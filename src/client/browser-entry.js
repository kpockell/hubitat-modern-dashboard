import "./domain/browser-entry.js";
import { createRuntime, replaceCollection, replaceRecord } from "./runtime/index.mjs";
import {
  createSessionService,
} from "./transport/session.mjs";

globalThis.MLDRuntime = { createRuntime, replaceCollection, replaceRecord };
globalThis.MLDTransport = { createSessionService };
