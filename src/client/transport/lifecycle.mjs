export function createLifecycleController({
  getConfig,
  isHidden,
  isGateOpen,
  isReorderActive,
  location = globalThis.location,
  WebSocket: WebSocketImpl = globalThis.WebSocket,
  refresh,
  onSocketMessage,
  onConnectionChange,
  pauseEffects,
  resumeUi,
  setInterval: scheduleInterval = globalThis.setInterval,
  clearInterval: cancelInterval = globalThis.clearInterval,
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  clearTimeout: cancelTimeout = globalThis.clearTimeout,
  defaultPollMs = 5_000,
  socketPollMs = 45_000,
} = {}) {
  let pollTimer = null;
  let socket = null;
  let connected = false;
  let retry = 0;
  let reconnectTimer = null;

  const hidden = () => !!isHidden?.();
  const reordering = () => !!isReorderActive?.();
  const config = () => getConfig?.() || {};
  const publishConnection = () => onConnectionChange?.({ socket, connected, retry, reconnectTimer });
  const runRefresh = () => refresh?.();

  function effectivePollInterval() {
    const current = config();
    const base = Math.max(2_000, current.pollIntervalMs || defaultPollMs);
    return current.useWebSocket && connected ? Math.max(base, socketPollMs) : base;
  }

  function stopPolling() {
    if (pollTimer != null) cancelInterval(pollTimer);
    pollTimer = null;
  }

  function startPolling() {
    stopPolling();
    pollTimer = scheduleInterval(runRefresh, effectivePollInterval());
    return pollTimer;
  }

  function restartPolling() {
    if (!hidden() && !reordering()) return startPolling();
    return null;
  }

  function clearReconnect() {
    if (reconnectTimer != null) cancelTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function stopSocket() {
    clearReconnect();
    connected = false;
    if (socket) {
      try { socket.close(); } catch {}
      socket = null;
    }
    publishConnection();
  }

  function scheduleReconnect() {
    const current = config();
    if (!current.useWebSocket || hidden()) return null;
    retry = Math.min(retry + 1, 6);
    const delay = Math.min(15_000, 1_000 * 2 ** retry);
    clearReconnect();
    reconnectTimer = scheduleTimeout(() => {
      reconnectTimer = null;
      startSocket();
    }, delay);
    publishConnection();
    return reconnectTimer;
  }

  function startSocket() {
    const current = config();
    if (!current.useWebSocket || !WebSocketImpl) return null;
    if (socket) {
      if (socket.readyState === WebSocketImpl.OPEN) return socket;
      try { socket.close(); } catch {}
      socket = null;
      connected = false;
    }
    if (location.hostname === "cloud.hubitat.com" || location.protocol === "https:") return null;
    try {
      socket = new WebSocketImpl("ws://" + location.host + "/eventsocket");
    } catch {
      socket = null;
      publishConnection();
      return null;
    }
    socket.onopen = () => {
      retry = 0;
      connected = true;
      publishConnection();
      restartPolling();
    };
    socket.onmessage = (event) => onSocketMessage?.(event);
    socket.onclose = () => {
      socket = null;
      connected = false;
      publishConnection();
      restartPolling();
      if (!hidden()) scheduleReconnect();
    };
    socket.onerror = () => { try { socket?.close(); } catch {} };
    publishConnection();
    return socket;
  }

  function pause() {
    stopPolling();
    stopSocket();
    pauseEffects?.();
  }

  function sync() {
    if (hidden() || isGateOpen?.()) return false;
    runRefresh();
    if (!reordering()) startPolling();
    startSocket();
    return true;
  }

  function resume() {
    if (hidden()) return false;
    resumeUi?.();
    return sync();
  }

  function dispose() {
    stopPolling();
    stopSocket();
  }

  return {
    get connected() { return connected; },
    get socket() { return socket; },
    get retry() { return retry; },
    effectivePollInterval,
    startPolling,
    restartPolling,
    stopPolling,
    startSocket,
    stopSocket,
    scheduleReconnect,
    pause,
    sync,
    resume,
    dispose,
  };
}
