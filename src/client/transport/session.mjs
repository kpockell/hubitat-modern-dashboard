export function createSessionService({
  storage = globalThis.localStorage,
  now = Date.now,
  sessionKey = "mld_dashSession",
  expiresKey = "mld_dashSessionExpiresAt",
  accessToken = "",
  onChange = () => {},
} = {}) {
  let session = "";
  let expiresAt = 0;

  const snapshot = () => ({ session, expiresAt });
  const publish = () => {
    const state = snapshot();
    onChange(state);
    return state;
  };

  const save = (value, expiry) => {
    session = String(value || "");
    const numericExpiry = Number(expiry);
    expiresAt = Number.isFinite(numericExpiry) && numericExpiry > 0 ? numericExpiry : 0;
    try {
      if (session) {
        storage.setItem(sessionKey, session);
        storage.setItem(expiresKey, String(expiresAt));
      } else {
        storage.removeItem(sessionKey);
        storage.removeItem(expiresKey);
      }
    } catch {}
    return publish();
  };

  const api = {
    get state() { return snapshot(); },
    load() {
      try {
        session = storage.getItem(sessionKey) || "";
        expiresAt = Number(storage.getItem(expiresKey)) || 0;
      } catch {
        session = "";
        expiresAt = 0;
      }
      return publish();
    },
    save,
    clear() { return save("", 0); },
    isFresh() { return !!session && expiresAt > now(); },
    applyResponse(data) {
      if (!data) return snapshot();
      const nextSession = data.session || data.dashSession;
      if (!nextSession) return snapshot();
      return save(nextSession, data.expiresAt ?? data.dashSessionExpiresAt);
    },
    withToken(path) {
      if (!session) api.load();
      const parts = [];
      if (accessToken) parts.push("access_token=" + encodeURIComponent(accessToken));
      if (session && api.isFresh()) parts.push("dash_session=" + encodeURIComponent(session));
      if (!parts.length) return path;
      return path + (path.includes("?") ? "&" : "?") + parts.join("&");
    },
    withOAuthToken(path) {
      if (!accessToken) return path;
      return path + (path.includes("?") ? "&" : "?")
        + "access_token=" + encodeURIComponent(accessToken);
    },
  };
  return api;
}
