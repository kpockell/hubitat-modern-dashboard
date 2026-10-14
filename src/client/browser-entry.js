import "./domain/browser-entry.js";
import { createRuntime, replaceCollection, replaceRecord } from "./runtime/index.mjs";

globalThis.MLDRuntime = { createRuntime, replaceCollection, replaceRecord };
