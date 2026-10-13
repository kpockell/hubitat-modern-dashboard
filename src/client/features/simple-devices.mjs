const COLLECTIONS = ["outlets", "locks", "garageDoors", "valves", "scenes", "hubModes"];

function snapshot(state) {
  return Object.fromEntries(COLLECTIONS.map((name) => [name, state[name] || []]));
}

function restore(target, previous) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, previous);
}

function lockSatisfied(pending, lock) {
  if (!!pending.lk !== !!lock.lk) return false;
  const wanted = String(pending.st || "").toLowerCase();
  const actual = String(lock.st || "").toLowerCase();
  if (wanted === "locking") return actual === "locked";
  if (wanted === "unlocking") return actual === "unlocked";
  return wanted === actual;
}

export function createSimpleDeviceFeature({ state, services, ui }) {
  const render = (reason = "render") => ui.renderSimpleDevices?.(snapshot(state), reason);

  function handleHubEvent(event) {
    if (event?.source !== "DEVICE" || event.deviceId == null) return false;
    const id = Number(event.deviceId);
    const name = String(event.name || "");
    let device;
    if (name === "switch" && (device = state.outlets?.find((item) => item.i === id))) {
      device.s = event.value === "on" ? 1 : 0;
    } else if (name === "lock" && (device = state.locks?.find((item) => item.i === id))) {
      device.st = String(event.value || "");
      device.lk = device.st === "locked" ? 1 : 0;
      const pending = state.lockOptimistic?.get(id);
      if (pending && lockSatisfied(pending, device)) {
        if (ui.clearOptimistic) ui.clearOptimistic("lock", id);
        else state.lockOptimistic.delete(id);
      }
    } else if (name === "door" && (device = state.garageDoors?.find((item) => item.i === id))) {
      device.st = String(event.value || "");
      const pending = state.garageOptimistic?.get(id);
      if (pending && (pending.st === device.st
        || (pending.st === "opening" && device.st === "open")
        || (pending.st === "closing" && device.st === "closed"))) {
        if (ui.clearOptimistic) ui.clearOptimistic("garage", id);
        else state.garageOptimistic.delete(id);
      }
    } else if (name.toLowerCase() === "valve" && (device = state.valves?.find((item) => item.i === id))) {
      device.st = String(event.value || "");
      const pending = state.valveOptimistic?.get(id);
      if (pending?.st === device.st) {
        if (ui.clearOptimistic) ui.clearOptimistic("valve", id);
        else state.valveOptimistic.delete(id);
      }
    } else {
      return false;
    }
    render("hub-event");
    return true;
  }

  async function command(collection, id, commandName, value, optimisticPatch = {}) {
    const list = state[collection];
    const device = Array.isArray(list) ? list.find((item) => item.i === id) : null;
    if (!device) return { ok: false, error: "device_not_found" };
    const previous = { ...device };
    Object.assign(device, optimisticPatch);
    render("optimistic");
    let result;
    try {
      result = await services.transport.sendCommand(id, commandName, value);
    } catch (error) {
      result = { ok: false, error: error?.message || "command_failed" };
    }
    if (!result?.ok) {
      restore(device, previous);
      render("rollback");
    }
    return result;
  }

  return {
    init: () => render("init"),
    render,
    handleHubEvent,
    pause() {},
    resume: () => render("resume"),
    dispose() {},
    command,
  };
}
