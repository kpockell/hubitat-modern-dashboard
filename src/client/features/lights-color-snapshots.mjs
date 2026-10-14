const LIGHT_ATTRS = new Set(["switch", "level", "colorTemperature", "hue", "saturation"]);

function findDeviceById(list, id) {
  return (Array.isArray(list) ? list : []).find((item) => item.i === id);
}

function numberOrNull(value) {
  const number = Math.round(Number(value));
  return Number.isNaN(number) ? null : number;
}

function snapshot(state) {
  return {
    devices: state.devices || [],
    snapshots: state.snapshots || {},
  };
}

function commandError(error, fallback) {
  return { ok: false, error: error?.message || fallback };
}

export function createLightsColorSnapshotsFeature({ state, services, ui }) {
  const render = (reason = "render", kind = "all", payload = null) =>
    ui.renderLights?.(snapshot(state), reason, kind, payload);

  function applyHubEvent(event) {
    if (event?.source !== "DEVICE" || event.deviceId == null) return { handled: false };
    const id = Number(event.deviceId);
    const name = String(event.name || "");
    if (!LIGHT_ATTRS.has(name)) return { handled: false };
    const rec = state.devMap?.get(id) || state.favDevMap?.get(id);
    if (!rec || rec.isOutlet) return { handled: false };
    const dev = findDeviceById(state.devices, id);
    if (!dev) return { handled: false };

    if (name === "switch") {
      dev.s = event.value === "on" ? 1 : 0;
      ui.clearSwitchOptimistic?.(id);
      render("hub-event", "switch", { id, rec, dev });
      return { handled: true, kind: "switch" };
    }

    if (name === "level") {
      if (!rec.isDim) return { handled: false };
      const level = numberOrNull(event.value);
      if (level == null) return { handled: false };
      dev.l = level;
      ui.clearSwitchOptimistic?.(id);
      if (!ui.isDragging?.(rec)) render("hub-event", "level", { id, rec, dev });
      return { handled: true, kind: "level" };
    }

    const activeColorSessionId = ui.activeColorSessionId?.();
    if (activeColorSessionId === rec.data?.i) return { handled: true, kind: "color-session" };

    if (name === "colorTemperature") {
      if (!rec.data?.ct) return { handled: false };
      const kelvin = numberOrNull(event.value);
      if (kelvin == null) return { handled: false };
      rec.data.k = kelvin;
      render("hub-event", "colorTemperature", { id, rec, dev });
      return { handled: true, kind: "colorTemperature" };
    }

    if (!rec.data?.rgb) return { handled: false };
    if (name === "hue") {
      const hue = numberOrNull(event.value);
      if (hue == null) return { handled: false };
      rec.data.h = hue;
      render("hub-event", "hue", { id, rec, dev });
      return { handled: true, kind: "hue" };
    }

    const saturation = numberOrNull(event.value);
    if (saturation == null) return { handled: false };
    rec.data.sat = saturation;
    render("hub-event", "saturation", { id, rec, dev });
    return { handled: true, kind: "saturation" };
  }

  async function bulkLights(command, scope, roomId = null) {
    if (typeof services.api?.bulkLights !== "function") {
      return { ok: false, error: "bulk_lights_api_unavailable" };
    }
    try {
      return await services.api.bulkLights(command, scope, roomId);
    } catch (error) {
      return commandError(error, "Could not control lights");
    }
  }

  async function saveSnapshot(scope, roomId = null) {
    if (typeof services.api?.saveSnapshot !== "function") {
      return { ok: false, error: "snapshot_save_api_unavailable" };
    }
    try {
      const result = await services.api.saveSnapshot(scope, roomId);
      if (result?.ok) ui.onSnapshotSaved?.(scope, roomId);
      return result;
    } catch (error) {
      return commandError(error, "Could not save state");
    }
  }

  async function restoreSnapshot(scope, roomId = null) {
    if (typeof services.api?.restoreSnapshot !== "function") {
      return { ok: false, error: "snapshot_restore_api_unavailable" };
    }
    try {
      return await services.api.restoreSnapshot(scope, roomId);
    } catch (error) {
      return commandError(error, "Could not restore state");
    }
  }

  return {
    init: () => render("init"),
    render,
    handleHubEvent(event) { return applyHubEvent(event).handled; },
    applyHubEvent,
    bulkLights,
    saveSnapshot,
    restoreSnapshot,
    pause() {},
    resume: () => render("resume"),
    dispose() {},
  };
}
