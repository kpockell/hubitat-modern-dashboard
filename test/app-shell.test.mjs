import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { hubitatData } from "./fixtures/hubitat-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "src/index.html"), "utf8");

test("dashboard shell keeps the Hubitat asset order and deferred post3 metadata", () => {
  const window = new Window({ url: "http://dashboard.local/dashboard" });
  window.document.write(html);

  const scripts = [...window.document.querySelectorAll("script[src]")]
    .map((script) => new URL(script.src).pathname.split("/").pop());
  assert.deepEqual(scripts, [
    "app.js",
    "app-core.js",
    "app-post.js",
    "app-post2.js",
    "app-post3.js",
  ]);
  assert.match(
    window.document.querySelector('meta[name="mld-post3"]')?.content || "",
    /^app-post3\.js\?v=/,
  );
  assert.equal(window.document.querySelector('link[rel="manifest"]')?.crossOrigin, "use-credentials");
  window.close();
});

test("dashboard shell exposes stable controls with usable focus and event behavior", () => {
  const window = new Window({ url: "http://dashboard.local/dashboard" });
  window.document.write(html);
  const search = window.document.getElementById("search");
  const overflow = window.document.getElementById("topbar-overflow-btn");
  let clicked = 0;
  overflow.addEventListener("click", () => clicked++);

  search.focus();
  overflow.click();

  assert.equal(window.document.activeElement, search);
  assert.equal(clicked, 1);
  assert.equal(overflow.getAttribute("aria-haspopup"), "menu");
  assert.equal(window.document.getElementById("rooms")?.tagName, "MAIN");
  window.close();
});

test("shared Hubitat fixture returns isolated overrides", () => {
  const first = hubitatData({ config: { defaultTab: "sensors" }, sensors: [{ i: 2 }] });
  const second = hubitatData();
  assert.equal(first.config.defaultTab, "sensors");
  assert.deepEqual(first.sensors, [{ i: 2 }]);
  assert.equal(second.config.defaultTab, "lights");
  assert.deepEqual(second.sensors, []);
});
