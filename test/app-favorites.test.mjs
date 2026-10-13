import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import {
  deviceFavoriteKey,
  embedFavoriteKey,
  favoriteEntryKey,
  htmlFavoriteKey,
  hostnameFromHttpsUrl,
  isSameOriginEmbedUrl,
  mapNotificationCardsFromConfig,
  mapTimeCardsFromConfig,
  normalizeEmbedTitle,
  normalizeFavoritesLayout,
  normalizeHtmlTileTitle,
  normalizeHtmlZoom,
  normalizeNotificationSize,
  normalizeTimeSize,
  normalizeTimeStyle,
  notificationFavoriteKey,
  parseEmbedInput,
  parseHtmlTileId,
  timeFavoriteKey,
  validateHttpsEmbedUrl,
} from "../src/client/domain/index.mjs";

test("embed URLs accept only absolute HTTPS values", () => {
  assert.strictEqual(validateHttpsEmbedUrl(null), null);
  assert.strictEqual(validateHttpsEmbedUrl(" https://Example.com/view?q=1 "), "https://Example.com/view?q=1");
  for (const value of [
    "", "x".repeat(4097), "http://example.com", "//example.com", "/relative",
    "javascript:alert(1)", "https://bad.example/\nnext",
  ]) {
    assert.strictEqual(validateHttpsEmbedUrl(value), null, value);
  }
  assert.deepStrictEqual(parseEmbedInput("https://cams.example/live"), {
    ok: true,
    url: "https://cams.example/live",
  });
  assert.match(parseEmbedInput("<script src='x'></script>").error, /Script embeds are not supported/);
  assert.match(parseEmbedInput("   ").error, /Enter an HTTPS/);
  const location = { href: "http://dashboard.local/index.html", origin: "http://dashboard.local" };
  assert.strictEqual(isSameOriginEmbedUrl("http://dashboard.local/tiles", location), true);
  assert.strictEqual(isSameOriginEmbedUrl("https://dashboard.local/tiles", location), false);
});

test("iframe embed input is parsed with the browser DOM implementation", () => {
  const window = new Window();
  assert.deepStrictEqual(
    parseEmbedInput('<iframe title="cam" src="https://cams.example/live"></iframe>', window.DOMParser),
    { ok: true, url: "https://cams.example/live" },
  );
  assert.match(parseEmbedInput("<iframe></iframe>", window.DOMParser).error, /iframe src/);
  assert.match(parseEmbedInput('<iframe src="http://cams.example/live"></iframe>', window.DOMParser).error, /absolute https/);
  class BrokenParser { constructor() { throw new Error("broken"); } }
  assert.match(parseEmbedInput("<iframe src='https://cams.example'></iframe>", BrokenParser).error, /parse iframe/);
  window.close();
});

test("embed and HTML titles are cleaned, truncated, and given useful fallbacks", () => {
  assert.strictEqual(normalizeEmbedTitle("  Kitchen\u0000 Camera  ", "https://fallback.example/x"), "Kitchen  Camera");
  assert.strictEqual(normalizeEmbedTitle("", "https://fallback.example/x"), "fallback.example");
  assert.strictEqual(normalizeHtmlTileTitle("", "temperature"), "temperature");
  assert.strictEqual(normalizeHtmlTileTitle("", ""), "HTML");
  assert.strictEqual(normalizeEmbedTitle("x".repeat(100), "https://x.example").length, 80);
  assert.strictEqual(normalizeHtmlTileTitle("x".repeat(100), "ignored").length, 80);
  assert.strictEqual(normalizeEmbedTitle(null, "not a URL"), "Embed");
  assert.strictEqual(normalizeHtmlTileTitle(null, null), "HTML");
  assert.strictEqual(hostnameFromHttpsUrl("not a URL"), "");
});

test("favorite identifiers normalize legacy prefixes and validate HTML tile IDs", () => {
  assert.strictEqual(deviceFavoriteKey("42"), "d:42");
  assert.strictEqual(embedFavoriteKey("e_weather"), "e:weather");
  assert.strictEqual(embedFavoriteKey("weather"), "e:weather");
  assert.strictEqual(timeFavoriteKey("t_clock"), "t:clock");
  assert.strictEqual(timeFavoriteKey("clock"), "t:clock");
  assert.strictEqual(notificationFavoriteKey("n_alerts"), "n:alerts");
  assert.strictEqual(notificationFavoriteKey("alerts"), "n:alerts");
  assert.strictEqual(htmlFavoriteKey("12:temperature"), "h:12:temperature");
  assert.deepStrictEqual(parseHtmlTileId("12:current.value"), {
    id: "12:current.value",
    deviceId: 12,
    attribute: "current.value",
  });
  assert.strictEqual(parseHtmlTileId("abc:value"), null);
  assert.strictEqual(parseHtmlTileId("missing-colon"), null);
  assert.strictEqual(parseHtmlTileId("12:bad value"), null);
});

test("favorite layouts retain valid unique entries and append missing configured cards", () => {
  const layout = normalizeFavoritesLayout(
    ["d:2", "e_weather", "e:e_weather", "t_clock", "n:alerts", "h:7:html", "d:999", "bad"],
    [1, 2],
    [{ id: "e_weather" }, { id: "e_cam" }],
    [{ id: "t_clock" }],
    [{ id: "n_alerts" }],
    [{ id: "7:html" }],
  );
  assert.deepStrictEqual(Array.from(layout), [
    "d:2", "e:weather", "t:clock", "n:alerts", "h:7:html", "d:1", "e:cam",
  ]);

  const legacyLayout = normalizeFavoritesLayout(
    ["e:e_weather", "t:t_clock", "n:n_alerts", "n_alerts", "e:bad!", "t:bad!", "n:bad!", "h:bad", "d:nope"],
    [],
    [{ id: "e_weather" }],
    [{ id: "t_clock" }],
    [{ id: "n_alerts" }],
    [],
  );
  assert.deepStrictEqual(legacyLayout, ["e:weather", "t:clock", "n:alerts"]);
  assert.deepStrictEqual(normalizeFavoritesLayout(null, null, null, null, null, null), []);
});

test("time and notification cards use safe style and size defaults", () => {
  assert.deepStrictEqual(mapTimeCardsFromConfig([
    { id: "t_clock", style: "time_seconds", size: "wide" },
    { id: "t_bad", style: "unknown", size: "unknown" },
    { id: "wrong", style: "time" },
  ]), [
    { id: "t_clock", style: "time_seconds", size: "wide" },
    { id: "t_bad", style: "time", size: "square" },
  ]);
  assert.deepStrictEqual(mapNotificationCardsFromConfig([
    { id: "n_alerts", size: "full" },
    { id: "n_bad", size: "tiny" },
  ]), [
    { id: "n_alerts", size: "full" },
    { id: "n_bad", size: "tall" },
  ]);
  assert.strictEqual(normalizeHtmlZoom(125), 125);
  assert.strictEqual(normalizeHtmlZoom(110), 100);
  assert.strictEqual(normalizeTimeStyle("bad"), "time");
  assert.strictEqual(normalizeTimeStyle("time_date"), "time_date");
  assert.strictEqual(normalizeTimeSize("bad"), "square");
  assert.strictEqual(normalizeTimeSize("wide"), "wide");
  assert.strictEqual(normalizeNotificationSize("bad"), "tall");
  assert.strictEqual(normalizeNotificationSize("full"), "full");
  assert.strictEqual(mapTimeCardsFromConfig(null), null);
  assert.strictEqual(mapNotificationCardsFromConfig(null), null);
});

test("favorite entry keys cover each card type", () => {
  assert.strictEqual(favoriteEntryKey({ type: "embed", card: { id: "e_cam" } }), "e:cam");
  assert.strictEqual(favoriteEntryKey({ type: "time", card: { id: "t_clock" } }), "t:clock");
  assert.strictEqual(favoriteEntryKey({ type: "notifications", card: { id: "n_alerts" } }), "n:alerts");
  assert.strictEqual(favoriteEntryKey({ type: "html", tile: { id: "7:status" } }), "h:7:status");
  assert.strictEqual(favoriteEntryKey({ dev: { i: 7 } }), "d:7");
  assert.strictEqual(favoriteEntryKey({ dev: {} }), "");
  assert.strictEqual(favoriteEntryKey(null), "");
});

test("same-origin checks fail closed for malformed locations", () => {
  assert.strictEqual(isSameOriginEmbedUrl("not a URL", { href: "also bad", origin: "null" }), false);
});
