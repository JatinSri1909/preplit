# AI Interview Prep Kit

Full-Stack Engineering Assessment submission — turns a pasted job description
+ company URL into a structured, editable interview prep kit.

> **Status**: feature-complete against the brief. Pipeline, API, builder UI
> and practice mode are implemented; 89 tests pass and the full build runs
> from a clean clone. Remaining known limitations are listed at the bottom.

## Tech stack

| Layer      | Choice                          | Why |
|------------|----------------------------------|-----|
| Frontend   | Next.js (App Router) + Tailwind  | Brief's preferred stack |
| Backend    | Node.js + Express                | Brief's preferred stack |
| Database   | MongoDB (Mongoose)               | Brief's preferred stack; kit documents are naturally schema-flexible (Appendix A + our own Builder-state metadata live side by side) |
| Client state | TanStack Query                  | Generation is a long poll, every builder edit is an optimistic cache write that must roll back on failure, and the kit is read by sibling routes that must share one copy. Hand-rolling that is where "an edit in flight" bugs come from |
| Language   | TypeScript throughout             | Shared types between API, CLI and (via package) the web app; zod schemas double as both request validation and the Appendix A structural contract |
| Scraping   | Custom crawler (`cheerio` + native `fetch`) | No fixed path list — brief explicitly disallows that. See "Retrieval approach" below |
| LLM        | **Groq** (`llama-3.3-70b-versatile` by default), via `groq-sdk` | Genuine free tier, OpenAI-compatible JSON-mode output, fast/consistent low-latency inference |
| Search (research step) | DuckDuckGo HTML endpoint scrape | No API key available/allowed per the brief; single seam (`searchWeb.ts`) to swap providers if needed |

## Setup

### Local

```bash
git clone <repo>
cd ai-interview-prep-kit
cp .env.example .env   # fill in GROQ_API_KEY, MONGODB_URI, SESSION_SECRET
npm install
npm run build           # builds packages/core and packages/llm first
npm run dev:api          # apps/api on :4000
npm run dev:web          # apps/web on :3000 (separate terminal)
```

`.env.example` documents every environment variable and what it's for.

### Batch entry point (Appendix B)

```bash
GROQ_API_KEY=... ALLOW_PRIVATE_HOSTS=true \
  npm run evaluate -- --input cases.json --output kits.json
```

`ALLOW_PRIVATE_HOSTS=true` is required when the input cases point at
`localhost`-served fixture sites (as Appendix B describes) — the crawler
refuses private/loopback addresses by default (brief Section 11). **Never**
set this in the deployed production API's environment.

### Deployed

Both apps deploy to Vercel from this one repo, as two separate Vercel
Projects pointed at different Root Directories — no second hosting
provider needed:

- **API** (`apps/api`): Root Directory `apps/api`. Vercel's zero-config
  Express support detects `src/index.ts`'s default export and runs it as
  a single Vercel Function on Fluid compute — no rewrite into
  `api/*.ts` handlers needed. `apps/api/vercel.json` builds
  `packages/core`/`packages/llm` before the function is bundled, since
  those are workspace packages this app imports from `dist/`, not source.
  Set the same env vars as `.env.example`, with `ALLOW_PRIVATE_HOSTS` left
  unset/false, plus `VERCEL=1` is set automatically by the platform (this
  is how `index.ts` knows not to call `app.listen()` there).
- **Web** (`apps/web`): Root Directory `apps/web`. `apps/web/vercel.json`
  builds the same two workspace packages first. `NEXT_PUBLIC_API_URL`
  points at the API project's URL.
- **DB**: MongoDB Atlas free tier (M0) — Vercel doesn't host databases,
  so this is the one piece that lives elsewhere regardless.

Locally and on the batch CLI, `apps/api` still runs as an ordinary
persistent Express server (`app.listen`) — the Vercel Function path only
kicks in under `VERCEL=1`.

## LLM provider

Groq. Chosen for a genuine free tier, OpenAI-compatible JSON-mode output
(removes most of the "the model wrapped its JSON in prose" failure class
outright), and noticeably more consistent response quality/latency than
Gemini's free-tier endpoint, which was the original choice before this
switch.

### Model pool, not one model

Groq's free-tier rate limits are per model, not per account — as of
writing, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b` and `openai/gpt-oss-20b`
each get their own 30 RPM / 8K TPM budget (see
[console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits)).
A dozen-plus LLM calls per kit against a single model's cap is exactly the
"provider says slow down" failure the brief warns about, so
`GroqModelPool` (`packages/llm/src/groqModelPool.ts`) spreads calls across
several models instead:

- Each call goes to whichever model has self-imposed budget headroom
  *right now* (`GroqClient.estimatedWaitMs`, checked without reserving
  anything) — not always the most-preferred one. Ties go to preference
  order, so the best model still wins whenever nothing is actually busy.
- If a model still gets a real 429 after its own retry budget, it sits
  out for 60s and the call falls over to the next model in the pool —
  a rate limit becomes a fallback, not an error surfaced to the user.
- `GET /llm-status` reports each model's live headroom and cooldown
  state, so "is the pool actually helping" is a request away rather than
  a guess from the logs.

`GROQ_MODEL_POOL` (comma-separated) configures the pool; a single
`GROQ_MODEL` still works with no fallback, for anyone who'd rather pin one
model. See `.env.example`.

## High-level architecture

```
apps/web/     Next.js App Router — UI
  lib/api.ts       the only module that knows the API exists; one place
                   for credentials, the error envelope, and 401 handling
  lib/useKit.ts    kit cache: generation polling + optimistic builder
                   mutations with rollback
  components/      builder sections, practice mode, shared primitives
apps/api/     Express — auth, kit persistence, REST routes
packages/core/  Framework-free pipeline logic — the single source of truth,
                imported by BOTH the API and the CLI (Appendix B: "the same
                code your application uses, not a parallel implementation")
  retrieval/    fetchPage, crawlSite, robots.txt, URL safety
  research/     public interview-discussion search + summarization
  extraction/   JD -> requirements (LLM call #1)
  generation/   requirement+category -> questions (LLM call #2+)
  coverage/     deterministic gap-finding (no LLM)
  schedule/     deterministic day allocation (no LLM)
  validation/   Appendix A structural + cross-referential validator
  state/        Builder edit/regenerate-without-clobbering merge logic
  pipeline.ts   wires all of the above into runPipeline()
packages/llm/   Provider-agnostic LLM client — Groq implementation,
                token-bucket rate limiter, backoff/retry, prompt-injection
                guardrail helper
cli/evaluate.ts  Appendix B entry point — imports packages/core directly
```

## Retrieval approach

The brief is explicit that a fixed path list ("/careers") is not
sufficient — companies bury their hiring page in unpredictable places. Our
crawler:

1. Fetches the homepage.
2. Extracts every on-site link **with its anchor text**.
3. Scores each link by keyword match against both the URL path and the
   anchor text (`career`, `jobs`, `hiring`, `join-us`, `handbook`,
   `engineering-blog`, etc.), with a small boost for shallower paths.
4. Fetches the top-ranked candidates (capped by `CRAWL_MAX_PAGES`), skipping
   and recording any that are disallowed by `robots.txt` or fail to load —
   never aborting the whole crawl over one bad page.
5. The highest-scoring successfully-fetched page becomes the "hiring page"
   fed into question generation and hiring-process research.

Verified with an integration test (`crawlSite.test.ts`) against a real
local HTTP fixture server whose hiring page is deliberately placed at
`/opportunities` — a URL carrying no hiring keyword itself, findable only
through its anchor text ("We're hiring — join the team"). This mirrors
exactly how the batch grader is described as testing (local-address company
sites).

Public discussion of the interview process is found via a DuckDuckGo HTML
search (no API key required/available) for `"<company>" interview process
questions`, fetching the top few results and asking the LLM to summarize —
but **only** if the fetched pages actually contain specific interview
content; otherwise it returns `null` rather than fabricating a process
(brief Section 10 edge case).

## Sequencing (why it's genuine, not one mega-prompt)

1. **Extraction** (LLM) — JD text needs no retrieval; requirements +
   must/nice priority are taken from the posting's own wording, never
   invented.
2. **Crawl** (deterministic + network) — finds the hiring page and general
   company content.
3. **Research** (search + LLM summarization, best-effort) — public
   interview-process discussion, `null` if nothing genuine is found.
4. **Generation** (LLM, one call per requirement × category) — a
   `technical` requirement and a `behavioural` requirement are never
   generated in the same call with the same instructions, because the
   right question style genuinely differs. When research/crawl surfaced a
   system-design interview round, must-have technical requirements get an
   **additional** system-design-category call — the hiring-process finding
   changes what gets generated, not just cosmetic framing.
5. **Coverage check** (deterministic, no LLM) — `findUncoveredMustHaveIds`
   diffs generated questions against must-have requirement ids.
6. **Gap-filling loop** — up to `maxCoveragePasses` (default **2**,
   configurable) additional generation passes targeting only the
   still-uncovered requirements. Two passes chosen as a pragmatic ceiling:
   in practice a requirement that's still uncovered after one full
   dedicated retry is more often a sign the requirement text itself is
   ambiguous than that another LLM call will fix it — better to surface
   the remaining gap honestly in `coverage.uncovered_requirement_ids` than
   loop indefinitely against a free-tier rate limit.
7. **Schedule allocation** (deterministic, no LLM) — see below.
8. **Validation** — the finished kit is checked against Appendix A's exact
   shape (via zod) plus cross-referential rules (dangling ids, day count)
   before being returned; an invalid kit is treated as a pipeline failure,
   never silently returned.

## Schedule allocation

Deterministic, in code (brief Section 8 — explicitly "not in a prompt"):

1. Weight each question by its linked requirement's priority (must > nice)
   and its own difficulty.
2. Sort descending by that weight.
3. Greedily place each question on the earliest day with remaining
   capacity (`minutesPerDay`, default 120) — this naturally front-loads
   hard/must-have material.
4. **Guarantee**: a must-have-linked question is placed even if it means
   exceeding the nominal daily budget — must-have coverage always outranks
   a clean time budget.
5. Duration per question: difficulty 1 → 15 min, 2 → 25 min, 3 → 40 min.

Always produces exactly `days_available` days, even with zero questions
(trailing days get a "Review / practice" focus rather than being omitted).

## Builder state model (edit/regenerate without clobbering)

The hardest state problem in the assessment. Design: kit content itself
stays **exactly** Appendix A shape — no extra fields bolted onto individual
questions, since automated grading structurally diffs against Appendix A.
Instead, a sibling `KitMeta` structure (app-internal only, never part of
the returned kit) tracks per-item provenance:

- `generated` — pipeline output, safe to discard on regeneration
- `edited` — pipeline output the user has hand-edited; survives
- `user_added` — created by the user directly; survives, untouched by
  category regeneration

Regenerating a question category replaces only `generated`-tagged
questions in that category; `edited`/`user_added` items and every question
in *other* categories pass through untouched. Same pattern for flashcards
and the two company-brief text fields independently. Fully unit-tested
(`kitState.test.ts`, 10 tests) including id-collision safety for freshly
generated replacement items.

## Practice mode ordering

Confidence-weighted sort, not a spaced-repetition interval
(`packages/core/src/practice/practiceQueue.ts`).

SM-2 and its relatives schedule cards into the future **in days**. That is
right for retaining material over months, and wrong here: this user has an
interview in a known, small number of days — often one — so a scheduler
deciding a card is "not due for 4 days" may be deferring it past the
interview itself. Confidence weighting gives the same core benefit (weak
material returns first) with none of that failure mode, and it is
explainable to someone using the tool under stress.

Order: unseen cards first (you cannot be confident about a card you never
read), then lowest confidence, then least-recently reviewed, then kit
order. Pure and deterministic — no clock, no LLM, fully unit-tested.

The queue is fixed for the duration of a session rather than resorted after
every rating. Resorting live means a card you just rated "guessed"
reappears immediately, which reads as punishment rather than revision.

## Frontend notes

- **Editing** is local while a field has focus and saves once, on blur, only
  if the text changed. Debouncing a PATCH per keystroke fires mid-word and
  lets two overlapping saves race; this touches the network once per edit.
  Escape reverts.
- **Reordering** is move-up/move-down buttons, not drag-and-drop. Keyboard
  access is graded, and a drag handle that genuinely works with a keyboard
  and a screen reader is substantial work that most implementations skip.
  Buttons are operable by every input method, work on a phone without a
  long-press, and the optimistic update makes them feel as immediate.
  Reordering inside a filtered category still sends the **full** question
  order, and the API rejects a partial list — a partial list cannot say
  where the hidden questions went.
- **Provenance is visible.** Edited and hand-written items are labelled
  "kept on regenerate"; generated items carry no badge, since they are the
  majority and badging them would drown the real signal. Regeneration is
  offered per category only — there is no "regenerate everything" button,
  because that is the button that loses work.
- **Generation progress** names the pipeline steps instead of faking a
  percentage. Duration depends on the posting and the company site, so any
  bar would be invented, and one that stalls at 80% is worse than honesty.
- **Typography** carries one rule: kit content is set in a serif, app
  chrome in a sans, so you can see at a glance what the model wrote versus
  what the application is offering. Both are system stacks — no webfont
  request, because a prep tool should not blank its own text while a font
  loads.

## Edge cases

| Case | Handling |
|---|---|
| Company URL invalid/404/timeout | Crawl returns empty `pagesUsed`; kit still generates with an honest "No public company information could be found" brief |
| No discoverable hiring page | `hiringPage` stays `null`; generation proceeds without hiring-process bias |
| Thin JD | Extraction returns a short requirements list — never padded to look thorough |
| No public interview discussion | `findInterviewDiscussion` returns `null` |
| LLM returns invalid JSON | One self-correction retry (asks the model to fix its own output), then a structured `LlmInvalidJsonError` |
| LLM rate-limited | Token-bucket rate limiter self-throttles *before* hitting the limit; exponential backoff + jitter on an actual 429 |
| Duplicate submission | Fingerprinted per user on (normalised company_url, normalised jd). A resubmission returns the existing kit with `duplicate_of_existing_kit: true` and the UI says so, rather than spending a second pipeline run. `days` is excluded from the fingerprint — the same posting with a different runway is the same research, and the schedule rebuilds without regenerating anything. A previously *failed* kit is excluded, so resubmitting after a failure genuinely retries |
| Generation orphaned by a restart | A kit "generating" for over 10 minutes is reported as failed on read, rather than leaving the interface polling a spinner forever |
| An edit that would break Appendix A | Rejected with 422 and not saved. Deleting a scheduled question also tidies the schedule, since `validateKit` rejects a dangling `question_ids` reference |
| 1-day / 60-day schedule | `buildSchedule` handles any `daysAvailable` — trailing/empty days get a "Review / practice" focus rather than breaking |

## Known limitations

- The LLM-calling modules are unit-tested against a **mock** client. They
  have not yet been exercised against the live Groq API end to end.
- Ownership failures return **404, not 403**. A 403 confirms to a signed-in
  stranger that a kit id exists and belongs to someone; nothing a
  legitimate caller can do differs between the two answers.
- There is no server-side render of kit content — every kit screen is
  client-fetched. Fine for a private, authenticated tool; it would need
  revisiting if kits were ever shareable.
- Regenerating a question category reuses the stored company brief as
  context rather than re-crawling. Cheaper and faster, but it will not pick
  up a hiring page that appeared since the kit was first built.

## Testing

```bash
npm test
```

89 tests across `packages/core` and `apps/api`, including a full pipeline
integration test that runs a **real** crawl (link ranking, robots.txt,
anchor-text scoring) against an in-process local HTTP fixture server, with
only the LLM calls mocked — the same code path the batch CLI uses.

## Build ordering (why the scripts look like this)

`packages/core` imports types from `packages/llm`, which resolves through
`main: ./dist/index.js` — so llm must be built **before** core, and
`npm run build:packages` enforces that order. `npm run evaluate` runs it
first, so the batch entry point works from a clean clone with no separate
build step, as Section 9 requires.

Tests are the one exception: `vitest.config.ts` aliases the two internal
packages to their TypeScript source, so `npm test` needs no build either.
The API, the CLI and the web app all still consume the built `dist` output,
so the test run is not exercising a different module graph than we ship.

## Session cookies across origins

Deployed, the web app and the API sit on different registrable domains, so
every authenticated request is cross-site. The session cookie is therefore
`sameSite: 'none'` + `secure` in production and `lax` locally — `lax` in
production would silently drop the cookie and 401 every protected route.
`CORS_ORIGIN` must list the deployed web origin exactly; `credentials` is
on, so a wildcard will not work.
