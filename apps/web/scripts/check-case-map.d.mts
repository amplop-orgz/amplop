// Types for check-case-map.mjs, used by test/case-map.test.ts.
export type Entry = {
  id: string;
  kind: string;
  tier: number;
  owner: string;
  automated: boolean;
  testnetSkip?: string;
};
export type FoundTest = { id: string; tier: number | null };
export function testsIn(sources: string[]): FoundTest[];
export function mapErrors(map: Entry[], tests: FoundTest[]): string[];
