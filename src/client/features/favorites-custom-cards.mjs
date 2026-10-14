import {
  EMBED_SIZE_PRESET_SET,
  mapNotificationCardsFromConfig,
  mapTimeCardsFromConfig,
  normalizeEmbedTitle,
  normalizeFavoritesLayout,
  normalizeHtmlTileTitle,
  normalizeHtmlZoom,
  parseHtmlTileId,
  validateHttpsEmbedUrl,
} from "../domain/favorites.mjs";

function replaceList(target, next) {
  target.length = 0;
  target.push(...next);
}

function replaceRecord(target, next) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, next);
}

function cloneList(list) {
  return list.map((item) => ({ ...item }));
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function signature(state) {
  return state.favoritesLayout.join(",")
    + "|" + state.embedCards.map((card) => `${card.id}:${card.size}:${card.url}`).join("|")
    + "|" + state.timeCards.map((card) => `${card.id}:${card.style}:${card.size}`).join("|")
    + "|" + state.notificationCards.map((card) => `${card.id}:${card.size}`).join("|");
}

export function htmlTitleOverridesForLayout(layout, overrides) {
  const result = {};
  for (const key of layout || []) {
    if (!key.startsWith("h:")) continue;
    const id = key.slice(2);
    if (overrides[id]) result[id] = overrides[id];
  }
  return result;
}

export function favoriteLayoutSizePayloads(state, layout, normalizeDeviceSizes = () => ({})) {
  const selectedLayout = Array.isArray(layout) ? layout : state.favoritesLayout;
  const deviceOrder = selectedLayout
    .filter((key) => key.startsWith("d:"))
    .map((key) => Number(key.slice(2)));
  const embedSizes = {};
  const htmlSizes = {};
  const htmlZooms = {};
  const timeSizes = {};
  const notificationSizes = {};
  for (const card of state.embedCards) embedSizes[card.id] = card.size || "tall";
  for (const tile of state.htmlTiles) {
    htmlSizes[tile.id] = tile.size || "tall";
    htmlZooms[tile.id] = normalizeHtmlZoom(tile.zoom);
  }
  for (const card of state.timeCards) timeSizes[card.id] = card.size || "square";
  for (const card of state.notificationCards) notificationSizes[card.id] = card.size || "tall";
  return {
    deviceSizes: normalizeDeviceSizes(deviceOrder),
    embedSizes,
    htmlSizes,
    htmlZooms,
    htmlTitles: htmlTitleOverridesForLayout(selectedLayout, state.htmlTileTitleOverrides),
    timeSizes,
    notificationSizes,
  };
}

export function createLazyEmbedLoader({ IntersectionObserver: Observer } = {}) {
  let observer = null;

  function activate(card) {
    const iframe = card?.querySelector?.(".fav-embed-iframe");
    const url = card?.dataset?.embedUrl;
    if (!iframe || !url || card.dataset.blocked === "1") return false;
    const current = String(iframe.getAttribute?.("src") || iframe.src || "");
    if (!current || current === "about:blank" || current.endsWith("about:blank")) iframe.src = url;
    return true;
  }

  function observe(card) {
    if (!card) return false;
    if (typeof Observer !== "function") return activate(card);
    if (!observer) {
      observer = new Observer((entries) => {
        for (const entry of entries) if (entry.isIntersecting) activate(entry.target);
      }, { root: null, rootMargin: "80px", threshold: 0.05 });
    }
    observer.observe(card);
    return true;
  }

  function blankIframe(iframe) {
    if (!iframe) return;
    try { iframe.src = "about:blank"; } catch {}
  }

  function discard(id, roots = []) {
    if (!id) return;
    for (const root of roots.filter(Boolean)) {
      for (const card of root.querySelectorAll?.(".fav-embed-card") || []) {
        if (card.dataset.embedId === String(id)) blankIframe(card.querySelector(".fav-embed-iframe"));
      }
    }
  }

  function stop(roots = []) {
    observer?.disconnect();
    observer = null;
    for (const root of roots.filter(Boolean)) {
      for (const iframe of root.querySelectorAll?.(".fav-embed-iframe") || []) blankIframe(iframe);
    }
  }

  return { observe, discard, stop, dispose: () => stop() };
}

export function createFavoritesCustomCardsFeature({ state, services, ui }) {
  const lazyEmbeds = createLazyEmbedLoader({ IntersectionObserver: services.IntersectionObserver });
  let reorderSnapshot = null;

  const render = (reason = "render") => ui.renderFavoritesCustomCards?.(state, reason);
  const sync = () => ui.syncCompatibilityFacade?.(state);

  function applyHtmlTitleOverrides(source, liveTitlesById = null) {
    const next = {};
    if (source && typeof source === "object") {
      for (const key of Object.keys(source)) {
        const override = normalizeHtmlTileTitle(source[key], key.split(":").slice(1).join(":"));
        if (!override) continue;
        const live = liveTitlesById?.[key] ?? liveTitlesById?.[`h:${key}`];
        if (!live || override !== live) next[key] = override;
      }
    }
    replaceRecord(state.htmlTileTitleOverrides, next);
  }

  function applyHtmlCatalogFromData(data) {
    if (!Array.isArray(data?.htmlTiles)) return false;
    const config = data.config || {};
    const hasSizes = (config.htmlSizes && typeof config.htmlSizes === "object")
      || (data.htmlSizes && typeof data.htmlSizes === "object");
    const sizes = config.htmlSizes && typeof config.htmlSizes === "object"
      ? config.htmlSizes : (data.htmlSizes || {});
    const hasZooms = (config.htmlZooms && typeof config.htmlZooms === "object")
      || (data.htmlZooms && typeof data.htmlZooms === "object");
    const zooms = config.htmlZooms && typeof config.htmlZooms === "object"
      ? config.htmlZooms : (data.htmlZooms || {});
    const hasTitles = hasOwn(config, "htmlTitles") || hasOwn(data, "htmlTitles");
    const titles = config.htmlTitles && typeof config.htmlTitles === "object"
      ? config.htmlTitles : (data.htmlTitles || {});
    const liveTitles = {};
    const hubTitles = {};

    for (const raw of data.htmlTiles) {
      if (!raw || typeof raw !== "object") continue;
      const candidate = raw.id ?? `${raw.deviceId ?? ""}:${raw.attribute || ""}`;
      const parsed = parseHtmlTileId(candidate);
      if (!parsed) continue;
      const live = normalizeHtmlTileTitle(raw.liveTitle ?? raw.name ?? parsed.attribute, parsed.attribute);
      liveTitles[parsed.id] = live;
      hubTitles[parsed.id] = normalizeHtmlTileTitle(raw.title ?? live, parsed.attribute);
    }
    if (hasTitles) applyHtmlTitleOverrides(titles, liveTitles);
    else {
      for (const id of Object.keys(hubTitles)) {
        if (hubTitles[id] && liveTitles[id] && hubTitles[id] !== liveTitles[id]) {
          state.htmlTileTitleOverrides[id] = hubTitles[id];
        }
      }
    }

    const nextTiles = [];
    const seen = new Set();
    for (const raw of data.htmlTiles) {
      if (!raw || typeof raw !== "object") continue;
      const candidate = raw.id ?? `${raw.deviceId ?? ""}:${raw.attribute || ""}`;
      const parsed = parseHtmlTileId(candidate);
      if (!parsed || seen.has(parsed.id)) continue;
      seen.add(parsed.id);
      const sizeValue = sizes[parsed.id] ?? sizes[`h:${parsed.id}`] ?? (hasSizes ? "tall" : raw.size);
      const zoomValue = zooms[parsed.id] ?? zooms[`h:${parsed.id}`] ?? (hasZooms ? 100 : raw.zoom);
      const liveTitle = liveTitles[parsed.id] ?? normalizeHtmlTileTitle(parsed.attribute, parsed.attribute);
      const override = state.htmlTileTitleOverrides[parsed.id] ?? state.htmlTileTitleOverrides[`h:${parsed.id}`];
      const tile = {
        id: parsed.id,
        deviceId: parsed.deviceId,
        attribute: parsed.attribute,
        liveTitle,
        title: normalizeHtmlTileTitle(override ?? hubTitles[parsed.id] ?? liveTitle, parsed.attribute),
        size: EMBED_SIZE_PRESET_SET.has(String(sizeValue)) ? String(sizeValue) : "tall",
        zoom: normalizeHtmlZoom(zoomValue),
      };
      if (hasOwn(raw, "html")) tile.html = raw.html == null ? "" : String(raw.html);
      else {
        const previous = state.htmlTiles.find((item) => item.id === parsed.id);
        if (previous && hasOwn(previous, "html")) tile.html = previous.html;
      }
      if (raw.error != null && String(raw.error).trim()) tile.error = String(raw.error).trim();
      if (raw.roomsCss != null && String(raw.roomsCss).trim()) tile.roomsCss = String(raw.roomsCss);
      if (raw.alignCss != null && String(raw.alignCss).trim()) tile.alignCss = String(raw.alignCss);
      nextTiles.push(tile);
    }

    const nextLayout = normalizeFavoritesLayout(
      Array.isArray(config.favoritesLayout) ? config.favoritesLayout : state.favoritesLayout,
      Array.isArray(config.favorites) ? config.favorites.map(Number) : state.favorites,
      state.embedCards,
      state.timeCards,
      state.notificationCards,
      nextTiles,
    );
    const favoredBefore = new Set(state.favoritesLayout.filter((key) => key.startsWith("h:")).map((key) => key.slice(2)));
    const favoredAfter = new Set(nextLayout.filter((key) => key.startsWith("h:")).map((key) => key.slice(2)));
    const htmlSignature = (tiles, ids, layout) => JSON.stringify({
      layout: layout.filter((key) => key.startsWith("h:")),
      tiles: tiles.filter((tile) => ids.has(tile.id)).map((tile) => [
        tile.id, tile.title, tile.size, tile.zoom, tile.html, tile.error, tile.roomsCss, tile.alignCss,
      ]),
    });
    const before = htmlSignature(state.htmlTiles, favoredBefore, state.favoritesLayout);
    const after = htmlSignature(nextTiles, favoredAfter, nextLayout);
    replaceList(state.htmlTiles, nextTiles);
    replaceList(state.favoritesLayout, nextLayout);
    sync();
    render("html-catalog");
    return before !== after;
  }

  function applyEmbedConfigFromData(data, { allowDuringReorder = false } = {}) {
    if (!data?.config) return false;
    if (!allowDuringReorder && (services.isReordering?.() || services.isEditing?.())) return false;
    const config = data.config;
    const nextEmbeds = Array.isArray(config.embedCards)
      ? config.embedCards.map((card) => ({
          id: String(card.id || ""),
          title: normalizeEmbedTitle(card.title, card.url),
          url: validateHttpsEmbedUrl(card.url) || "",
          size: EMBED_SIZE_PRESET_SET.has(String(card.size)) ? String(card.size) : "tall",
        })).filter((card) => card.id.startsWith("e_") && card.url)
      : cloneList(state.embedCards);
    const mappedTimes = mapTimeCardsFromConfig(config.timeCards);
    const mappedNotifications = mapNotificationCardsFromConfig(config.notificationCards);
    const nextTimes = mappedTimes ?? cloneList(state.timeCards);
    const nextNotifications = mappedNotifications ?? cloneList(state.notificationCards);
    const nextLayout = normalizeFavoritesLayout(
      Array.isArray(config.favoritesLayout) ? config.favoritesLayout : state.favoritesLayout,
      state.favorites,
      nextEmbeds,
      nextTimes,
      nextNotifications,
      state.htmlTiles,
    );
    const before = signature(state);
    replaceList(state.embedCards, nextEmbeds);
    replaceList(state.timeCards, nextTimes);
    replaceList(state.notificationCards, nextNotifications);
    replaceList(state.favoritesLayout, nextLayout);
    sync();
    render("card-config");
    return before !== signature(state);
  }

  function beginReorder() {
    reorderSnapshot = {
      favorites: [...state.favorites],
      favoriteSizes: { ...state.favoriteSizes },
      favoritesLayout: [...state.favoritesLayout],
      embedCards: cloneList(state.embedCards),
      timeCards: cloneList(state.timeCards),
      notificationCards: cloneList(state.notificationCards),
      htmlTiles: cloneList(state.htmlTiles),
      htmlTileTitleOverrides: { ...state.htmlTileTitleOverrides },
    };
    return reorderSnapshot;
  }

  function cancelReorder() {
    if (!reorderSnapshot) return false;
    replaceList(state.favorites, reorderSnapshot.favorites);
    replaceRecord(state.favoriteSizes, reorderSnapshot.favoriteSizes);
    replaceList(state.favoritesLayout, reorderSnapshot.favoritesLayout);
    replaceList(state.embedCards, cloneList(reorderSnapshot.embedCards));
    replaceList(state.timeCards, cloneList(reorderSnapshot.timeCards));
    replaceList(state.notificationCards, cloneList(reorderSnapshot.notificationCards));
    replaceList(state.htmlTiles, cloneList(reorderSnapshot.htmlTiles));
    replaceRecord(state.htmlTileTitleOverrides, reorderSnapshot.htmlTileTitleOverrides);
    reorderSnapshot = null;
    services.saveFavoriteSizes?.(state.favoriteSizes);
    sync();
    render("reorder-cancel");
    return true;
  }

  function finishReorder() {
    reorderSnapshot = null;
  }

  async function persistFavoriteLayout(layout) {
    const selectedLayout = Array.isArray(layout) ? layout : state.favoritesLayout;
    const sizes = favoriteLayoutSizePayloads(state, selectedLayout, services.normalizeDeviceSizes);
    const payload = {
      layout: selectedLayout,
      favoriteSizes: sizes.deviceSizes,
      embedSizes: sizes.embedSizes,
      htmlSizes: sizes.htmlSizes,
      htmlZooms: sizes.htmlZooms,
      htmlTitles: sizes.htmlTitles,
      timeSizes: sizes.timeSizes,
      notificationSizes: sizes.notificationSizes,
    };
    try {
      const result = await services.api.saveLayout(payload);
      if (!result?.ok) {
        ui.error?.(result?.error || "Could not save favorites layout");
        return false;
      }
      if (Array.isArray(result.favorites)) replaceList(state.favorites, result.favorites.map(Number));
      if (result.sizes && typeof result.sizes === "object") {
        replaceRecord(state.favoriteSizes, Object.fromEntries(
          Object.entries(result.sizes).map(([key, value]) => [Number(key), String(value)]),
        ));
        services.saveFavoriteSizes?.(state.favoriteSizes);
      }
      applyHtmlCatalogFromData({ htmlTiles: cloneList(state.htmlTiles), config: result });
      applyEmbedConfigFromData({ config: result }, { allowDuringReorder: true });
      finishReorder();
      render("layout-saved");
      return true;
    } catch (error) {
      ui.error?.(error?.message || "Could not save favorites layout");
      return false;
    }
  }

  async function mutateCard(kind, payload) {
    try {
      const result = await services.api.mutateCard(kind, payload);
      if (!result?.ok) {
        ui.error?.(result?.error || "Could not save tile");
        return null;
      }
      applyEmbedConfigFromData({ config: result }, { allowDuringReorder: true });
      render(`${kind}-mutation`);
      return result;
    } catch (error) {
      ui.error?.(error?.message || "Could not save tile");
      return null;
    }
  }

  return {
    init: () => render("init"),
    render,
    handleHubEvent: () => false,
    applyHtmlTitleOverrides,
    htmlTitleOverridesForLayout: (layout, overrides = state.htmlTileTitleOverrides) =>
      htmlTitleOverridesForLayout(layout, overrides),
    applyHtmlCatalogFromData,
    applyEmbedConfigFromData,
    layoutSizePayloads: (layout) => favoriteLayoutSizePayloads(state, layout, services.normalizeDeviceSizes),
    beginReorder,
    cancelReorder,
    finishReorder,
    persistFavoriteLayout,
    mutateCard,
    observeEmbedCard: lazyEmbeds.observe,
    discardEmbed: lazyEmbeds.discard,
    stopEmbedStreams: lazyEmbeds.stop,
    pause() { lazyEmbeds.stop(ui.embedRoots?.() || []); },
    resume() { render("resume"); },
    dispose() { lazyEmbeds.dispose(); },
  };
}
