import assert from "node:assert/strict";
import test from "node:test";
import { createEnvironmentMediaFeature } from "../src/client/features/environment-media.mjs";

function fixture(commandResult = { ok: true }) {
  const state = {
    windowShades: [{ i: 1, st: "closed", pos: 0 }],
    ceilingFans: [{ i: 2, s: 0, sp: "off" }],
    music: [{ i: 3, st: "paused", v: 20 }],
    tempSensors: [{ i: 4, temp: 68, bat: 90, ex: [] }],
    sensors: [
      { i: 4, t: "humidity", v: 40, ex: [] },
      { i: 5, t: "contact", v: "closed", a: 0, ex: [] },
    ],
    shadeOptimistic: new Map(),
    fanOptimistic: new Map(),
  };
  const renders = [];
  const commands = [];
  let climateRenders = 0;
  const feature = createEnvironmentMediaFeature({
    state,
    services: {
      now: () => 1_000,
      transport: {
        async sendCommand(...args) {
          commands.push(args);
          if (commandResult instanceof Error) throw commandResult;
          return commandResult;
        },
      },
    },
    ui: {
      renderEnvironmentMedia: (snapshot, reason, kind, device) => renders.push({ snapshot, reason, kind, device }),
      renderClimate: () => { climateRenders += 1; },
    },
  });
  return { feature, state, renders, commands, climateRenders: () => climateRenders };
}

test("initial render and lifecycle hooks expose stable environment collections", () => {
  const { feature, state, renders } = fixture();
  feature.init();
  assert.strictEqual(renders[0].snapshot.windowShades, state.windowShades);
  assert.strictEqual(renders[0].snapshot.ceilingFans, state.ceilingFans);
  feature.pause();
  feature.resume();
  feature.dispose();
  assert.equal(renders.at(-1).reason, "resume");
});

test("shade events preserve light passthrough and optimistic guards", () => {
  const { feature, state, renders } = fixture();
  assert.deepEqual(feature.applyHubEvent({ source: "DEVICE", deviceId: 1, name: "position", value: "55" }), {
    handled: true, passthrough: false, kind: "shade",
  });
  assert.deepEqual({ st: state.windowShades[0].st, pos: state.windowShades[0].pos }, {
    st: "partially open", pos: 55,
  });
  assert.equal(feature.applyHubEvent({ source: "DEVICE", deviceId: 1, name: "switch", value: "off" }).passthrough, true);
  assert.equal(feature.applyHubEvent({ source: "DEVICE", deviceId: 1, name: "level", value: 100 }).passthrough, true);
  assert.equal(state.windowShades[0].st, "open");

  state.shadeOptimistic.set(1, { until: 2_000 });
  feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "windowShade", value: "closed" });
  assert.equal(state.windowShades[0].st, "open");
  assert.equal(renders.at(-1).kind, "shade");
});

test("fan events update power and speed unless an optimistic command is active", () => {
  const { feature, state } = fixture();
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 2, name: "switch", value: "on" }), true);
  assert.deepEqual(state.ceilingFans[0], { i: 2, s: 1, sp: "off" });
  feature.handleHubEvent({ source: "DEVICE", deviceId: 2, name: "speed", value: "medium" });
  assert.deepEqual(state.ceilingFans[0], { i: 2, s: 1, sp: "medium" });
  feature.handleHubEvent({ source: "DEVICE", deviceId: 2, name: "switch", value: "off" });
  assert.deepEqual(state.ceilingFans[0], { i: 2, s: 0, sp: "off" });

  state.fanOptimistic.set(2, { until: 2_000 });
  feature.handleHubEvent({ source: "DEVICE", deviceId: 2, name: "speed", value: "high" });
  assert.equal(state.ceilingFans[0].sp, "off");
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 2, name: "battery", value: 80 }), true);
});

test("sensor events update primary, secondary, climate, and last-event state", () => {
  const { feature, state, climateRenders } = fixture();
  feature.handleHubEvent({ source: "DEVICE", deviceId: 4, name: "temperature", value: "71.6", unit: "F" });
  assert.equal(state.tempSensors[0].temp, 72);
  assert.equal(climateRenders(), 1);

  feature.handleHubEvent({ source: "DEVICE", deviceId: 4, name: "relativeHumidity", value: 44, unit: "%" });
  assert.equal(state.sensors[0].v, "44");
  feature.handleHubEvent({ source: "DEVICE", deviceId: 5, name: "contact", value: "on" });
  assert.deepEqual({ v: state.sensors[1].v, a: state.sensors[1].a, le: state.sensors[1].le }, {
    v: "open", a: 1, le: 1_000,
  });
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 5, name: "unsupported", value: "x" }), true);
});

test("unrelated Hubitat events are not claimed", () => {
  const { feature } = fixture();
  assert.equal(feature.handleHubEvent(null), false);
  assert.equal(feature.handleHubEvent({ source: "LOCATION", name: "mode", value: "Away" }), false);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 999, name: "switch", value: "on" }), false);
});

test("commands retain optimistic success and roll back rejection", async () => {
  const success = fixture();
  assert.deepEqual(await success.feature.command("music", 3, "play", null, { st: "playing" }), { ok: true });
  assert.equal(success.state.music[0].st, "playing");
  assert.deepEqual(success.commands, [[3, "play", null]]);

  const rejected = fixture({ ok: false, status: 500 });
  const original = rejected.state.ceilingFans[0];
  await rejected.feature.command("ceilingFans", 2, "on", null, { s: 1 });
  assert.strictEqual(rejected.state.ceilingFans[0], original);
  assert.deepEqual(original, { i: 2, s: 0, sp: "off" });
  assert.equal(rejected.renders.at(-1).reason, "rollback");
});

test("command timeout and missing devices fail closed", async () => {
  const timedOut = fixture(new Error("timeout"));
  assert.deepEqual(await timedOut.feature.command("windowShades", 1, "open", null, { st: "opening" }), {
    ok: false, error: "timeout",
  });
  assert.deepEqual(await timedOut.feature.command("music", 99, "play", null, { st: "playing" }), {
    ok: false, error: "device_not_found",
  });
});
