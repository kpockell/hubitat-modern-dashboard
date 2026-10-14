const GATE_RECHECK_MS = 8000;

export function createApplicationShellFeature({ state, services, ui }) {
  const timers = services.timers || globalThis;
  const documentRef = services.document || globalThis.document;
  let gateRecheckTimer = null;
  let ensureAccessTask = null;
  let visibilityHandler = null;

  function stopGateRecheck() {
    if (gateRecheckTimer) {
      timers.clearInterval(gateRecheckTimer);
      gateRecheckTimer = null;
    }
  }

  async function recheckAuthWhileGateOpen() {
    if (!ui.isGateOpen?.()) {
      stopGateRecheck();
      return;
    }
    try {
      const status = await services.fetchAuthStatus();
      if (!status?.required) setAuthRequired(false);
    } catch {}
  }

  function startGateRecheck() {
    stopGateRecheck();
    gateRecheckTimer = timers.setInterval(recheckAuthWhileGateOpen, GATE_RECHECK_MS);
  }

  function setAuthRequired(required) {
    state.dashboardPasswordRequired = !!required;
    if (!required) {
      services.clearDashSession?.();
      if (ui.isGateOpen?.()) ui.closeGateAndResolve?.();
    }
  }

  async function ensureDashboardAccess() {
    if (ensureAccessTask) return ensureAccessTask;
    ensureAccessTask = (async () => {
      services.loadDashSession?.();
      let status;
      try {
        status = await services.fetchAuthStatus();
      } catch {
        try {
          status = await services.fetchAuthStatus();
        } catch {
          return;
        }
      }
      if (!status?.required) {
        setAuthRequired(false);
        return;
      }
      setAuthRequired(true);
      if (services.isDashSessionFresh?.()) {
        services.setupDashSessionActivityRenewal?.();
        return;
      }
      await services.promptDashboardPassword?.();
      services.loadDashSession?.();
      services.setupDashSessionActivityRenewal?.();
    })();
    try {
      await ensureAccessTask;
    } finally {
      ensureAccessTask = null;
    }
  }

  return {
    init() {
      if (visibilityHandler || !documentRef?.addEventListener) return;
      visibilityHandler = () => {
        if (documentRef.visibilityState === "visible" && ui.isGateOpen?.()) {
          void recheckAuthWhileGateOpen();
        }
      };
      documentRef.addEventListener("visibilitychange", visibilityHandler);
    },
    render() {},
    handleHubEvent() { return false; },
    setAuthRequired,
    ensureDashboardAccess,
    gateOpened: startGateRecheck,
    gateClosed: stopGateRecheck,
    pause() {},
    resume() {},
    dispose() {
      stopGateRecheck();
      if (visibilityHandler && documentRef?.removeEventListener) {
        documentRef.removeEventListener("visibilitychange", visibilityHandler);
      }
      visibilityHandler = null;
    },
  };
}
