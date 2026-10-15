import assert from "node:assert/strict";
import test from "node:test";
import { schedIdList, schedThermoThenBits } from "../src/client/domain/scheduler.mjs";

test("scheduler id list handles scalar, arrays, and duplicate or invalid values", () => {
  assert.deepEqual(schedIdList(37), ["37"]);
  assert.deepEqual(schedIdList(["37", 37, "", "null", " 42 "]), ["37", "42"]);
  assert.deepEqual(schedIdList(null), []);
});

test("scheduler thermostat action summary preserves mode and fan wording", () => {
  assert.deepEqual(
    schedThermoThenBits({ mode: "heat", heat: 68, fanMode: "auto" }),
    ["Heat 68°"],
  );
  assert.deepEqual(
    schedThermoThenBits({ mode: "auto", heat: 67, cool: 74, fanMode: "circulate" }),
    ["Auto", "Heat 67°", "Cool 74°", "Fan circulate"],
  );
  assert.deepEqual(
    schedThermoThenBits({ mode: "off", fanMode: "on" }),
    ["Off", "Fan on"],
  );
});
