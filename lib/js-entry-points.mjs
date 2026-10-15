export const LEGACY_JS_ENTRY_POINTS = [
  {
    chunk: "bootstrap",
    output: "mld-app.js",
    missingPrereqMessage: null,
  },
  {
    chunk: "core",
    output: "mld-app-core.js",
    missingPrereqMessage: "upload mld-app.js before mld-app-core.js",
  },
  {
    chunk: "post",
    output: "mld-app-post.js",
    missingPrereqMessage: "upload mld-app-core.js before mld-app-post.js",
  },
  {
    chunk: "post2",
    output: "mld-app-post2.js",
    missingPrereqMessage: "upload mld-app-post.js before mld-app-post2.js",
  },
  {
    chunk: "post3",
    output: "mld-app-post3.js",
    missingPrereqMessage: "upload mld-app-post2.js before mld-app-post3.js",
  },
];

export const LEGACY_CHUNK_NAMES = LEGACY_JS_ENTRY_POINTS.map((entry) => entry.chunk);
