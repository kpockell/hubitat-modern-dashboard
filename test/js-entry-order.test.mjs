import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIENT_CHUNK_NAMES } from "../lib/client-source.mjs";
import { LEGACY_JS_ENTRY_POINTS } from "../lib/js-entry-points.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const legacyDir = join(root, "src", "client", "legacy");

test("legacy chunks stay in explicit bootstrap/core/post/post2/post3 order", () => {
  assert.deepEqual(CLIENT_CHUNK_NAMES, ["bootstrap", "core", "post", "post2", "post3"]);
  assert.deepEqual(
    LEGACY_JS_ENTRY_POINTS.map((entry) => entry.output),
    ["mld-app.js", "mld-app-core.js", "mld-app-post.js", "mld-app-post2.js", "mld-app-post3.js"],
  );
});

test("bootstrap and post3 preserve the IIFE boundaries across split chunks", () => {
  const bootstrap = readFileSync(join(legacyDir, "bootstrap.js"), "utf8");
  const post3 = readFileSync(join(legacyDir, "post3.js"), "utf8");
  assert.match(bootstrap, /^\(\(\) => \{\n  "use strict";/);
  assert.match(post3, /\n\}\)\(\);\s*$/);
});
