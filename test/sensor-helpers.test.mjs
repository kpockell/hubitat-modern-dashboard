import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMergedSensorCard,
  sensorCardFilterTypes,
  sensorTemperatureReading,
  climateSensorsByRoom,
} from "../src/client/domain/sensors.mjs";
import {
  filterSensorExForType,
  sensorLastEventLine,
  sensorCardFootText,
  mockSensorExFooter,
} from "../preview/sensor-ex-display.mjs";

test("typed sensors filter diagnostic attributes from card footers", () => {
  const contact = {
    i: 1,
    t: "contact",
    v: "closed",
    le: Date.now() - 60_000,
    ex: [
      { k: "battery", v: 92 },
      { k: "enrollment", v: "complete" },
      { k: "temperature", v: 68, u: "F" },
    ],
  };

  assert.deepEqual(filterSensorExForType(contact.ex, contact.t), [
    { k: "battery", v: 92 },
    { k: "temperature", v: 68, u: "F" },
  ]);
  assert.match(sensorLastEventLine(contact), /^Last activity · /);
  assert.doesNotMatch(sensorCardFootText(contact, mockSensorExFooter(contact)), /enroll/i);
});

test("generic sensors retain useful custom attributes but drop diagnostics", () => {
  const ex = [
    { k: "airQuality", v: "good" },
    { k: "pressure", v: 1012 },
    { k: "rssi", v: -62 },
    { k: "firmware", v: "1.0" },
  ];
  assert.deepEqual(filterSensorExForType(ex, "generic"), ex.slice(0, 2));
});

test("temperature and environmental records merge into one temperature-primary card", () => {
  const temp = { i: 5, r: 2, temp: 71, u: "F", bat: 88, ex: [] };
  const humidity = { i: 5, r: 2, t: "humidity", v: 43, u: "%", ex: [{ k: "battery", v: 88 }] };
  const merged = buildMergedSensorCard(temp, humidity);

  assert.equal(merged.t, "temp");
  assert.equal(merged.v, 71);
  assert.ok(merged.ex.some((entry) => entry.k === "humidity" && entry.v === 43));
  assert.deepEqual([...sensorCardFilterTypes(merged)].sort(), ["humidity", "temp"]);

  const illuminance = { i: 5, r: 2, t: "illuminance", v: 320, u: "lx", ex: [] };
  const lightMerged = buildMergedSensorCard(temp, illuminance);
  assert.equal(lightMerged.t, "temp");
  assert.ok(lightMerged.ex.some((entry) => entry.k === "illuminance" && entry.v === 320));
  assert.equal(lightMerged.ex.filter((entry) => entry.k === "battery").length, 0);
});

test("generic multisensors stay generic and gain temperature as a secondary reading", () => {
  const temp = { i: 9, r: 6, temp: 68, u: "F", ex: [] };
  const sensor = { i: 9, r: 6, t: "generic", v: "active", ex: [{ k: "pressure", v: 1010 }] };
  const merged = buildMergedSensorCard(temp, sensor);

  assert.equal(merged.t, "generic");
  assert.ok(merged.ex.some((entry) => entry.k === "temperature" && entry.v === 68));
  assert.deepEqual([...sensorCardFilterTypes(merged)].sort(), ["generic", "temp"]);
  assert.deepEqual(sensorTemperatureReading(merged), { temp: 68, u: "F" });
});

test("room climate falls back to multisensors only when no dedicated sensor exists", () => {
  const dedicated = [{ i: 1, r: 42, temp: 70, u: "F" }];
  const sensors = [
    { i: 2, r: 42, t: "motion", ex: [{ k: "temperature", v: 68, u: "F" }] },
    { i: 3, r: 7, t: "motion", ex: [{ k: "temperature", v: 66, u: "F" }] },
  ];
  const byRoom = climateSensorsByRoom(dedicated, sensors);

  assert.deepEqual(byRoom.get(42).map((sensor) => sensor.i), [1]);
  assert.deepEqual(byRoom.get(7).map((sensor) => sensor.i), [3]);
});

test("sensor temperature readings reject missing and nonnumeric values", () => {
  assert.equal(sensorTemperatureReading({ temp: "" }), null);
  assert.equal(sensorTemperatureReading({ ex: [{ k: "temperature", v: "unknown" }] }), null);
  assert.deepEqual(sensorTemperatureReading({ ex: [{ k: "Temperature", v: "69.5", u: "F" }] }), {
    temp: 69.5,
    u: "F",
  });
});

test("merged sensor extras are deduplicated without mutating their inputs", () => {
  const temp = { i: 12, temp: 72, ex: [{ k: "battery", v: 90 }] };
  const sensor = {
    i: 12,
    t: "generic",
    v: "ok",
    ex: [{ k: "battery", v: 80 }, { k: "pressure", v: 1012 }],
  };
  const before = structuredClone({ temp, sensor });
  const merged = buildMergedSensorCard(temp, sensor);

  assert.equal(merged.ex.filter((entry) => entry.k === "battery").length, 1);
  assert.equal(merged.bat, 80);
  assert.deepEqual({ temp, sensor }, before);
});
