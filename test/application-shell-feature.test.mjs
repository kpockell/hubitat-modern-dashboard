import assert from "node:assert/strict";
import test from "node:test";
import { createApplicationShellFeature } from "../src/client/features/application-shell.mjs";

function fakeDocument() {
  const listeners = new Map();
  return {
    visibilityState: "hidden",
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    removeEventListener(name, handler) {
      if (listeners.get(name) === handler) listeners.delete(name);
    },
    emit(name) {
      listeners.get(name)?.();
    },
    listenerCount() { return listeners.size; },
  };
}

test("application shell feature leaves non-auth hub events to other features", () => {
  const feature = createApplicationShellFeature({
    state: { dashboardPasswordRequired: false },
    services: {},
    ui: {},
  });
  assert.equal(feature.handleHubEvent({ source: "LOCATION", name: "mode", value: "Away" }), false);
  assert.equal(feature.handleHubEvent({ source: "DEVICE", name: "switch", value: "on" }), false);
});

test("auth state transitions clear sessions and close active gates", () => {
  const state = { dashboardPasswordRequired: false };
  const calls = [];
  let gateOpen = true;
  const feature = createApplicationShellFeature({
    state,
    services: { clearDashSession: () => calls.push("clear-session") },
    ui: {
      isGateOpen: () => gateOpen,
      closeGateAndResolve() {
        calls.push("close-gate");
        gateOpen = false;
      },
    },
  });

  feature.setAuthRequired(true);
  assert.equal(state.dashboardPasswordRequired, true);
  feature.setAuthRequired(false);
  assert.equal(state.dashboardPasswordRequired, false);
  assert.deepEqual(calls, ["clear-session", "close-gate"]);
});

test("ensure dashboard access covers required, fresh-session, and prompt flows", async () => {
  const state = { dashboardPasswordRequired: false };
  const calls = [];
  let required = false;
  let fresh = false;
  const feature = createApplicationShellFeature({
    state,
    services: {
      async fetchAuthStatus() { calls.push("fetch"); return { required }; },
      loadDashSession: () => calls.push("load"),
      isDashSessionFresh: () => fresh,
      setupDashSessionActivityRenewal: () => calls.push("renewal"),
      promptDashboardPassword: async () => { calls.push("prompt"); },
      clearDashSession: () => calls.push("clear"),
    },
    ui: { isGateOpen: () => false },
  });

  await feature.ensureDashboardAccess();
  assert.equal(state.dashboardPasswordRequired, false);
  assert.deepEqual(calls, ["load", "fetch", "clear"]);

  required = true;
  fresh = true;
  calls.length = 0;
  await feature.ensureDashboardAccess();
  assert.equal(state.dashboardPasswordRequired, true);
  assert.deepEqual(calls, ["load", "fetch", "renewal"]);

  fresh = false;
  calls.length = 0;
  await feature.ensureDashboardAccess();
  assert.deepEqual(calls, ["load", "fetch", "prompt", "load", "renewal"]);
});

test("gate polling and visibility hooks are attached and cleared", async () => {
  const doc = fakeDocument();
  const intervals = [];
  const cleared = [];
  let gateOpen = false;
  let fetchCount = 0;
  const feature = createApplicationShellFeature({
    state: { dashboardPasswordRequired: true },
    services: {
      document: doc,
      timers: {
        setInterval(handler, ms) {
          intervals.push({ handler, ms });
          return intervals.length;
        },
        clearInterval(id) { cleared.push(id); },
      },
      async fetchAuthStatus() { fetchCount += 1; return { required: true }; },
      clearDashSession() {},
    },
    ui: {
      isGateOpen: () => gateOpen,
      closeGateAndResolve() {},
    },
  });

  feature.init();
  assert.equal(doc.listenerCount(), 1);

  gateOpen = true;
  feature.gateOpened();
  assert.equal(intervals.length, 1);
  await intervals[0].handler();
  assert.equal(fetchCount, 1);

  doc.visibilityState = "visible";
  doc.emit("visibilitychange");
  assert.equal(fetchCount, 2);

  feature.gateClosed();
  assert.deepEqual(cleared, [1]);
  feature.dispose();
  assert.equal(doc.listenerCount(), 0);
});
