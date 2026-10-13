export function createTransport({
  fetch: fetchImpl = globalThis.fetch,
  AbortController: AbortControllerImpl = globalThis.AbortController,
  setTimeout: scheduleTimeout = globalThis.setTimeout,
  clearTimeout: cancelTimeout = globalThis.clearTimeout,
  session,
  ensureAccess,
  flash,
  timeoutMs = 15_000,
} = {}) {
  if (!session) throw new TypeError("Transport requires a session service");

  async function fetchWithTimeout(url, options = {}, milliseconds = timeoutMs) {
    const controller = new AbortControllerImpl();
    const timer = scheduleTimeout(() => controller.abort(), milliseconds);
    try {
      return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
      cancelTimeout(timer);
    }
  }

  async function getJson(url, authPass = 0) {
    let response;
    try {
      response = await fetchWithTimeout(session.withToken(url), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } catch (cause) {
      const error = new Error(cause?.name === "AbortError" ? "timed out" : (cause?.message || "network error"));
      error.code = cause?.name === "AbortError" ? "timeout" : "network";
      throw error;
    }
    if (response.status === 401) {
      if (authPass === 0) {
        session.load();
        if (session.isFresh()) return getJson(url, 1);
      }
      session.clear();
      await ensureAccess?.();
      if (authPass < 2) return getJson(url, authPass + 1);
      const error = new Error("auth required");
      error.code = "auth_required";
      throw error;
    }
    if (!response.ok) {
      const error = new Error("HTTP " + response.status);
      error.status = response.status;
      throw error;
    }
    let data;
    try {
      data = await response.json();
    } catch {
      const error = new Error("invalid JSON (response may exceed Hubitat Cloud ~128 KB limit)");
      error.code = "bad_json";
      throw error;
    }
    session.applyResponse(data);
    return data;
  }

  async function sendCommand(id, command, value, pin) {
    let url = "cmd?id=" + id + "&c=" + encodeURIComponent(command);
    if (value != null) url += "&v=" + encodeURIComponent(value);
    if (pin != null && pin !== "") url += "&pin=" + encodeURIComponent(pin);
    try {
      const response = await fetchImpl(session.withToken(url), { cache: "no-store" });
      if (!response.ok) {
        let message = "Command failed";
        try {
          const body = await response.json();
          if (body?.error) message = String(body.error);
        } catch {}
        if (response.status !== 403 && message !== "wrong pin") flash?.(message, true);
        return { ok: false, status: response.status, error: message };
      }
      return { ok: true };
    } catch {
      flash?.("Command failed", true);
      return { ok: false };
    }
  }

  async function sendBatch(commands) {
    if (!commands.length) return { ok: true, failed: 0 };
    if (commands.length === 1) {
      const command = commands[0];
      const result = await sendCommand(command.id, command.cmd, command.val);
      return { ok: result.ok, failed: result.ok ? 0 : 1, total: 1 };
    }
    try {
      const response = await fetchImpl(session.withToken("cmd/batch"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          commands: commands.map((command) => ({
            id: command.id,
            c: command.cmd,
            v: command.val == null ? null : command.val,
          })),
        }),
      });
      let data = null;
      try { data = await response.json(); } catch {}
      if (!response.ok || !data) {
        flash?.("Command failed", true);
        return { ok: false, failed: commands.length, total: commands.length };
      }
      if (data.failed > 0) flash?.(data.failed + " of " + data.total + " command(s) failed", true);
      return data;
    } catch {
      flash?.("Command failed", true);
      return { ok: false, failed: commands.length, total: commands.length };
    }
  }

  return { fetchWithTimeout, getJson, sendCommand, sendBatch };
}
