export const FAVORITE_SIZE_PRESET_SET = new Set([
  "full", "square", "wide", "tall", "large", "portrait", "standard", "compact", "viewport",
]);
export const EMBED_SIZE_PRESET_SET = new Set([
  "compact", "standard", "wide", "square", "portrait", "full", "tall", "large", "viewport",
]);
export const TIME_SIZE_PRESET_SET = new Set(["compact", "standard", "square", "wide", "tall", "large"]);
export const TIME_STYLE_SET = new Set(["time", "time_seconds", "time_date"]);
export const TIME_STYLE_LABELS = {
  time: "Just the time",
  time_seconds: "Time with seconds",
  time_date: "Time with date",
};
export const MAX_EMBED_CARDS = 12;
export const MAX_TIME_CARDS = 12;
export const MAX_NOTIFICATION_CARDS = 12;
export const NOTIFICATION_SIZE_PRESET_SET = new Set([
  "compact", "standard", "square", "wide", "tall", "large", "full", "viewport",
]);
export const MAX_EMBED_TITLE = 80;
export const MAX_EMBED_URL = 4096;
export const HTML_ZOOM_PRESETS = [50, 75, 100, 125, 150];

export function validateHttpsEmbedUrl(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value || value.length > MAX_EMBED_URL) return null;
  if (/[\u0000-\u001F\u007F]/.test(value) || value.startsWith("//")) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== "https:" || !url.hostname) return null;
  return value;
}

export function hostnameFromHttpsUrl(url) {
  try { return new URL(url).hostname || ""; } catch { return ""; }
}

export function normalizeEmbedTitle(raw, url) {
  let title = raw == null ? "" : String(raw).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (title.length > MAX_EMBED_TITLE) title = title.slice(0, MAX_EMBED_TITLE).trim();
  return title || hostnameFromHttpsUrl(url) || "Embed";
}

export function normalizeHtmlTileTitle(raw, fallback) {
  let title = raw == null ? "" : String(raw).replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (title.length > MAX_EMBED_TITLE) title = title.slice(0, MAX_EMBED_TITLE).trim();
  if (title) return title;
  return String(fallback == null ? "" : fallback).trim() || "HTML";
}

export function parseEmbedInput(raw, parser = globalThis.DOMParser) {
  const text = String(raw || "").trim();
  if (!text) return { ok: false, error: "Enter an HTTPS embed URL or iframe code" };
  if (/<script[\s>]/i.test(text) && !/<iframe[\s>]/i.test(text)) {
    return { ok: false, error: "Script embeds are not supported — paste an iframe embed URL instead" };
  }
  let candidate = text;
  if (/<iframe[\s>]/i.test(text)) {
    try {
      const doc = new parser().parseFromString(text, "text/html");
      const iframe = doc.querySelector("iframe[src]");
      if (!iframe) return { ok: false, error: "Could not find an iframe src in the pasted code" };
      candidate = String(iframe.getAttribute("src") || "").trim();
    } catch {
      return { ok: false, error: "Could not parse iframe code" };
    }
  }
  const url = validateHttpsEmbedUrl(candidate);
  return url
    ? { ok: true, url }
    : { ok: false, error: "URL must be an absolute https:// link" };
}

export function isSameOriginEmbedUrl(url, currentLocation = globalThis.location) {
  try {
    return new URL(url, currentLocation.href).origin === currentLocation.origin;
  } catch {
    return false;
  }
}

export function deviceFavoriteKey(id) { return "d:" + Number(id); }
export function embedFavoriteKey(id) {
  const value = String(id || "");
  return "e:" + (value.startsWith("e_") ? value.slice(2) : value);
}
export function timeFavoriteKey(id) {
  const value = String(id || "");
  return "t:" + (value.startsWith("t_") ? value.slice(2) : value);
}
export function notificationFavoriteKey(id) {
  const value = String(id || "");
  return "n:" + (value.startsWith("n_") ? value.slice(2) : value);
}
export function htmlFavoriteKey(id) { return "h:" + String(id || ""); }

export function parseHtmlTileId(raw) {
  const id = String(raw || "").trim();
  const colon = id.indexOf(":");
  if (colon <= 0) return null;
  const deviceId = id.slice(0, colon);
  const attribute = id.slice(colon + 1);
  if (!/^\d+$/.test(deviceId) || !/^[A-Za-z0-9_.-]+$/.test(attribute)) return null;
  return { id: deviceId + ":" + attribute, deviceId: Number(deviceId), attribute };
}

export function normalizeTimeStyle(raw) {
  const value = String(raw || "").trim();
  return TIME_STYLE_SET.has(value) ? value : "time";
}
export function normalizeTimeSize(raw) {
  const value = String(raw || "").trim();
  return TIME_SIZE_PRESET_SET.has(value) ? value : "square";
}
export function normalizeNotificationSize(raw) {
  const value = String(raw || "").trim();
  return NOTIFICATION_SIZE_PRESET_SET.has(value) ? value : "tall";
}
export function normalizeHtmlZoom(raw) {
  const value = Number(raw);
  return HTML_ZOOM_PRESETS.includes(value) ? value : 100;
}

export function favoriteEntryKey(entry) {
  if (!entry) return "";
  if (entry.type === "embed") return embedFavoriteKey(entry.card?.id);
  if (entry.type === "time") return timeFavoriteKey(entry.card?.id);
  if (entry.type === "notifications") return notificationFavoriteKey(entry.card?.id);
  if (entry.type === "html") return htmlFavoriteKey(entry.tile?.id);
  return entry.dev?.i == null ? "" : deviceFavoriteKey(entry.dev.i);
}

export function normalizeFavoritesLayout(
  layout,
  deviceIds,
  cards,
  timeCardsList,
  notificationCardsList,
  htmlTilesList,
) {
  const validDevices = new Set((deviceIds || []).map(Number));
  const validEmbeds = new Set((cards || []).map((card) => String(card.id)));
  const validTimes = new Set((timeCardsList || []).map((card) => String(card.id)));
  const validNotifs = new Set((notificationCardsList || []).map((card) => String(card.id)));
  const validHtml = new Set((htmlTilesList || []).map((tile) => String(tile.id)));
  const out = [];
  const seen = new Set();
  for (const raw of layout || []) {
    const value = String(raw || "").trim();
    let key = null;
    if (value.startsWith("d:") && /^\d+$/.test(value.slice(2))) key = value;
    else if (value.startsWith("e:")) {
      let rest = value.slice(2);
      if (rest.startsWith("e_")) rest = rest.slice(2);
      if (/^[A-Za-z0-9_-]+$/.test(rest)) key = "e:" + rest;
    } else if (value.startsWith("e_") && /^e_[A-Za-z0-9_-]+$/.test(value)) {
      key = "e:" + value.slice(2);
    } else if (value.startsWith("t:")) {
      let rest = value.slice(2);
      if (rest.startsWith("t_")) rest = rest.slice(2);
      if (/^[A-Za-z0-9_-]+$/.test(rest)) key = "t:" + rest;
    } else if (value.startsWith("t_") && /^t_[A-Za-z0-9_-]+$/.test(value)) {
      key = "t:" + value.slice(2);
    } else if (value.startsWith("n:")) {
      let rest = value.slice(2);
      if (rest.startsWith("n_")) rest = rest.slice(2);
      if (/^[A-Za-z0-9_-]+$/.test(rest)) key = "n:" + rest;
    } else if (value.startsWith("n_") && /^n_[A-Za-z0-9_-]+$/.test(value)) {
      key = "n:" + value.slice(2);
    } else if (value.startsWith("h:")) {
      const parsed = parseHtmlTileId(value.slice(2));
      if (parsed) key = htmlFavoriteKey(parsed.id);
    }
    if (!key || seen.has(key)) continue;
    if (key.startsWith("d:") && !validDevices.has(Number(key.slice(2)))) continue;
    if (key.startsWith("e:") && !validEmbeds.has("e_" + key.slice(2))) continue;
    if (key.startsWith("t:") && !validTimes.has("t_" + key.slice(2))) continue;
    if (key.startsWith("n:") && !validNotifs.has("n_" + key.slice(2))) continue;
    if (key.startsWith("h:") && !validHtml.has(key.slice(2))) continue;
    seen.add(key);
    out.push(key);
  }
  const append = (key) => {
    if (!seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  };
  for (const id of deviceIds || []) append(deviceFavoriteKey(id));
  for (const card of cards || []) append(embedFavoriteKey(card.id));
  for (const card of timeCardsList || []) append(timeFavoriteKey(card.id));
  for (const card of notificationCardsList || []) append(notificationFavoriteKey(card.id));
  return out;
}

export function mapTimeCardsFromConfig(list) {
  if (!Array.isArray(list)) return null;
  return list.map((card) => ({
    id: String(card.id || ""),
    style: normalizeTimeStyle(card.style),
    size: normalizeTimeSize(card.size),
  })).filter((card) => card.id.startsWith("t_"));
}

export function mapNotificationCardsFromConfig(list) {
  if (!Array.isArray(list)) return null;
  return list.map((card) => ({
    id: String(card.id || ""),
    size: normalizeNotificationSize(card.size),
  })).filter((card) => card.id.startsWith("n_"));
}
