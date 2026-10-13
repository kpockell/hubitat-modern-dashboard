import assert from "node:assert/strict";
import test from "node:test";
import { createSimpleDeviceFeature } from "../src/client/features/simple-devices.mjs";

function fixture(result = { ok: true }) {
  const state = {
    outlets: [{ i: 1, s: 0 }],
    locks: [{ i: 2, lk: 0, st: "unlocked" }],
    garageDoors: [{ i: 3, st: "closed" }],
    valves: [{ i: 4, st: "closed" }],
    lockOptimistic: new Map(),
    garageOptimistic: new Map(),
    valveOptimistic: new Map(),
  };
  const renders = [];
  const commands = [];
  const feature = createSimpleDeviceFeature({
    state,
    services: { transport: { async sendCommand(...args) { commands.push(args); return result; } } },
    ui: { renderSimpleDevices: (snapshot, reason) => renders.push([snapshot, reason]) },
  });
  return { feature, state, renders, commands };
}

test("initial render and Hubitat events update each simple-device collection", () => {
  const { feature, state, renders } = fixture();
  feature.init();
  assert.strictEqual(renders.length, 1);
  for (const event of [
    { source: "DEVICE", deviceId: 1, name: "switch", value: "on" },
    { source: "DEVICE", deviceId: 2, name: "lock", value: "locked" },
    { source: "DEVICE", deviceId: 3, name: "door", value: "opening" },
    { source: "DEVICE", deviceId: 4, name: "valve", value: "open" },
  ]) assert.strictEqual(feature.handleHubEvent(event), true);
  assert.strictEqual(state.outlets[0].s, 1);
  assert.deepStrictEqual(state.locks[0], { i: 2, lk: 1, st: "locked" });
  assert.strictEqual(state.garageDoors[0].st, "opening");
  assert.strictEqual(state.valves[0].st, "open");
  assert.strictEqual(renders.length, 5);
  assert.strictEqual(feature.handleHubEvent({ source: "DEVICE", deviceId: 99, name: "switch", value: "on" }), false);
});

test("commands preserve optimistic success and roll back rejection", async () => {
  const success = fixture({ ok: true });
  assert.deepStrictEqual(await success.feature.command("outlets", 1, "on", null, { s: 1 }), { ok: true });
  assert.strictEqual(success.state.outlets[0].s, 1);
  assert.deepStrictEqual(success.commands, [[1, "on", null]]);

  const rejected = fixture({ ok: false, status: 500 });
  const original = rejected.state.locks[0];
  await rejected.feature.command("locks", 2, "lock", null, { lk: 1, st: "locking" });
  assert.strictEqual(rejected.state.locks[0], original);
  assert.deepStrictEqual(original, { i: 2, lk: 0, st: "unlocked" });
  assert.strictEqual(rejected.renders.at(-1)[1], "rollback");
});

test("command failure and missing devices fail closed", async () => {
  const failed = fixture();
  failed.feature = createSimpleDeviceFeature({
    state: failed.state,
    services: { transport: { async sendCommand() { throw new Error("timeout"); } } },
    ui: { renderSimpleDevices: () => {} },
  });
  assert.deepStrictEqual(await failed.feature.command("valves", 4, "open", null, { st: "opening" }), {
    ok: false, error: "timeout",
  });
  assert.deepStrictEqual(await failed.feature.command("locks", 99, "lock", null, { st: "locking" }), {
    ok: false, error: "device_not_found",
  });
});
