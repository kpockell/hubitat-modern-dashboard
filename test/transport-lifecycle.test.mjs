import assert from "node:assert/strict";
import test from "node:test";
import {
  createLifecycleController,
  createSessionService,
  createTransport,
} from "../src/client/transport/index.mjs";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    values,
  };
}

test("session service loads, persists, expires, and appends OAuth/session tokens", () => {
  let now = 1_000;
  const storage = memoryStorage({ session: "saved", expires: "2000" });
  const changes = [];
  const session = createSessionService({
    storage,
    now: () => now,
    sessionKey: "session",
    expiresKey: "expires",
    accessToken: "a token",
    onChange: (state) => changes.push({ ...state }),
  });

  assert.deepStrictEqual(session.load(), { session: "saved", expiresAt: 2000 });
  assert.strictEqual(session.isFresh(), true);
  assert.strictEqual(session.withToken("data"), "data?access_token=a%20token&dash_session=saved");
  assert.strictEqual(session.withToken("data?x=1"), "data?x=1&access_token=a%20token&dash_session=saved");
  assert.strictEqual(session.withOAuthToken("sw.js"), "sw.js?access_token=a%20token");

  now = 2_001;
  assert.strictEqual(session.isFresh(), false);
  assert.strictEqual(session.withToken("data"), "data?access_token=a%20token");
  session.applyResponse({ dashSession: "next", dashSessionExpiresAt: 4000 });
  assert.strictEqual(storage.values.get("session"), "next");
  session.clear();
  assert.strictEqual(storage.values.has("session"), false);
  assert.deepStrictEqual(session.state, { session: "", expiresAt: 0 });
  assert.deepStrictEqual(session.applyResponse(null), { session: "", expiresAt: 0 });
  assert.deepStrictEqual(session.applyResponse({ ok: true }), { session: "", expiresAt: 0 });
  assert.ok(changes.length >= 3);
});

test("session storage failures fail closed and token helpers work without OAuth", () => {
  const brokenStorage = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); },
  };
  const session = createSessionService({ storage: brokenStorage, now: () => 10 });
  assert.deepStrictEqual(session.load(), { session: "", expiresAt: 0 });
  assert.deepStrictEqual(session.save("value", "invalid"), { session: "value", expiresAt: 0 });
  assert.strictEqual(session.withToken("data"), "data");
  assert.strictEqual(session.withOAuthToken("sw.js?x=1"), "sw.js?x=1");
});

test("transport classifies timeout, network, HTTP, JSON, and auth failures", async () => {
  const session = createSessionService({ storage: memoryStorage(), accessToken: "token" });
  let fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const transport = createTransport({
    fetch: (...args) => fetchImpl(...args),
    session,
    ensureAccess: async () => {},
  });

  fetchImpl = async () => { const error = new Error("aborted"); error.name = "AbortError"; throw error; };
  await assert.rejects(transport.getJson("data"), (error) => error.code === "timeout");
  fetchImpl = async () => { throw new Error("offline"); };
  await assert.rejects(transport.getJson("data"), (error) => error.code === "network");
  fetchImpl = async () => ({ ok: false, status: 503, json: async () => ({}) });
  await assert.rejects(transport.getJson("data"), (error) => error.status === 503);
  fetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new Error("bad"); } });
  await assert.rejects(transport.getJson("data"), (error) => error.code === "bad_json");
  fetchImpl = async () => ({ ok: false, status: 401, json: async () => ({}) });
  await assert.rejects(transport.getJson("data"), (error) => error.code === "auth_required");

  fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ session: "renewed", expiresAt: Date.now() + 10_000 }),
  });
  assert.strictEqual((await transport.getJson("data")).session, "renewed");
});

test("commands cover success, rejection, partial failure, and network failure", async () => {
  const flashes = [];
  const requests = [];
  let response = { ok: true, status: 200, json: async () => ({ ok: true }) };
  const transport = createTransport({
    fetch: async (...args) => { requests.push(args); if (response instanceof Error) throw response; return response; },
    session: createSessionService({ storage: memoryStorage(), accessToken: "token" }),
    flash: (...args) => flashes.push(args),
  });

  assert.deepStrictEqual(await transport.sendCommand(7, "set level", "50 & up", "1234"), { ok: true });
  assert.match(requests[0][0], /cmd\?id=7&c=set%20level&v=50%20%26%20up&pin=1234/);

  response = { ok: false, status: 500, json: async () => ({ error: "hub rejected" }) };
  assert.deepStrictEqual(await transport.sendCommand(7, "on"), { ok: false, status: 500, error: "hub rejected" });
  response = { ok: true, status: 200, json: async () => ({ ok: true, failed: 1, total: 2 }) };
  assert.deepStrictEqual(await transport.sendBatch([{ id: 1, cmd: "on" }, { id: 2, cmd: "off" }]), {
    ok: true, failed: 1, total: 2,
  });
  response = new Error("offline");
  assert.deepStrictEqual(await transport.sendBatch([{ id: 1, cmd: "on" }, { id: 2, cmd: "off" }]), {
    ok: false, failed: 2, total: 2,
  });
  assert.deepStrictEqual(await transport.sendCommand(7, "on"), { ok: false });
  assert.deepStrictEqual(await transport.sendBatch([]), { ok: true, failed: 0 });

  response = { ok: true, status: 200, json: async () => ({ ok: true }) };
  assert.deepStrictEqual(await transport.sendBatch([{ id: 1, cmd: "on", val: null }]), {
    ok: true, failed: 0, total: 1,
  });
  response = { ok: false, status: 503, json: async () => { throw new Error("not json"); } };
  assert.deepStrictEqual(await transport.sendBatch([{ id: 1, cmd: "on" }, { id: 2, cmd: "off" }]), {
    ok: false, failed: 2, total: 2,
  });
  assert.ok(flashes.length >= 3);
});

test("transport suppresses expected PIN failures and validates its session dependency", async () => {
  assert.throws(() => createTransport(), /session service/);
  const flashes = [];
  const transport = createTransport({
    fetch: async () => ({ ok: false, status: 403, json: async () => ({ error: "wrong pin" }) }),
    session: createSessionService({ storage: memoryStorage() }),
    flash: (...args) => flashes.push(args),
  });
  assert.deepStrictEqual(await transport.sendCommand(1, "unlock", null, "bad"), {
    ok: false, status: 403, error: "wrong pin",
  });
  assert.deepStrictEqual(flashes, []);
});

test("fetch timeout aborts through injected timers and always clears the timer", async () => {
  let timeout = null;
  let cleared = false;
  const transport = createTransport({
    session: createSessionService({ storage: memoryStorage() }),
    setTimeout(fn) { timeout = fn; return 9; },
    clearTimeout(id) { assert.strictEqual(id, 9); cleared = true; },
    fetch: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  });
  const pending = transport.fetchWithTimeout("data");
  timeout();
  await assert.rejects(pending, /aborted/);
  assert.strictEqual(cleared, true);
});

test("lifecycle selects local WebSocket or cloud polling and cleans up", () => {
  const intervals = new Map();
  const timeouts = new Map();
  let id = 0;
  const calls = [];
  class FakeSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; FakeSocket.last = this; }
    close() { calls.push("socket-close"); this.readyState = 3; }
  }
  const config = { pollIntervalMs: 1000, useWebSocket: true };
  const lifecycle = createLifecycleController({
    getConfig: () => config,
    isHidden: () => false,
    isGateOpen: () => false,
    isReorderActive: () => false,
    location: { hostname: "hub.local", protocol: "http:", host: "hub.local" },
    WebSocket: FakeSocket,
    refresh: () => calls.push("refresh"),
    onSocketMessage: (event) => calls.push(event.data),
    pauseEffects: () => calls.push("pause-effects"),
    resumeUi: () => calls.push("resume-ui"),
    setInterval: (fn, delay) => { const key = ++id; intervals.set(key, { fn, delay }); return key; },
    clearInterval: (key) => intervals.delete(key),
    setTimeout: (fn, delay) => { const key = ++id; timeouts.set(key, { fn, delay }); return key; },
    clearTimeout: (key) => timeouts.delete(key),
  });

  lifecycle.sync();
  assert.strictEqual([...intervals.values()][0].delay, 2000);
  assert.strictEqual(FakeSocket.last.url, "ws://hub.local/eventsocket");
  FakeSocket.last.readyState = FakeSocket.OPEN;
  FakeSocket.last.onopen();
  assert.strictEqual(lifecycle.connected, true);
  assert.strictEqual(lifecycle.socket, FakeSocket.last);
  assert.strictEqual(lifecycle.retry, 0);
  assert.strictEqual([...intervals.values()][0].delay, 45_000);
  FakeSocket.last.onmessage({ data: "event" });
  FakeSocket.last.onerror();
  assert.strictEqual(lifecycle.startSocket(), FakeSocket.last);
  FakeSocket.last.onclose();
  assert.strictEqual(lifecycle.connected, false);
  assert.ok([...timeouts.values()][0].delay >= 2_000);

  lifecycle.pause();
  assert.strictEqual(intervals.size, 0);
  assert.ok(calls.includes("pause-effects"));
  lifecycle.resume();
  assert.ok(calls.includes("resume-ui"));
  lifecycle.dispose();
  assert.strictEqual(timeouts.size, 0);

  const cloud = createLifecycleController({
    getConfig: () => config,
    location: { hostname: "cloud.hubitat.com", protocol: "https:", host: "cloud.hubitat.com" },
    WebSocket: FakeSocket,
    refresh() {},
  });
  assert.strictEqual(cloud.startSocket(), null);
});

test("lifecycle covers guards, failed sockets, retry callbacks, and hidden resumes", () => {
  let hidden = true;
  let reorder = false;
  let useWebSocket = false;
  let timeoutCallback = null;
  const lifecycle = createLifecycleController({
    getConfig: () => ({ useWebSocket, pollIntervalMs: 9_000 }),
    isHidden: () => hidden,
    isReorderActive: () => reorder,
    isGateOpen: () => false,
    location: { hostname: "hub.local", protocol: "http:", host: "hub.local" },
    WebSocket: class BrokenSocket { constructor() { throw new Error("no socket"); } },
    refresh() {},
    setTimeout(fn) { timeoutCallback = fn; return 1; },
    clearTimeout() { timeoutCallback = null; },
  });

  assert.strictEqual(lifecycle.restartPolling(), null);
  assert.strictEqual(lifecycle.scheduleReconnect(), null);
  assert.strictEqual(lifecycle.sync(), false);
  assert.strictEqual(lifecycle.resume(), false);
  hidden = false;
  reorder = true;
  assert.strictEqual(lifecycle.restartPolling(), null);
  useWebSocket = true;
  assert.strictEqual(lifecycle.startSocket(), null);
  lifecycle.scheduleReconnect();
  assert.ok(timeoutCallback);
  timeoutCallback();
  lifecycle.stopSocket();
});
