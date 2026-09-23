import type { CreateKitInput } from '../kits.api';

export const DEFAULT_DAYS = 5;

/**
 * Parse an uploaded file of description-and-company pairs.
 *
 * Accepts the Appendix B case shape, because a candidate who already has a
 * cases.json for the batch command should not have to rewrite it to use
 * the interface. Errors name the row, since "invalid file" is useless when
 * nineteen of twenty rows are fine.
 */
export function parseCasesFile(text: string): CreateKitInput[] {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON. Export it as a JSON array of roles.');
  }

  const rows = Array.isArray(raw) ? raw : (raw as { cases?: unknown })?.cases;
  if (!Array.isArray(rows)) {
    throw new Error('Expected a JSON array of roles, each with a jd and a company_url.');
  }
  if (rows.length === 0) throw new Error('That file has no roles in it.');

  return rows.map((row, index) => {
    const entry = row as Record<string, unknown>;
    const jd = entry.jd ?? entry.job_description;
    const url = entry.company_url ?? entry.companyUrl;
    if (typeof jd !== 'string' || jd.trim().length === 0) {
      throw new Error(`Row ${index + 1} has no job description.`);
    }
    if (typeof url !== 'string' || url.trim().length === 0) {
      throw new Error(`Row ${index + 1} has no company_url.`);
    }
    const days = Number(entry.days);
    return {
      jd,
      company_url: url,
      days: Number.isInteger(days) && days > 0 ? days : DEFAULT_DAYS,
    };
  });
}
