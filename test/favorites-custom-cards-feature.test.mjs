import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import {
  createFavoritesCustomCardsFeature,
  createLazyEmbedLoader,
  favoriteLayoutSizePayloads,
  htmlTitleOverridesForLayout,
} from "../src/client/features/favorites-custom-cards.mjs";

function fixture(overrides = {}) {
  const state = {
    favorites: [1, 2],
    favoriteSizes: { 1: "wide" },
    embedCards: [{ id: "e_cam", title: "Cam", url: "https://cam.example/live", size: "tall" }],
    timeCards: [{ id: "t_clock", style: "time", size: "square" }],
    notificationCards: [{ id: "n_alerts", size: "full" }],
    htmlTiles: [{
      id: "7:status", deviceId: 7, attribute: "status", liveTitle: "Status",
      title: "Front Door", size: "wide", zoom: 125, html: "<b>Locked</b>",
    }],
    htmlTileTitleOverrides: { "7:status": "Front Door", stale: "Stale" },
    favoritesLayout: ["d:1", "e:cam", "t:clock", "n:alerts", "h:7:status", "d:2"],
  };
  const calls = [];
  const errors = [];
  let editing = false;
  let reordering = false;
  const services = {
    IntersectionObserver: undefined,
    isEditing: () => editing,
    isReordering: () => reordering,
    normalizeDeviceSizes: (ids) => Object.fromEntries(ids.map((id) => [id, state.favoriteSizes[id] || "square"])),
    saveFavoriteSizes: (sizes) => calls.push(["save-sizes", { ...sizes }]),
    api: {
      saveLayout: async (payload) => ({ ok: true, ...payload, favorites: [2, 1], sizes: { 2: "compact" } }),
      mutateCard: async (_kind, payload) => ({
        ok: true,
        embedCards: state.embedCards,
        timeCards: state.timeCards,
        notificationCards: state.notificationCards,
        favoritesLayout: state.favoritesLayout,
        payload,
      }),
      ...overrides.api,
    },
    ...overrides.services,
  };
  const ui = {
    renderFavoritesCustomCards: (_state, reason) => calls.push(["render", reason]),
    syncCompatibilityFacade: () => calls.push(["sync"]),
    error: (message) => errors.push(message),
    embedRoots: () => [],
    ...overrides.ui,
  };
  const feature = createFavoritesCustomCardsFeature({ state, services, ui });
  return {
    feature, state, calls, errors,
    setEditing(value) { editing = value; },
    setReordering(value) { reordering = value; },
  };
}

test("layout payloads retain per-type sizes, zooms, titles, and device order", () => {
  const { state } = fixture();
  assert.deepEqual(htmlTitleOverridesForLayout(state.favoritesLayout, state.htmlTileTitleOverrides), {
    "7:status": "Front Door",
  });
  const payload = favoriteLayoutSizePayloads(
    state,
    ["h:7:status", "d:2", "d:1", "e:cam", "t:clock", "n:alerts"],
    (ids) => ({ order: ids }),
  );
  assert.deepEqual(payload, {
    deviceSizes: { order: [2, 1] },
    embedSizes: { e_cam: "tall" },
    htmlSizes: { "7:status": "wide" },
    htmlZooms: { "7:status": 125 },
    htmlTitles: { "7:status": "Front Door" },
    timeSizes: { t_clock: "square" },
    notificationSizes: { n_alerts: "full" },
  });
});

test("card config reconciliation normalizes input and preserves collection identity", () => {
  const { feature, state, setEditing, setReordering } = fixture();
  const refs = [state.embedCards, state.timeCards, state.notificationCards, state.favoritesLayout];
  assert.equal(feature.applyEmbedConfigFromData(null), false);
  setEditing(true);
  assert.equal(feature.applyEmbedConfigFromData({ config: { embedCards: [] } }), false);
  setEditing(false);
  setReordering(true);
  assert.equal(feature.applyEmbedConfigFromData({ config: { embedCards: [] } }), false);
  setReordering(false);
  assert.equal(feature.applyEmbedConfigFromData({
    config: {
      embedCards: [
        { id: "e_weather", title: "", url: "https://weather.example/view", size: "viewport" },
        { id: "bad", url: "https://bad.example" },
        { id: "e_http", url: "http://bad.example" },
      ],
      timeCards: [{ id: "t_clock", style: "bad", size: "bad" }],
      notificationCards: [{ id: "n_alerts", size: "bad" }],
      favoritesLayout: ["n:alerts", "e:weather", "t:clock", "d:1", "d:unknown"],
    },
  }), true);
  assert.strictEqual(state.embedCards, refs[0]);
  assert.strictEqual(state.timeCards, refs[1]);
  assert.strictEqual(state.notificationCards, refs[2]);
  assert.strictEqual(state.favoritesLayout, refs[3]);
  assert.deepEqual(state.embedCards, [{
    id: "e_weather", title: "weather.example", url: "https://weather.example/view", size: "viewport",
  }]);
  assert.deepEqual(state.timeCards, [{ id: "t_clock", style: "time", size: "square" }]);
  assert.deepEqual(state.notificationCards, [{ id: "n_alerts", size: "tall" }]);
  assert.deepEqual(state.favoritesLayout, ["n:alerts", "e:weather", "t:clock", "d:1", "d:2"]);
});

test("HTML catalog reconciliation validates ids and retains cached bodies", () => {
  const { feature, state } = fixture();
  const tiles = state.htmlTiles;
  const layout = state.favoritesLayout;
  assert.equal(feature.applyHtmlCatalogFromData({}), false);
  assert.equal(feature.applyHtmlCatalogFromData({
    config: {
      favorites: [1, 2],
      favoritesLayout: ["h:7:status", "h:bad", "d:1", "d:2"],
      htmlSizes: { "h:7:status": "large" },
      htmlZooms: { "7:status": 150 },
      htmlTitles: { "7:status": "Entry" },
    },
    htmlTiles: [
      { id: "7:status", name: "Status", title: "Hub Status", roomsCss: ".room{}", alignCss: ".x{}" },
      { id: "7:status", name: "Duplicate" },
      { id: "bad", name: "Bad" },
    ],
  }), true);
  assert.strictEqual(state.htmlTiles, tiles);
  assert.strictEqual(state.favoritesLayout, layout);
  assert.deepEqual(state.htmlTiles, [{
    id: "7:status", deviceId: 7, attribute: "status", liveTitle: "Duplicate", title: "Entry",
    size: "large", zoom: 150, html: "<b>Locked</b>", roomsCss: ".room{}", alignCss: ".x{}",
  }]);
  assert.deepEqual(state.favoritesLayout, ["h:7:status", "d:1", "d:2", "e:cam", "t:clock", "n:alerts"]);

  feature.applyHtmlCatalogFromData({
    config: { favorites: [1, 2] },
    htmlTiles: [{ deviceId: 8, attribute: "html", name: "Live", title: "Override", html: null, error: " failed " }],
  });
  assert.equal(state.htmlTiles[0].id, "8:html");
  assert.equal(state.htmlTiles[0].title, "Override");
  assert.equal(state.htmlTiles[0].html, "");
  assert.equal(state.htmlTiles[0].error, "failed");
});

test("reorder snapshots restore every collection without replacing identities", () => {
  const { feature, state } = fixture();
  const refs = {
    favorites: state.favorites,
    sizes: state.favoriteSizes,
    layout: state.favoritesLayout,
    embeds: state.embedCards,
    html: state.htmlTiles,
    titles: state.htmlTileTitleOverrides,
  };
  assert.equal(feature.cancelReorder(), false);
  feature.beginReorder();
  state.favorites.splice(0, 2, 99);
  state.favoriteSizes[99] = "large";
  state.favoritesLayout.splice(0, 1, "d:99");
  state.embedCards[0].title = "Changed";
  state.htmlTiles.length = 0;
  state.htmlTileTitleOverrides["7:status"] = "Changed";
  assert.equal(feature.cancelReorder(), true);
  assert.strictEqual(state.favorites, refs.favorites);
  assert.strictEqual(state.favoriteSizes, refs.sizes);
  assert.strictEqual(state.favoritesLayout, refs.layout);
  assert.strictEqual(state.embedCards, refs.embeds);
  assert.strictEqual(state.htmlTiles, refs.html);
  assert.strictEqual(state.htmlTileTitleOverrides, refs.titles);
  assert.deepEqual(state.favorites, [1, 2]);
  assert.equal(state.embedCards[0].title, "Cam");
  assert.equal(state.htmlTiles.length, 1);
  assert.equal(state.htmlTileTitleOverrides["7:status"], "Front Door");
});

test("layout persistence applies server state and covers rejection and timeout", async () => {
  const success = fixture();
  assert.equal(await success.feature.persistFavoriteLayout(["d:2", "d:1"]), true);
  assert.deepEqual(success.state.favorites, [2, 1]);
  assert.deepEqual(success.state.favoriteSizes, { 2: "compact" });
  assert.ok(success.calls.some((call) => call[0] === "save-sizes"));

  const rejected = fixture({ api: { saveLayout: async () => ({ ok: false, error: "denied" }) } });
  assert.equal(await rejected.feature.persistFavoriteLayout(), false);
  assert.deepEqual(rejected.errors, ["denied"]);

  const timedOut = fixture({ api: { saveLayout: async () => { throw new Error("timeout"); } } });
  assert.equal(await timedOut.feature.persistFavoriteLayout(), false);
  assert.deepEqual(timedOut.errors, ["timeout"]);
});

test("card mutations reconcile server config and fail closed", async () => {
  const success = fixture({
    api: {
      mutateCard: async (kind) => ({
        ok: true,
        embedCards: kind === "embed" ? [] : undefined,
        timeCards: [],
        notificationCards: [],
        favoritesLayout: [],
      }),
    },
  });
  assert.ok(await success.feature.mutateCard("embed", { action: "delete", id: "e_cam" }));
  assert.deepEqual(success.state.embedCards, []);

  const rejected = fixture({ api: { mutateCard: async () => ({ ok: false, error: "denied" }) } });
  assert.equal(await rejected.feature.mutateCard("time", {}), null);
  assert.deepEqual(rejected.errors, ["denied"]);
  const offline = fixture({ api: { mutateCard: async () => { throw new Error("offline"); } } });
  assert.equal(await offline.feature.mutateCard("notifications", {}), null);
  assert.deepEqual(offline.errors, ["offline"]);
});

test("lazy embed loading activates intersections and blanks discarded streams", () => {
  const window = new Window({ url: "https://dashboard.local" });
  const root = window.document.createElement("div");
  root.innerHTML = `
    <article class="fav-embed-card" data-embed-id="e_cam" data-embed-url="https://cam.example/live">
      <iframe class="fav-embed-iframe" src="about:blank"></iframe>
    </article>`;
  const card = root.querySelector(".fav-embed-card");
  const iframe = root.querySelector("iframe");
  let callback;
  let disconnected = 0;
  class Observer {
    constructor(fn, options) { callback = fn; assert.equal(options.rootMargin, "80px"); }
    observe(target) { assert.strictEqual(target, card); }
    disconnect() { disconnected += 1; }
  }
  const loader = createLazyEmbedLoader({ IntersectionObserver: Observer });
  assert.equal(loader.observe(card), true);
  assert.equal(iframe.getAttribute("src"), "about:blank");
  callback([{ target: card, isIntersecting: false }, { target: card, isIntersecting: true }]);
  assert.equal(iframe.getAttribute("src"), "https://cam.example/live");
  loader.discard("e_cam", [root]);
  assert.equal(iframe.getAttribute("src"), "about:blank");
  loader.stop([root]);
  assert.equal(disconnected, 1);
  loader.dispose();

  const immediate = createLazyEmbedLoader();
  assert.equal(immediate.observe(card), true);
  assert.equal(iframe.getAttribute("src"), "https://cam.example/live");
  assert.equal(immediate.observe(null), false);
  window.close();
});

test("feature lifecycle exposes stable registry hooks", () => {
  const { feature, calls } = fixture();
  feature.init();
  assert.equal(feature.handleHubEvent({ source: "DEVICE" }), false);
  feature.resume();
  feature.pause();
  feature.dispose();
  assert.ok(calls.some((call) => call[0] === "render" && call[1] === "init"));
  assert.ok(calls.some((call) => call[0] === "render" && call[1] === "resume"));
});
