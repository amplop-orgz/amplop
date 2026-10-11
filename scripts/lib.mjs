// Small helpers shared by the check scripts.
import { pathToFileURL } from "node:url";

export const isMain = (meta) => process.argv[1] && meta.url === pathToFileURL(process.argv[1]).href;

export function fail(lines) {
  for (const l of [lines].flat()) console.error(l);
  process.exit(1);
}
