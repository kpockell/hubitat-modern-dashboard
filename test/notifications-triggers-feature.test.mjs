import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createNotificationsTriggersFeature,
  normalizeNotifications,
} from "../src/client/features/notifications-triggers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function notificationTriggerRequestFromSource(fetchImpl) {
  const source = readFileSync(join(root, "src/client/legacy/post2.js"), "utf8");
  const marker = "async function notificationTriggerRequest";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "notificationTriggerRequest missing from legacy source");
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) {
      end = index + 1;
      break;
    }
  }
  assert.notEqual(end, -1, "notificationTriggerRequest body is incomplete");
  const declaration = source.slice(start, end);
  return Function("fetch", "withToken", `${declaration}; return notificationTriggerRequest;`)(
    fetchImpl,
    (path) => path,
  );
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(overrides = {}) {
  const state = {
    hubNotifications: [],
    hubTileNotifications: [],
    hubTriggerActions: [],
    notificationCards: [{ id: "n_alerts" }],
    notificationDeviceIds: new Set([10]),
    tileNotificationDeviceIds: new Set([11]),
    triggerSourceIds: new Set([12]),
    playedTriggerToneIds: new Map(),
    notificationTriggerState: {
      triggersEnabled: true,
      alertsArmed: true,
      alertsArmSwitchId: 13,
    },
  };
  const calls = [];
  const errors = [];
  const scheduled = new Map();
  let nextTimer = 1;
  let activeCameraId = null;
  const api = {
    fetchNotifications: async () => ({ ok: true, notifications: [] }),
    fetchTileNotifications: async () => ({ ok: true, tileNotifications: [] }),
    fetchTriggerActions: async () => ({ ok: true, triggerActions: [] }),
    acknowledge: async () => ({ ok: true }),
    setAlertsArmed: async (armed) => ({ ok: true, alertsArmed: armed }),
    ...overrides.api,
  };
  const services = {
    now: () => 1_000,
    isGateOpen: () => false,
    isLocal: () => true,
    api,
    timers: {
      setTimeout(fn) { const id = nextTimer++; scheduled.set(id, fn); return id; },
      clearTimeout(id) { scheduled.delete(id); },
    },
    ...overrides.services,
  };
  const ui = {
    renderNotificationsTriggers: (_snapshot, reason) => calls.push(["render", reason]),
    notificationsChanged: () => calls.push(["notifications"]),
    tileNotificationsChanged: () => calls.push(["tiles"]),
    pruneNotificationLocalState: (alive) => calls.push(["prune", [...alive]]),
    notificationAcknowledged: (id) => calls.push(["acknowledged", id]),
    syncArmed: (armed) => calls.push(["armed", armed]),
    stopTone: () => calls.push(["stop-tone"]),
    playTone: (tone) => calls.push(["tone", tone]),
    showCameraOverlay: (action, caption) => {
      activeCameraId = action.id;
      calls.push(["camera", action.id, caption]);
    },
    activeCameraId: () => activeCameraId,
    teardownCameraOverlay: (reason) => { activeCameraId = null; calls.push(["teardown", reason]); },
    hideNotificationPopup: () => calls.push(["hide-popup"]),
    syncNotificationPopup: () => calls.push(["sync-popup"]),
    pauseCameraOverlay: () => calls.push(["pause-camera"]),
    acknowledgementChanged: (kind, id, pending) => calls.push(["ack", kind, id, pending]),
    error: (message) => errors.push(message),
    ...overrides.ui,
  };
  const feature = createNotificationsTriggersFeature({ state, services, ui });
  return { feature, state, calls, errors, scheduled, api, setActiveCamera: (id) => { activeCameraId = id; } };
}

test("notification normalization coerces supported fields and rejects incomplete entries", () => {
  assert.deepEqual(normalizeNotifications([
    { id: 1, text: 2, ts: "3", deviceId: "4", deviceName: 5 },
    { id: "", text: "missing id" },
    { id: "empty", text: "" },
    null,
  ]), [{ id: "1", text: "2", ts: 3, deviceId: 4, deviceName: "5" }]);
  assert.deepEqual(normalizeNotifications(null), []);
});

test("initial render and notification payloads preserve collection identity", () => {
  const { feature, state, calls } = fixture();
  const notifications = state.hubNotifications;
  const ids = state.notificationDeviceIds;
  feature.init();
  feature.applyNotificationsFromData({
    notifications: [{ id: 1, text: "Door", ts: 20 }],
    notificationDeviceIds: [10, "bad", 14],
  });
  assert.strictEqual(state.hubNotifications, notifications);
  assert.strictEqual(state.notificationDeviceIds, ids);
  assert.deepEqual(state.hubNotifications, [{ id: "1", text: "Door", ts: 20, deviceId: null, deviceName: "" }]);
  assert.deepEqual([...state.notificationDeviceIds], [10, 14]);
  assert.deepEqual(calls.find((call) => call[0] === "prune"), ["prune", ["1"]]);
});

test("tile notification payloads sort newest first and ignore unrelated data", () => {
  const { feature, state } = fixture();
  assert.equal(feature.applyTileNotificationsFromData({ config: {} }), false);
  assert.equal(feature.applyTileNotificationsFromData({
    tileNotifications: [{ id: "a", text: "Old", ts: 1 }, { id: "b", text: "New", ts: 2 }],
    tileNotificationDeviceIds: [20],
  }), true);
  assert.deepEqual(state.hubTileNotifications.map((item) => item.id), ["b", "a"]);
  assert.deepEqual([...state.tileNotificationDeviceIds], [20]);
});

test("trigger reconciliation prunes expired actions and dispatches newest camera and one tone", () => {
  const { feature, state, calls } = fixture();
  const sourceIds = state.triggerSourceIds;
  const actions = state.hubTriggerActions;
  state.hubNotifications.push({ id: "n1", text: "Front door" });
  state.playedTriggerToneIds.set("old", 999);
  feature.applyTriggerControlsFromData({ triggerSourceIds: [12, "bad"] });
  assert.strictEqual(state.hubTriggerActions, actions);
  assert.deepEqual(state.hubTriggerActions, []);
  feature.applyTriggerActionsFromData({
    alertsArmed: true,
    alertsArmSwitchId: "13",
    triggerSourceIds: [12, "bad"],
    triggerActions: [
      { id: "expired", cameraId: 1, cameraExpiresAt: 999 },
      { id: "cam1", cameraId: 1, cameraExpiresAt: 2_000, toneId: "alert", toneExpiresAt: 1_500 },
      { id: "cam2", cameraId: 2, cameraExpiresAt: 3_000, notificationId: "n1" },
      { id: "text", notificationId: "missing" },
    ],
  });
  assert.deepEqual(state.hubTriggerActions.map((action) => action.id), ["cam1", "cam2", "text"]);
  assert.strictEqual(state.triggerSourceIds, sourceIds);
  assert.deepEqual([...sourceIds], [12]);
  assert.equal(state.playedTriggerToneIds.has("old"), false);
  assert.ok(calls.some((call) => call[0] === "camera" && call[1] === "cam2" && call[2] === "Front door"));
  assert.deepEqual(calls.find((call) => call[0] === "tone"), ["tone", "alert"]);

  feature.applyTriggerActionsFromData({ triggerActions: state.hubTriggerActions });
  assert.equal(calls.filter((call) => call[0] === "tone").length, 1);
});

test("trigger reconciliation tears down stale overlays and stops tone when shunted", () => {
  const { feature, calls, setActiveCamera } = fixture();
  setActiveCamera("gone");
  feature.applyTriggerActionsFromData({ alertsArmed: false, triggerActions: [] });
  assert.ok(calls.some((call) => call[0] === "stop-tone"));
  assert.ok(calls.some((call) => call[0] === "teardown" && call[1] === "hub"));
  feature.applyTriggerActionsFromData({ triggerActions: [] });
  assert.ok(calls.some((call) => call[0] === "sync-popup"));
  assert.equal(feature.applyTriggerActionsFromData(null), false);
  assert.equal(feature.applyTriggerActionsFromData({ triggersEnabled: false }), false);
});

test("fetches serialize and queue one follow-up request", async () => {
  const first = deferred();
  let count = 0;
  const { feature, state } = fixture({
    api: {
      fetchNotifications: async () => {
        count += 1;
        if (count === 1) return first.promise;
        return { ok: true, notifications: [{ id: "second", text: "Second" }] };
      },
    },
  });
  const active = feature.fetchNotifications();
  const queued = feature.fetchNotifications();
  first.resolve({ ok: true, notifications: [{ id: "first", text: "First" }] });
  await Promise.all([active, queued]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(count, 2);
  assert.equal(state.hubNotifications[0].id, "second");
});

test("fetch guards and request failures fail closed", async () => {
  const gated = fixture({ services: { isGateOpen: () => true } });
  assert.equal(await gated.feature.fetchNotifications(), null);
  assert.equal(await gated.feature.fetchTileNotifications(), null);
  assert.equal(await gated.feature.fetchTriggerActions(), null);

  const failed = fixture({ api: { fetchNotifications: async () => { throw new Error("offline"); } } });
  assert.deepEqual(await failed.feature.fetchNotifications(), { ok: false, error: "offline" });
});

test("malformed request responses preserve notifications and armed state", async () => {
  let response = { ok: true, json: async () => { throw new Error("truncated"); } };
  const request = notificationTriggerRequestFromSource(async () => response);
  assert.deepEqual(await request("notifications"), { ok: false, error: "bad_json" });
  response = { ok: true, json: async () => null };
  assert.deepEqual(await request("alerts/arm", "POST", { armed: false }), {
    ok: false,
    error: "bad_json",
  });
  response = { ok: true, json: async () => ({}) };
  assert.deepEqual(await request("notifications"), { ok: true });

  const malformed = { ok: false, error: "bad_json" };
  const guarded = fixture({
    api: {
      fetchNotifications: async () => malformed,
      setAlertsArmed: async () => malformed,
    },
  });
  guarded.state.hubNotifications.push({ id: "existing", text: "Keep me" });
  await guarded.feature.fetchNotifications();
  await guarded.feature.setAlertsArmed(false);
  assert.deepEqual(guarded.state.hubNotifications, [{ id: "existing", text: "Keep me" }]);
  assert.equal(guarded.state.notificationTriggerState.alertsArmed, true);
});

test("acknowledgements apply server payloads, local fallbacks, and errors", async () => {
  const { feature, state, calls } = fixture({
    api: {
      acknowledge: async (kind) => kind === "notifications"
        ? { ok: true, notifications: [] }
        : { ok: true },
    },
  });
  state.hubNotifications.push({ id: "n", text: "N" });
  state.hubTileNotifications.push({ id: "t", text: "T" });
  state.hubTriggerActions.push({ id: "a", notificationId: "n" });
  await feature.acknowledgeNotification("n");
  await feature.acknowledgeTileNotification("t");
  await feature.acknowledgeTriggerAction("a");
  assert.deepEqual(state.hubNotifications, []);
  assert.deepEqual(state.hubTileNotifications, []);
  assert.deepEqual(state.hubTriggerActions, []);
  assert.ok(calls.some((call) => call[0] === "acknowledged" && call[1] === "n"));
  assert.equal(calls.filter((call) => call[0] === "ack" && call[3]).length, 3);

  const rejected = fixture({ api: { acknowledge: async () => ({ ok: false, error: "denied" }) } });
  assert.deepEqual(await rejected.feature.acknowledgeNotification("n"), { ok: false, error: "denied" });
  assert.deepEqual(rejected.errors, ["denied"]);
  assert.equal(await rejected.feature.acknowledgeNotification(""), null);

  const payloads = fixture({
    api: {
      acknowledge: async (kind) => {
        if (kind === "tiles") return { ok: true, tileNotifications: [] };
        if (kind === "triggers") return { ok: true, triggerActions: [] };
        return { ok: true };
      },
    },
  });
  payloads.state.hubNotifications.push({ id: "n", text: "N" });
  payloads.state.hubTileNotifications.push({ id: "t", text: "T" });
  payloads.state.hubTriggerActions.push({ id: "a", notificationId: "n" });
  await payloads.feature.acknowledgeNotification("n");
  await payloads.feature.acknowledgeTileNotification("t");
  await payloads.feature.acknowledgeTriggerAction("a");
  assert.deepEqual(payloads.state.hubNotifications, []);
  assert.deepEqual(payloads.state.hubTileNotifications, []);
  assert.deepEqual(payloads.state.hubTriggerActions, []);

  const failed = fixture({ api: { acknowledge: async () => { throw new Error("offline"); } } });
  failed.state.hubTriggerActions.push({ id: "a", notificationId: "n" });
  assert.deepEqual(await failed.feature.acknowledgeTriggerAction("a"), { ok: false, error: "offline" });
  assert.deepEqual(failed.state.hubTriggerActions, []);
  assert.deepEqual(failed.errors, []);
});

test("arm updates cover success, rejection, and timeout", async () => {
  const success = fixture();
  assert.deepEqual(await success.feature.setAlertsArmed(false), { ok: true, alertsArmed: false });
  assert.equal(success.state.notificationTriggerState.alertsArmed, false);

  const rejected = fixture({ api: { setAlertsArmed: async () => ({ ok: false, error: "denied" }) } });
  assert.deepEqual(await rejected.feature.setAlertsArmed(true), { ok: false, error: "denied" });
  const timedOut = fixture({ api: { setAlertsArmed: async () => { throw new Error("timeout"); } } });
  assert.deepEqual(await timedOut.feature.setAlertsArmed(true), { ok: false, error: "timeout" });
});

test("Hubitat event routing debounces queues and lifecycle clears effects", () => {
  const { feature, state, scheduled, calls } = fixture();
  assert.deepEqual(feature.routeHubEvent({ source: "DEVICE", deviceId: 10, name: "notificationText" }), {
    handled: true, scheduled: true,
  });
  feature.routeHubEvent({ source: "DEVICE", deviceId: 10, name: "notificationText" });
  assert.equal(scheduled.size, 1);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 11, name: "lastMessage" }), true);
  assert.deepEqual(feature.routeHubEvent({ source: "DEVICE", deviceId: 12, name: "motion" }), {
    handled: false, scheduled: true,
  });
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 13, name: "switch", value: "off" }), true);
  assert.equal(state.notificationTriggerState.alertsArmed, false);
  assert.equal(feature.handleHubEvent({ source: "LOCATION" }), false);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", deviceId: 99, name: "switch" }), false);
  for (const run of [...scheduled.values()]) run();
  scheduled.clear();
  feature.pause();
  assert.equal(scheduled.size, 0);
  feature.resume();
  feature.dispose();
  assert.ok(calls.some((call) => call[0] === "pause-camera"));
  assert.equal(calls.at(-1)[0], "stop-tone");
});

test("trigger-source routing schedules a later notification refresh independently", async () => {
  let triggerFetches = 0;
  let notificationFetches = 0;
  const { feature, scheduled } = fixture({
    api: {
      fetchTriggerActions: async () => {
        triggerFetches += 1;
        return { ok: true, triggerActions: [] };
      },
      fetchNotifications: async () => {
        notificationFetches += 1;
        return { ok: true, notifications: [] };
      },
    },
  });

  feature.routeHubEvent({ source: "DEVICE", deviceId: 12, name: "motion", value: "active" });
  assert.equal(scheduled.size, 1);
  const [triggerTimerId, runTriggerTimer] = scheduled.entries().next().value;
  scheduled.delete(triggerTimerId);
  runTriggerTimer();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(triggerFetches, 1);
  assert.equal(notificationFetches, 0);
  assert.equal(scheduled.size, 1);

  const [notificationTimerId, runNotificationTimer] = scheduled.entries().next().value;
  scheduled.delete(notificationTimerId);
  runNotificationTimer();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notificationFetches, 1);
});
