import assert from "node:assert/strict";
import test from "node:test";
import { createAppHarness, plain } from "./harness.mjs";

test("favorite domain helpers fail closed on malformed external input", () => {
  const { api } = createAppHarness();
  for (const value of [
    null,
    "",
    "x".repeat(4097),
    "http://example.com",
    "//example.com",
    "/relative",
    "javascript:alert(1)",
    "https://bad.example/\nnext",
  ]) {
    assert.strictEqual(api.validateHttpsEmbedUrl(value), null, String(value));
  }
  assert.match(api.parseEmbedInput("   ").error, /Enter an HTTPS/);
  assert.match(api.parseEmbedInput("<script src='x'></script>").error, /Script embeds are not supported/);
  assert.strictEqual(api.parseHtmlTileId("missing-colon"), null);
  assert.strictEqual(api.parseHtmlTileId("12:bad value"), null);
});

test("favorite layouts accept legacy prefixes, reject unknown entries, and remove duplicates", () => {
  const { api } = createAppHarness();
  const layout = api.normalizeFavoritesLayout(
    [
      "e:e_weather",
      "e_weather",
      "t:t_clock",
      "t_clock",
      "n:n_alerts",
      "n_alerts",
      "e:bad!",
      "t:bad!",
      "n:bad!",
      "h:bad",
      "d:nope",
    ],
    [],
    [{ id: "e_weather" }],
    [{ id: "t_clock" }],
    [{ id: "n_alerts" }],
    [],
  );
  assert.deepStrictEqual(plain(layout), ["e:weather", "t:clock", "n:alerts"]);
  assert.deepStrictEqual(plain(api.normalizeFavoritesLayout(null, null, null, null, null, null)), []);
});

test("card normalizers preserve supported values and apply stable defaults", () => {
  const { api } = createAppHarness();
  assert.strictEqual(api.normalizeTimeStyle("time_date"), "time_date");
  assert.strictEqual(api.normalizeTimeStyle("bad"), "time");
  assert.strictEqual(api.normalizeTimeSize("wide"), "wide");
  assert.strictEqual(api.normalizeTimeSize("bad"), "square");
  assert.strictEqual(api.normalizeNotificationSize("full"), "full");
  assert.strictEqual(api.normalizeNotificationSize("bad"), "tall");
  assert.strictEqual(api.normalizeHtmlZoom(125), 125);
  assert.strictEqual(api.normalizeHtmlZoom(110), 100);
  assert.strictEqual(api.mapTimeCardsFromConfig(null), null);
  assert.strictEqual(api.mapNotificationCardsFromConfig(null), null);
});
