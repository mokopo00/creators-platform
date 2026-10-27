/**
 * Search input handling. User input is never interpolated into SQL; these
 * helpers only build *bound parameter values* that are safe for FTS5 MATCH
 * and LIKE.
 */

/** Quotes a string as a single FTS5 phrase (`"..."` with `"` doubled). */
export function ftsPhrase(input: string): string {
  return `"${input.replace(/"/g, '""')}"`;
}

/** Builds an FTS5 query that ANDs each whitespace-separated term as a literal phrase. */
export function ftsQuery(input: string): string | null {
  const terms = input
    .normalize('NFKC')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => [...t].length >= 3) // trigram tokenizer needs 3+ characters
    .slice(0, 8);
  return terms.length ? terms.map(ftsPhrase).join(' AND ') : null;
}

/** Escapes LIKE wildcards; use with `ESCAPE '\'`. */
export function likePattern(input: string): string {
  return `%${input.normalize('NFKC').replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}
