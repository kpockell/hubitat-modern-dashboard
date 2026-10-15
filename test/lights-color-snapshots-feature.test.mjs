import assert from "node:assert/strict";
import test from "node:test";
import { createLightsColorSnapshotsFeature } from "../src/client/features/lights-color-snapshots.mjs";

function fixture() {
  const dimmer = { i: 1, s: 0, l: 10, d: 1, ct: 1, rgb: 1, k: 3000, h: 10, sat: 20 };
  const switchOnly = { i: 2, s: 1, d: 0 };
  const outletLike = { i: 3, s: 0 };
  const devMap = new Map();
  const favDevMap = new Map();
  const dimRec = { data: dimmer, isDim: true, isOutlet: false, el: { classList: { contains: () => false } } };
  const outletRec = { data: outletLike, isDim: false, isOutlet: true, el: { classList: { contains: () => false } } };
  devMap.set(1, dimRec);
  devMap.set(2, { data: switchOnly, isDim: false, isOutlet: false, el: { classList: { contains: () => false } } });
  devMap.set(3, outletRec);
  const state = {
    devices: [dimmer, switchOnly, outletLike],
    devMap,
    favDevMap,
    snapshots: {},
  };
  const renders = [];
  const calls = [];
  const cleared = [];
  let dragging = false;
  let activeColorSessionId = null;
  const feature = createLightsColorSnapshotsFeature({
    state,
    services: {
      api: {
        async bulkLights(...args) { calls.push(["bulk", ...args]); return { ok: true }; },
        async saveSnapshot(...args) { calls.push(["save", ...args]); return { ok: true }; },
        async restoreSnapshot(...args) { calls.push(["restore", ...args]); return { ok: true }; },
      },
    },
    ui: {
      clearSwitchOptimistic: (id) => cleared.push(id),
      isDragging: () => dragging,
      activeColorSessionId: () => activeColorSessionId,
      onSnapshotSaved(scope, roomId) { calls.push(["saved", scope, roomId]); },
      renderLights: (_snapshot, reason, kind, payload) => renders.push({ reason, kind, payload }),
    },
  });
  return {
    feature,
    state,
    renders,
    calls,
    cleared,
    setDragging(next) { dragging = next; },
    setColorSession(id) { activeColorSessionId = id; },
  };
}

test("light hub events update state and trigger rendering", () => {
  const { feature, state, renders, cleared } = fixture();
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "switch", value: "on" }), true);
  assert.equal(state.devices[0].s, 1);
  assert.deepEqual(cleared, [1]);
  assert.equal(renders.at(-1).kind, "switch");

  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "level", value: "77.3" }), true);
  assert.equal(state.devices[0].l, 77);
  assert.equal(renders.at(-1).kind, "level");

  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "colorTemperature", value: "4200" }), true);
  assert.equal(state.devices[0].k, 4200);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "hue", value: "66" }), true);
  assert.equal(state.devices[0].h, 66);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "saturation", value: "44" }), true);
  assert.equal(state.devices[0].sat, 44);
});

test("dragging and active color sessions block visual updates without dropping ownership", () => {
  const { feature, renders, setDragging, setColorSession } = fixture();
  setDragging(true);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "level", value: "33" }), true);
  assert.equal(renders.length, 0);

  setDragging(false);
  setColorSession(1);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 1, name: "hue", value: "50" }), true);
  assert.equal(renders.length, 0);
});

test("outlets and unrelated events are ignored", () => {
  const { feature, state } = fixture();
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 3, name: "switch", value: "on" }), false);
  assert.equal(state.devices[2].s, 0);
  assert.equal(feature.handleHubEvent({ source: "LOCATION", name: "mode", value: "Away" }), false);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 2, name: "battery", value: 99 }), false);
});

test("bulk and snapshot actions delegate to configured APIs", async () => {
  const { feature, calls } = fixture();
  assert.deepEqual(await feature.bulkLights("off", "house"), { ok: true });
  assert.deepEqual(await feature.saveSnapshot("house"), { ok: true });
  assert.deepEqual(await feature.restoreSnapshot("room", 12), { ok: true });
  assert.deepEqual(calls, [
    ["bulk", "off", "house", null],
    ["save", "house", null],
    ["saved", "house", null],
    ["restore", "room", 12],
  ]);
});

test("legacy boolean API results are normalized to the feature result contract", async () => {
  const saved = [];
  const feature = createLightsColorSnapshotsFeature({
    state: { devices: [], devMap: new Map(), favDevMap: new Map(), snapshots: {} },
    services: {
      api: {
        async bulkLights() { return true; },
        async saveSnapshot() { return true; },
        async restoreSnapshot() { return true; },
      },
    },
    ui: { onSnapshotSaved: (...args) => saved.push(args) },
  });
  assert.deepEqual(await feature.bulkLights("off", "house"), { ok: true });
  assert.deepEqual(await feature.saveSnapshot("house"), { ok: true });
  assert.deepEqual(await feature.restoreSnapshot("house"), { ok: true });
  assert.deepEqual(saved, [["house", null]]);

  const rejected = createLightsColorSnapshotsFeature({
    state: { devices: [], devMap: new Map(), favDevMap: new Map(), snapshots: {} },
    services: {
      api: {
        async bulkLights() { return false; },
        async saveSnapshot() { return false; },
        async restoreSnapshot() { return false; },
      },
    },
    ui: { onSnapshotSaved: () => saved.push(["unexpected"]) },
  });
  assert.deepEqual(await rejected.bulkLights("on", "house"), { ok: false });
  assert.deepEqual(await rejected.saveSnapshot("house"), { ok: false });
  assert.deepEqual(await rejected.restoreSnapshot("house"), { ok: false });
  assert.deepEqual(saved, [["house", null]]);
});

test("feature APIs fail closed when handlers are unavailable or throw", async () => {
  const feature = createLightsColorSnapshotsFeature({
    state: { devices: [], devMap: new Map(), favDevMap: new Map(), snapshots: {} },
    services: {
      api: {
        async bulkLights() { throw new Error("down"); },
        async saveSnapshot() { throw new Error("down"); },
        async restoreSnapshot() { throw new Error("down"); },
      },
    },
    ui: {},
  });
  assert.deepEqual(await feature.bulkLights("on", "house"), { ok: false, error: "down" });
  assert.deepEqual(await feature.saveSnapshot("house"), { ok: false, error: "down" });
  assert.deepEqual(await feature.restoreSnapshot("house"), { ok: false, error: "down" });

  const noApiFeature = createLightsColorSnapshotsFeature({
    state: { devices: [], devMap: new Map(), favDevMap: new Map(), snapshots: {} },
    services: {},
    ui: {},
  });
  assert.deepEqual(await noApiFeature.bulkLights("on", "house"), {
    ok: false,
    error: "bulk_lights_api_unavailable",
  });
  assert.deepEqual(await noApiFeature.saveSnapshot("house"), {
    ok: false,
    error: "snapshot_save_api_unavailable",
  });
  assert.deepEqual(await noApiFeature.restoreSnapshot("house"), {
    ok: false,
    error: "snapshot_restore_api_unavailable",
  });
});

test("lifecycle hooks and direct event routing stay stable", () => {
  const { feature, renders } = fixture();
  feature.init();
  feature.render("manual", "all");
  const routed = feature.applyHubEvent({ source: "DEVICE", deviceId: 1, name: "switch", value: "off" });
  assert.deepEqual(routed, { handled: true, kind: "switch" });
  feature.pause();
  feature.resume();
  feature.dispose();
  assert.equal(renders[0].reason, "init");
  assert.equal(renders[1].reason, "manual");
  assert.equal(renders.at(-1).reason, "resume");
});
