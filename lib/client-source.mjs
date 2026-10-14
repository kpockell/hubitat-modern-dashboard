import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGACY_CHUNK_NAMES } from "./js-entry-points.mjs";

export const CLIENT_CHUNK_NAMES = LEGACY_CHUNK_NAMES;

export function readClientChunks(root) {
  return Object.fromEntries(CLIENT_CHUNK_NAMES.map((name) => [
    name,
    readFileSync(join(root, "src", "client", "legacy", `${name}.js`), "utf8"),
  ]));
}

export function readClientSource(root) {
  const chunks = readClientChunks(root);
  return CLIENT_CHUNK_NAMES.map((name) => chunks[name].trimEnd()).join("\n\n") + "\n";
}
