import assert from "node:assert/strict";
import test from "node:test";
import { Window } from "happy-dom";
import {
  bindPopupDismiss,
  createElement,
  createGestureRegistry,
  createPopupController,
  dragThresholdExceeded,
} from "../src/client/ui/index.mjs";

test("createElement applies classes, text, attributes, and properties", () => {
  const window = new Window();
  const button = createElement(window.document, "button", "primary", {
    text: "Save",
    attributes: { "aria-label": "Save card" },
    properties: { type: "button", disabled: true },
  });
  assert.strictEqual(button.className, "primary");
  assert.strictEqual(button.textContent, "Save");
  assert.strictEqual(button.getAttribute("aria-label"), "Save card");
  assert.strictEqual(button.type, "button");
  assert.strictEqual(button.disabled, true);
  window.close();
});

test("popup dismissal distinguishes overlay, panel, and close-button events", () => {
  const window = new Window();
  const overlay = createElement(window.document, "div", "overlay");
  const panel = createElement(window.document, "div", "panel");
  const close = createElement(window.document, "button", "close");
  overlay.append(panel, close);
  window.document.body.append(overlay);
  let closes = 0;
  const cleanup = bindPopupDismiss(overlay, panel, close, () => { closes += 1; });

  panel.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(closes, 0);
  close.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(closes, 2);
  cleanup();
  overlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  assert.strictEqual(closes, 2);
  window.close();
});

test("popup controller opens, focuses, closes, restores focus, and disposes", () => {
  const window = new Window();
  const opener = createElement(window.document, "button");
  const popup = createElement(window.document, "div");
  const first = createElement(window.document, "button");
  popup.append(first);
  window.document.body.append(opener, popup);
  opener.focus();

  const controller = createPopupController({ element: popup, initialFocus: first, document: window.document });
  controller.open();
  assert.strictEqual(popup.hidden, false);
  assert.strictEqual(popup.classList.contains("open"), true);
  assert.strictEqual(window.document.activeElement, first);
  controller.close();
  assert.strictEqual(popup.hidden, true);
  assert.strictEqual(window.document.activeElement, opener);
  controller.dispose();
  window.close();
});

test("gesture registry cancels every active gesture despite self-removal", () => {
  const registry = createGestureRegistry();
  const calls = [];
  let removeFirst;
  removeFirst = registry.register(() => { calls.push("first"); removeFirst(); });
  registry.register(() => calls.push("second"));
  assert.strictEqual(registry.size, 2);
  registry.cancelAll();
  assert.deepStrictEqual(calls, ["first", "second"]);
  assert.strictEqual(registry.size, 0);
});

test("drag threshold uses Euclidean distance and supports a custom threshold", () => {
  assert.strictEqual(dragThresholdExceeded(3, 4), false);
  assert.strictEqual(dragThresholdExceeded(6, 6), true);
  assert.strictEqual(dragThresholdExceeded(3, 4, 4), true);
});
