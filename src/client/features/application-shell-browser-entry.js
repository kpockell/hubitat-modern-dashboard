import { createApplicationShellFeature } from "./application-shell.mjs";

// Authentication is needed by the /data transport before the deferred feature
// bundle loads, so publish the application shell with the startup modules.
globalThis.MLDFeatures = {
  ...(globalThis.MLDFeatures || {}),
  createApplicationShellFeature,
};
