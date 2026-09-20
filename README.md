# AI Interview Prep Kit

Full-Stack Engineering Assessment submission — turns a pasted job description
+ company URL into a structured, editable interview prep kit.

> **Status**: backend pipeline (extraction, crawling, research, generation,
> coverage, scheduling, validation) is implemented and tested end to end.
> Auth + kit persistence + REST API are implemented. The Next.js builder UI
> and practice mode are not yet built. See "What's left" at the bottom.

## Tech stack

| Layer      | Choice                          | Why |
|------------|----------------------------------|-----|
| Frontend   | Next.js (App Router) + Tailwind  | Brief's preferred stack |
| Backend    | Node.js + Express                | Brief's preferred stack |
| Database   | MongoDB (Mongoose)               | Brief's preferred stack; kit documents are naturally schema-flexible (Appendix A + our own Builder-state metadata live side by side) |
| Language   | TypeScript throughout             | Shared types between API, CLI and (via package) the web app; zod schemas double as both request validation and the Appendix A structural contract |
| Scraping   | Custom crawler (`cheerio` + native `fetch`) | No fixed path list — brief explicitly disallows that. See "Retrieval approach" below |
| LLM        | **Google Gemini** (`gemini-2.0-flash` by default), via `@google/generative-ai` | Genuine free tier, JSON-mode output, generous-enough TPM for this workload |
| Search (research step) | DuckDuckGo HTML endpoint scrape | No API key available/allowed per the brief; single seam (`searchWeb.ts`) to swap providers if needed |

## Setup

### Local

```bash
git clone <repo>
cd ai-interview-prep-kit
cp .env.example .env   # fill in GEMINI_API_KEY, MONGODB_URI, SESSION_SECRET
npm install
npm run build           # builds packages/core and packages/llm first
npm run dev:api          # apps/api on :4000
npm run dev:web          # apps/web on :3000 (separate terminal)
```

`.env.example` documents every environment variable and what it's for.

### Batch entry point (Appendix B)

```bash
GEMINI_API_KEY=... ALLOW_PRIVATE_HOSTS=true \
  npm run evaluate -- --input cases.json --output kits.json
```

`ALLOW_PRIVATE_HOSTS=true` is required when the input cases point at
`localhost`-served fixture sites (as Appendix B describes) — the crawler
refuses private/loopback addresses by default (brief Section 11). **Never**
set this in the deployed production API's environment.

### Deployed

- API: deploy `apps/api` (Render/Railway/Fly — any Node host with a free
  tier). Set the same env vars as `.env.example`, with `ALLOW_PRIVATE_HOSTS`
  left unset/false.
- Web: deploy `apps/web` to Vercel, `NEXT_PUBLIC_API_URL` pointing at the
  deployed API.
- DB: MongoDB Atlas free tier.

## LLM provider

Google Gemini, model `gemini-2.0-flash` (overridable via `GEMINI_MODEL`).
Chosen for a genuine free tier and native structured-JSON output mode,
which removes most of the "the model wrapped its JSON in prose" failure
class outright.

## High-level architecture

```
apps/web/     Next.js — UI (form, builder, practice mode) [not yet built]
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
packages/llm/   Provider-agnostic LLM client — Gemini implementation,
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

## Edge cases

| Case | Handling |
|---|---|
| Company URL invalid/404/timeout | Crawl returns empty `pagesUsed`; kit still generates with an honest "No public company information could be found" brief |
| No discoverable hiring page | `hiringPage` stays `null`; generation proceeds without hiring-process bias |
| Thin JD | Extraction returns a short requirements list — never padded to look thorough |
| No public interview discussion | `findInterviewDiscussion` returns `null` |
| LLM returns invalid JSON | One self-correction retry (asks the model to fix its own output), then a structured `LlmInvalidJsonError` |
| LLM rate-limited | Token-bucket rate limiter self-throttles *before* hitting the limit; exponential backoff + jitter on an actual 429 |
| Duplicate submission | Not deduplicated server-side yet — left as a known limitation (see below) |
| 1-day / 60-day schedule | `buildSchedule` handles any `daysAvailable` — trailing/empty days get a "Review / practice" focus rather than breaking |

## Known limitations / not yet built

- Next.js UI (form, builder, practice mode) — biggest remaining piece.
- Duplicate-submission detection.
- `generateQuestionsForRequirement`/`Gaps` and `findInterviewDiscussion`
  are implemented and unit-tested against a **mock** LLM client (no real
  API key was available while scaffolding this); they have not yet been
  run against the live Gemini API end-to-end.
- Regeneration routes for question categories/brief are wired in the API
  but return `501` pending the above live-LLM verification.

## Testing

```bash
npm test
```

69 tests across `packages/core` and `apps/api`, including a full pipeline
integration test that runs a **real** crawl (link ranking, robots.txt,
anchor-text scoring) against an in-process local HTTP fixture server, with
only the LLM calls mocked — the same code path the batch CLI uses.
