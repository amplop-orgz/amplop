// Types for bundle-scan.mjs, so tests can import it.
export type Pattern = { id: string; pattern: string };
export type Secret = { name: string; value: string };
export type Hit = { file?: string; id: string; offset: number; preview: string };
export const SECRET_NAMES: string[];
export function secretValues(env: Record<string, string | undefined>): Secret[];
export function loadAllow(text: string): Set<string>;
export function filesToScan(nextDir: string): string[];
export function scanText(
  text: string,
  o: { patterns: Pattern[]; allow: Set<string>; secrets: Secret[] },
): Hit[];
export function scan(o: {
  files: string[];
  patterns: Pattern[];
  allow: Set<string>;
  secrets: Secret[];
  root: string;
}): Hit[];
