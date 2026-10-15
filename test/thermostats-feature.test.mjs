import assert from "node:assert/strict";
import test from "node:test";
import { createThermostatsFeature } from "../src/client/features/thermostats.mjs";

function fixture() {
  const tstat = {
    i: 41,
    tm: "off",
    os: "idle",
    hsp: 68,
    csp: 74,
    temp: 70,
    hasCfs: true,
    fm: "auto",
    cfs: "auto",
    fs: "medium",
    vp: "auto",
  };
  const state = { thermostats: [tstat] };
  const modeLocked = new Set();
  const fanLocked = new Set();
  const vaneLocked = new Set();
  const renders = [];
  const setpointCalls = [];
  const feature = createThermostatsFeature({
    state,
    ui: {
      isModeLocked: (id) => modeLocked.has(id),
      isFanModeLocked: (id) => fanLocked.has(id),
      isVaneLocked: (id) => vaneLocked.has(id),
      applySetpoints(t, patch) {
        setpointCalls.push({ id: t.i, patch });
        if (patch.hsp != null) t.hsp = Number(patch.hsp);
        if (patch.csp != null) t.csp = Number(patch.csp);
      },
      renderThermostats: (_snapshot, reason, kind, thermostat) => {
        renders.push({ reason, kind, thermostat });
      },
    },
  });
  return { feature, state, tstat, modeLocked, fanLocked, vaneLocked, renders, setpointCalls };
}

test("thermostat hub events update mode, operating state, setpoints, and controls", () => {
  const { feature, tstat, renders, setpointCalls } = fixture();
  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "thermostatMode", value: "cool",
  }), true);
  assert.equal(tstat.tm, "cool");

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "thermostatOperatingState", value: "cooling",
  }), true);
  assert.equal(tstat.os, "cooling");

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "heatingSetpoint", value: "69",
  }), true);
  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "coolingSetpoint", value: "75",
  }), true);
  assert.deepEqual(setpointCalls, [
    { id: 41, patch: { hsp: "69" } },
    { id: 41, patch: { csp: "75" } },
  ]);
  assert.deepEqual({ hsp: tstat.hsp, csp: tstat.csp }, { hsp: 69, csp: 75 });

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "temperature", value: "72.6",
  }), true);
  assert.equal(tstat.temp, 73);

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "thermostatFanMode", value: "on",
  }), true);
  assert.deepEqual({ fm: tstat.fm, cfs: tstat.cfs }, { fm: "on", cfs: "on" });

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "comfortFanSpeed", value: "quiet",
  }), true);
  assert.deepEqual({ fm: tstat.fm, cfs: tstat.cfs }, { fm: "quiet", cfs: "quiet" });

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "fanSpeed", value: "high",
  }), true);
  assert.equal(tstat.fs, "high");

  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "vanePosition", value: "2",
  }), true);
  assert.equal(tstat.vp, "2");
  assert.equal(renders.length, 9);
});

test("thermostat locks consume recognized echoes without applying them", () => {
  const { feature, tstat, modeLocked, fanLocked, vaneLocked, renders } = fixture();
  modeLocked.add(41);
  fanLocked.add(41);
  vaneLocked.add(41);

  const lockedEvents = [
    ["thermostatMode", "heat", "mode"],
    ["comfortMode", "sleep", "mode"],
    ["thermostatOperatingState", "heating", "operating-state"],
    ["thermostatFanMode", "on", "fan-mode"],
    ["comfortFanSpeed", "medium", "comfort-fan-speed"],
    ["vanePosition", "1", "vane-position"],
  ];
  for (const [name, value, kind] of lockedEvents) {
    assert.deepEqual(feature.applyHubEvent({ source: "DEVICE", deviceId: 41, name, value }), {
      handled: true,
      kind,
    });
  }
  assert.deepEqual({ tm: tstat.tm, os: tstat.os, fm: tstat.fm, cfs: tstat.cfs, vp: tstat.vp }, {
    tm: "off", os: "idle", fm: "auto", cfs: "auto", vp: "auto",
  });
  assert.equal(renders.length, 0);
});

test("irrelevant and malformed events are ignored", () => {
  const { feature, tstat } = fixture();
  assert.equal(feature.handleHubEvent(null), false);
  assert.equal(feature.handleHubEvent({ source: "LOCATION", name: "mode", value: "Away" }), false);
  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 99, name: "thermostatMode", value: "heat",
  }), false);
  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "temperature", value: "bad-data",
  }), false);
  assert.equal(feature.handleHubEvent({
    source: "DEVICE", deviceId: 41, name: "battery", value: 85,
  }), false);
  assert.equal(tstat.temp, 70);
});

test("lifecycle hooks call renderer predictably", () => {
  const { feature, renders } = fixture();
  feature.init();
  feature.render("manual");
  feature.pause();
  feature.resume();
  feature.dispose();
  assert.equal(renders[0].reason, "init");
  assert.equal(renders[1].reason, "manual");
  assert.equal(renders.at(-1).reason, "resume");
});
