import assert from "node:assert/strict";
import test from "node:test";
import {
  createFeatureRegistry,
  createRuntime,
  createStore,
  registerFeature,
  replaceCollection,
  replaceRecord,
} from "../src/client/runtime/index.mjs";

test("collection replacement preserves identity for arrays, maps, and sets", () => {
  const array = [{ i: 1 }];
  const map = new Map([["old", 1]]);
  const set = new Set(["old"]);

  assert.strictEqual(replaceCollection(array, [{ i: 2 }]), array);
  assert.deepStrictEqual(array, [{ i: 2 }]);
  assert.strictEqual(replaceCollection(map, new Map([["next", 2]])), map);
  assert.deepStrictEqual([...map], [["next", 2]]);
  assert.strictEqual(replaceCollection(set, ["next"]), set);
  assert.deepStrictEqual([...set], ["next"]);

  replaceCollection(array, null);
  assert.deepStrictEqual(array, []);
  replaceCollection(map, { object: 3 });
  assert.deepStrictEqual([...map], [["object", 3]]);
  replaceCollection(set, null);
  assert.deepStrictEqual([...set], []);
  assert.throws(() => replaceCollection({}, []), /Array, Map, or Set/);
});

test("record replacement preserves identity and removes stale properties", () => {
  const record = { keep: 1, stale: true };
  assert.strictEqual(replaceRecord(record, { keep: 2, added: 3 }), record);
  assert.deepStrictEqual(record, { keep: 2, added: 3 });
  replaceRecord(record, null);
  assert.deepStrictEqual(record, {});
  assert.throws(() => replaceRecord([], {}), /plain object/);
});

test("store emits controlled changes and patches devices in place", () => {
  const devices = [{ i: 7, n: "Lamp", s: 0 }];
  const rooms = [1];
  const store = createStore({ devices, rooms });
  const changes = [];
  const unsubscribe = store.subscribe((change, state) => changes.push([change, state]));

  assert.strictEqual(store.replaceCollection("rooms", [2, 3]), rooms);
  assert.strictEqual(store.patchDevice(7, { s: 1 }), devices[0]);
  assert.deepStrictEqual(devices[0], { i: 7, n: "Lamp", s: 1 });
  assert.strictEqual(store.patchDevice(99, { s: 1 }), null);
  assert.deepStrictEqual(changes.map(([change]) => change.type), ["replace", "device-patch"]);
  assert.ok(changes.every(([, state]) => state === store.state));

  unsubscribe();
  store.replaceCollection("rooms", []);
  assert.strictEqual(changes.length, 2);

  store.state.metadata = { stale: true };
  assert.strictEqual(store.replaceRecord("metadata", { fresh: true }), store.state.metadata);
  assert.deepStrictEqual(store.state.metadata, { fresh: true });
});

test("store validates subscriptions and supports alternate device collections", () => {
  assert.throws(() => createStore([]), /Initial state/);
  const accessory = { id: "a", value: 1 };
  const store = createStore({ accessories: [accessory], invalid: null });
  assert.throws(() => store.subscribe(null), /listener/);
  assert.strictEqual(
    store.patchDevice("a", { value: 2 }, { collection: "accessories", idKey: "id" }),
    accessory,
  );
  assert.strictEqual(store.patchDevice("a", null, { collection: "accessories", idKey: "id" }), null);
  assert.strictEqual(store.patchDevice("a", {}, { collection: "invalid", idKey: "id" }), null);
});

test("feature registry supplies only the public runtime context and runs lifecycle hooks", async () => {
  const calls = [];
  const context = { state: { ready: false }, services: { command: () => {} }, ui: { flash: () => {} } };
  const features = createFeatureRegistry(context);
  const feature = features.registerFeature("lights", ({ state, services, ui }) => ({
    init() { calls.push(["init", state, services, ui]); },
    render(value) { calls.push(["render", value]); return "rendered"; },
    handleHubEvent(event) { calls.push(["event", event]); },
    pause() { calls.push(["pause"]); },
    resume() { calls.push(["resume"]); },
    dispose() { calls.push(["dispose"]); },
  }));

  assert.strictEqual(features.get("lights"), feature);
  assert.deepStrictEqual(features.names(), ["lights"]);
  assert.deepStrictEqual(await features.init(), [undefined]);
  assert.deepStrictEqual(await features.render("room"), ["rendered"]);
  await features.handleHubEvent({ id: 7 });
  await features.pause();
  await features.resume();
  await features.dispose();
  assert.deepStrictEqual(calls.map(([name]) => name), ["init", "render", "event", "pause", "resume", "dispose"]);
  assert.deepStrictEqual(calls[0].slice(1), [context.state, context.services, context.ui]);
  assert.deepStrictEqual(features.names(), []);
});

test("registry rejects duplicate names and unsupported hook contracts", () => {
  const features = createFeatureRegistry({ state: {}, services: {}, ui: {} });
  features.registerFeature("locks", {});
  assert.throws(() => features.registerFeature("locks", {}), /already registered/);
  assert.throws(() => features.registerFeature("bad name", {}), /feature name/);
  assert.throws(() => features.registerFeature("bad-hook", { render: true }), /render.*function/);
  assert.throws(() => features.registerFeature("empty-factory", () => null), /object or constructor/);
});

test("createRuntime composes state, services, store, UI, and an isolated registry", () => {
  const initialState = { devices: [] };
  const command = () => "ok";
  const ui = { flash: () => {} };
  const runtime = createRuntime({ services: { command }, ui }, initialState);

  assert.strictEqual(runtime.state, initialState);
  assert.strictEqual(runtime.services.command, command);
  assert.strictEqual(runtime.services.store.state, initialState);
  assert.strictEqual(runtime.features.context.ui, ui);
  runtime.features.registerFeature("one", {});

  const other = createRuntime({}, {});
  assert.deepStrictEqual(other.features.names(), []);
});

test("standalone registerFeature supports an explicit registry", () => {
  const features = createFeatureRegistry({ state: {}, services: {}, ui: {} });
  const feature = registerFeature("scene", { render() {} }, features);
  assert.strictEqual(features.get("scene"), feature);
  assert.ok(registerFeature("default-registry-feature", {}));
});
