const THERMOSTAT_ATTRS = new Set([
  "thermostatMode",
  "comfortMode",
  "thermostatOperatingState",
  "heatingSetpoint",
  "coolingSetpoint",
  "temperature",
  "thermostatFanMode",
  "comfortFanSpeed",
  "fanSpeed",
  "vanePosition",
]);

function findById(collection, id) {
  return collection?.find((item) => item.i === id);
}

function numberOrNull(value) {
  const number = Math.round(Number(value));
  return Number.isNaN(number) ? null : number;
}

function snapshot(state) {
  return { thermostats: state.thermostats || [] };
}

export function createThermostatsFeature({ state, ui }) {
  const render = (reason = "render", kind = "all", thermostat = null) =>
    ui.renderThermostats?.(snapshot(state), reason, kind, thermostat);

  function applyHubEvent(event) {
    if (event?.source !== "DEVICE" || event.deviceId == null) return { handled: false };
    const id = Number(event.deviceId);
    const name = String(event.name || "");
    if (!THERMOSTAT_ATTRS.has(name)) return { handled: false };
    const thermostat = findById(state.thermostats, id);
    if (!thermostat) return { handled: false };

    if ((name === "thermostatMode" || name === "comfortMode")
      && !ui.isModeLocked?.(thermostat.i)) {
      thermostat.tm = event.value;
      render("hub-event", "mode", thermostat);
      return { handled: true, kind: "mode" };
    }
    if (name === "thermostatOperatingState" && !ui.isModeLocked?.(thermostat.i)) {
      thermostat.os = event.value;
      render("hub-event", "operating-state", thermostat);
      return { handled: true, kind: "operating-state" };
    }
    if (name === "heatingSetpoint") {
      ui.applySetpoints?.(thermostat, { hsp: event.value });
      render("hub-event", "setpoint", thermostat);
      return { handled: true, kind: "setpoint" };
    }
    if (name === "coolingSetpoint") {
      ui.applySetpoints?.(thermostat, { csp: event.value });
      render("hub-event", "setpoint", thermostat);
      return { handled: true, kind: "setpoint" };
    }
    if (name === "temperature") {
      const temperature = numberOrNull(event.value);
      if (temperature == null) return { handled: false };
      thermostat.temp = temperature;
      render("hub-event", "temperature", thermostat);
      return { handled: true, kind: "temperature" };
    }
    if (name === "thermostatFanMode" && !ui.isFanModeLocked?.(thermostat.i)) {
      thermostat.fm = event.value;
      if (thermostat.hasCfs) thermostat.cfs = event.value;
      render("hub-event", "fan-mode", thermostat);
      return { handled: true, kind: "fan-mode" };
    }
    if (name === "comfortFanSpeed" && !ui.isFanModeLocked?.(thermostat.i)) {
      thermostat.cfs = event.value;
      thermostat.fm = event.value;
      render("hub-event", "comfort-fan-speed", thermostat);
      return { handled: true, kind: "comfort-fan-speed" };
    }
    if (name === "fanSpeed") {
      thermostat.fs = event.value;
      render("hub-event", "fan-speed", thermostat);
      return { handled: true, kind: "fan-speed" };
    }
    if (name === "vanePosition" && !ui.isVaneLocked?.(thermostat.i)) {
      thermostat.vp = event.value;
      render("hub-event", "vane-position", thermostat);
      return { handled: true, kind: "vane-position" };
    }
    return { handled: false };
  }

  return {
    init: () => render("init"),
    render,
    handleHubEvent(event) { return applyHubEvent(event).handled; },
    applyHubEvent,
    pause() {},
    resume: () => render("resume"),
    dispose() {},
  };
}
