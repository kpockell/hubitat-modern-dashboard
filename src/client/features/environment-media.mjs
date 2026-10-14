import { applySensorLiveAttr } from "../domain/sensors.mjs";

const SNAPSHOT_COLLECTIONS = ["windowShades", "ceilingFans", "music", "tempSensors", "sensors"];

function snapshot(state) {
  return Object.fromEntries(SNAPSHOT_COLLECTIONS.map((name) => [name, state[name] || []]));
}

function findById(collection, id) {
  return collection?.find((item) => item.i === Number(id));
}

function applyShadeEvent(shade, name, value) {
  if (name === "windowShade" || name === "windowBlind") {
    shade.st = String(value || "");
  } else if (name === "position" || name === "level") {
    const position = Math.round(Number(value));
    if (!Number.isNaN(position)) {
      shade.pos = position;
      if (position <= 0) shade.st = "closed";
      else if (position >= 99) shade.st = "open";
      else shade.st = "partially open";
    }
  } else if (name === "switch") {
    const valueName = String(value || "");
    if (valueName === "on") shade.st = "open";
    else if (valueName === "off") shade.st = "closed";
  } else {
    return false;
  }
  return true;
}

function restore(target, previous) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, previous);
}

export function createEnvironmentMediaFeature({ state, services, ui }) {
  const now = typeof services.now === "function" ? services.now : Date.now;
  const render = (reason = "render", kind = "all", device = null) =>
    ui.renderEnvironmentMedia?.(snapshot(state), reason, kind, device);

  function applyHubEvent(event) {
    if (event?.source !== "DEVICE" || event.deviceId == null) return { handled: false, passthrough: false };
    const id = Number(event.deviceId);
    const name = String(event.name || "");
    const shade = findById(state.windowShades, id);
    if (shade && ["windowShade", "windowBlind", "position", "level", "switch"].includes(name)) {
      const optimistic = state.shadeOptimistic?.get(id);
      if (!optimistic || optimistic.until <= now()) applyShadeEvent(shade, name, event.value);
      render("hub-event", "shade", shade);
      return { handled: true, passthrough: name === "switch" || name === "level", kind: "shade" };
    }

    const fan = findById(state.ceilingFans, id);
    if (fan) {
      const optimistic = state.fanOptimistic?.get(id);
      if (optimistic && optimistic.until > now()) {
        return { handled: true, passthrough: false, kind: "fan" };
      }
      if (name === "switch") {
        fan.s = event.value === "on" ? 1 : 0;
        if (!fan.s) fan.sp = "off";
      } else if (name === "speed") {
        fan.sp = String(event.value || "");
        fan.s = fan.sp.toLowerCase() === "off" ? 0 : fan.sp ? 1 : fan.s;
      } else {
        return { handled: false, passthrough: false };
      }
      render("hub-event", "fan", fan);
      return { handled: true, passthrough: false, kind: "fan" };
    }

    if (findById(state.tempSensors, id) || findById(state.sensors, id)) {
      const result = applySensorLiveAttr(state, id, name, event.value, event.unit, now);
      if (!result.changed) return { handled: true, passthrough: false, kind: "sensor" };
      if (result.climate) ui.renderClimate?.();
      render("hub-event", "sensor", result.sensor || result.tempSensor);
      return { handled: true, passthrough: false, kind: "sensor" };
    }
    return { handled: false, passthrough: false };
  }

  async function command(collection, id, commandName, value, optimisticPatch = null) {
    const device = findById(state[collection], id);
    if (!device) return { ok: false, error: "device_not_found" };
    const previous = { ...device };
    if (optimisticPatch) {
      if (ui.applyOptimistic) ui.applyOptimistic(collection, id, optimisticPatch);
      else Object.assign(device, optimisticPatch);
      render("optimistic", collection, device);
    }
    let result;
    try {
      result = await services.transport.sendCommand(id, commandName, value);
    } catch (error) {
      result = { ok: false, error: error?.message || "command_failed" };
    }
    if (!result?.ok) {
      if (ui.rollbackOptimistic) ui.rollbackOptimistic(collection, id, previous);
      else restore(device, previous);
      render("rollback", collection, device);
    }
    ui.reconcile?.(collection, id);
    return result;
  }

  return {
    init: () => render("init"),
    render,
    handleHubEvent(event) { return applyHubEvent(event).handled; },
    applyHubEvent,
    command,
    pause() {},
    resume: () => render("resume"),
    dispose() {},
  };
}
