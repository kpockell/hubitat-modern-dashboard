import { createFeatureRegistry } from "./registry.mjs";
import { createStore } from "./store.mjs";

export function createRuntime(dependencies = {}, initialState = {}) {
  const store = createStore(initialState);
  const services = { ...(dependencies.services || {}), store };
  const ui = dependencies.ui || {};
  const features = createFeatureRegistry({ state: store.state, services, ui });
  return { state: store.state, services, features };
}
