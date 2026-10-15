const NOTIFICATION_ATTRIBUTES = new Set(["notificationText", "deviceNotification", "lastMessage"]);
const FETCH_DELAY_MS = 180;

function replaceList(target, next) {
  target.length = 0;
  target.push(...next);
}

function replaceSet(target, next) {
  target.clear();
  for (const value of next) target.add(value);
}

export function normalizeNotifications(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    id: item?.id != null ? String(item.id) : "",
    text: item?.text != null ? String(item.text) : "",
    ts: Number(item?.ts) || 0,
    deviceId: item?.deviceId != null ? Number(item.deviceId) : null,
    deviceName: item?.deviceName != null ? String(item.deviceName) : "",
  })).filter((item) => item.id && item.text);
}

function normalizeIds(list) {
  return (Array.isArray(list) ? list : []).map(Number).filter(Number.isFinite);
}

function snapshot(state) {
  return {
    notifications: state.hubNotifications,
    tileNotifications: state.hubTileNotifications,
    triggerActions: state.hubTriggerActions,
    controls: state.notificationTriggerState,
  };
}

export function createNotificationsTriggersFeature({ state, services, ui }) {
  const now = typeof services.now === "function" ? services.now : Date.now;
  const timers = services.timers || globalThis;
  const controls = state.notificationTriggerState || (state.notificationTriggerState = {});
  const notificationIds = state.notificationDeviceIds || (state.notificationDeviceIds = new Set());
  const tileNotificationIds = state.tileNotificationDeviceIds || (state.tileNotificationDeviceIds = new Set());
  const triggerSourceIds = state.triggerSourceIds || (state.triggerSourceIds = new Set());
  const playedTones = state.playedTriggerToneIds || (state.playedTriggerToneIds = new Map());
  const inFlight = new Map();
  const queued = new Set();
  const fetchTimers = new Map();
  const acknowledgements = { notifications: new Set(), tiles: new Set(), triggers: new Set() };

  const render = (reason = "render") => ui.renderNotificationsTriggers?.(snapshot(state), reason);

  function applyArmed(next) {
    const armed = !!next;
    if (controls.alertsArmed && !armed) ui.stopTone?.();
    controls.alertsArmed = armed;
    ui.syncArmed?.(armed);
    return armed;
  }

  function applyNotificationsFromData(data) {
    replaceList(state.hubNotifications, normalizeNotifications(data?.notifications));
    if (data?.notificationDeviceIds != null) {
      replaceSet(notificationIds, normalizeIds(data.notificationDeviceIds));
    }
    ui.pruneNotificationLocalState?.(new Set(state.hubNotifications.map((item) => item.id)));
    ui.notificationsChanged?.(state.hubNotifications);
    render("notifications");
    return state.hubNotifications;
  }

  function applyTileNotificationsFromData(data) {
    if (!data || (data.tileNotifications == null && data.tileNotificationDeviceIds == null)) return false;
    const normalized = normalizeNotifications(data.tileNotifications).sort((a, b) => b.ts - a.ts);
    replaceList(state.hubTileNotifications, normalized);
    if (data.tileNotificationDeviceIds != null) {
      replaceSet(tileNotificationIds, normalizeIds(data.tileNotificationDeviceIds));
    }
    ui.tileNotificationsChanged?.(state.hubTileNotifications);
    render("tile-notifications");
    return true;
  }

  function captionFor(action) {
    const caption = ui.captionForTriggerAction?.(action);
    if (caption != null) return String(caption);
    if (!action) return "";
    if (action.caption) return String(action.caption);
    if (action.notificationId) {
      const linked = state.hubNotifications.find((item) => item.id === action.notificationId);
      if (linked?.text) return String(linked.text);
    }
    return state.hubNotifications[0]?.text ? String(state.hubNotifications[0].text) : "";
  }

  function prunePlayedTones(timestamp) {
    for (const [id, expiresAt] of playedTones) {
      if (!expiresAt || expiresAt <= timestamp) playedTones.delete(id);
    }
  }

  function applyTriggerControlsFromData(data, shouldRender = true) {
    if (!data) return false;
    if (data.triggersEnabled != null) controls.triggersEnabled = !!data.triggersEnabled;
    if (data.alertsArmed != null) applyArmed(data.alertsArmed);
    if (data.alertsArmSwitchId != null) {
      const id = Number(data.alertsArmSwitchId);
      controls.alertsArmSwitchId = Number.isFinite(id) ? id : null;
    }
    if (Array.isArray(data.triggerSourceIds)) replaceSet(triggerSourceIds, normalizeIds(data.triggerSourceIds));
    if (shouldRender) render("trigger-controls");
    return true;
  }

  function applyTriggerActionsFromData(data) {
    if (!applyTriggerControlsFromData(data, false)) return false;
    if (!Array.isArray(data.triggerActions)) {
      render("trigger-controls");
      return false;
    }

    const timestamp = now();
    prunePlayedTones(timestamp);
    const live = data.triggerActions.filter((action) => action?.id).filter((action) => {
      const cameraLive = action.cameraId != null && Number(action.cameraExpiresAt) > timestamp;
      const toneLive = action.toneId && Number(action.toneExpiresAt) > timestamp;
      return cameraLive || toneLive || action.notificationId;
    });
    replaceList(state.hubTriggerActions, live);

    if (live.some((action) => action.notificationId)) void runFetch("notifications");

    const cameraAction = [...live].reverse().find((action) =>
      action.cameraId != null && Number(action.cameraExpiresAt) > timestamp
    );
    if (cameraAction && services.isLocal() && !services.isGateOpen()) {
      ui.showCameraOverlay?.(cameraAction, captionFor(cameraAction));
      ui.hideNotificationPopup?.();
    } else if (ui.activeCameraId?.()) {
      const activeId = ui.activeCameraId();
      const stillLive = live.some((action) =>
        action.id === activeId && Number(action.cameraExpiresAt) > timestamp
      );
      if (!stillLive) ui.teardownCameraOverlay?.("hub");
      ui.syncNotificationPopup?.();
    } else {
      ui.syncNotificationPopup?.();
    }

    for (const action of live) {
      if (!action.toneId || Number(action.toneExpiresAt) <= timestamp || playedTones.has(action.id)) continue;
      playedTones.set(action.id, Number(action.toneExpiresAt) || timestamp + 15000);
      ui.playTone?.(String(action.toneId));
      break;
    }
    render("trigger-actions");
    return true;
  }

  const fetchConfigs = {
    notifications: {
      eligible: () => !services.isGateOpen(),
      request: () => services.api.fetchNotifications(),
      apply: applyNotificationsFromData,
    },
    tiles: {
      eligible: () => !services.isGateOpen() && (state.notificationCards?.length || tileNotificationIds.size),
      request: () => services.api.fetchTileNotifications(),
      apply: applyTileNotificationsFromData,
    },
    triggers: {
      eligible: () => !services.isGateOpen()
        && (controls.triggersEnabled || state.hubTriggerActions.length),
      request: () => services.api.fetchTriggerActions(),
      apply: applyTriggerActionsFromData,
    },
  };

  async function runFetch(kind) {
    const config = fetchConfigs[kind];
    if (!config?.eligible()) return null;
    if (inFlight.has(kind)) {
      queued.add(kind);
      return inFlight.get(kind);
    }
    const task = (async () => {
      try {
        const result = await config.request();
        if (result?.ok) config.apply(result);
        return result;
      } catch (error) {
        return { ok: false, error: error?.message || "request_failed" };
      } finally {
        inFlight.delete(kind);
        if (queued.delete(kind)) void runFetch(kind);
      }
    })();
    inFlight.set(kind, task);
    return task;
  }

  function scheduleFetch(kind, afterFetch = null) {
    const previous = fetchTimers.get(kind);
    if (previous) timers.clearTimeout(previous);
    fetchTimers.set(kind, timers.setTimeout(() => {
      fetchTimers.delete(kind);
      void runFetch(kind);
      if (kind === "notifications") void runFetch("tiles");
      afterFetch?.();
    }, FETCH_DELAY_MS));
  }

  function scheduleTriggerFetchFromWs() {
    scheduleFetch("triggers", () => scheduleFetch("notifications"));
  }

  function routeHubEvent(event) {
    if (event?.source !== "DEVICE" || event.deviceId == null) return { handled: false, scheduled: false };
    const id = Number(event.deviceId);
    const name = String(event.name || "");
    if (notificationIds.has(id) && NOTIFICATION_ATTRIBUTES.has(name)) {
      scheduleFetch("notifications");
      return { handled: true, scheduled: true };
    }
    if (tileNotificationIds.has(id) && NOTIFICATION_ATTRIBUTES.has(name)) {
      scheduleFetch("tiles");
      return { handled: true, scheduled: true };
    }
    if (controls.alertsArmSwitchId != null && id === controls.alertsArmSwitchId && name === "switch") {
      applyArmed(String(event.value) === "on");
      scheduleTriggerFetchFromWs();
      return { handled: true, scheduled: true };
    }
    if (triggerSourceIds.has(id)) {
      scheduleTriggerFetchFromWs();
      return { handled: false, scheduled: true };
    }
    return { handled: false, scheduled: false };
  }

  async function acknowledge(kind, id) {
    const pending = acknowledgements[kind];
    if (!id || pending.has(id)) return null;
    pending.add(id);
    ui.acknowledgementChanged?.(kind, id, true);
    try {
      const result = await services.api.acknowledge(kind, id);
      if (!result?.ok) {
        if (kind === "triggers") {
          replaceList(state.hubTriggerActions, state.hubTriggerActions.filter((item) => item.id !== id));
          render("acknowledge");
          return result;
        }
        ui.error?.(result?.error || "Could not mark as read");
        return result;
      }
      if (kind === "notifications") {
        ui.notificationAcknowledged?.(id);
        if (Array.isArray(result.notifications)) applyNotificationsFromData({
          notifications: result.notifications,
          notificationDeviceIds: [...notificationIds],
        });
        else {
          replaceList(state.hubNotifications, state.hubNotifications.filter((item) => item.id !== id));
          ui.notificationsChanged?.(state.hubNotifications);
        }
      } else if (kind === "tiles") {
        if (Array.isArray(result.tileNotifications)) applyTileNotificationsFromData({
          tileNotifications: result.tileNotifications,
          tileNotificationDeviceIds: [...tileNotificationIds],
        });
        else {
          replaceList(state.hubTileNotifications, state.hubTileNotifications.filter((item) => item.id !== id));
          ui.tileNotificationsChanged?.(state.hubTileNotifications);
        }
      } else if (Array.isArray(result.triggerActions)) {
        applyTriggerActionsFromData(result);
      } else {
        replaceList(state.hubTriggerActions, state.hubTriggerActions.filter((item) => item.id !== id));
      }
      render("acknowledge");
      return result;
    } catch (error) {
      const result = { ok: false, error: error?.message || "request_failed" };
      if (kind === "triggers") {
        replaceList(state.hubTriggerActions, state.hubTriggerActions.filter((item) => item.id !== id));
        render("acknowledge");
        return result;
      }
      ui.error?.(result.error);
      return result;
    } finally {
      pending.delete(id);
      ui.acknowledgementChanged?.(kind, id, false);
    }
  }

  async function setAlertsArmed(armed) {
    try {
      const result = await services.api.setAlertsArmed(!!armed);
      if (!result?.ok) {
        ui.error?.(result?.error || "Could not update alert arm");
        return result;
      }
      applyArmed(!!result.alertsArmed);
      render("armed");
      return result;
    } catch (error) {
      const result = { ok: false, error: error?.message || "request_failed" };
      ui.error?.(result.error);
      return result;
    }
  }

  function clearScheduledFetches() {
    for (const timer of fetchTimers.values()) timers.clearTimeout(timer);
    fetchTimers.clear();
  }

  return {
    init: () => render("init"),
    render,
    handleHubEvent(event) { return routeHubEvent(event).handled; },
    routeHubEvent,
    applyArmed,
    applyNotificationsFromData,
    applyTileNotificationsFromData,
    applyTriggerControlsFromData,
    applyTriggerActionsFromData,
    fetchNotifications: () => runFetch("notifications"),
    fetchTileNotifications: () => runFetch("tiles"),
    fetchTriggerActions: () => runFetch("triggers"),
    acknowledgeNotification: (id) => acknowledge("notifications", id),
    acknowledgeTileNotification: (id) => acknowledge("tiles", id),
    acknowledgeTriggerAction: (id) => acknowledge("triggers", id),
    setAlertsArmed,
    pause() {
      clearScheduledFetches();
      ui.stopTone?.();
      ui.pauseCameraOverlay?.();
    },
    resume() {
      render("resume");
      ui.syncNotificationPopup?.();
    },
    dispose() {
      clearScheduledFetches();
      ui.stopTone?.();
    },
  };
}
