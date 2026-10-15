(() => {
  "use strict";

  const ROOMS_EL = document.getElementById("rooms");
  const SEARCH_EL = document.getElementById("search");
  const STATUS_EL = document.getElementById("status");
  const ALL_ON_BTN = document.getElementById("all-on");
  const ALL_OFF_BTN = document.getElementById("all-off");
  const ALL_ON_TRACK = document.getElementById("all-on-track");
  const ALL_OFF_TRACK = document.getElementById("all-off-track");
  const ALL_ON_RESTORE_BTN = document.getElementById("all-on-restore");
  const ALL_OFF_SAVE_BTN = document.getElementById("all-off-save");
  const CENTRAL_TSTAT_BTN = document.getElementById("tstat-central-btn");
  const CENTRAL_MUSIC_BTN = document.getElementById("music-central-btn");
  const CENTRAL_BLINDS_BTN = document.getElementById("blinds-central-btn");
  const CENTRAL_FAN_BTN = document.getElementById("fan-central-btn");
  const EXPAND_ALL_BTN = document.getElementById("expand-all");
  const REORDER_DONE_BTN = document.getElementById("reorder-done");
  const REORDER_CANCEL_BTN = document.getElementById("reorder-cancel");
  const OVERFLOW_BTN = document.getElementById("topbar-overflow-btn");
  const OVERFLOW_MENU = document.getElementById("topbar-overflow-menu");
  const MENU_REORDER_BTN = document.getElementById("menu-reorder");
  const MENU_ADD_TILE = document.getElementById("menu-add-tile");
  const MENU_ADD_EMBED_BTN = document.getElementById("menu-add-embed");
  const MENU_ADD_TIME_BTN = document.getElementById("menu-add-time");
  const MENU_ADD_NOTIF_BTN = document.getElementById("menu-add-notif");
  const MENU_ADD_HTML_BTN = document.getElementById("menu-add-html");
  const MENU_HAPTICS_EL = document.getElementById("menu-haptics");
  const MENU_NOTIF_SOUND_EL = document.getElementById("menu-notif-sound");
  const MENU_ALERTS_ARM_EL = document.getElementById("menu-alerts-arm");
  const MENU_ALERTS_ARM_WRAP = document.getElementById("menu-alerts-arm-wrap");
  const MENU_TABS_EL = document.getElementById("menu-tabs");
  const MENU_DRAWER_EL = document.getElementById("menu-drawer");
  const MENU_THEME_SEGMENT = document.getElementById("menu-theme-segment");
  const MENU_CAMERAS_LAYOUT = document.getElementById("menu-cameras-layout");
  const MENU_CAMERAS_COLS_SEGMENT = document.getElementById("menu-cameras-cols");
  const MENU_SENSORS_ORG = document.getElementById("menu-sensors-org");
  const MENU_SENSORS_FLAT_EL = document.getElementById("menu-sensors-flat");
  const MENU_OPEN_LOCAL_BTN = document.getElementById("menu-open-local");
  const MENU_OPEN_CLOUD_BTN = document.getElementById("menu-open-cloud");
  const MENU_LOCAL_URL_EL = document.getElementById("menu-local-url");
  const HAPTICS_STORAGE_KEY = "mld_haptics";
  const NOTIF_SOUND_STORAGE_KEY = "mld_notif_sound";
  const NOTIF_SNOOZE_STORAGE_KEY = "mld_notif_snooze";
  const THEME_STORAGE_KEY = "mld_theme";
  const TABS_STORAGE_KEY = "mld_tabs";
  const DRAWER_STORAGE_KEY = "mld_drawer";
  const CAMERAS_COLS_STORAGE_KEY = "mld_cameras_cols";
  const SENSORS_FLAT_STORAGE_KEY = "mld_sensors_flat";
  const FAVORITE_SIZES_STORAGE_KEY = "mld_favorite_sizes";
  const LOCAL_URL_STORAGE_KEY = "mld_localUrl";
  const CLOUD_URL_STORAGE_KEY = "mld_cloudUrl";
  const PREFER_CLOUD_STORAGE_KEY = "mld_preferCloud";
  const DASH_SESSION_STORAGE_KEY = "mld_dashSession";
  const DASH_SESSION_EXPIRES_KEY = "mld_dashSessionExpiresAt";
  const DASH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const THEME_OPTIONS = ["dark", "light", "auto"];
  const APP_EL = document.getElementById("app");
  const REORDER_DRAG_THRESHOLD = 8;
  const DASHBOARD_TITLE_EL = document.getElementById("dashboard-title");
  const CURRENT_CATEGORY_TITLE_EL = document.getElementById("current-category-title");

  const POLL_DEFAULT = 5000;
  const POLL_WS_FALLBACK = 45000;

  function loadHapticsPref() {
    try {
      const raw = localStorage.getItem(HAPTICS_STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return true;
  }

  function saveHapticsPref(on) {
    try { localStorage.setItem(HAPTICS_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  function loadNotifSoundPref() {
    try {
      const raw = localStorage.getItem(NOTIF_SOUND_STORAGE_KEY);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {}
    return false;
  }

  function saveNotifSoundPref(on) {
    try { localStorage.setItem(NOTIF_SOUND_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  function loadNotifSnoozeMap() {
    try {
      const raw = localStorage.getItem(NOTIF_SNOOZE_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
    } catch { return {}; }
  }

  function saveNotifSnoozeMap(map) {
    try { localStorage.setItem(NOTIF_SNOOZE_STORAGE_KEY, JSON.stringify(map || {})); } catch {}
  }

  function loadThemePref() {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (THEME_OPTIONS.includes(raw)) return raw;
    } catch {}
    return "auto";
  }

  function saveThemePref(theme) {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch {}
  }

  function loadTabsPref() {
    try {
      const raw = localStorage.getItem(TABS_STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return true;
  }

  function saveTabsPref(on) {
    try { localStorage.setItem(TABS_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  function loadDrawerPref() {
    try {
      const raw = localStorage.getItem(DRAWER_STORAGE_KEY);
      if (raw === "0") return false;
      if (raw === "1") return true;
    } catch {}
    return false;
  }

  function saveDrawerPref(on) {
    try { localStorage.setItem(DRAWER_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  function loadCamerasColsPref() {
    try {
      const n = Number(localStorage.getItem(CAMERAS_COLS_STORAGE_KEY));
      if (n === 2 || n === 3) return n;
    } catch {}
    return 1;
  }

  function saveCamerasColsPref(cols) {
    try { localStorage.setItem(CAMERAS_COLS_STORAGE_KEY, String(cols)); } catch {}
  }

  function loadSensorsFlatPref() {
    try {
      const raw = localStorage.getItem(SENSORS_FLAT_STORAGE_KEY);
      if (raw === "1") return true;
      if (raw === "0") return false;
    } catch {}
    return false;
  }

  function saveSensorsFlatPref(on) {
    try { localStorage.setItem(SENSORS_FLAT_STORAGE_KEY, on ? "1" : "0"); } catch {}
  }

  const {
    FAVORITE_SIZE_PRESET_SET, EMBED_SIZE_PRESET_SET, TIME_SIZE_PRESET_SET, TIME_STYLE_LABELS,
    MAX_EMBED_CARDS, MAX_TIME_CARDS, MAX_NOTIFICATION_CARDS, MAX_EMBED_TITLE, HTML_ZOOM_PRESETS,
    validateHttpsEmbedUrl, hostnameFromHttpsUrl, normalizeEmbedTitle, normalizeHtmlTileTitle,
  } = MLDDomain;
  const {
    createRuntime,
    replaceCollection: replaceList,
    replaceRecord: replaceMap,
  } = MLDRuntime;
  const { createSessionService } = MLDTransport;

  function applyHtmlTitleOverridesFromConfig(source, liveTitlesById = null) {
    const feature = postCall("ensureFavoritesCustomCardsFeature");
    if (feature) return feature.applyHtmlTitleOverrides(source, liveTitlesById);
    const next = {};
    if (source && typeof source === "object") {
      for (const k of Object.keys(source)) {
        const override = normalizeHtmlTileTitle(source[k], k.split(":").slice(1).join(":"));
        if (!override) continue;
        if (liveTitlesById) {
          const live = liveTitlesById[k] ?? liveTitlesById[htmlFavoriteKey(k)];
          if (live && override === live) continue;
        }
        next[k] = override;
      }
    }
    replaceMap(htmlTileTitleOverrides, next);
  }

  function htmlTitleOverridesForLayout(layout = favoritesLayout, overrides = htmlTileTitleOverrides) {
    const feature = postCall("ensureFavoritesCustomCardsFeature");
    if (feature) return feature.htmlTitleOverridesForLayout(layout, overrides);
    const out = {};
    for (const key of layout || []) {
      if (!key.startsWith("h:")) continue;
      const id = key.slice(2);
      const title = overrides[id];
      if (title) out[id] = title;
    }
    return out;
  }

  const {
    parseEmbedInput, isSameOriginEmbedUrl, deviceFavoriteKey, embedFavoriteKey, timeFavoriteKey,
    notificationFavoriteKey, htmlFavoriteKey, parseHtmlTileId, normalizeTimeStyle, normalizeTimeSize,
    normalizeNotificationSize, normalizeHtmlZoom, favoriteEntryKey, normalizeFavoritesLayout,
  } = MLDDomain;

  function syncEmbedStateToMld() {
    const m = globalThis.__MLD;
    if (!m) return;
    m.embedCards = embedCards;
    m.timeCards = timeCards;
    m.notificationCards = notificationCards;
    m.htmlTiles = htmlTiles;
    m.htmlTileTitleOverrides = htmlTileTitleOverrides;
    m.favoritesLayout = favoritesLayout;
    m.embedEditorOpen = embedEditorOpen;
    m.timeEditorOpen = timeEditorOpen;
    m.htmlTitleEditorOpen = htmlTitleEditorOpen;
  }

  const { mapTimeCardsFromConfig, mapNotificationCardsFromConfig } = MLDDomain;

  function applyHtmlCatalogFromData(d) {
    const feature = postCall("ensureFavoritesCustomCardsFeature");
    if (feature) return feature.applyHtmlCatalogFromData(d);
    if (!Array.isArray(d?.htmlTiles)) return false;
    const hasHtmlSizes = !!(d.config?.htmlSizes && typeof d.config.htmlSizes === "object")
      || !!(d.htmlSizes && typeof d.htmlSizes === "object");
    const htmlSizes = d.config?.htmlSizes && typeof d.config.htmlSizes === "object"
      ? d.config.htmlSizes
      : (d.htmlSizes && typeof d.htmlSizes === "object" ? d.htmlSizes : {});
    const hasHtmlZooms = !!(d.config?.htmlZooms && typeof d.config.htmlZooms === "object")
      || !!(d.htmlZooms && typeof d.htmlZooms === "object");
    const htmlZooms = d.config?.htmlZooms && typeof d.config.htmlZooms === "object"
      ? d.config.htmlZooms
      : (d.htmlZooms && typeof d.htmlZooms === "object" ? d.htmlZooms : {});
    const hasHtmlTitles = Object.prototype.hasOwnProperty.call(d.config || {}, "htmlTitles")
      || Object.prototype.hasOwnProperty.call(d, "htmlTitles");
    const htmlTitles = d.config?.htmlTitles && typeof d.config.htmlTitles === "object"
      ? d.config.htmlTitles
      : (d.htmlTitles && typeof d.htmlTitles === "object" ? d.htmlTitles : {});
    const liveTitlesById = {};
    const hubDisplayById = {};
    for (const raw of d.htmlTiles) {
      if (!raw || typeof raw !== "object") continue;
      const candidateId = raw.id != null
        ? raw.id
        : String(raw.deviceId == null ? "" : raw.deviceId) + ":" + String(raw.attribute || "");
      const parsed = parseHtmlTileId(candidateId);
      if (!parsed) continue;
      // liveTitle is the hub/device default; title may already include an override from the hub.
      const liveTitle = normalizeHtmlTileTitle(
        raw.liveTitle != null ? raw.liveTitle : (raw.name ?? parsed.attribute),
        parsed.attribute
      );
      const hubDisplay = normalizeHtmlTileTitle(raw.title ?? liveTitle, parsed.attribute);
      liveTitlesById[parsed.id] = liveTitle;
      hubDisplayById[parsed.id] = hubDisplay;
    }
    if (hasHtmlTitles) {
      applyHtmlTitleOverridesFromConfig(htmlTitles, liveTitlesById);
    } else {
      // /data historically omitted config.htmlTitles — infer overrides from hub title vs live.
      for (const id of Object.keys(hubDisplayById)) {
        const live = liveTitlesById[id];
        const hubDisplay = hubDisplayById[id];
        if (hubDisplay && live && hubDisplay !== live) htmlTileTitleOverrides[id] = hubDisplay;
      }
    }
    const nextTiles = [];
    const seen = new Set();
    for (const raw of d.htmlTiles) {
      if (!raw || typeof raw !== "object") continue;
      const candidateId = raw.id != null
        ? raw.id
        : String(raw.deviceId == null ? "" : raw.deviceId) + ":" + String(raw.attribute || "");
      const parsed = parseHtmlTileId(candidateId);
      if (!parsed || seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      const configuredSize = htmlSizes[parsed.id] ?? htmlSizes[htmlFavoriteKey(parsed.id)];
      const sizeCandidate = configuredSize ?? (hasHtmlSizes ? "tall" : raw.size);
      const configuredZoom = htmlZooms[parsed.id] ?? htmlZooms[htmlFavoriteKey(parsed.id)];
      const zoomCandidate = configuredZoom ?? (hasHtmlZooms ? 100 : raw.zoom);
      const liveTitle = liveTitlesById[parsed.id]
        ?? normalizeHtmlTileTitle(parsed.attribute, parsed.attribute);
      const configuredOverride = htmlTileTitleOverrides[parsed.id]
        ?? htmlTileTitleOverrides[htmlFavoriteKey(parsed.id)];
      const hubDisplay = hubDisplayById[parsed.id] ?? liveTitle;
      const tile = {
        id: parsed.id,
        deviceId: parsed.deviceId,
        attribute: parsed.attribute,
        liveTitle,
        title: normalizeHtmlTileTitle(configuredOverride ?? hubDisplay ?? liveTitle, parsed.attribute),
        size: EMBED_SIZE_PRESET_SET.has(String(sizeCandidate)) ? String(sizeCandidate) : "tall",
        zoom: normalizeHtmlZoom(zoomCandidate),
      };
      if (Object.prototype.hasOwnProperty.call(raw, "html")) {
        tile.html = raw.html == null ? "" : String(raw.html);
      } else {
        const prev = htmlTiles.find((candidate) => candidate.id === parsed.id);
        if (prev && Object.prototype.hasOwnProperty.call(prev, "html")) tile.html = prev.html;
      }
      if (raw.error != null && String(raw.error).trim()) tile.error = String(raw.error).trim();
      if (raw.roomsCss != null && String(raw.roomsCss).trim()) tile.roomsCss = String(raw.roomsCss);
      if (raw.alignCss != null && String(raw.alignCss).trim()) tile.alignCss = String(raw.alignCss);
      nextTiles.push(tile);
    }
    const incomingLayout = Array.isArray(d.config?.favoritesLayout)
      ? d.config.favoritesLayout
      : favoritesLayout;
    const nextDeviceIds = Array.isArray(d.config?.favorites)
      ? d.config.favorites.map(Number)
      : favorites;
    const nextLayout = normalizeFavoritesLayout(
      incomingLayout,
      nextDeviceIds,
      embedCards,
      timeCards,
      notificationCards,
      nextTiles
    );
    const favoredIdsBefore = new Set(favoritesLayout.filter((key) => key.startsWith("h:")).map((key) => key.slice(2)));
    const favoredIdsAfter = new Set(nextLayout.filter((key) => key.startsWith("h:")).map((key) => key.slice(2)));
    const signature = (tiles, ids, layout) => JSON.stringify({
      layout: layout.filter((key) => key.startsWith("h:")),
      tiles: tiles.filter((tile) => ids.has(tile.id)).map((tile) => [
        tile.id, tile.title, tile.size, tile.zoom, tile.html, tile.error, tile.roomsCss, tile.alignCss,
      ]),
    });
    const prevSig = signature(htmlTiles, favoredIdsBefore, favoritesLayout);
    const nextSig = signature(nextTiles, favoredIdsAfter, nextLayout);
    replaceList(htmlTiles, nextTiles);
    replaceList(favoritesLayout, nextLayout);
    syncEmbedStateToMld();
    return prevSig !== nextSig;
  }

  function applyEmbedConfigFromData(d, { allowDuringReorder = false } = {}) {
    const feature = postCall("ensureFavoritesCustomCardsFeature");
    if (feature) return feature.applyEmbedConfigFromData(d, { allowDuringReorder });
    if (!d?.config) return false;
    const editorOpen = embedEditorOpen || timeEditorOpen || htmlTitleEditorOpen
      || !!globalThis.__MLD?.embedEditorOpen
      || !!globalThis.__MLD?.timeEditorOpen
      || !!globalThis.__MLD?.htmlTitleEditorOpen;
    if (!allowDuringReorder && (postCall("isFavoritesReorderActive") || editorOpen)) return false;
    const nextCards = Array.isArray(d.config.embedCards)
      ? d.config.embedCards.map((c) => ({
          id: String(c.id || ""),
          title: normalizeEmbedTitle(c.title, c.url),
          url: validateHttpsEmbedUrl(c.url) || "",
          size: EMBED_SIZE_PRESET_SET.has(String(c.size)) ? String(c.size) : "tall",
        })).filter((c) => c.id.startsWith("e_") && c.url)
      : embedCards.slice();
    const mappedTimes = mapTimeCardsFromConfig(d.config.timeCards);
    const nextTimeCards = mappedTimes != null ? mappedTimes : timeCards.slice();
    const mappedNotifs = mapNotificationCardsFromConfig(d.config.notificationCards);
    const nextNotificationCards = mappedNotifs != null ? mappedNotifs : notificationCards.slice();
    const nextLayout = normalizeFavoritesLayout(
      Array.isArray(d.config.favoritesLayout) ? d.config.favoritesLayout : favoritesLayout,
      favorites,
      nextCards,
      nextTimeCards,
      nextNotificationCards,
      htmlTiles
    );
    const prevSig = favoritesLayout.join(",")
      + "|" + embedCards.map((c) => c.id + ":" + c.size + ":" + c.url).join("|")
      + "|" + timeCards.map((c) => c.id + ":" + c.style + ":" + c.size).join("|")
      + "|" + notificationCards.map((c) => c.id + ":" + c.size).join("|");
    replaceList(embedCards, nextCards);
    replaceList(timeCards, nextTimeCards);
    replaceList(notificationCards, nextNotificationCards);
    replaceList(favoritesLayout, nextLayout);
    syncEmbedStateToMld();
    const nextSig = favoritesLayout.join(",")
      + "|" + embedCards.map((c) => c.id + ":" + c.size + ":" + c.url).join("|")
      + "|" + timeCards.map((c) => c.id + ":" + c.style + ":" + c.size).join("|")
      + "|" + notificationCards.map((c) => c.id + ":" + c.size).join("|");
    return prevSig !== nextSig;
  }

  function loadFavoriteSizesCache() {
    try {
      const raw = localStorage.getItem(FAVORITE_SIZES_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      const out = {};
      for (const k of Object.keys(parsed)) {
        const id = Number(k);
        const size = String(parsed[k]);
        if (Number.isFinite(id) && FAVORITE_SIZE_PRESET_SET.has(size)) out[id] = size;
      }
      return out;
    } catch {}
    return {};
  }

  function saveFavoriteSizesCache(sizes) {
    try {
      if (!sizes || !Object.keys(sizes).length) {
        localStorage.removeItem(FAVORITE_SIZES_STORAGE_KEY);
        return;
      }
      const out = {};
      for (const k of Object.keys(sizes)) out[String(k)] = sizes[k];
      localStorage.setItem(FAVORITE_SIZES_STORAGE_KEY, JSON.stringify(out));
    } catch {}
  }

  function primeFavoriteSizesFromConfig(favoriteIds, sizesObj) {
    if (!sizesObj || typeof sizesObj !== "object" || !Array.isArray(favoriteIds)) return;
    const favSet = new Set(favoriteIds.map(Number));
    for (const k of Object.keys(sizesObj)) {
      const id = Number(k);
      const size = String(sizesObj[k]);
      if (favSet.has(id) && FAVORITE_SIZE_PRESET_SET.has(size)) favoriteSizes[id] = size;
    }
  }

  let cfg = { pollIntervalMs: POLL_DEFAULT, useWebSocket: false, theme: loadThemePref(), dashboardName: "mDash", defaultTab: "lights", roomOrder: null, navOrder: null, cameraOrder: null, thermostatOrder: null, enableHaptics: loadHapticsPref(), enableNotifSound: loadNotifSoundPref(), enableTabs: loadTabsPref(), enableDrawer: loadDrawerPref(), camerasCols: loadCamerasColsPref(), sensorsFlat: loadSensorsFlatPref(), localUrl: "", cloudUrl: "" };

  let localModeBannerEl = null;
  let localBannerDismissed = false;

  // state
  let rooms = [];            // [{id,name}]
  let roomMap = new Map();   // id -> name
  let devices = [];          // [{i,n,r,d,ct,s,l,k}]
  let devicesByRoom = new Map(); // roomId -> [device]
  let outletsByRoom = new Map(); // roomId -> [outlet]
  let devMap = new Map();    // id -> {el, data}
  let outletMap = new Map(); // id -> {el, data} (outlet tiles in rooms)
  let favDevMap = new Map(); // id -> {el, data} (favorites popup tiles)
  let roomEls = new Map();   // roomId -> {card, body, meta}
  let lastDataSig = "";
  let pollTimer = null;
  let ws = null;
  let wsConnected = false;
  let wsRetry = 0;
  let wsReconnectTimer = null;
  let pageWasHidden = false;
  let reorderMode = false;
  let reorderBusy = false;
  let reorderSnapshot = null;
  let reorderDraftOrder = null;
  let navReorderSnapshot = null;
  let navReorderDraftOrder = null;
  let navReorderDrawerRelocated = false;
  let tstatReorderActive = false;
  let tstatReorderSnapshot = null;
  let tstatReorderDraftOrder = null;
  const tstatReorderEls = new Map();
  const navEls = new Map(); // navKey -> { wrap, btn, handle }

  let colorPopup = null;
  let colorSession = null;
  const levelOptimistic = new Map(); // device id -> { level, until, timer }
  const switchOptimistic = new Map(); // device id -> { s, l?, until, timer }
  const lockOptimistic = new Map(); // lock id -> { lk, st, until, timer }
  const garageOptimistic = new Map(); // garage id -> { st, until, timer }
  const shadeOptimistic = new Map(); // shade id -> { st?, pos?, until, timer }
  const fanOptimistic = new Map(); // fan id -> { s?, sp?, until, timer }
  const valveOptimistic = new Map(); // valve id -> { st?, until, timer }
  const musicOptimistic = new Map(); // music id -> { st, v?, until, timer }
  const setpointOptimistic = new Map(); // tstat id -> { hsp?, csp?, until, timer }

  let rgbWheelCache = null;

  // ---- thermostat ----
  let thermostats = [];          // [{i,n,r,tm,os,hsp,csp,temp,u,hasFm,fm,hasFs,fs,supM,supFM,fsLev,hasCm,hasCfs,cfs,hasVp,vp,vpLev}]
  let tempSensors = [];          // [{i,n,r,temp,u}]
  let thermoByRoom = new Map();  // roomId -> [thermostat]
  let sensorByRoom = new Map();  // roomId -> [temp sensor or multi-sensor with temperature]
  let climateEls = new Map();    // roomId -> { el, iconEl, tempEl, controllable }
  let tstatPopup = null;
  let tstatSession = null;       // { rid, anchor, ids:[], unit, edit:"heat"|"cool" }
  const tstatDeviceModeLock = new Map(); // id -> { until, mode }
  const tstatFanModeLock = new Map(); // id -> { until, mode }
  const tstatVaneLock = new Map(); // id -> { until, position }

  let musicMasterPopup = null;
  let fanMasterPopup = null;
  let shadeMasterPopup = null;
  let fanMasterSession = null;   // { ids: number[], allIds: number[] }
  let shadeMasterSession = null;
  let fanMasterTargetMenu = null;
  let fanMasterTargetMenuCleanup = null;
  let fanMasterTargetMenuAnchor = null;
  let shadeMasterTargetMenu = null;
  let shadeMasterTargetMenuCleanup = null;
  let shadeMasterTargetMenuAnchor = null;
  const fanMasterTargetState = { menu: null, anchor: null, cleanup: null };
  const shadeMasterTargetState = { menu: null, anchor: null, cleanup: null };
  const MUSIC_VOL_STEP = 5;

  let hubModes = [];
  let currentHubMode = "";
  let scenes = [];
  let locks = [];
  let garageDoors = [];
  let windowShades = [];
  let ceilingFans = [];           // [{i,n,r,s,sp,supSp,hasSw}]
  let valves = [];
  let outlets = [];              // [{i,n,r,s}] outlet devices from companion app
  let music = [];
  let cameras = [];
  let favorites = [];
  let favoriteSizes = loadFavoriteSizesCache(); // id -> preset string (only non-default entries kept)
  let favoritesReorderSnapshotSizes = null;
  let embedCards = []; // [{id,title,url,size}]
  let timeCards = []; // [{id,style,size}]
  let notificationCards = []; // [{id,size}]
  let htmlTiles = []; // [{id,deviceId,attribute,title,liveTitle?,size,html?,error?,roomsCss?,alignCss?}]
  let htmlTileTitleOverrides = {}; // id -> user-renamed display title (not live hub titles)
  let favoritesReorderSnapshotHtmlTitles = null;
  let favoritesLayout = []; // ["d:123","e:abc","t:xyz","n:abc","h:123:attribute",...]
  let favoritesReorderSnapshotLayout = null;
  let favoritesReorderSnapshotEmbeds = null;
  let favoritesReorderSnapshotTimes = null;
  let favoritesReorderSnapshotNotifs = null;
  let favoritesReorderSnapshotHtml = null;
  let embedEditorOpen = false;
  let timeEditorOpen = false;
  let htmlTitleEditorOpen = false;
  let embedExpandState = null; // { cardEl, placeholder, restoreFocus }
  let favEmbedObserver = null;
  let favHtmlObserver = null;
  const htmlTileIframes = new Map(); // tile id -> iframe
  let timeTickTimer = null;
  let favoritesPersistEl = null; // stable Favorites panel (iframes never moved)
  let snapshots = {};
  let roomGestureLockCount = 0;
  let hubModeLockUntil = 0;
  let hubModeLockTimer = null;
  let hsmStatus = "";
  let hsmAlert = "";
  let hsmAlertDesc = "";
  let hsmLockTimer = null;
  let hubNotifications = [];
  let hubTileNotifications = [];
  let notificationDeviceIds = new Set();
  let tileNotificationDeviceIds = new Set();
  let notifPopup = null;
  let notifShowingId = null;
  let notifAckInFlight = false;
  let notifTileAckIds = new Set();
  let notifSnoozeTimer = null;
  let notifLastSoundId = null;
  let notifAudioCtx = null;
  let notifFetchInFlight = null;
  let notifFetchQueued = false;
  let notifTileFetchInFlight = null;
  let notifTileFetchQueued = false;
  let notifWsFetchTimer = null;
  let notifTileWsFetchTimer = null;
  let triggersEnabled = false;
  let alertsArmed = false;
  let alertsArmSwitchId = null;
  let triggerSourceIds = new Set();
  let hubTriggerActions = [];
  let triggerFetchInFlight = null;
  let triggerFetchQueued = false;
  let triggerWsFetchTimer = null;
  let triggerAckInFlight = false;
  let activeCameraOverlayId = null;
  let activeCameraOverlayCamId = null;
  let cameraOverlayPopup = null;
  let cameraOverlayDismissTimer = null;
  let cameraOverlayFocusRestore = null;
  let playedTriggerToneIds = new Map(); // id -> expiresAt
  let alertToneStop = null;
  let hsmEnabled = false;
  let hsmPinRequired = false;
  let thermostatsPopupEnabled = false;
  let outletsSeparateTab = false;
  let hubModePopupEnabled = true;
  let scenesPopupEnabled = true;
  let roomClimateEnabled = true;
  let schedulerEnabled = true;
  let unlockPinEnabled = false;
  let unlockPinRequired = false;
  let hsmLockUntil = 0;
  let pinPadPopup = null;
  let pinPadState = null;
  let gatePopup = null;
  let gateState = null;
  let dashSession = "";
  let dashSessionExpiresAt = 0;
  let dashboardPasswordRequired = false;
  let dashSessionActivityBound = false;
  let ensureDashboardAccessTask = null;
  let confirmPopup = null;
  let confirmPending = null;
  let quickPopup = null;
  let quickPopupOpenType = null;

  function syncQuickPopupRef(el) {
    quickPopup = el;
    if (globalThis.__MLD) globalThis.__MLD.quickPopup = el;
  }

  // ---------- tab mode (inline tabs instead of popups) ----------
  const TAB_CATEGORIES = new Set(["favorites", "sensors", "thermostats", "music", "cameras", "blinds", "fans", "outlets", "scheduling"]);
  const TAB_LABELS = { lights: "Lights", favorites: "Favorites", sensors: "Sensors", thermostats: "Thermostats", music: "Music", cameras: "Cameras", blinds: "Blinds", fans: "Fans", outlets: "Outlets", scheduling: "Scheduler" };
  let tabMode = cfg.enableTabs;
  let activeTab = "lights";
  let defaultTabApplied = false;
  let tabViewEl = null;
  const QUICK_LIGHTS_BTN = document.getElementById("quick-lights");
  let favTstatModeMenu = null;
  let favTstatModeMenuCleanup = null;
  let favTstatModeMenuId = null;
  let favTstatModeMenuAnchor = null;
  let centralTstatTargetMenu = null;
  let centralTstatTargetMenuCleanup = null;
  let centralTstatTargetMenuAnchor = null;
  let favTstatMap = new Map(); // tstat id -> { el, card, spEl, stateEl, stateTxt, modeLabel, modeBtn, minus, plus }
  let favPopupSig = "";
  let tstatsPopupMap = new Map();
  let tstatsPopupSig = "";

  function setLevelOptimistic(id, level) {
    const prev = levelOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const until = Date.now() + LEVEL_OPTIMISTIC_MS;
    const timer = setTimeout(() => {
      levelOptimistic.delete(id);
      postCall("updateStates");
    }, LEVEL_OPTIMISTIC_MS);
    levelOptimistic.set(id, { level, until, timer });
  }

  function setSwitchOptimistic(id, s, l) {
    const prev = switchOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const dev = devices.find((d) => d.i === id);
    if (dev) {
      dev.s = s;
      if (l !== undefined) dev.l = l;
    } else {
      const out = outlets.find((d) => d.i === id);
      if (out) out.s = s;
    }
    const entry = { s, until: Date.now() + LEVEL_OPTIMISTIC_MS, timer: null };
    if (l !== undefined) entry.l = l;
    entry.timer = setTimeout(() => {
      switchOptimistic.delete(id);
      postCall("updateStates");
    }, LEVEL_OPTIMISTIC_MS);
    switchOptimistic.set(id, entry);
  }

  function clearSwitchOptimistic(id) {
    const prev = switchOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    switchOptimistic.delete(id);
  }

  function reapplySwitchOptimistic() {
    for (const [id, opt] of switchOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        switchOptimistic.delete(id);
        continue;
      }
      const dev = devices.find((d) => d.i === id) || outlets.find((d) => d.i === id);
      if (!dev) continue;
      const sMatch = !!dev.s === !!opt.s;
      const lMatch = opt.l === undefined || (opt.l === null && opt.s === 1) || dev.l === opt.l;
      if (sMatch && lMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        switchOptimistic.delete(id);
        continue;
      }
      dev.s = opt.s;
      if (opt.l !== undefined && "l" in dev) dev.l = opt.l;
    }
  }

  function effectiveSwitch(dev) {
    const opt = switchOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until) return !!opt.s;
    return !!dev.s;
  }

  function effectiveLevel(dev) {
    const swOpt = switchOptimistic.get(dev.i);
    if (swOpt && Date.now() < swOpt.until && swOpt.l === null) return null;
    const opt = levelOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until) return opt.level;
    return dev.l;
  }

  function setLockOptimistic(id, lk, st) {
    const prev = lockOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const lock = locks.find((l) => l.i === id);
    if (lock) {
      lock.lk = lk;
      lock.st = st;
    }
    const timer = setTimeout(() => {
      lockOptimistic.delete(id);
      const cur = locks.find((l) => l.i === id);
      if (cur && (cur.st === "locking" || cur.st === "unlocking")) {
        cur.st = cur.lk ? "locked" : "unlocked";
      }
      if (postCall("currentCategory") === "locks") postCall("renderLocksPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    }, LOCK_OPTIMISTIC_MS);
    lockOptimistic.set(id, { lk, st, until: Date.now() + LOCK_OPTIMISTIC_MS, timer });
  }

  function clearLockOptimistic(id) {
    const prev = lockOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    lockOptimistic.delete(id);
  }

  function lockOptimisticSatisfied(opt, lock) {
    if (!opt || !lock) return false;
    if (!!lock.lk !== !!opt.lk) return false;
    const want = String(opt.st || "").toLowerCase();
    const got = String(lock.st || "").toLowerCase();
    if (want === "locking") return got === "locked";
    if (want === "unlocking") return got === "unlocked";
    return want === got;
  }

  function reapplyLockOptimistic() {
    for (const [id, opt] of lockOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        lockOptimistic.delete(id);
        continue;
      }
      const lock = locks.find((l) => l.i === id);
      if (!lock) continue;
      if (lockOptimisticSatisfied(opt, lock)) {
        if (opt.timer) clearTimeout(opt.timer);
        lockOptimistic.delete(id);
        continue;
      }
      lock.lk = opt.lk;
      lock.st = opt.st;
    }
  }

  function effectiveLockState(lock) {
    const opt = lockOptimistic.get(lock.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return lock.st || "";
  }

  function effectiveLock(lock) {
    const st = String(effectiveLockState(lock) || "").toLowerCase();
    if (st === "locking" || st === "locked") return true;
    if (st === "unlocking" || st === "unlocked") return false;
    const opt = lockOptimistic.get(lock.i);
    if (opt && Date.now() < opt.until) return !!opt.lk;
    return !!lock.lk;
  }

  function lockIsMoving(lock) {
    const st = String(effectiveLockState(lock) || "").toLowerCase();
    return st === "locking" || st === "unlocking";
  }

  function lockStatusLabel(lock) {
    const st = String(effectiveLockState(lock) || "").toLowerCase();
    if (st === "locking") return "Locking…";
    if (st === "unlocking") return "Unlocking…";
    if (st === "jammed") return "Jammed";
    if (st === "unknown") return "Unknown";
    if (st === "unavailable") return "Unavailable";
    return effectiveLock(lock) ? "Locked" : "Unlocked";
  }

  function setGarageOptimistic(id, patch) {
    const prev = garageOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const door = garageDoors.find((g) => g.i === id);
    if (door && patch.st != null) door.st = patch.st;
    const entry = {
      st: patch.st != null ? patch.st : prev?.st,
      until: Date.now() + GARAGE_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      garageOptimistic.delete(id);
      const cur = garageDoors.find((g) => g.i === id);
      if (cur && (cur.st === "opening" || cur.st === "closing")) {
        // Fall back to last known direction if hub never settled in time.
        cur.st = cur.st === "opening" ? "open" : "closed";
      }
      if (postCall("currentCategory") === "locks") postCall("renderLocksPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    }, GARAGE_OPTIMISTIC_MS);
    garageOptimistic.set(id, entry);
  }

  function clearGarageOptimistic(id) {
    const prev = garageOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    garageOptimistic.delete(id);
  }

  function garageOptimisticSatisfied(opt, door) {
    if (!opt || !door || opt.st == null) return false;
    const want = String(opt.st);
    const got = String(door.st || "");
    if (want === got) return true;
    // Hub often reports the settled state while we still hold opening/closing.
    return (want === "opening" && got === "open") || (want === "closing" && got === "closed");
  }

  function reapplyGarageOptimistic() {
    for (const [id, opt] of garageOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        garageOptimistic.delete(id);
        continue;
      }
      const door = garageDoors.find((g) => g.i === id);
      if (!door) continue;
      if (garageOptimisticSatisfied(opt, door)) {
        if (opt.timer) clearTimeout(opt.timer);
        garageOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) door.st = opt.st;
    }
  }

  function effectiveGarageState(door) {
    const opt = garageOptimistic.get(door.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return door.st || "unknown";
  }

  function garageIsOpen(door) {
    const st = effectiveGarageState(door);
    return st === "open" || st === "opening";
  }

  function garageIsMoving(door) {
    const st = effectiveGarageState(door);
    return st === "opening" || st === "closing";
  }

  function garageStatusLabel(door) {
    const st = effectiveGarageState(door);
    if (st === "opening") return "Opening…";
    if (st === "closing") return "Closing…";
    if (st === "open") return "Open";
    if (st === "closed") return "Closed";
    if (st === "unknown" || st === "unavailable") return st.charAt(0).toUpperCase() + st.slice(1);
    return st || "—";
  }

  function setShadeOptimistic(id, patch) {
    const prev = shadeOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const shade = windowShades.find((s) => s.i === id);
    if (shade) {
      if (patch.st != null) shade.st = patch.st;
      if (patch.pos != null) shade.pos = patch.pos;
    }
    const entry = {
      st: patch.st != null ? patch.st : prev?.st,
      pos: patch.pos != null ? patch.pos : prev?.pos,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      shadeOptimistic.delete(id);
      if (postCall("currentCategory") === "blinds") postCall("refreshBlindsPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
      if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterBody");
    }, LEVEL_OPTIMISTIC_MS);
    shadeOptimistic.set(id, entry);
  }

  function clearShadeOptimistic(id) {
    const prev = shadeOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    shadeOptimistic.delete(id);
  }

  function shadeOptimisticSatisfied(opt, shade) {
    if (!opt || !shade) return false;
    if (opt.st != null) {
      const want = String(opt.st);
      const got = String(shade.st || "");
      if (want !== got) {
        // Hub often reports the settled state while we still hold opening/closing.
        if (!(want === "opening" && got === "open") && !(want === "closing" && got === "closed")) {
          return false;
        }
      }
    }
    if (opt.pos != null && shade.pos !== opt.pos) return false;
    return true;
  }

  function reapplyShadeOptimistic() {
    for (const [id, opt] of shadeOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        shadeOptimistic.delete(id);
        continue;
      }
      const shade = windowShades.find((s) => s.i === id);
      if (!shade) continue;
      if (shadeOptimisticSatisfied(opt, shade)) {
        if (opt.timer) clearTimeout(opt.timer);
        shadeOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) shade.st = opt.st;
      if (opt.pos != null) shade.pos = opt.pos;
    }
  }

  function effectiveShadeState(shade) {
    const opt = shadeOptimistic.get(shade.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return shade.st || "unknown";
  }

  function effectiveShadePosition(shade) {
    const opt = shadeOptimistic.get(shade.i);
    if (opt && Date.now() < opt.until && opt.pos != null) return opt.pos;
    return shade.pos;
  }

  function applyShadeWsEvent(shade, name, value) {
    if (!shade) return false;
    const opt = shadeOptimistic.get(shade.i);
    if (opt && opt.until > Date.now()) return true;
    if (name === "windowShade" || name === "windowBlind") {
      shade.st = String(value || "");
    } else if (name === "position" || name === "level") {
      const pos = Math.round(Number(value));
      if (!isNaN(pos)) {
        shade.pos = pos;
        if (pos <= 0) shade.st = "closed";
        else if (pos >= 99) shade.st = "open";
        else shade.st = "partially open";
      }
    } else if (name === "switch") {
      const sw = String(value || "");
      if (sw === "on") shade.st = "open";
      else if (sw === "off") shade.st = "closed";
    } else return false;
    return true;
  }

  function refreshShadeViews() {
    if (postCall("currentCategory") === "blinds") postCall("refreshBlindsPopup");
    else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterBody");
  }

  function shadeIsMoving(shade) {
    const st = effectiveShadeState(shade);
    return st === "opening" || st === "closing";
  }

  function shadeHasPosition(shade) {
    return !!shade?.hasPos;
  }

  function shadeHasStop(shade) {
    return !!shade?.hasStop;
  }

  function shadeStatusLabel(shade) {
    const st = effectiveShadeState(shade);
    const pos = effectiveShadePosition(shade);
    const posText = shadeHasPosition(shade) && pos != null ? pos + "%" : null;
    if (st === "opening") return "Opening…";
    if (st === "closing") return "Closing…";
    if (st === "open") return posText ? posText + " · Open" : "Open";
    if (st === "closed") return posText ? posText + " · Closed" : "Closed";
    if (st === "partially open") return posText ? posText + " · Partially open" : "Partially open";
    if (st === "unknown" || st === "unavailable") return st.charAt(0).toUpperCase() + st.slice(1);
    return posText || st || "—";
  }

  function setFanOptimistic(id, patch) {
    const prev = fanOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const fan = ceilingFans.find((f) => f.i === id);
    if (fan) {
      if (patch.s != null) fan.s = patch.s ? 1 : 0;
      if (patch.sp != null) fan.sp = patch.sp;
    }
    const entry = {
      s: patch.s != null ? (patch.s ? 1 : 0) : prev?.s,
      sp: patch.sp != null ? patch.sp : prev?.sp,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      fanOptimistic.delete(id);
      if (postCall("currentCategory") === "fans") postCall("refreshFansPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    }, LEVEL_OPTIMISTIC_MS);
    fanOptimistic.set(id, entry);
  }

  function clearFanOptimistic(id) {
    const prev = fanOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    fanOptimistic.delete(id);
  }

  function reapplyFanOptimistic() {
    for (const [id, opt] of fanOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        fanOptimistic.delete(id);
        continue;
      }
      const fan = ceilingFans.find((f) => f.i === id);
      if (!fan) continue;
      let matched = true;
      if (opt.s != null && !!fan.s !== !!opt.s) matched = false;
      if (opt.sp != null && String(fan.sp || "").toLowerCase() !== String(opt.sp).toLowerCase()) matched = false;
      if (matched) {
        if (opt.timer) clearTimeout(opt.timer);
        fanOptimistic.delete(id);
        continue;
      }
      if (opt.s != null) fan.s = opt.s ? 1 : 0;
      if (opt.sp != null) fan.sp = opt.sp;
    }
  }

  function effectiveFanOn(fan) {
    const opt = fanOptimistic.get(fan.i);
    if (opt && Date.now() < opt.until && opt.s != null) return !!opt.s;
    return !!fan.s;
  }

  function effectiveFanSpeed(fan) {
    const opt = fanOptimistic.get(fan.i);
    if (opt && Date.now() < opt.until && opt.sp != null) return opt.sp;
    return fan.sp;
  }

  function ceilingFanSpeedLabel(sp) {
    const key = String(sp || "").trim().toLowerCase();
    if (!key) return "—";
    if (CEILING_FAN_SPEED_LABELS[key]) return CEILING_FAN_SPEED_LABELS[key];
    return key.replace(/(^|[-_\s])([a-z])/g, (_, a, b) => (a === "-" ? "-" : " ") + b.toUpperCase()).replace(/^ /, "");
  }

  function ceilingFanSpeeds(fan) {
    const list = parseList(fan?.supSp).map((s) => String(s).toLowerCase());
    const filtered = list.filter((s) => s && s !== "off" && s !== "on" && s !== "auto");
    if (filtered.length) {
      // Misparsed dim-level maps (e.g. 25,50,75) are not valid FanControl speeds.
      // Keep small numeric lists (1–6 DC fans). Anything >10 is almost certainly levels.
      const allNumeric = filtered.every((s) => /^\d+(\.\d+)?$/.test(s));
      const max = allNumeric ? Math.max(...filtered.map(Number)) : 0;
      if (allNumeric && max > 10) return CEILING_FAN_SPEED_ORDER.slice(0, 3);
      return filtered.slice().sort((a, b) => {
        const ia = CEILING_FAN_SPEED_ORDER.indexOf(a);
        const ib = CEILING_FAN_SPEED_ORDER.indexOf(b);
        if (ia >= 0 && ib >= 0) return ia - ib;
        if (ia >= 0) return -1;
        if (ib >= 0) return 1;
        return a.localeCompare(b, undefined, { numeric: true });
      });
    }
    return CEILING_FAN_SPEED_ORDER.slice(0, 3); // low, medium, high
  }

  function ceilingFanSupportsSpeed(fan, speed) {
    const sp = String(speed || "").toLowerCase();
    if (!sp || sp === "off") return true;
    return ceilingFanSpeeds(fan).includes(sp);
  }

  function sortCeilingFanSpeedTokens(speeds) {
    return speeds.slice().sort((a, b) => {
      const ia = CEILING_FAN_SPEED_ORDER.indexOf(a);
      const ib = CEILING_FAN_SPEED_ORDER.indexOf(b);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }

  function intersectionCeilingFanSpeeds(fans) {
    if (!fans.length) return [];
    let common = new Set(ceilingFanSpeeds(fans[0]).map((s) => String(s).toLowerCase()));
    for (let i = 1; i < fans.length; i++) {
      const supported = new Set(ceilingFanSpeeds(fans[i]).map((s) => String(s).toLowerCase()));
      common = new Set([...common].filter((s) => supported.has(s)));
      if (!common.size) break;
    }
    return sortCeilingFanSpeedTokens([...common]);
  }

  function unionCeilingFanSpeeds(fans) {
    const seen = new Set();
    const out = [];
    for (const fan of fans) {
      for (const sp of ceilingFanSpeeds(fan)) {
        const key = String(sp).toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          out.push(key);
        }
      }
    }
    return sortCeilingFanSpeedTokens(out);
  }

  function allHouseCeilingFanSpeeds() {
    return unionCeilingFanSpeeds(ceilingFans);
  }

  function averageShadePosition(shades) {
    const list = shades || windowShades;
    const positioned = list.filter((s) => shadeHasPosition(s));
    if (!positioned.length) return 50;
    let sum = 0;
    for (const shade of positioned) {
      const pos = effectiveShadePosition(shade);
      sum += pos != null ? pos : 0;
    }
    return Math.round(sum / positioned.length);
  }

  const NAMED_FAN_SPIN_SEC = {
    low: 2.4,
    "medium-low": 2,
    medium: 1.6,
    "medium-high": 1.2,
    high: 0.9,
  };

  function fanSpinDuration(fan, speedKey) {
    const key = String(speedKey || "").toLowerCase();
    if (NAMED_FAN_SPIN_SEC[key] != null) return NAMED_FAN_SPIN_SEC[key];
    const speeds = ceilingFanSpeeds(fan);
    const idx = speeds.indexOf(key);
    const i = idx >= 0 ? idx : 0;
    const n = speeds.length;
    if (n <= 1) return 1.6;
    const slow = 2.4;
    const fast = 0.9;
    return slow - (i / (n - 1)) * (slow - fast);
  }

  function syncFanBladeSpin(powerEl, fan, on, speedKey) {
    const blades = powerEl && powerEl.querySelector(".fan-blades");
    if (!blades) return;
    if (!on) {
      blades.style.removeProperty("animation-duration");
      return;
    }
    blades.style.animationDuration = fanSpinDuration(fan, speedKey) + "s";
  }

  function fanStatusLabel(fan) {
    if (!effectiveFanOn(fan)) return "Off";
    return ceilingFanSpeedLabel(effectiveFanSpeed(fan));
  }

  function setValveOptimistic(id, patch) {
    const prev = valveOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const valve = valves.find((v) => v.i === id);
    if (valve && patch.st != null) valve.st = patch.st;
    const entry = {
      st: patch.st != null ? patch.st : prev?.st,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      valveOptimistic.delete(id);
      if (postCall("currentCategory") === "sensors") postCall("refreshSensorsPopup");
      else if (postCall("currentCategory") === "favorites") postCall("refreshFavoritesPopup");
    }, LEVEL_OPTIMISTIC_MS);
    valveOptimistic.set(id, entry);
  }

  function clearValveOptimistic(id) {
    const prev = valveOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    valveOptimistic.delete(id);
  }

  function reapplyValveOptimistic() {
    for (const [id, opt] of valveOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        valveOptimistic.delete(id);
        continue;
      }
      const valve = valves.find((v) => v.i === id);
      if (!valve) continue;
      if (opt.st != null && valve.st === opt.st) {
        if (opt.timer) clearTimeout(opt.timer);
        valveOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) valve.st = opt.st;
    }
  }

  function effectiveValveState(valve) {
    const opt = valveOptimistic.get(valve.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return valve.st || "unknown";
  }

  function valveIsMoving(valve) {
    const st = effectiveValveState(valve);
    return st === "opening" || st === "closing";
  }

  function normalizeValveForCard(valve) {
    const st = effectiveValveState(valve);
    return { i: valve.i, n: valve.n, r: valve.r, t: "valve", v: st, a: st === "open" ? 1 : 0, ex: [], _ref: valve };
  }

  function isMusicPlaying(st) {
    return st === "playing" || st === "transitioning" || st === "running";
  }

  function musicControls(dev) {
    const f = dev.f == null ? 127 : Number(dev.f);
    return {
      play: !!(f & 1),
      pause: !!(f & 2),
      stop: !!(f & 4),
      prev: !!(f & 8),
      next: !!(f & 16),
      volume: !!(f & 32),
      mute: !!(f & 64),
    };
  }

  function effectiveMusicStatus(dev) {
    const opt = musicOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until && opt.st != null) return opt.st;
    return dev.st || "idle";
  }

  function effectiveMusicVolume(dev) {
    const opt = musicOptimistic.get(dev.i);
    if (opt && Date.now() < opt.until && opt.v != null) return opt.v;
    return dev.v == null ? null : dev.v;
  }

  function musicStatusLabel(dev) {
    const st = effectiveMusicStatus(dev);
    if (st === "playing") return "Playing";
    if (st === "transitioning") return "Transitioning";
    if (st === "paused") return "Paused";
    if (st === "stopped") return "Stopped";
    return "Idle";
  }

  function setMusicOptimistic(id, patch) {
    const prev = musicOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const dev = music.find((m) => m.i === id);
    if (dev) {
      if (patch.st != null) dev.st = patch.st;
      if (patch.v != null) dev.v = patch.v;
    }
    const entry = {
      st: patch.st ?? null,
      v: patch.v ?? null,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      musicOptimistic.delete(id);
      if (postCall("currentCategory") === "music") postCall("renderMusicPopup");
    }, LEVEL_OPTIMISTIC_MS);
    musicOptimistic.set(id, entry);
  }

  function clearMusicOptimistic(id) {
    const prev = musicOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    musicOptimistic.delete(id);
  }

  function reapplyMusicOptimistic() {
    for (const [id, opt] of musicOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        musicOptimistic.delete(id);
        continue;
      }
      const dev = music.find((m) => m.i === id);
      if (!dev) continue;
      const stMatch = opt.st == null || dev.st === opt.st;
      const vMatch = opt.v == null || dev.v === opt.v;
      if (stMatch && vMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        musicOptimistic.delete(id);
        continue;
      }
      if (opt.st != null) dev.st = opt.st;
      if (opt.v != null) dev.v = opt.v;
    }
  }


  function setSetpointOptimistic(id, patch) {
    const prev = setpointOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    const t = thermostats.find((x) => x.i === id);
    if (t) {
      if (patch.hsp != null) t.hsp = patch.hsp;
      if (patch.csp != null) t.csp = patch.csp;
    }
    const entry = {
      hsp: patch.hsp ?? null,
      csp: patch.csp ?? null,
      until: Date.now() + LEVEL_OPTIMISTIC_MS,
      timer: null,
    };
    entry.timer = setTimeout(() => {
      setpointOptimistic.delete(id);
      if (tstatSession?.ids?.includes(id)) {
        postCall("renderTstatDial");
        postCall("updateClimateWidgets");
      }
      postCall("refreshOpenTstatQuickPopups");
      postCall("refreshDevice", id);
    }, LEVEL_OPTIMISTIC_MS);
    setpointOptimistic.set(id, entry);
  }

  function clearSetpointOptimistic(id) {
    const prev = setpointOptimistic.get(id);
    if (prev?.timer) clearTimeout(prev.timer);
    setpointOptimistic.delete(id);
  }

  function reapplySetpointOptimistic() {
    for (const [id, opt] of setpointOptimistic) {
      if (Date.now() >= opt.until) {
        if (opt.timer) clearTimeout(opt.timer);
        setpointOptimistic.delete(id);
        continue;
      }
      const t = thermostats.find((x) => x.i === id);
      if (!t) continue;
      const hspMatch = opt.hsp == null || t.hsp === opt.hsp;
      const cspMatch = opt.csp == null || t.csp === opt.csp;
      if (hspMatch && cspMatch) {
        if (opt.timer) clearTimeout(opt.timer);
        setpointOptimistic.delete(id);
        continue;
      }
      if (opt.hsp != null) t.hsp = opt.hsp;
      if (opt.csp != null) t.csp = opt.csp;
    }
  }

  function applyTstatSetpoints(t, { hsp, csp }) {
    const opt = setpointOptimistic.get(t.i);
    if (hsp != null && (!opt || Date.now() >= opt.until || opt.hsp == null)) {
      t.hsp = Number(hsp);
    }
    if (csp != null && (!opt || Date.now() >= opt.until || opt.csp == null)) {
      t.csp = Number(csp);
    }
    if (opt && Date.now() < opt.until) {
      if (opt.hsp != null) t.hsp = opt.hsp;
      if (opt.csp != null) t.csp = opt.csp;
      const hspOk = opt.hsp == null || (hsp != null && Number(hsp) === opt.hsp);
      const cspOk = opt.csp == null || (csp != null && Number(csp) === opt.csp);
      if (hspOk && cspOk) clearSetpointOptimistic(t.i);
    }
  }

  function drawRgbWheel(canvas) {
    const ctx = canvas.getContext("2d");
    if (rgbWheelCache) {
      ctx.drawImage(rgbWheelCache, 0, 0);
      return;
    }
    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2;
    const off = document.createElement("canvas");
    off.width = size;
    off.height = size;
    const offCtx = off.getContext("2d");
    const img = offCtx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist > radius) {
          data[idx + 3] = 0;
          continue;
        }
        const { h, s } = posToHs(cx, cy, x + 0.5, y + 0.5, radius);
        const [r, g, b] = hsToRgb(h, s);
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }
    offCtx.putImageData(img, 0, 0);
    rgbWheelCache = off;
    ctx.drawImage(off, 0, 0);
  }

  const activeSlideGestures = [];
  const cancelAllSlideGestures = () => MLDUI.cancelGestures(activeSlideGestures);
  const appendPopup = (element) => MLDUI.appendPopup(document, element);
  const bindPopupDismiss = (...args) => MLDUI.bindPopupDismiss(...args);
  const dragThresholdExceeded = (...args) => MLDUI.dragThresholdExceeded(...args);

  function supportedModes(t) {
    if (t?.supM == null) return TSTAT_DEFAULT_MODES;
    return parseList(t.supM);
  }

  // All-thermostats bulk control: drivers may omit supportedThermostatModes, but we
  // still need mode buttons so the user can pick heat/cool before setpoints work.
  function tstatControlModes(t) {
    const modes = supportedModes(t);
    if (modes.length || !t?._central) return modes;
    return TSTAT_DEFAULT_MODES;
  }

  function supportedFanModes(t) {
    // Match Hubitat dashboards: no supportedThermostatFanModes → no fan controls.
    // null/undefined/"" all mean no supported fan modes.
    if (t?.supFM == null) return [];
    return parseList(t.supFM);
  }

  function deviceHasFanSpeed(t) {
    return !!(t?.hasFs || parseList(t?.fsLev).length);
  }

  function supportedFanSpeeds(t) {
    const list = parseList(t?.fsLev);
    if (list.length) return list;
    return deviceHasFanSpeed(t) ? FAN_SPEED_OPTS.map((o) => o.key) : [];
  }

  function showFanSpeedControls(t) {
    return String(t?.fm || "").toLowerCase() === "on" && deviceHasFanSpeed(t);
  }

  function deviceHasComfortFan(t) {
    if (t?.hasCfs) return true;
    const list = supportedFanModes(t);
    return list.some((k) => !STANDARD_FAN_MODE_KEYS.includes(String(k).toLowerCase()));
  }

  function deviceHasVane(t) {
    return !!(t?.hasVp || parseList(t?.vpLev).length);
  }

  function comfortFanSpeeds(t) {
    const list = supportedFanModes(t);
    if (list.length) return list;
    return deviceHasComfortFan(t) ? COMFORT_FAN_SPEED_OPTS.map((o) => o.key) : [];
  }

  function supportedVanePositions(t) {
    const list = parseList(t?.vpLev);
    if (list.length) return list;
    return deviceHasVane(t) ? VANE_POSITION_OPTS.map((o) => o.key) : [];
  }

  function tstatChoiceLabel(opts, key) {
    const k = String(key || "").toLowerCase();
    const hit = opts.find((o) => o.key === k);
    if (hit) return hit.label;
    if (!k) return "—";
    return k.charAt(0).toUpperCase() + k.slice(1);
  }

  function comfortFanValue(t) {
    return String(t?.cfs || t?.fm || "").toLowerCase();
  }

  function fanModeActive(fm) {
    const m = String(fm || "").toLowerCase();
    return m === "on" || m === "circulate";
  }

  function tstatSectionLabel(text) {
    const el = ce("div", "tstat-section-label");
    el.textContent = text;
    return el;
  }

  // icon color: mode-driven (off=gray, heat=red, cool=blue, fan=white),
  // with auto falling back to operating state, and fan-on overriding to white
  function tstatStateClass(t) {
    const os = String(t?.os || "").toLowerCase();
    const tm = String(t?.tm || "").toLowerCase();
    const fmOn = !!(t?.hasFm && fanModeActive(t.fm));
    if (tm === "heat" || tm === "emergency heat") return "state-heat";
    if (tm === "cool" || tm === "dry") return "state-cool";
    if (tm === "fan") return "state-fan";
    if (tm === "auto") {
      if (os === "heating" || os === "pending heat") return "state-heat";
      if (os === "cooling" || os === "pending cool") return "state-cool";
      if (fmOn || os === "fan" || os === "fan only") return "state-fan";
      return "state-off";
    }
    if (fmOn) return "state-fan"; // fan-only while "off"
    return "state-off";
  }

  function formatRoomTemp(device) {
    const reading = MLDDomain.sensorTemperatureReading(device);
    if (!reading) return "—";
    return Math.round(reading.temp) + tstatTempSuffix(reading.u);
  }

  function roomClimateInfo(rid) {
    const key = normalizeRoomId(rid);
    const thermos = thermoByRoom.get(key);
    if (thermos?.length) return { device: thermos[0], controllable: true };
    const sensors = sensorByRoom.get(key);
    if (sensors?.length) return { device: sensors[0], controllable: false };
    return null;
  }

  function roomHasClimate(rid) {
    const key = normalizeRoomId(rid);
    return thermoByRoom.has(key) || sensorByRoom.has(key);
  }

  // pick the most "active" thermostat in a room for the icon color
  function roomTstatState(rid) {
    const list = thermoByRoom.get(normalizeRoomId(rid)) || [];
    const rank = { "state-heat": 3, "state-cool": 2, "state-fan": 1, "state-off": 0 };
    let best = "state-off";
    for (const t of list) {
      const cls = tstatStateClass(t);
      if (rank[cls] > rank[best]) best = cls;
    }
    return best;
  }

  function isFavorite(id) {
    return favorites.includes(Number(id));
  }

  function syncFavButton(btn, id) {
    if (!btn) return;
    const on = isFavorite(id);
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
  }

  function isFavoriteableDeviceId(id) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId < 0) return false;
    return devices.some((d) => d.i === numId)
      || outlets.some((o) => o.i === numId)
      || thermostats.some((t) => t.i === numId)
      || tempSensors.some((t) => t.i === numId)
      || sensors.some((s) => s.i === numId)
      || music.some((m) => m.i === numId)
      || locks.some((l) => l.i === numId)
      || garageDoors.some((g) => g.i === numId)
      || windowShades.some((s) => s.i === numId)
      || ceilingFans.some((f) => f.i === numId)
      || valves.some((v) => v.i === numId);
  }

  function centralThermostatsSorted() {
    return thermostats.slice().sort((a, b) => {
      const labelA = postCall("roomLabel", a.r) || String(a.r ?? "");
      const labelB = postCall("roomLabel", b.r) || String(b.r ?? "");
      const ra = labelA.localeCompare(labelB);
      if (ra !== 0) return ra;
      return String(a.n || "").localeCompare(String(b.n || ""), undefined, { sensitivity: "base" });
    });
  }

  function buildCentralTstat(selectedThermostats, unitHint) {
    const first = selectedThermostats[0];
    const union = (arr) => [...new Set(arr.flat())];
    return {
      i: -1, n: "All Thermostats", r: null,
      tm: "", os: "", hsp: null, csp: null, temp: null, u: first?.u ?? unitHint,
      hasFm: selectedThermostats.some((t) => t.hasFm), fm: "",
      hasFs: selectedThermostats.some(deviceHasFanSpeed), fs: "",
      fsLev: union(selectedThermostats.map(supportedFanSpeeds)).join(","),
      supM: union(selectedThermostats.map(supportedModes)).join(","),
      supFM: union(selectedThermostats.map(supportedFanModes)).join(","),
      hasCm: selectedThermostats.some((t) => t.hasCm),
      hasCfs: selectedThermostats.some(deviceHasComfortFan), cfs: "",
      hasVp: selectedThermostats.some(deviceHasVane), vp: "",
      vpLev: union(selectedThermostats.map(supportedVanePositions)).join(","),
      _central: true,
    };
  }

  function postCall(name, ...args) {
    const fn = globalThis.__MLD?.[name];
    if (typeof fn === "function") return fn(...args);
  }


  // ---------- Dashboard session + API (bootstrap) ----------

  const ACCESS_TOKEN = (() => {
    try { return new URLSearchParams(location.search).get("access_token") || ""; }
    catch { return ""; }
  })();

  const sessionService = createSessionService({
    storage: localStorage,
    sessionKey: DASH_SESSION_STORAGE_KEY,
    expiresKey: DASH_SESSION_EXPIRES_KEY,
    accessToken: ACCESS_TOKEN,
    onChange(state) {
      dashSession = state.session;
      dashSessionExpiresAt = state.expiresAt;
      publishMld({ dashSession, dashSessionExpiresAt });
    },
  });
  const loadDashSession = sessionService.load;
  const saveDashSession = sessionService.save;
  const clearDashSession = sessionService.clear;
  const isDashSessionFresh = sessionService.isFresh;

  let dashSessionRenewInFlight = null;
  let dashSessionLastRenewAt = 0;
  const DASH_SESSION_RENEW_MIN_INTERVAL_MS = 60 * 60 * 1000; // at most hourly

  async function renewDashSessionFromServer(force) {
    if (!dashSession || !isDashSessionFresh()) return false;
    const now = Date.now();
    if (!force && now - dashSessionLastRenewAt < DASH_SESSION_RENEW_MIN_INTERVAL_MS) return true;
    if (dashSessionRenewInFlight) return dashSessionRenewInFlight;
    dashSessionRenewInFlight = (async () => {
      try {
        const r = await fetchWithTimeout(withToken("auth/renew"), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (r.status === 401) {
          clearDashSession();
          return false;
        }
        if (!r.ok) return false;
        const data = await r.json();
        if (data?.required === false) {
          postCall("syncDashboardAuthState", false);
          return false;
        }
        applyDashSessionFromResponse(data);
        dashSessionLastRenewAt = Date.now();
        return isDashSessionFresh();
      } catch {
        return false;
      } finally {
        dashSessionRenewInFlight = null;
      }
    })();
    return dashSessionRenewInFlight;
  }

  function slideDashSessionExpiry() {
    if (!dashSession) return;
    // Server is authoritative — ask it to slide the 7-day window (throttled).
    renewDashSessionFromServer(false);
  }

  const applyDashSessionFromResponse = sessionService.applyResponse;

  function isDashboardGateOpen() {
    return !!document.querySelector(".dash-gate-popup.open");
  }

  function setupDashSessionActivityRenewal() {
    if (dashSessionActivityBound) return;
    dashSessionActivityBound = true;
    const renew = () => {
      if (!isDashSessionFresh()) return;
      slideDashSessionExpiry();
    };
    document.addEventListener("pointerdown", () => {
      renew();
      postCall("unlockNotifAudio");
    }, { passive: true });
    document.addEventListener("keydown", renew);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") renewDashSessionFromServer(true);
    });
  }


  // ---------- API (OAuth: access_token required on every request, especially cloud) ----------
  const withToken = sessionService.withToken;
  // Service worker script URL must stay stable (OAuth token only — never dash_session).
  const withOAuthToken = sessionService.withOAuthToken;

  function registerServiceWorkerForPwa() {
    if (location.protocol !== "https:" || !("serviceWorker" in navigator)) return;
    // Register from the first JS chunk so Chrome sees a controlling SW before install checks.
    navigator.serviceWorker.register(withOAuthToken("sw.js"), { scope: "./" }).catch((err) => {
      console.warn("mDash: service worker registration failed (PWA install may not work)", err);
    });
  }
  registerServiceWorkerForPwa();

  let transport = null;
  function getTransport() {
    if (!transport) {
      transport = MLDTransport.createTransport({
        fetch: (...args) => fetch(...args),
        session: sessionService,
        ensureAccess: () => postCall("ensureDashboardAccess"),
        flash: (...args) => postCall("flash", ...args),
      });
    }
    return transport;
  }
  function fetchWithTimeout(...args) { return getTransport().fetchWithTimeout(...args); }
  function getJson(...args) { return getTransport().getJson(...args); }

  async function fetchData() {
    const d = await getJson("data");
    if (d && typeof d.dashboardPasswordRequired === "boolean") {
      postCall("syncDashboardAuthState", !!d.dashboardPasswordRequired);
    }
    applyHtmlCatalogFromData(d);
    if (d && d.config) {
      if (d.config.pollIntervalMs) cfg.pollIntervalMs = d.config.pollIntervalMs;
      if (typeof d.config.useWebSocket === "boolean") cfg.useWebSocket = d.config.useWebSocket;
      if (d.config.dashboardName != null) postCall("applyDashboardName", d.config.dashboardName);
      if (d.config.defaultTab != null) {
        const s = String(d.config.defaultTab || "").trim();
        cfg.defaultTab = (s === "lights" || TAB_CATEGORIES.has(s)) ? s : "lights";
      }
      if (!reorderMode && Array.isArray(d.config.roomOrder)) {
        cfg.roomOrder = d.config.roomOrder.length ? d.config.roomOrder : null;
      }
      if (!reorderMode && Array.isArray(d.config.navOrder)) {
        cfg.navOrder = d.config.navOrder.length ? d.config.navOrder : null;
        postCall("applyNavOrder", postCall("getDisplayNavOrder"));
      }
      if (!reorderMode && Array.isArray(d.config.cameraOrder)) {
        cfg.cameraOrder = d.config.cameraOrder.length ? d.config.cameraOrder : null;
      }
      if (!reorderMode && Array.isArray(d.config.thermostatOrder)) {
        cfg.thermostatOrder = d.config.thermostatOrder.length ? d.config.thermostatOrder : null;
      }
      if (d.config.localUrl != null) cfg.localUrl = String(d.config.localUrl || "");
      if (d.config.cloudUrl != null) cfg.cloudUrl = String(d.config.cloudUrl || "");
      if (Array.isArray(d.config.favorites) && d.config.favoriteSizes) {
        primeFavoriteSizesFromConfig(d.config.favorites, d.config.favoriteSizes);
      }
      applyEmbedConfigFromData(d, { allowDuringReorder: true });
    }
    if (globalThis.__MLD) {
      const schedHook = globalThis.__MLD["applySchedules" + "FromData"];
      if (typeof schedHook === "function") schedHook(d);
    }
    return d;
  }

  function sendCmd(...args) { return getTransport().sendCommand(...args); }
  function sendCmdBatch(...args) { return getTransport().sendBatch(...args); }

  function publishMld(patch) {
    const m = globalThis.__MLD;
    if (m) Object.assign(m, patch);
  }


  // Sensors (other-sensor pickers): [{i,n,r,t,v,a,ex:[{k,v,u?}]}]
  let sensors = [];
  const sensorCardMap = new Map(); // id -> { el, heroEl, pillEl, pillTxt, dot, footEl, batteryEl, favBtn, t, i }
  const sensorRoomEls = new Map(); // roomId -> { card, body, meta }
  const favSensorMap = new Map(); // id -> sensor card rec (favorites popup)
  const favMusicMap = new Map(); // id -> music row rec (favorites popup)
  const favLockMap = new Map(); // id -> lock row rec (favorites popup)
  const favGarageMap = new Map(); // id -> garage row rec (favorites popup)
  const favShadeMap = new Map(); // id -> shade tile rec (favorites popup)
  const favFanMap = new Map(); // id -> fan tile rec (favorites popup)
  const fansPopupMap = new Map(); // id -> fan tile rec (fans popup/tab)
  let fansPopupSig = "";
  const shadePopupMap = new Map(); // id -> shade tile rec (blinds popup/tab)
  let blindsPopupSig = "";
  let sensorsPopupSig = "";
  const sensorTypeFilter = new Set(); // empty = show all types
  let sensorFilterOpen = false;
  let sensorFilterChipsEl = null;
  let sensorFilterBtnEl = null;
  let sensorFilterEmptyEl = null;

  // Keep the legacy bindings and the temporary cross-chunk facade pointed at the
  // same collections while features migrate onto the controlled runtime store.
  const transportFacade = { fetchWithTimeout, getJson, sendCommand: sendCmd, sendBatch: sendCmdBatch };
  const notificationTriggerState = { triggersEnabled, alertsArmed, alertsArmSwitchId };
  const runtime = createRuntime({ services: { session: sessionService, transport: transportFacade }, ui: { document } }, {
    cfg, rooms, devices, outlets, thermostats, tempSensors, sensors,
    hubModes, scenes, locks, garageDoors, windowShades, ceilingFans, valves, music, cameras,
    favorites, favoriteSizes, embedCards, timeCards, notificationCards, htmlTiles,
    htmlTileTitleOverrides, favoritesLayout, snapshots, hubNotifications,
    hubTileNotifications, hubTriggerActions, notificationDeviceIds, tileNotificationDeviceIds,
    triggerSourceIds, playedTriggerToneIds, notificationTriggerState,
    levelOptimistic, switchOptimistic, lockOptimistic, garageOptimistic, shadeOptimistic,
    fanOptimistic, valveOptimistic, musicOptimistic, setpointOptimistic,
  });

  function registerFeature(name, feature) {
    return runtime.features.registerFeature(name, feature);
  }

  function repopulateThermoByRoom() {
    thermoByRoom.clear();
    for (const t of thermostats) {
      const rid = normalizeRoomId(t.r);
      if (!thermoByRoom.has(rid)) thermoByRoom.set(rid, []);
      thermoByRoom.get(rid).push(t);
    }
  }

  function repopulateSensorByRoom() {
    sensorByRoom.clear();
    for (const [rid, list] of MLDDomain.climateSensorsByRoom(tempSensors, sensors)) {
      sensorByRoom.set(rid, list);
    }
  }

  function syncRoomMap() {
    roomMap.clear();
    for (const r of rooms) roomMap.set(r.id, r.name);
  }

  // ---------- render ----------
