export function createElement(document, tagName, className = "", options = {}) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (options.text != null) element.textContent = String(options.text);
  for (const [name, value] of Object.entries(options.attributes || {})) {
    element.setAttribute(name, String(value));
  }
  Object.assign(element, options.properties || {});
  return element;
}

export function appendPopup(document, element) {
  document.documentElement.appendChild(element);
  return element;
}

export function bindPopupDismiss(overlay, panel, closeButton, onClose) {
  const onOverlayClick = (event) => {
    if (event.target === overlay) onClose();
  };
  const onPanelClick = (event) => event.stopPropagation();
  const onCloseClick = (event) => {
    event.stopPropagation();
    onClose();
  };
  overlay.addEventListener("click", onOverlayClick);
  panel?.addEventListener("click", onPanelClick);
  closeButton?.addEventListener("click", onCloseClick);
  return () => {
    overlay.removeEventListener("click", onOverlayClick);
    panel?.removeEventListener("click", onPanelClick);
    closeButton?.removeEventListener("click", onCloseClick);
  };
}

export function createPopupController({ element, initialFocus, document, onClose } = {}) {
  let restoreFocus = null;
  const resolveFocus = () => typeof initialFocus === "function" ? initialFocus() : initialFocus;
  const onKeyDown = (event) => {
    if (event.key === "Escape" && element.classList.contains("open")) close();
  };
  function open() {
    restoreFocus = document.activeElement;
    element.hidden = false;
    element.classList.add("open");
    resolveFocus()?.focus();
  }
  function close() {
    if (!element.classList.contains("open") && element.hidden) return;
    element.hidden = true;
    element.classList.remove("open");
    onClose?.();
    restoreFocus?.focus?.();
    restoreFocus = null;
  }
  document.addEventListener("keydown", onKeyDown);
  return {
    open,
    close,
    dispose() {
      close();
      document.removeEventListener("keydown", onKeyDown);
    },
  };
}

export function createGestureRegistry() {
  const active = [];
  return {
    active,
    get size() { return active.length; },
    register(cancel) {
      if (typeof cancel !== "function") throw new TypeError("Gesture cancel callback must be a function");
      active.push(cancel);
      return () => {
        const index = active.indexOf(cancel);
        if (index >= 0) active.splice(index, 1);
      };
    },
    cancelAll() {
      cancelGestures(active);
    },
  };
}

export function cancelGestures(active) {
  while (active.length) active.shift()();
}

export function dragThresholdExceeded(deltaX, deltaY, threshold = 8) {
  return Math.hypot(deltaX, deltaY) >= threshold;
}
