// Defence in depth: the API rejects non-http(s) company_url values on
// create, but a kit stored before that check existed could still have one,
// and this is a raw string rendered straight into an <a href> below.
export function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
