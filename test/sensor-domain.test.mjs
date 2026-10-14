import assert from "node:assert/strict";
import test from "node:test";
import {
  applySensorLiveAttr,
  applySensorPayload,
  applySensorWsAttr,
  applyTempSensorPayload,
  applyTempSensorWsAttr,
  buildMergedSensorCard,
  climateSensorsByRoom,
  filterSensorExForType,
  sensorCardFilterTypes,
  sensorExKeyAllowed,
  sensorTemperatureReading,
  syncTempSensorFromSensorEntry,
} from "../src/client/domain/sensors.mjs";

test("sensor cards preserve production metadata for temperature-only and combined records", () => {
  const temp = { i: 1, n: "Climate", r: "7", temp: 70, u: "F", bat: 88, ex: [] };
  const only = buildMergedSensorCard(temp, null);
  assert.deepEqual(only, {
    i: 1, n: "Climate", r: "7", t: "temp", v: 70, u: "F", a: 0,
    ex: [], bat: 88, _ref: temp,
  });
  assert.equal(buildMergedSensorCard(null, null), null);

  const humidity = { i: 1, n: "Humidity", r: 7, t: "humidity", v: "", ex: [], le: 123 };
  const combined = buildMergedSensorCard({ ...temp, n: "", r: null, bat: null }, humidity);
  assert.equal(combined.n, "Humidity");
  assert.equal(combined.r, 7);
  assert.equal(combined.le, 123);
  assert.strictEqual(combined._senRef, humidity);

  const illuminance = { i: 2, t: "illuminance", v: 100, ex: [{ k: "illuminance", v: 100 }] };
  assert.equal(buildMergedSensorCard(null, illuminance).ex.length, 0);
  const sensorBattery = buildMergedSensorCard(null, { i: 3, t: "contact", v: "closed", bat: 77 });
  assert.equal(sensorBattery.bat, 77);
  assert.equal(sensorBattery._tempRef, null);
  assert.equal(buildMergedSensorCard({ i: 4, temp: 60 }, null).bat, null);
});

test("sensor filters discover direct, merged, and secondary types", () => {
  const types = sensorCardFilterTypes({
    t: "generic",
    _senRef: { t: "humidity" },
    _tempRef: {},
    ex: [{ k: "water" }, { k: "vibration" }, { k: "unknown" }],
  });
  assert.deepEqual([...types].sort(), ["generic", "humidity", "leak", "shock", "temp"]);
  assert.deepEqual([...sensorCardFilterTypes(null)], []);
});

test("room grouping normalizes missing and invalid room ids", () => {
  const grouped = climateSensorsByRoom(
    [{ i: 1, r: null, temp: 70 }, { i: 2, r: "5", temp: 72 }],
    [
      { i: 3, r: "invalid", ex: [{ k: "temperature", v: 65 }] },
      { i: 4, r: "", ex: [] },
      { i: 5, r: 5, ex: [{ k: "temperature", v: 66 }] },
    ],
  );
  assert.deepEqual(grouped.get(-1).map((sensor) => sensor.i), [1]);
  assert.deepEqual(grouped.get(5).map((sensor) => sensor.i), [2]);
  assert.equal(grouped.has("invalid"), false);
  const sentinelRooms = climateSensorsByRoom([
    { i: 10, r: "null", temp: 1 },
    { i: 11, r: "", temp: 1 },
    { i: 12, r: -1, temp: 1 },
    { i: 13, r: "-1", temp: 1 },
  ], []);
  assert.deepEqual(sentinelRooms.get(-1).map((sensor) => sensor.i), [10, 11, 12, 13]);
});

test("temperature reading prefers direct values and falls back to extras", () => {
  assert.deepEqual(sensorTemperatureReading({ temp: "71", u: "F" }), { temp: 71, u: "F" });
  assert.deepEqual(sensorTemperatureReading({ temp: "bad", u: "F", ex: [{ k: "temperature", v: 22 }] }), {
    temp: 22, u: "F",
  });
  assert.equal(sensorTemperatureReading({ ex: [{ k: "temperature", v: "" }] }), null);
  assert.equal(sensorTemperatureReading({}), null);
});

test("sensor extra filtering separates typed readings from generic diagnostics", () => {
  assert.equal(sensorExKeyAllowed("", "generic"), false);
  assert.equal(sensorExKeyAllowed("airQuality", "generic"), true);
  assert.equal(sensorExKeyAllowed("rssi", "generic"), false);
  assert.equal(sensorExKeyAllowed("pressure", "motion"), true);
  assert.equal(sensorExKeyAllowed("custom", "motion"), false);
  assert.deepEqual(filterSensorExForType([null, { k: "battery", v: 90 }, { k: "firmware", v: "1" }], "temp"), [
    { k: "battery", v: 90 },
  ]);
  assert.deepEqual(filterSensorExForType(null, "temp"), []);
});

test("poll payloads update typed and temperature sensors without replacing identity", () => {
  const temp = { i: 1, temp: 60, ex: [] };
  applyTempSensorPayload(temp, {
    temp: 72, bat: 81,
    ex: [{ k: "humidity", v: 45 }, { k: "firmware", v: "1" }],
  });
  assert.deepEqual(temp, { i: 1, temp: 72, bat: 81, ex: [{ k: "humidity", v: 45, u: null }] });

  const sensor = { i: 2, t: "contact", v: "closed", ex: [] };
  applySensorPayload(sensor, {
    t: "generic", v: "ok", a: true, le: "123",
    ex: [{ k: "airQuality", v: "good" }, { k: "rssi", v: -60 }],
  });
  assert.deepEqual(sensor, {
    i: 2, t: "generic", v: "ok", a: 1, le: 123,
    ex: [{ k: "airQuality", v: "good", u: null }],
  });
  applySensorPayload(sensor, {});
  applyTempSensorPayload(temp, {});
});

test("temperature websocket attributes update, append, cap, and reject unsupported extras", () => {
  const sensor = { temp: 60, ex: [] };
  assert.equal(applyTempSensorWsAttr(sensor, "temperature", "70.6"), true);
  assert.equal(sensor.temp, 71);
  assert.equal(applyTempSensorWsAttr(sensor, "battery", "84", "%"), true);
  assert.equal(sensor.bat, 84);
  assert.equal(applyTempSensorWsAttr(sensor, "battery", "85", "%"), true);
  assert.deepEqual(sensor.ex[0], { k: "battery", v: 85, u: "%" });
  assert.equal(applyTempSensorWsAttr(sensor, "unsupported", "x"), false);
  assert.equal(applyTempSensorWsAttr(sensor, "temperature", "unknown"), true);
  assert.equal(applyTempSensorWsAttr(sensor, "relativeHumidity", 42), true);
  sensor.ex = Array.from({ length: 6 }, (_, index) => ({ k: `x${index}`, v: index }));
  assert.equal(applyTempSensorWsAttr(sensor, "humidity", 50), false);
});

test("typed websocket values normalize every alert family", () => {
  const cases = [
    ["motion", "motion", "off", "inactive", 0],
    ["shock", "acceleration", "on", "active", 1],
    ["contact", "contact", "false", "closed", 0],
    ["leak", "water", "true", "wet", 1],
    ["presence", "presence", "away", "not present", 0],
    ["smoke", "smoke", "tested", "clear", 0],
    ["smoke", "carbonMonoxide", "co", "detected", 1],
    ["valve", "valve", "open", "open", 1],
  ];
  for (const [type, attribute, value, expected, active] of cases) {
    const sensor = { t: type, ex: [] };
    assert.equal(applySensorWsAttr(sensor, attribute, value, null, () => 999), true);
    assert.equal(sensor.v, expected);
    assert.equal(sensor.a, active);
  }

  const alternateValues = [
    ["motion", "motion", "true", "active"],
    ["shock", "shock", "false", "inactive"],
    ["contact", "contact", "true", "open"],
    ["leak", "water", "dry", "dry"],
    ["presence", "presence", "home", "present"],
    ["smoke", "smoke", "clear", "clear"],
  ];
  for (const [type, attribute, value, expected] of alternateValues) {
    const sensor = { t: type, ex: [] };
    applySensorWsAttr(sensor, attribute, value, null, () => 999);
    assert.equal(sensor.v, expected);
  }
});

test("sensor websocket extras and event timestamps update or fail closed", () => {
  const generic = { t: "generic", ex: [] };
  assert.equal(applySensorWsAttr(generic, "airQuality", "good", "AQI"), true);
  assert.equal(applySensorWsAttr(generic, "airQuality", "fair", "score"), true);
  assert.deepEqual(generic.ex[0], { k: "airquality", v: "fair", u: "score" });
  generic.ex = Array.from({ length: 6 }, (_, index) => ({ k: `custom${index}`, v: index }));
  assert.equal(applySensorWsAttr(generic, "custom7", 7), false);

  const contact = { t: "contact", ex: [] };
  assert.equal(applySensorWsAttr(contact, "lastActivity", "1700000000"), true);
  assert.equal(contact.le, 1_700_000_000_000);
  assert.equal(applySensorWsAttr(contact, "lastEvent", "2026-01-01T00:00:00Z"), true);
  assert.equal(applySensorWsAttr(contact, "lastEvent", "not-a-date"), false);
  assert.equal(applySensorWsAttr(contact, "lastEvent", ""), false);
  assert.equal(applySensorWsAttr(contact, "lastEvent", null), false);
  assert.equal(applySensorWsAttr(contact, "lastEvent", "1700000000000"), true);
  assert.equal(applySensorWsAttr(contact, "unsupported", "x"), false);
});

test("dual sensor synchronization and live updates report climate impact", () => {
  const temp = { i: 1, temp: 60, bat: 90, ex: [] };
  const sensor = { i: 1, t: "generic", v: "ok", ex: [{ k: "temperature", v: 65 }] };
  assert.equal(syncTempSensorFromSensorEntry(temp, sensor), true);
  assert.equal(temp.temp, 65);
  assert.equal(syncTempSensorFromSensorEntry(null, sensor), false);
  assert.equal(syncTempSensorFromSensorEntry(temp, { ex: [] }), false);

  const state = { tempSensors: [temp], sensors: [sensor] };
  assert.deepEqual(applySensorLiveAttr(state, 1, "battery", "75", "%", () => 1).climate, false);
  assert.equal(temp.bat, 75);
  const climate = applySensorLiveAttr(state, 1, "temperature", "69.8", "F", () => 1);
  assert.equal(climate.changed, true);
  assert.equal(climate.climate, true);
  assert.equal(temp.temp, 70);
  assert.equal(applySensorLiveAttr(state, 99, "temperature", 70).changed, false);
});

test("sensor domain fallback branches retain legacy defaults", () => {
  const tempFallback = { i: 20, n: "Temp name", r: 4, temp: 67, u: null, ex: [{ k: "battery", v: 60 }] };
  const primary = buildMergedSensorCard(tempFallback, {
    i: 20, n: "", r: null, t: "motion", v: "inactive", a: 0, ex: null, le: null,
  });
  assert.equal(primary.n, "Temp name");
  assert.equal(primary.r, 4);
  assert.equal(primary.bat, 60);
  assert.deepEqual([...sensorCardFilterTypes({ t: "unknown", ex: [{ k: "" }, { k: "humidity" }] })], ["humidity"]);

  const grouped = climateSensorsByRoom(undefined, [
    { i: 1, r: 1, temp: 64 },
    { i: 2, r: 1, ex: [{ k: "temperature", v: 65 }] },
  ]);
  assert.deepEqual(grouped.get(1).map((sensor) => sensor.i), [1, 2]);
  assert.deepEqual(climateSensorsByRoom([], undefined), new Map());

  const sensorWithFallbackType = { t: "motion", ex: [] };
  applySensorPayload(sensorWithFallbackType, { ex: [{ k: "battery", v: 50, u: "%" }] });
  assert.deepEqual(sensorWithFallbackType.ex, [{ k: "battery", v: 50, u: "%" }]);
  const sensorWithNoType = { ex: [] };
  applySensorPayload(sensorWithNoType, { ex: [{ k: "custom", v: "yes" }] });
  assert.deepEqual(sensorWithNoType.ex, [{ k: "custom", v: "yes", u: null }]);
});

test("websocket fallback branches cover absent arrays, units, and non-alert values", () => {
  const temp = {};
  assert.equal(applyTempSensorWsAttr(temp, "humidity", 40), true);
  assert.deepEqual(temp.ex, [{ k: "humidity", v: 40, u: null }]);
  assert.equal(applyTempSensorWsAttr(temp, "humidity", 41), true);
  assert.equal(temp.ex[0].u, null);
  assert.equal(applyTempSensorWsAttr(temp, "battery", "unknown"), true);

  const generic = {};
  assert.equal(applySensorWsAttr(generic, "custom", "value"), true);
  assert.deepEqual(generic.ex, [{ k: "custom", v: "value", u: null }]);
  const unknown = { t: "unknown", ex: [] };
  assert.equal(applySensorWsAttr(unknown, "custom", "value"), false);
  const inactiveValve = { t: "valve", ex: [] };
  assert.equal(applySensorWsAttr(inactiveValve, "valve", "closed"), true);
  assert.equal(inactiveValve.a, 0);

  const tempOnly = { tempSensors: [{ i: 1, temp: 1, ex: [] }] };
  assert.equal(applySensorLiveAttr(tempOnly, 1, "humidity", 20).changed, true);
  const sensorOnly = { sensors: [{ i: 2, t: "motion", v: "inactive", ex: [] }] };
  assert.equal(applySensorLiveAttr(sensorOnly, 2, "motion", "active", null, () => 5).sensor.le, 5);
});
