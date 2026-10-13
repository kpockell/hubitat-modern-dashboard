import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("legacy state and the runtime store retain the same collection identities", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.runtime.state.devices, api.state.devices);
  assert.strictEqual(api.runtime.state.locks, api.state.locks);
  assert.strictEqual(api.runtime.state.favoritesLayout, api.state.favoritesLayout);

  const devices = api.state.devices;
  api.runtime.services.store.replaceCollection("devices", [{ i: 7, n: "Lamp", s: 0 }]);
  assert.strictEqual(api.state.devices, devices);
  assert.deepStrictEqual(plain(api.state.devices), [{ i: 7, n: "Lamp", s: 0 }]);
});

test("temporary registerFeature facade receives runtime context and hub events", async () => {
  const { api } = createAppHarness();
  const calls = [];
  api.registerFeature("test-feature", ({ state, services, ui }) => ({
    render() { calls.push(["render", state.devices, services.store, ui.document]); },
    handleHubEvent(event) { calls.push(["event", event]); },
  }));

  await api.runtime.features.render();
  await api.runtime.features.handleHubEvent({ id: 7, name: "switch", value: "on" });
  assert.strictEqual(calls[0][1], api.state.devices);
  assert.strictEqual(calls[0][2], api.runtime.services.store);
  assert.ok(calls[0][3]);
  assert.deepStrictEqual(plain(calls[1]), ["event", { id: 7, name: "switch", value: "on" }]);
});
