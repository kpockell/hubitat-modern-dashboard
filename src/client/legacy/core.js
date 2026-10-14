

  function ensureColorPopup() {
    if (colorPopup) return colorPopup;
    colorPopup = ce("div", "ct-popup");
    colorPopup.hidden = true;
    colorPopup.setAttribute("role", "dialog");
    colorPopup.setAttribute("aria-modal", "true");
    colorPopup.setAttribute("aria-label", "Light settings");
    const panel = ce("div", "ct-panel");
    const head = ce("div", "ct-head");
    const leading = ce("div", "ct-head-leading");
    const title = ce("div", "ct-title");
    const value = ce("div", "ct-value");
    const closeBtn = ce("button", "ct-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close light settings");
    closeBtn.textContent = "×";
    leading.appendChild(title);
    leading.appendChild(value);
    head.appendChild(leading);
    head.appendChild(closeBtn);

    const tabs = ce("div", "ct-tabs");
    const tabCt = ce("button", "ct-tab");
    tabCt.type = "button";
    tabCt.textContent = "White";
    tabCt.dataset.tab = "ct";
    const tabRgb = ce("button", "ct-tab");
    tabRgb.type = "button";
    tabRgb.textContent = "RGB";
    tabRgb.dataset.tab = "rgb";
    tabs.appendChild(tabCt);
    tabs.appendChild(tabRgb);
    const tabLevel = ce("button", "ct-tab");
    tabLevel.type = "button";
    tabLevel.textContent = "Brightness";
    tabLevel.dataset.tab = "level";
    tabs.appendChild(tabLevel);

    const paneCt = ce("div", "ct-pane ct-pane-ct");
    const track = ce("div", "ct-track");
    const thumb = ce("div", "ct-thumb");
    track.appendChild(thumb);
    paneCt.appendChild(track);
    const ctPresets = ce("div", "ct-presets");
    for (const k of CT_PRESETS) {
      const btn = ce("button", "ct-preset");
      btn.type = "button";
      btn.dataset.k = String(k);
      btn.setAttribute("aria-label", k + " Kelvin");
      btn.style.background = kelvinSwatchColor(k);
      const label = ce("span", "ct-preset-k");
      label.textContent = String(k);
      btn.appendChild(label);
      ctPresets.appendChild(btn);
    }
    paneCt.appendChild(ctPresets);

    const paneRgb = ce("div", "ct-pane ct-pane-rgb");
    const wheelWrap = ce("div", "rgb-wheel-wrap");
    const canvas = ce("canvas", "rgb-wheel");
    canvas.width = RGB_WHEEL_SIZE;
    canvas.height = RGB_WHEEL_SIZE;
    const cursor = ce("div", "rgb-cursor");
    wheelWrap.appendChild(canvas);
    wheelWrap.appendChild(cursor);
    const presets = ce("div", "rgb-presets");
    for (const p of RGB_PRESETS) {
      const sw = ce("button", "rgb-swatch");
      sw.type = "button";
      sw.setAttribute("aria-label", p.label);
      sw.style.background = hsToHex(p.h, p.s);
      sw.dataset.h = String(p.h);
      sw.dataset.s = String(p.s);
      presets.appendChild(sw);
    }
    paneRgb.appendChild(wheelWrap);
    paneRgb.appendChild(presets);

    const paneLevel = ce("div", "ct-pane ct-pane-level");
    const levelTrack = ce("div", "level-track");
    const levelInner = ce("div", "level-track-inner");
    const levelDim = ce("div", "level-dim");
    const levelThumb = ce("div", "level-thumb");
    levelInner.appendChild(levelDim);
    levelTrack.appendChild(levelInner);
    levelTrack.appendChild(levelThumb);
    paneLevel.appendChild(levelTrack);
    const levelPresets = ce("div", "level-presets");
    for (const pct of LEVEL_PRESETS) {
      const btn = ce("button", "level-preset");
      btn.type = "button";
      btn.dataset.l = String(pct);
      btn.setAttribute("aria-label", pct + " percent brightness");
      const label = ce("span", "level-preset-pct");
      label.textContent = pct + "%";
      btn.appendChild(label);
      levelPresets.appendChild(btn);
    }
    paneLevel.appendChild(levelPresets);

    panel.appendChild(head);
    panel.appendChild(tabs);
    panel.appendChild(paneCt);
    panel.appendChild(paneRgb);
    panel.appendChild(paneLevel);
    colorPopup.appendChild(panel);
    appendPopup(colorPopup);

    colorPopup._titleEl = title;
    colorPopup._valueEl = value;
    colorPopup._tabsEl = tabs;
    colorPopup._tabCt = tabCt;
    colorPopup._tabRgb = tabRgb;
    colorPopup._tabLevel = tabLevel;
    colorPopup._paneCt = paneCt;
    colorPopup._paneRgb = paneRgb;
    colorPopup._paneLevel = paneLevel;
    colorPopup._trackEl = track;
    colorPopup._thumbEl = thumb;
    colorPopup._levelTrackEl = levelTrack;
    colorPopup._levelDimEl = levelDim;
    colorPopup._levelThumbEl = levelThumb;
    colorPopup._wheelCanvas = canvas;
    colorPopup._wheelCursor = cursor;
    colorPopup._presetsEl = presets;

    drawRgbWheel(canvas);
    attachCtTrackDrag(track);
    attachCtPresets(ctPresets);
    attachLevelTrackDrag(levelTrack);
    attachLevelPresets(levelPresets);
    attachRgbWheel(canvas, cursor);
    attachRgbPresets(presets);

    tabCt.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("ct"); });
    tabRgb.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("rgb"); });
    tabLevel.addEventListener("click", (e) => { e.stopPropagation(); setColorTab("level"); });

    bindPopupDismiss(colorPopup, panel, closeBtn, () => closeColorPopup(true));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && colorSession) closeColorPopup(false);
    });

    return colorPopup;
  }

  function setColorTab(tab) {
    if (!colorSession) return;
    colorSession.tab = tab;
    updateColorPopupUI();
  }

  function updateColorPopupUI() {
    if (!colorSession) return;
    const popup = ensureColorPopup();
    const sess = colorSession;
    const tabCount = (sess.hasCt ? 1 : 0) + (sess.hasRgb ? 1 : 0) + (sess.hasLevel ? 1 : 0);
    popup._tabsEl.hidden = tabCount < 2;
    popup._tabCt.hidden = !sess.hasCt;
    popup._tabRgb.hidden = !sess.hasRgb;
    popup._tabLevel.hidden = !sess.hasLevel;
    popup._tabCt.classList.toggle("active", sess.tab === "ct");
    popup._tabRgb.classList.toggle("active", sess.tab === "rgb");
    popup._tabLevel.classList.toggle("active", sess.tab === "level");
    popup._paneCt.hidden = sess.tab !== "ct";
    popup._paneRgb.hidden = sess.tab !== "rgb";
    popup._paneLevel.hidden = sess.tab !== "level";
    const name = sess.name || "Light";
    popup._titleEl.textContent = name;
    popup.setAttribute("aria-label", "Light settings — " + name);
    if (sess.tab === "ct") setCtVisual(sess.k);
    else if (sess.tab === "rgb") setRgbVisual(sess.h, sess.s);
    else setLevelVisual(sess.level);
  }

  function tileRecsFor(id) {
    const out = [];
    const roomRec = devMap.get(id);
    if (roomRec) out.push(roomRec);
    const favRec = favDevMap.get(id);
    if (favRec) out.push(favRec);
    return out;
  }

  function applyLevelChange(id, level) {
    setLevelVisual(level);
    for (const rec of tileRecsFor(id)) {
      rec.data.l = level;
      rec.data.s = level > 0 ? 1 : 0;
      rec.levelEl.textContent = formatFootText(rec.data, rec.isDim);
    }
  }

  function applyCtChange(id, k) {
    setCtVisual(k);
    for (const rec of tileRecsFor(id)) {
      rec.data.k = k;
      rec.levelEl.textContent = formatFootText(rec.data, rec.isDim);
    }
  }

  function applyRgbChange(id, h, s) {
    setRgbVisual(h, s);
    for (const rec of tileRecsFor(id)) {
      rec.data.h = h;
      rec.data.sat = s;
      rec.levelEl.textContent = formatFootText(rec.data, rec.isDim);
    }
  }

  function attachCtPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".ct-preset");
      if (!btn || !colorSession) return;
      e.stopPropagation();
      const k = Number(btn.dataset.k);
      colorSession.k = k;
      colorSession.changed = true;
      applyCtChange(colorSession.id, k);
      sendCmd(colorSession.id, "setCT", k);
      ensureLightOn(colorSession.id);
    });
  }

  function attachLevelPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".level-preset");
      if (!btn || !colorSession) return;
      e.stopPropagation();
      const level = Number(btn.dataset.l);
      colorSession.level = level;
      colorSession.changed = true;
      applyLevelChange(colorSession.id, level);
      setLevelOptimistic(colorSession.id, level);
      sendCmd(colorSession.id, "setLevel", level);
    });
  }

  function trackPctFromEvent(track, e) {
    const rect = track.getBoundingClientRect();
    const style = getComputedStyle(track);
    const thumbSize = parseFloat(style.getPropertyValue("--thumb-size"));
    const overhang = parseFloat(style.getPropertyValue("--thumb-overhang"));
    const size = Number.isFinite(thumbSize) && thumbSize > 0 ? thumbSize : 34;
    const hang = Number.isFinite(overhang) && overhang >= 0 ? overhang : 6;
    const inset = size / 2 - hang;
    const x = (e.clientX != null ? e.clientX : 0) - rect.left - inset;
    const travel = rect.width - 2 * inset;
    let pct = travel > 0 ? Math.round((x / travel) * 100) : 0;
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return pct;
  }

  function levelFromTrackEvent(track, e) {
    return trackPctFromEvent(track, e);
  }

  function updateLevelTrackVisual(track, thumbEl, dimEl, level) {
    const l = Math.max(0, Math.min(100, Math.round(level)));
    track.style.setProperty("--level", String(l));
    return l;
  }

  function bindLevelTrackDrag(track, opts) {
    const { canAdjust, levelFromEvent, onAdjust, onCommit, throttleMs = 0 } = opts;
    let lastCommit = 0;

    function adjust(e) {
      if (!canAdjust()) return;
      const level = levelFromEvent(e);
      onAdjust(level);
      if (onCommit && throttleMs > 0) {
        const now = Date.now();
        if (now - lastCommit > throttleMs) {
          lastCommit = now;
          onCommit(level);
        }
      }
      e.preventDefault();
    }

    function stop(e) {
      track.removeEventListener("pointermove", adjust);
      track.removeEventListener("pointerup", stop);
      track.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) track.releasePointerCapture(e.pointerId); } catch {}
      if (canAdjust() && onCommit) onCommit(levelFromEvent(e));
    }

    function start(e) {
      if (!canAdjust()) return;
      if (e.button != null && e.button !== 0) return;
      lastCommit = 0;
      adjust(e);
      try { track.setPointerCapture(e.pointerId); } catch {}
      track.addEventListener("pointermove", adjust);
      track.addEventListener("pointerup", stop);
      track.addEventListener("pointercancel", stop);
    }

    track.addEventListener("pointerdown", start);
  }

  function makeLevelTrackSlider({ value = 100, min = 1, max = 100, onChange }) {
    const track = ce("div", "level-track");
    const inner = ce("div", "level-track-inner");
    const dim = ce("div", "level-dim");
    const thumb = ce("div", "level-thumb");
    inner.appendChild(dim);
    track.appendChild(inner);
    track.appendChild(thumb);

    function clampLevel(level) {
      return Math.max(min, Math.min(max, Math.round(level)));
    }

    function setLevel(level) {
      const l = clampLevel(level);
      updateLevelTrackVisual(track, thumb, dim, l);
      return l;
    }

    setLevel(value);

    bindLevelTrackDrag(track, {
      canAdjust: () => true,
      levelFromEvent: (e) => clampLevel(levelFromTrackEvent(track, e)),
      onAdjust: (level) => { onChange(setLevel(level)); },
    });

    return { el: track, setValue: setLevel };
  }

  function updateCtTrackVisual(thumbEl, k) {
    const clamped = Math.max(CT_K_MIN, Math.min(CT_K_MAX, Math.round(k)));
    const pct = ((clamped - CT_K_MIN) / (CT_K_MAX - CT_K_MIN)) * 100;
    if (thumbEl) thumbEl.style.setProperty("--pct", String(pct));
    return clamped;
  }

  function bindCtTrackDrag(track, opts) {
    const { canAdjust, kFromEvent, onAdjust, onCommit, throttleMs = 0 } = opts;
    let lastCommit = 0;

    function adjust(e) {
      if (!canAdjust()) return;
      const k = kFromEvent(e);
      onAdjust(k);
      if (onCommit && throttleMs > 0) {
        const now = Date.now();
        if (now - lastCommit > throttleMs) {
          lastCommit = now;
          onCommit(k);
        }
      }
      e.preventDefault();
    }

    function stop(e) {
      track.removeEventListener("pointermove", adjust);
      track.removeEventListener("pointerup", stop);
      track.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) track.releasePointerCapture(e.pointerId); } catch {}
      if (canAdjust() && onCommit) onCommit(kFromEvent(e));
    }

    function start(e) {
      if (!canAdjust()) return;
      if (e.button != null && e.button !== 0) return;
      lastCommit = 0;
      adjust(e);
      try { track.setPointerCapture(e.pointerId); } catch {}
      track.addEventListener("pointermove", adjust);
      track.addEventListener("pointerup", stop);
      track.addEventListener("pointercancel", stop);
    }

    track.addEventListener("pointerdown", start);
  }

  function makeCtTrackSlider({ value = CT_K_DEFAULT, onChange }) {
    const track = ce("div", "ct-track");
    const thumb = ce("div", "ct-thumb");
    track.appendChild(thumb);

    function setK(k) {
      const clamped = updateCtTrackVisual(thumb, k);
      return clamped;
    }

    setK(value);

    bindCtTrackDrag(track, {
      canAdjust: () => true,
      kFromEvent: (e) => kFromEvent(track, e),
      onAdjust: (k) => { onChange(setK(k)); },
    });

    return { el: track, setValue: setK };
  }

  function attachLevelTrackDrag(track) {
    bindLevelTrackDrag(track, {
      canAdjust: () => colorSession && colorSession.tab === "level",
      levelFromEvent: (e) => levelFromTrackEvent(track, e),
      onAdjust: (level) => {
        colorSession.level = level;
        colorSession.changed = true;
        applyLevelChange(colorSession.id, level);
      },
      onCommit: (level) => {
        setLevelOptimistic(colorSession.id, level);
        sendCmd(colorSession.id, "setLevel", level);
      },
      throttleMs: 300,
    });
  }

  function attachRgbPresets(presetsEl) {
    presetsEl.addEventListener("click", (e) => {
      const sw = e.target.closest(".rgb-swatch");
      if (!sw || !colorSession) return;
      e.stopPropagation();
      const h = Number(sw.dataset.h);
      const s = Number(sw.dataset.s);
      colorSession.h = h;
      colorSession.s = s;
      colorSession.changed = true;
      applyRgbChange(colorSession.id, h, s);
      sendCmd(colorSession.id, "setColor", h + "," + s);
      ensureLightOn(colorSession.id);
    });
  }

  function attachRgbWheel(canvas, cursor) {
    let lastCommit = 0;
    const radius = RGB_WHEEL_SIZE / 2;

    function pick(e) {
      if (!colorSession || colorSession.tab !== "rgb") return;
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.width / rect.width;
      const x = (e.clientX - rect.left) * scale;
      const y = (e.clientY - rect.top) * scale;
      const { h, s } = posToHs(radius, radius, x, y, radius - 2);
      colorSession.h = h;
      colorSession.s = s;
      colorSession.changed = true;
      applyRgbChange(colorSession.id, h, s);
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        sendCmd(colorSession.id, "setColor", h + "," + s);
        ensureLightOn(colorSession.id);
      }
      e.preventDefault();
    }

    function stop(e) {
      canvas.removeEventListener("pointermove", pick);
      canvas.removeEventListener("pointerup", stop);
      canvas.removeEventListener("pointercancel", stop);
      try { if (e?.pointerId != null) canvas.releasePointerCapture(e.pointerId); } catch {}
      if (colorSession && colorSession.tab === "rgb") {
        sendCmd(colorSession.id, "setColor", colorSession.h + "," + colorSession.s);
      }
    }

    function start(e) {
      if (!colorSession || colorSession.tab !== "rgb") return;
      if (e.button != null && e.button !== 0) return;
      lastCommit = 0;
      pick(e);
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      canvas.addEventListener("pointermove", pick);
      canvas.addEventListener("pointerup", stop);
      canvas.addEventListener("pointercancel", stop);
    }

    canvas.addEventListener("pointerdown", start);
  }

  function ensureLightOn(id) {
    const dev = devices.find((d) => d.i === id);
    if (dev && !effectiveSwitch(dev)) {
      setSwitchOptimistic(id, 1);
      postCall("updateStates");
    }
  }

  function attachCtTrackDrag(track) {
    bindCtTrackDrag(track, {
      canAdjust: () => colorSession && colorSession.tab === "ct",
      kFromEvent: (e) => kFromEvent(track, e),
      onAdjust: (k) => {
        colorSession.k = k;
        colorSession.changed = true;
        applyCtChange(colorSession.id, k);
      },
      onCommit: (k) => {
        sendCmd(colorSession.id, "setCT", k);
        ensureLightOn(colorSession.id);
      },
      throttleMs: 300,
    });
  }

  function kToPct(k) {
    return ((k - CT_K_MIN) / (CT_K_MAX - CT_K_MIN)) * 100;
  }

  function pctToK(pct) {
    const k = Math.round(CT_K_MIN + (pct / 100) * (CT_K_MAX - CT_K_MIN));
    return Math.max(CT_K_MIN, Math.min(CT_K_MAX, k));
  }

  function kFromEvent(track, e) {
    return pctToK(trackPctFromEvent(track, e));
  }

  function setCtVisual(k) {
    const popup = ensureColorPopup();
    const pct = kToPct(k);
    popup._valueEl.textContent = k + "K";
    popup._thumbEl.style.setProperty("--pct", String(pct));
    popup.querySelectorAll(".ct-preset").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.k) === k);
    });
  }

  function setRgbVisual(h, s) {
    const popup = ensureColorPopup();
    popup._valueEl.textContent = hsToHex(h, s);
    const radius = RGB_WHEEL_SIZE / 2;
    const angle = (h / 100) * Math.PI * 2;
    const dist = (s / 100) * (radius - 8);
    const x = radius + Math.sin(angle) * dist;
    const y = radius - Math.cos(angle) * dist;
    popup._wheelCursor.style.left = x + "px";
    popup._wheelCursor.style.top = y + "px";
    popup._wheelCursor.style.background = hsToHex(h, s);
  }

  function setLevelVisual(level) {
    const popup = ensureColorPopup();
    const l = Math.max(0, Math.min(100, Math.round(level)));
    popup._valueEl.textContent = l + "%";
    updateLevelTrackVisual(popup._levelTrackEl, popup._levelThumbEl, popup._levelDimEl, l);
    popup.querySelectorAll(".level-preset").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.l) === l);
    });
  }

  function openColorPopup(id, anchorEl, dev, displayName, opts) {
    cancelAllSlideGestures();
    closeColorPopup(false);
    const name = dev.n || displayName || "Light";
    const hasCt = !!dev.ct;
    const hasRgb = !!dev.rgb;
    const hasLevel = !!dev.d;
    let tab = "level";
    const forcedTab = opts && opts.defaultTab;
    if (forcedTab === "level" || forcedTab === "ct" || forcedTab === "rgb") {
      tab = forcedTab;
    } else if (hasCt || hasRgb) {
      tab = "ct";
      if (hasRgb && !hasCt) tab = "rgb";
      else if (hasCt && hasRgb) {
        const cm = String(dev.cm || "").toUpperCase();
        tab = cm === "RGB" ? "rgb" : "ct";
      }
    }
    const k = dev.k != null ? Math.max(CT_K_MIN, Math.min(CT_K_MAX, Math.round(dev.k))) : CT_K_DEFAULT;
    const h = dev.h != null ? Math.max(0, Math.min(100, Math.round(dev.h))) : 0;
    const s = dev.sat != null ? Math.max(0, Math.min(100, Math.round(dev.sat))) : 100;
    const rawLevel = effectiveLevel(dev) ?? dev.l ?? 0;
    const level = Math.max(0, Math.min(100, Math.round(rawLevel)));
    colorSession = { id, anchorEl, name, tab, hasCt, hasRgb, hasLevel, k, h, s, level, changed: false };
    const popup = ensureColorPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ colorSession: colorSession, colorPopup: popup });
    updateColorPopupUI();
    if (tab !== "level") ensureLightOn(id);
  }

  function closeColorPopup(commit) {
    if (!colorSession) return;
    const { id, tab, k, h, s, level, changed } = colorSession;
    if (commit && changed) {
      const rec = devMap.get(id);
      if (tab === "ct") {
        sendCmd(id, "setCT", k);
        if (rec) { rec.data.k = k; rec.data.s = 1; postCall("updateStates"); }
      } else if (tab === "rgb") {
        sendCmd(id, "setColor", h + "," + s);
        if (rec) { rec.data.h = h; rec.data.sat = s; rec.data.s = 1; postCall("updateStates"); }
      } else if (tab === "level") {
        setLevelOptimistic(id, level);
        sendCmd(id, "setLevel", level);
        if (rec) {
          rec.data.l = level;
          rec.data.s = level > 0 ? 1 : 0;
          postCall("updateStates");
        }
      }
      postCall("reconcileDevice", id);
    }
    if (colorPopup) {
      colorPopup.setAttribute("hidden", "");
      colorPopup.classList.remove("open");
    }
    colorSession = null;
    publishMld({ colorSession: null, colorPopup: colorPopup });
  }

  function closeCtPopup(commit) { closeColorPopup(commit); }

  // =================== thermostat ===================

  function applyCentralTstatSelection(selectedIds) {
    if (!tstatSession?.central && !tstatSession?.roomGroup) return;
    const allIds = tstatSession.allIds || thermostats.map((t) => t.i);
    const ids = selectedIds.filter((id) => allIds.includes(id));
    tstatSession.ids = ids;
    if (tstatSession.central) {
      const selected = ids.map((id) => thermostats.find((t) => t.i === id)).filter(Boolean);
      tstatSession.centralTstat = buildCentralTstat(selected, tstatSession.unit);
    }
    updateTstatHeadExtras();
    renderTstatDial();
    renderTstatControls();
    syncCentralTstatTargetMenu();
  }

  function tstatTargetPickerEnabled() {
    return !!(tstatSession?.central || tstatSession?.roomGroup);
  }

  function updateCentralTstatTargetButton() {
    const btn = tstatPopup?._targetBtn;
    if (!btn) return;
    if (!tstatTargetPickerEnabled()) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const labelEl = btn.querySelector(".tstat-target-btn-label");
    const allCount = (tstatSession.allIds || []).length;
    const selCount = tstatSession.ids.length;
    let label;
    if (selCount === 0) label = "No thermostats selected";
    else if (selCount === allCount) {
      label = tstatSession.roomGroup
        ? ("All in room (" + allCount + ")")
        : ("All thermostats (" + allCount + ")");
    } else if (selCount === 1) {
      const t = thermostats.find((x) => x.i === tstatSession.ids[0]);
      label = t?.n || "1 thermostat";
    } else label = selCount + " of " + allCount + " thermostats";
    if (labelEl) labelEl.textContent = label;
    btn.setAttribute("aria-label", "Choose thermostats to control: " + label);
  }

  function updateTstatHeadExtras() {
    updateCentralTstatTargetButton();
    const favBtn = tstatPopup?._favBtn;
    if (!favBtn || !tstatSession?.ids?.length) return;
    if (tstatSession.ids.length !== 1 || !isFavoriteableDeviceId(tstatSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, tstatSession.ids[0]);
  }

  function updateTstatFavButton() {
    updateTstatHeadExtras();
  }

  function ensureTstatPopup() {
    if (tstatPopup) return tstatPopup;
    tstatPopup = ce("div", "tstat-popup");
    tstatPopup.hidden = true;
    tstatPopup.setAttribute("role", "dialog");
    tstatPopup.setAttribute("aria-modal", "true");
    tstatPopup.setAttribute("aria-label", "Thermostat");

    const panel = ce("div", "tstat-panel");
    const head = ce("div", "tstat-head");
    const leading = ce("div", "tstat-head-leading");
    const title = ce("div", "tstat-title");
    const targetBtn = ce("button", "tstat-target-btn");
    targetBtn.type = "button";
    targetBtn.hidden = true;
    targetBtn.setAttribute("aria-haspopup", "listbox");
    targetBtn.setAttribute("aria-expanded", "false");
    const targetLabel = ce("span", "tstat-target-btn-label");
    const targetCaret = ce("span", "tstat-target-btn-caret");
    targetCaret.setAttribute("aria-hidden", "true");
    targetCaret.textContent = "▾";
    targetBtn.appendChild(targetLabel);
    targetBtn.appendChild(targetCaret);
    targetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (centralTstatTargetMenu) closeCentralTstatTargetMenu();
      else openCentralTstatTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (tstatSession?.ids?.length !== 1) return;
      const id = tstatSession.ids[0];
      if (id == null || !isFavoriteableDeviceId(id)) return;
      hapticTap();
      postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "tstat-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close thermostat");
    closeBtn.textContent = "×";
    leading.appendChild(title);
    leading.appendChild(targetBtn);
    leading.appendChild(favBtn);
    head.appendChild(leading); head.appendChild(closeBtn);

    const dialWrap = ce("div", "tstat-dial-wrap");
    const svg = svgEl("svg", { viewBox: `0 0 ${TSTAT_DIAL_SIZE} ${TSTAT_DIAL_SIZE}`, class: "tstat-dial" });
    const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
    // static track
    svg.appendChild(svgEl("path", { class: "tstat-track", d: describeArc(cx, cy, TSTAT_DIAL_R, TSTAT_ANGLE_MIN, TSTAT_ANGLE_MAX) }));
    // tick marks
    const ticks = svgEl("g", { class: "tstat-ticks" });
    const unit = "F";
    const { min, max } = tstatRange(unit);
    for (let v = min; v <= max; v += 1) {
      const major = (v % 5 === 0);
      const a = valToAngle(v, unit);
      const inner = polar(cx, cy, TSTAT_DIAL_R - (major ? 14 : 8), a);
      const outer = polar(cx, cy, TSTAT_DIAL_R - 2, a);
      ticks.appendChild(svgEl("line", {
        x1: inner.x.toFixed(2), y1: inner.y.toFixed(2),
        x2: outer.x.toFixed(2), y2: outer.y.toFixed(2),
        class: major ? "tstat-tick major" : "tstat-tick"
      }));
    }
    svg.appendChild(ticks);
    const heatArc = svgEl("path", { class: "tstat-arc heat" });
    const coolArc = svgEl("path", { class: "tstat-arc cool" });
    svg.appendChild(heatArc); svg.appendChild(coolArc);
    const heatKnob = svgEl("circle", { class: "tstat-knob heat", r: 11 });
    const coolKnob = svgEl("circle", { class: "tstat-knob cool", r: 11 });
    svg.appendChild(heatKnob); svg.appendChild(coolKnob);

    const center = ce("div", "tstat-center");
    const curBlock = ce("div", "tstat-readout");
    const curLbl = ce("div", "tstat-readout-label");
    curLbl.textContent = "Currently:";
    const tempEl = ce("div", "tstat-temp");
    curBlock.appendChild(curLbl);
    curBlock.appendChild(tempEl);
    const spBlock = ce("div", "tstat-readout");
    const spLbl = ce("div", "tstat-readout-label");
    spLbl.textContent = "Setpoint:";
    const spEl = ce("div", "tstat-sp");
    spBlock.appendChild(spLbl);
    spBlock.appendChild(spEl);
    center.appendChild(curBlock);
    center.appendChild(spBlock);

    function dialStepPos(angleDeg) {
      const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
      const outerR = TSTAT_DIAL_R + 30;
      const p = polar(cx, cy, outerR, angleDeg);
      const downNudge = 14;
      return {
        left: ((p.x / TSTAT_DIAL_SIZE) * 100).toFixed(2) + "%",
        top: (((p.y + downNudge) / TSTAT_DIAL_SIZE) * 100).toFixed(2) + "%",
      };
    }

    const minusBtn = ce("button", "tstat-step-btn tstat-step-minus");
    minusBtn.type = "button";
    minusBtn.textContent = "−";
    minusBtn.setAttribute("aria-label", "Decrease setpoint by 1 degree");
    const minusPos = dialStepPos(-132);
    minusBtn.style.left = minusPos.left;
    minusBtn.style.top = minusPos.top;
    let stepBusy = false;
    function onStep(delta, e) {
      e.stopPropagation();
      e.preventDefault();
      if (stepBusy) return;
      stepBusy = true;
      adjustTstatSetpoint(delta);
      setTimeout(() => { stepBusy = false; }, 300);
    }
    minusBtn.addEventListener("click", (e) => onStep(-1, e));
    minusBtn.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      onStep(-1, e);
    });

    const plusBtn = ce("button", "tstat-step-btn tstat-step-plus");
    plusBtn.type = "button";
    plusBtn.textContent = "+";
    plusBtn.setAttribute("aria-label", "Increase setpoint by 1 degree");
    const plusPos = dialStepPos(132);
    plusBtn.style.left = plusPos.left;
    plusBtn.style.top = plusPos.top;
    plusBtn.addEventListener("click", (e) => onStep(1, e));
    plusBtn.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      onStep(1, e);
    });

    dialWrap.appendChild(svg);
    dialWrap.appendChild(minusBtn);
    dialWrap.appendChild(plusBtn);
    dialWrap.appendChild(center);
    attachTstatDialDrag(svg);

    const chips = ce("div", "tstat-chips");
    const heatChip = ce("button", "tstat-chip heat"); heatChip.type = "button"; heatChip.textContent = "Heat";
    heatChip.addEventListener("click", (e) => { e.stopPropagation(); if (tstatSession) { tstatSession.edit = "heat"; renderTstatDial(); } });
    const coolChip = ce("button", "tstat-chip cool"); coolChip.type = "button"; coolChip.textContent = "Cool";
    coolChip.addEventListener("click", (e) => { e.stopPropagation(); if (tstatSession) { tstatSession.edit = "cool"; renderTstatDial(); } });
    chips.appendChild(heatChip); chips.appendChild(coolChip);

    const modeSection = ce("div", "tstat-section");
    modeSection.appendChild(tstatSectionLabel("Thermostat mode"));
    const modes = ce("div", "tstat-modes");
    modeSection.appendChild(modes);

    const fanModeSection = ce("div", "tstat-section");
    fanModeSection.appendChild(tstatSectionLabel("Fan mode"));
    const fanModes = ce("div", "tstat-modes");
    const fanModeBtns = {};
    for (const fm of FAN_MODE_OPTS) {
      const b = ce("button", "tstat-mode");
      b.type = "button";
      b.textContent = fm.label;
      b.dataset.fanKey = fm.key;
      b.setAttribute("aria-label", fm.aria);
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setFanMode(fm.key); });
      fanModes.appendChild(b);
      fanModeBtns[fm.key] = b;
    }
    fanModeSection.appendChild(fanModes);

    const fanSpeedSection = ce("div", "tstat-section");
    fanSpeedSection.appendChild(tstatSectionLabel("Fan speed"));
    const fanSpeeds = ce("div", "tstat-modes");
    const fanSpeedBtns = {};
    for (const lv of FAN_SPEED_OPTS) {
      const b = ce("button", "tstat-mode");
      b.type = "button";
      b.textContent = lv.label;
      b.dataset.speedKey = lv.key;
      b.setAttribute("aria-label", lv.aria);
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setFanSpeed(lv.key); });
      fanSpeeds.appendChild(b);
      fanSpeedBtns[lv.key] = b;
    }
    fanSpeedSection.appendChild(fanSpeeds);

    const comfortFanSection = ce("div", "tstat-section");
    comfortFanSection.style.display = "none";
    comfortFanSection.appendChild(tstatSectionLabel("Fan speed"));
    const comfortFans = ce("div", "tstat-modes");
    comfortFanSection.appendChild(comfortFans);

    const vaneSection = ce("div", "tstat-section");
    vaneSection.style.display = "none";
    vaneSection.appendChild(tstatSectionLabel("Vane position"));
    const vanes = ce("div", "tstat-modes");
    vaneSection.appendChild(vanes);

    panel.appendChild(head);
    panel.appendChild(dialWrap);
    panel.appendChild(chips);
    panel.appendChild(modeSection);
    panel.appendChild(fanModeSection);
    panel.appendChild(fanSpeedSection);
    panel.appendChild(comfortFanSection);
    panel.appendChild(vaneSection);
    tstatPopup.appendChild(panel);
    appendPopup(tstatPopup);

    bindPopupDismiss(tstatPopup, panel, closeBtn, closeTstatPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !tstatSession) return;
      if (centralTstatTargetMenu) { closeCentralTstatTargetMenu(); return; }
      closeTstatPopup();
    });

    tstatPopup._panel = panel;
    tstatPopup._title = title;
    tstatPopup._targetBtn = targetBtn;
    tstatPopup._favBtn = favBtn;
    tstatPopup._svg = svg;
    tstatPopup._heatArc = heatArc;
    tstatPopup._coolArc = coolArc;
    tstatPopup._heatKnob = heatKnob;
    tstatPopup._coolKnob = coolKnob;
    tstatPopup._tempEl = tempEl;
    tstatPopup._spEl = spEl;
    tstatPopup._minusBtn = minusBtn;
    tstatPopup._plusBtn = plusBtn;
    tstatPopup._chips = chips;
    tstatPopup._heatChip = heatChip;
    tstatPopup._coolChip = coolChip;
    tstatPopup._modeSection = modeSection;
    tstatPopup._modes = modes;
    tstatPopup._modeBtns = {};
    tstatPopup._fanModeSection = fanModeSection;
    tstatPopup._fanModes = fanModes;
    tstatPopup._fanModeBtns = fanModeBtns;
    tstatPopup._fanSpeedSection = fanSpeedSection;
    tstatPopup._fanSpeeds = fanSpeeds;
    tstatPopup._fanSpeedBtns = fanSpeedBtns;
    tstatPopup._comfortFanSection = comfortFanSection;
    tstatPopup._comfortFans = comfortFans;
    tstatPopup._vaneSection = vaneSection;
    tstatPopup._vanes = vanes;
    publishMld({ tstatPopup: tstatPopup });
    return tstatPopup;
  }

  function activeTstat() {
    if (!tstatSession) return null;
    // Mode/fan caps always come from one real device when exactly one is selected.
    if (tstatSession.ids?.length === 1) {
      return thermostats.find((x) => x.i === tstatSession.ids[0]) || null;
    }
    if (tstatSession.central) return tstatSession.centralTstat;
    if (!tstatSession.ids?.length) return null;
    return thermostats.find((x) => x.i === tstatSession.ids[0]) || null;
  }

  function tstatSetpointTarget(t) {
    if (!t || !tstatSession) return null;
    const tm = String(t.tm || "").toLowerCase();
    if (tstatSession?.central && !tm) return null;
    if (tm === "off" || tm === "fan") return null;
    return (tstatSession.edit === "cool" && tm === "auto") || tm === "cool" || tm === "dry" ? "cool" : "heat";
  }

  async function commitTstatSetpoint(ids, target, val, { haptic = true } = {}) {
    const patch = target === "heat" ? { hsp: val } : { csp: val };
    const cmd = target === "heat" ? "setHeat" : "setCool";
    for (const id of ids) setSetpointOptimistic(id, patch);
    if (haptic) hapticTap();
    renderTstatDial();
    updateClimateWidgets();
    refreshOpenTstatQuickPopups();
    const results = await Promise.all(ids.map((id) => sendCmd(id, cmd, val)));
    if (results.some((r) => !r?.ok)) {
      for (const id of ids) clearSetpointOptimistic(id);
      renderTstatDial();
      updateClimateWidgets();
      refreshOpenTstatQuickPopups();
      for (const id of ids) reconcileTstat(id);
      return false;
    }
    for (const id of ids) reconcileTstat(id);
    return true;
  }

  function adjustTstatSetpoint(delta) {
    if (!tstatSession?.ids?.length) return;
    const t = activeTstat();
    if (!t) return;
    const target = tstatSetpointTarget(t);
    if (!target) return;
    const unit = tstatSession.unit;
    const field = target === "heat" ? "hsp" : "csp";
    const cur = Number(t[field]);
    const base = Number.isFinite(cur) ? cur : (target === "heat" ? 70 : 74);
    const val = clampSetpoint(base + delta, unit);
    if (tstatSession.central) t[field] = val;
    commitTstatSetpoint(tstatSession.ids, target, val);
  }

  function renderTstatDial() {
    if (!tstatSession) return;
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const unit = tstatSession.unit;
    const cx = TSTAT_DIAL_SIZE / 2, cy = TSTAT_DIAL_SIZE / 2;
    const tm = String(t.tm || "").toLowerCase();
    const deg = tstatTempSuffix(unit);
    const tempVal = t.temp != null ? Math.round(Number(t.temp)) : null;

    popup._tempEl.textContent = tempVal != null ? (tempVal + deg) : "—";
    if (tstatTargetPickerEnabled() && tstatSession.ids?.length !== 1) {
      popup._title.textContent = (tstatSession.ids?.length || 0) + " thermostats";
    } else {
      popup._title.textContent = t.n || "Thermostat";
    }

    const showHeat = (tm === "heat" || tm === "auto" || tm === "emergency heat");
    const showCool = (tm === "cool" || tm === "auto" || tm === "dry");
    const editHeat = tm === "heat" || tm === "emergency heat"
      || (tm === "auto" && tstatSession.edit !== "cool");

    const hsp = t.hsp != null ? Number(t.hsp) : null;
    const csp = t.csp != null ? Number(t.csp) : null;

    // heat arc
    if (showHeat && hsp != null) {
      popup._heatArc.setAttribute("d", describeArc(cx, cy, TSTAT_DIAL_R, TSTAT_ANGLE_MIN, valToAngle(hsp, unit)));
      const kp = polar(cx, cy, TSTAT_DIAL_R, valToAngle(hsp, unit));
      popup._heatKnob.setAttribute("cx", kp.x.toFixed(2));
      popup._heatKnob.setAttribute("cy", kp.y.toFixed(2));
      popup._heatKnob.setAttribute("data-active", editHeat ? "1" : "0");
    } else {
      popup._heatArc.setAttribute("d", "");
      popup._heatKnob.setAttribute("cx", -100);
    }
    // cool arc
    if (showCool && csp != null) {
      popup._coolArc.setAttribute("d", describeArc(cx, cy, TSTAT_DIAL_R, TSTAT_ANGLE_MIN, valToAngle(csp, unit)));
      const kp = polar(cx, cy, TSTAT_DIAL_R, valToAngle(csp, unit));
      popup._coolKnob.setAttribute("cx", kp.x.toFixed(2));
      popup._coolKnob.setAttribute("cy", kp.y.toFixed(2));
      popup._coolKnob.setAttribute("data-active", !editHeat ? "1" : "0");
    } else {
      popup._coolArc.setAttribute("d", "");
      popup._coolKnob.setAttribute("cx", -100);
    }

    // setpoint readout
    let spText;
    if (tm === "off") spText = "Off";
    else if (tm === "fan") spText = "Fan";
    else if (tm === "heat" || tm === "emergency heat") spText = hsp != null ? hsp + deg : "—";
    else if (tm === "cool" || tm === "dry") spText = csp != null ? csp + deg : "—";
    else if (tm === "auto") spText = (editHeat ? hsp : csp) != null ? (editHeat ? hsp : csp) + deg : "—";
    else spText = "—";
    popup._spEl.textContent = spText;

    // chips only in auto
    popup._chips.style.display = (tm === "auto") ? "" : "none";
    popup._heatChip.classList.toggle("active", editHeat);
    popup._coolChip.classList.toggle("active", !editHeat);

    // disabled look when off or none selected for bulk
    const noneSelected = !!(tstatTargetPickerEnabled() && !tstatSession.ids?.length);
    popup._svg.classList.toggle("disabled", tm === "off" || tm === "fan" || noneSelected);
    const noMode = !!(tstatSession?.roomGroup && tstatSession.ids?.length !== 1)
      || !!(tstatSession?.central && !tm);
    const canAdjust = tm !== "off" && tm !== "fan" && !noMode && !noneSelected;
    if (popup._minusBtn) popup._minusBtn.disabled = !canAdjust;
    if (popup._plusBtn) popup._plusBtn.disabled = !canAdjust;
  }

  function renderTstatModeButtons(popup, supported, tm, noneSelected) {
    const modes = popup._modes;
    modes.replaceChildren();
    popup._modeBtns = {};
    for (const key of supported) {
      const k = String(key).toLowerCase();
      const b = ce("button", "tstat-mode");
      if (k === "off") b.classList.add("off");
      b.type = "button";
      b.dataset.modeKey = k;
      if (k === "off") {
        b.setAttribute("aria-label", "Turn thermostat off");
        b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9"/><path d="M7.5 5.5a7 7 0 1 0 9 0"/></svg>';
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setTstatMode("off", "off"); });
      } else {
        const def = TSTAT_MODE_DEFS.find((m) => m.key === k);
        const { cmd } = modeCmdForKey(k);
        const label = def ? def.label : tstatModeDisplayLabel(k);
        b.textContent = label;
        b.setAttribute("aria-label", "Set thermostat to " + label);
        b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); setTstatMode(cmd, k); });
      }
      b.classList.toggle("active", tm === k);
      b.disabled = noneSelected;
      modes.appendChild(b);
      popup._modeBtns[k] = b;
    }
  }

  function renderTstatChoiceRow(container, keys, lookupOpts, active, noneSelected, onPick) {
    container.replaceChildren();
    const btns = {};
    for (const key of keys) {
      const k = String(key).toLowerCase();
      const def = lookupOpts.find((o) => o.key === k);
      const label = def ? def.label : tstatChoiceLabel(lookupOpts, k);
      const b = ce("button", "tstat-mode");
      b.type = "button";
      b.textContent = label;
      b.dataset.choiceKey = k;
      b.setAttribute("aria-label", def ? def.aria : ("Set " + label));
      b.classList.toggle("active", active === k);
      b.disabled = noneSelected;
      b.addEventListener("click", (e) => { e.stopPropagation(); e.preventDefault(); onPick(k); });
      container.appendChild(b);
      btns[k] = b;
    }
    return btns;
  }

  function renderTstatControls() {
    if (!tstatSession) return;
    const popup = ensureTstatPopup();
    const t = activeTstat();
    if (!t) return;
    const noneSelected = !!(tstatTargetPickerEnabled() && !tstatSession.ids?.length);
    // Room groups with multiple targets: setpoints only — caps come from one device.
    // All-thermostats bulk: show union mode/fan controls even when many are selected.
    const roomMultiTarget = !!(tstatSession?.roomGroup && tstatSession.ids?.length !== 1);
    if (roomMultiTarget) {
      popup._modeSection.style.display = "none";
      popup._fanModeSection.style.display = "none";
      popup._fanSpeedSection.style.display = "none";
      popup._comfortFanSection.style.display = "none";
      popup._vaneSection.style.display = "none";
      return;
    }
    const supM = tstatControlModes(t);
    const tm = String(t.tm || "").toLowerCase();
    renderTstatModeButtons(popup, supM, tm, noneSelected);
    popup._modeSection.style.display = supM.length ? "" : "none";

    const useComfortFan = deviceHasComfortFan(t);
    if (useComfortFan) {
      popup._fanModeSection.style.display = "none";
      popup._fanSpeedSection.style.display = "none";
      const speeds = comfortFanSpeeds(t);
      renderTstatChoiceRow(popup._comfortFans, speeds, COMFORT_FAN_SPEED_OPTS, comfortFanValue(t), noneSelected, setComfortFanSpeed);
      popup._comfortFanSection.style.display = speeds.length ? "" : "none";
    } else {
      popup._comfortFanSection.style.display = "none";
      if (t.hasFm) {
        const supported = supportedFanModes(t);
        const fmVal = String(t.fm || "").toLowerCase();
        let fanCount = 0;
        for (const [key, btn] of Object.entries(popup._fanModeBtns)) {
          const show = supported.includes(key);
          btn.hidden = !show;
          if (show) fanCount++;
          btn.classList.toggle("active", fmVal === key);
          btn.disabled = noneSelected;
        }
        popup._fanModeSection.style.display = fanCount ? "" : "none";
      } else {
        popup._fanModeSection.style.display = "none";
      }

      if (showFanSpeedControls(t)) {
        const levels = supportedFanSpeeds(t);
        const fsVal = String(t.fs || "").toLowerCase();
        let speedCount = 0;
        for (const [key, btn] of Object.entries(popup._fanSpeedBtns)) {
          const show = levels.includes(key);
          btn.hidden = !show;
          if (show) speedCount++;
          btn.classList.toggle("active", fsVal === key);
          btn.disabled = noneSelected;
        }
        popup._fanSpeedSection.style.display = speedCount ? "" : "none";
      } else {
        popup._fanSpeedSection.style.display = "none";
      }
    }

    if (deviceHasVane(t)) {
      const positions = supportedVanePositions(t);
      renderTstatChoiceRow(popup._vanes, positions, VANE_POSITION_OPTS, String(t.vp || "").toLowerCase(), noneSelected, setVanePosition);
      popup._vaneSection.style.display = positions.length ? "" : "none";
    } else {
      popup._vaneSection.style.display = "none";
    }
  }

  function attachTstatDialDrag(svg) {
    let dragging = false;
    let lastCommit = 0;

    function angleFromEvent(e) {
      const rect = svg.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const px = e.clientX != null ? e.clientX : 0;
      const py = e.clientY != null ? e.clientY : 0;
      let a = Math.atan2(px - cx, cy - py) * 180 / Math.PI; // 0 at top, clockwise
      // normalize to [-180,180]; clamp to dial range
      if (a < TSTAT_ANGLE_MIN) a = TSTAT_ANGLE_MIN;
      if (a > TSTAT_ANGLE_MAX) a = TSTAT_ANGLE_MAX;
      return a;
    }

    function apply(e) {
      const t = activeTstat();
      if (!t || !tstatSession || !tstatSession.ids?.length) return;
      const unit = tstatSession.unit;
      const tm = String(t.tm || "").toLowerCase();
      if (tm === "off") return;
      const val = angleToVal(angleFromEvent(e), unit);
      const editing = (tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
      const patch = editing === "heat" ? { hsp: clampSetpoint(val, unit) } : { csp: clampSetpoint(val, unit) };
      if (editing === "heat") t.hsp = patch.hsp;
      else t.csp = patch.csp;
      for (const id of tstatSession.ids) setSetpointOptimistic(id, patch);
      renderTstatDial();
      const now = Date.now();
      if (now - lastCommit > 300) {
        lastCommit = now;
        const cmd = editing === "heat" ? "setHeat" : "setCool";
        const sendVal = editing === "heat" ? patch.hsp : patch.csp;
        for (const id of tstatSession.ids) sendCmd(id, cmd, sendVal);
      }
      e.preventDefault();
    }

    function end() {
      dragging = false;
      svg.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      const t = activeTstat();
      if (t && tstatSession) {
        const tm = String(t.tm || "").toLowerCase();
        if (tm !== "off") {
          const editing = (tstatSession.edit === "cool" && tm === "auto") || tm === "cool" ? "cool" : "heat";
          const val = editing === "heat" ? t.hsp : t.csp;
          commitTstatSetpoint(tstatSession.ids, editing, val, { haptic: false });
        }
      }
    }
    function move(e) { if (dragging) apply(e); }
    function start(e) {
      const t = activeTstat();
      if (!t || !tstatSession || !tstatSession.ids?.length) return;
      if (String(t.tm || "").toLowerCase() === "off") return;
      if (tstatSession?.central && !String(t.tm || "")) return;
      if (e.button != null && e.button !== 0) return;
      dragging = true;
      svg.classList.add("dragging");
      lastCommit = 0;
      apply(e);
      try { svg.setPointerCapture(e.pointerId); } catch {}
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    svg.addEventListener("pointerdown", start);
  }

  function tstatModeLocked(id) {
    const devLock = tstatDeviceModeLock.get(Number(id));
    if (devLock?.until > Date.now()) return true;
    return !!(tstatSession?.modeLockUntil > Date.now() && tstatSession.ids?.includes(Number(id)));
  }

  function tstatFanModeLocked(id) {
    const devLock = tstatFanModeLock.get(Number(id));
    return !!(devLock?.until > Date.now());
  }

  function reapplyTstatDeviceModeLocks() {
    const now = Date.now();
    for (const [id, lock] of tstatDeviceModeLock) {
      if (lock.until <= now) {
        tstatDeviceModeLock.delete(id);
        continue;
      }
      const t = thermostats.find(x => x.i === id);
      if (t) t.tm = lock.mode;
    }
  }

  function reapplyTstatFanModeLocks() {
    const now = Date.now();
    for (const [id, lock] of tstatFanModeLock) {
      if (lock.until <= now) {
        tstatFanModeLock.delete(id);
        continue;
      }
      const t = thermostats.find(x => x.i === id);
      if (t) {
        t.fm = lock.mode;
        if (t.hasCfs) t.cfs = lock.mode;
      }
    }
  }

  function tstatVaneLocked(id) {
    const devLock = tstatVaneLock.get(Number(id));
    return !!(devLock?.until > Date.now());
  }

  function reapplyTstatVaneLocks() {
    const now = Date.now();
    for (const [id, lock] of tstatVaneLock) {
      if (lock.until <= now) {
        tstatVaneLock.delete(id);
        continue;
      }
      const t = thermostats.find(x => x.i === id);
      if (t) t.vp = lock.position;
    }
  }

  function tstatModeDisplayLabel(tm) {
    const m = String(tm || "").toLowerCase();
    if (m === "heat" || m === "emergency heat" || m === "emergencyheat") return "Heat";
    if (m === "cool") return "Cool";
    if (m === "auto") return "Auto";
    if (m === "off") return "Off";
    if (m === "dry") return "Dry";
    if (m === "fan") return "Fan";
    return tm || "—";
  }

  let tstatModeLabelRo = null;

  function fitTstatModeLabel(btn) {
    const label = btn && btn.querySelector(".quick-fav-ctl-mode-label");
    if (!label) return;
    label.style.fontSize = "";
    if (!btn.clientWidth) return;
    const caret = btn.querySelector(".quick-fav-ctl-mode-caret");
    const cs = getComputedStyle(btn);
    let avail = btn.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (caret) avail -= caret.offsetWidth + (parseFloat(cs.columnGap || cs.gap) || 0);
    if (avail < 8) return;
    const textW = () => {
      const r = document.createRange();
      r.selectNodeContents(label);
      return r.getBoundingClientRect().width;
    };
    let px = 13;
    while (px > 8 && textW() > avail) {
      px -= 0.5;
      label.style.fontSize = px + "px";
    }
  }

  function scheduleFitTstatModeLabel(btn) {
    requestAnimationFrame(() => fitTstatModeLabel(btn));
    if (typeof ResizeObserver === "undefined") return;
    if (!tstatModeLabelRo) {
      tstatModeLabelRo = new ResizeObserver((entries) => {
        for (const e of entries) {
          if (!e.target.isConnected) tstatModeLabelRo.unobserve(e.target);
          else fitTstatModeLabel(e.target);
        }
      });
    }
    tstatModeLabelRo.observe(btn);
  }

  // Compact favorites: ring accent from operating state (mode off → muted).
  function favoriteTstatCompactStateClass(t) {
    const tm = String(t?.tm || "").toLowerCase();
    if (tm === "off") return "state-off";
    if (tm === "fan") return "state-fan";
    if (tm === "dry") return "state-cool";
    const os = String(t?.os || "").toLowerCase();
    if (os === "heating" || os === "pending heat") return "state-heat";
    if (os === "cooling" || os === "pending cool") return "state-cool";
    if (os === "fan" || os === "fan only") return "state-fan";
    if (t?.hasFm && fanModeActive(t.fm)) return "state-fan";
    return "state-off";
  }

  function syncFavoriteTstatCompactState(card, t) {
    const next = favoriteTstatCompactStateClass(t);
    for (const cls of ["state-heat", "state-cool", "state-fan", "state-off"]) {
      card.classList.toggle(cls, cls === next);
    }
  }

  function openFavoriteTstatPopup(t, anchor) {
    hapticTap();
    openTstatPopupForDevice(t.i, anchor || null);
  }

  // Compact favorites: whole-tile tap opens the thermostat popup.
  function attachTstatTap(card, t) {
    const TAP_MOVE = 10;
    const TAP_MAX_MS = 500;
    let downX = 0, downY = 0, downT = 0, active = false;

    card.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (!card.classList.contains("fav-size-compact")) return;
      if (e.target.closest(".quick-fav-tstat-controls")) return;
      if (e.target.closest(".quick-fav-ctl")) return;
      active = true;
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });

    card.addEventListener("pointerup", (e) => {
      if (!active) return;
      active = false;
      if (!card.classList.contains("fav-size-compact")) return;
      if (e.target.closest(".quick-fav-tstat-controls")) return;
      if (e.target.closest(".quick-fav-ctl")) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > TAP_MOVE || dy > TAP_MOVE) return;
      if (Date.now() - downT > TAP_MAX_MS) return;
      openFavoriteTstatPopup(t, card);
    }, { passive: true });

    card.addEventListener("pointercancel", () => { active = false; }, { passive: true });
  }

  function makeFavoriteTstatCompactDial(currentTemp) {
    const dial = ce("div", "quick-fav-tstat-dial");
    const svg = svgEl("svg", {
      viewBox: "0 0 48 48",
      class: "quick-fav-tstat-ring",
      "aria-hidden": "true",
    });
    svg.appendChild(svgEl("circle", {
      class: "quick-fav-tstat-ring-track",
      cx: "24", cy: "24", r: "20",
      fill: "none",
    }));
    dial.appendChild(svg);
    const temp = ce("span", "quick-fav-tstat-dial-temp");
    temp.textContent = currentTemp;
    dial.appendChild(temp);
    return { dial, temp };
  }

  function favoriteTstatTarget(t) {
    const tm = String(t?.tm || "").toLowerCase();
    if (tm === "off") return null;
    if (tm === "fan") return null;
    if (tm === "cool" || tm === "dry") return "cool";
    if (tm === "heat" || tm === "emergency heat") return "heat";
    if (tm === "auto") {
      const os = String(t?.os || "").toLowerCase();
      if (os === "cooling" || os === "pending cool") return "cool";
      return "heat";
    }
    return "heat";
  }

  function favoriteTstatTemps(t) {
    const unit = normalizeTstatUnit(t.u);
    const deg = "°" + unit;
    const current = t.temp != null ? Math.round(t.temp) + deg : "—";
    const tm = String(t?.tm || "").toLowerCase();
    if (tm === "off") return { current, setpoint: "Off", value: "Off", unit: "", tone: "off" };
    const target = favoriteTstatTarget(t);
    if (!target) return { current, setpoint: "—", value: "—", unit: "", tone: "off" };
    const sp = target === "heat" ? t.hsp : t.csp;
    if (sp == null) return { current, setpoint: "—", value: "—", unit: "", tone: target };
    const value = String(Math.round(Number(sp)));
    return { current, setpoint: value + deg, value, unit: deg, tone: target };
  }

  function paintTstatSetpoint(el, temps) {
    el.className = "quick-fav-tstat-sp " + temps.tone;
    el.replaceChildren();
    el.appendChild(document.createTextNode(temps.value));
    if (temps.unit) {
      const unitEl = ce("span", "quick-fav-tstat-unit");
      unitEl.textContent = temps.unit;
      el.appendChild(unitEl);
    }
  }

  function favoriteTstatState(t) {
    const unit = normalizeTstatUnit(t.u);
    const deg = "°" + unit;
    const tm = String(t?.tm || "").toLowerCase();
    const os = String(t?.os || "").toLowerCase();
    const now = t.temp != null ? Math.round(t.temp) + deg : "—";
    let prefix = "Now ";
    let active = false;
    if (tm === "off") prefix = "Off · now ";
    else if (tm === "fan") { prefix = "Fan · now "; active = true; }
    else if (tm === "dry") {
      prefix = "Dry · now ";
      active = os === "cooling" || os === "pending cool";
    } else if (os === "heating" || os === "pending heat") { prefix = "Heating · now "; active = true; }
    else if (os === "cooling" || os === "pending cool") { prefix = "Cooling · now "; active = true; }
    else if (os === "fan" || os === "fan only") { prefix = "Fan · now "; active = true; }
    return { prefix, now, active, label: prefix + now };
  }

  function paintTstatStateTxt(el, info) {
    el.replaceChildren();
    el.appendChild(document.createTextNode(info.prefix));
    const nowEl = ce("span", "quick-fav-tstat-now");
    nowEl.textContent = info.now;
    el.appendChild(nowEl);
  }

  function modeCmdForKey(key) {
    const k = String(key).toLowerCase();
    const def = TSTAT_MODE_DEFS.find(m => m.key === k);
    if (def) return { cmd: def.cmd, key: k };
    if (k === "off") return { cmd: "off", key: k };
    return { cmd: "setMode", key: k };
  }

  function applyTstatModeOptimistic(ids, key) {
    for (const id of ids) {
      const t = thermostats.find(x => x.i === id);
      if (!t) continue;
      t.tm = key;
      if (key === "heat") t.os = "heating";
      else if (key === "cool" || key === "dry") t.os = "cooling";
      else if (key === "off") t.os = "idle";
      else if (key === "auto") t.os = "idle";
      else if (key === "fan") t.os = "fan";
      tstatDeviceModeLock.set(id, { until: Date.now() + 4000, mode: key });
    }
    refreshOpenTstatQuickPopups();
  }

  function applyTstatFanModeOptimistic(ids, fm) {
    const key = String(fm || "").toLowerCase();
    for (const id of ids) {
      const t = thermostats.find(x => x.i === id);
      if (!t || !(t.hasFm || deviceHasComfortFan(t))) continue;
      t.fm = key;
      if (t.hasCfs) t.cfs = key;
      const tm = String(t.tm || "").toLowerCase();
      if (tm === "off") {
        if (key === "on" || key === "circulate") t.os = "fan";
        else if (key === "auto") t.os = "idle";
      }
      tstatFanModeLock.set(id, { until: Date.now() + LEVEL_OPTIMISTIC_MS, mode: key });
    }
    refreshOpenTstatQuickPopups();
  }

  function sendTstatModeCmd(id, cmd, key) {
    const t = thermostats.find((x) => x.i === id);
    if (t?.hasCm && (cmd === "setMode" || cmd === "setComfortMode")) {
      return sendCmd(id, "setComfortMode", key);
    }
    if (cmd === "setMode") return sendCmd(id, cmd, key);
    return sendCmd(id, cmd);
  }

  function adjustFavoriteTstat(id, delta) {
    const t = thermostats.find(x => x.i === id);
    if (!t) return;
    const target = favoriteTstatTarget(t);
    if (!target) return;
    const unit = normalizeTstatUnit(t.u);
    const field = target === "heat" ? "hsp" : "csp";
    const cur = Number(t[field]);
    const base = Number.isFinite(cur) ? cur : (target === "heat" ? 70 : 74);
    const val = clampSetpoint(base + delta, unit);
    commitTstatSetpoint([id], target, val);
  }

  function refreshOpenTstatQuickPopups() {
    postCall("refreshFavoritesPopup");
    postCall("refreshThermostatsPopup");
  }

  function closeFavoriteTstatModeMenu() {
    if (favTstatModeMenuCleanup) {
      favTstatModeMenuCleanup();
      favTstatModeMenuCleanup = null;
    }
    if (favTstatModeMenu) {
      favTstatModeMenu.remove();
      favTstatModeMenu = null;
    }
    favTstatModeMenuId = null;
    favTstatModeMenuAnchor = null;
  }

  function repositionFavoriteTstatModeMenu() {
    const menu = favTstatModeMenu;
    if (!menu) return;
    let anchorBtn = favTstatModeMenuAnchor;
    if (!anchorBtn?.isConnected && favTstatModeMenuId != null) {
      anchorBtn = favTstatMap.get(favTstatModeMenuId)?.modeBtn
        || tstatsPopupMap.get(favTstatModeMenuId)?.modeBtn || null;
      favTstatModeMenuAnchor = anchorBtn;
    }
    if (!anchorBtn) return;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let top = rect.top - menuH - 6;
    if (top < 8) top = rect.bottom + 6;
    let left = rect.left + rect.width / 2 - menuW / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function syncFavoriteTstatModeMenu(t) {
    if (!favTstatModeMenu) return;
    const current = String(t?.tm || "").toLowerCase();
    for (const b of favTstatModeMenu.querySelectorAll(".quick-fav-mode-opt")) {
      const key = b.dataset.modeKey;
      const active = key === current;
      b.classList.toggle("active", active);
      if (active) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function applyFavoriteTstatMode(id, key) {
    const { cmd } = modeCmdForKey(key);
    hapticTap();
    closeFavoriteTstatModeMenu();
    applyTstatModeOptimistic([id], key);
    if (tstatSession?.ids?.includes(id)) {
      tstatSession.modeLockUntil = Date.now() + 4000;
      tstatSession.lockedMode = key;
      renderTstatDial();
      renderTstatControls();
    }
    updateClimateWidgets();
    sendTstatModeCmd(id, cmd, key);
    reconcileTstat(id);
  }

  function openFavoriteTstatModeMenu(anchorBtn, tstatId) {
    closeFavoriteTstatModeMenu();
    const t = thermostats.find(x => x.i === tstatId);
    if (!t) return;
    const modes = supportedModes(t);
    if (!modes.length) return;

    const menu = ce("div", "quick-fav-mode-menu");
    menu.setAttribute("role", "listbox");
    const current = String(t.tm || "").toLowerCase();

    for (const m of modes) {
      const key = String(m).toLowerCase();
      const b = ce("button", "tstat-mode quick-fav-mode-opt");
      if (key === "off") b.classList.add("off");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset.modeKey = key;
      b.textContent = tstatModeDisplayLabel(key);
      if (key === current) {
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (key === current) { closeFavoriteTstatModeMenu(); return; }
        applyFavoriteTstatMode(tstatId, key);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    favTstatModeMenu = menu;
    favTstatModeMenuId = tstatId;
    favTstatModeMenuAnchor = anchorBtn;

    repositionFavoriteTstatModeMenu();

    anchorBtn.setAttribute("aria-expanded", "true");

    const onOutside = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      closeFavoriteTstatModeMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeFavoriteTstatModeMenu();
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    favTstatModeMenuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      favTstatModeMenuAnchor = null;
    };
  }

  function closeCentralTstatTargetMenu() {
    if (centralTstatTargetMenuCleanup) {
      centralTstatTargetMenuCleanup();
      centralTstatTargetMenuCleanup = null;
    }
    if (centralTstatTargetMenu) {
      centralTstatTargetMenu.remove();
      centralTstatTargetMenu = null;
    }
    centralTstatTargetMenuAnchor = null;
  }

  function repositionCentralTstatTargetMenu() {
    const menu = centralTstatTargetMenu;
    const anchorBtn = centralTstatTargetMenuAnchor;
    if (!menu || !anchorBtn?.isConnected) return;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function syncCentralTstatTargetMenu() {
    if (!centralTstatTargetMenu || !tstatTargetPickerEnabled()) return;
    const allIds = tstatSession.allIds || [];
    const selectedSet = new Set(tstatSession.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
    const selectAllBtn = centralTstatTargetMenu.querySelector(".tstat-target-all");
    if (selectAllBtn) {
      selectAllBtn.classList.toggle("active", allSelected);
      selectAllBtn.setAttribute("aria-selected", allSelected ? "true" : "false");
    }
    for (const b of centralTstatTargetMenu.querySelectorAll(".tstat-target-opt:not(.tstat-target-all)")) {
      const id = Number(b.dataset.tstatId);
      const on = selectedSet.has(id);
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function openCentralTstatTargetMenu(anchorBtn) {
    closeCentralTstatTargetMenu();
    if (!tstatTargetPickerEnabled()) return;

    const menu = ce("div", "tstat-target-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-multiselectable", "true");

    const allIds = tstatSession.allIds || thermostats.map((t) => t.i);
    const selectedSet = new Set(tstatSession.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

    const selectAllBtn = ce("button", "tstat-target-opt tstat-target-all");
    selectAllBtn.type = "button";
    selectAllBtn.setAttribute("role", "option");
    const selectAllCheck = ce("span", "tstat-target-check");
    const selectAllInfo = ce("span", "tstat-target-info");
    const selectAllName = ce("span", "tstat-target-name");
    selectAllName.textContent = "Select all";
    selectAllInfo.appendChild(selectAllName);
    selectAllBtn.appendChild(selectAllCheck);
    selectAllBtn.appendChild(selectAllInfo);
    if (allSelected) {
      selectAllBtn.classList.add("active");
      selectAllBtn.setAttribute("aria-selected", "true");
    }
    selectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      const currentSelected = new Set(tstatSession.ids);
      const currentlyAll = allIds.length > 0 && allIds.every((id) => currentSelected.has(id));
      applyCentralTstatSelection(currentlyAll ? [] : allIds.slice());
    });
    menu.appendChild(selectAllBtn);

    const pool = tstatSession.roomGroup
      ? allIds.map((id) => thermostats.find((t) => t.i === id)).filter(Boolean)
      : centralThermostatsSorted();
    for (const t of pool) {
      const b = ce("button", "tstat-target-opt");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset.tstatId = String(t.i);
      const check = ce("span", "tstat-target-check");
      const info = ce("span", "tstat-target-info");
      const name = ce("span", "tstat-target-name");
      name.textContent = t.n || ("Thermostat " + t.i);
      const room = ce("span", "tstat-target-room");
      room.textContent = postCall("roomLabel", t.r) || String(t.r ?? "");
      info.appendChild(name);
      info.appendChild(room);
      b.appendChild(check);
      b.appendChild(info);
      if (selectedSet.has(t.i)) {
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        hapticTap();
        const next = new Set(tstatSession.ids);
        if (next.has(t.i)) next.delete(t.i);
        else next.add(t.i);
        applyCentralTstatSelection([...next]);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    centralTstatTargetMenu = menu;
    centralTstatTargetMenuAnchor = anchorBtn;
    repositionCentralTstatTargetMenu();
    anchorBtn.setAttribute("aria-expanded", "true");

    const onOutside = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      closeCentralTstatTargetMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeCentralTstatTargetMenu();
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    centralTstatTargetMenuCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      centralTstatTargetMenuAnchor = null;
    };
  }

  function setTstatMode(cmd, key) {
    if (!tstatSession || !tstatSession.ids?.length) return;
    const ids = tstatSession.ids;
    applyTstatModeOptimistic(ids, key);
    if (tstatSession.central) {
      const ct = tstatSession.centralTstat;
      ct.tm = key;
      if (ct.hsp == null) {
        const ref = thermostats.find(x => x.hsp != null);
        ct.hsp = ref ? Number(ref.hsp) : 70;
      }
      if (ct.csp == null) {
        const ref = thermostats.find(x => x.csp != null);
        ct.csp = ref ? Number(ref.csp) : 74;
      }
      tstatSession.edit = (key === "cool" || key === "dry") ? "cool" : "heat";
    }
    tstatSession.modeLockUntil = Date.now() + 4000;
    tstatSession.lockedMode = key;
    renderTstatDial(); renderTstatControls(); updateClimateWidgets();
    for (const id of ids) sendTstatModeCmd(id, cmd, key);
    for (const id of ids) reconcileTstat(id);
  }

  function setFanMode(fm) {
    if (!tstatSession || !tstatSession.ids?.length) return;
    const ids = tstatSession.ids;
    applyTstatFanModeOptimistic(ids, fm);
    if (fm === "on") {
      for (const id of ids) {
        const t = thermostats.find((x) => x.i === id);
        if (!t?.hasFm) continue;
        if (!t.fs && deviceHasFanSpeed(t)) {
          const levels = supportedFanSpeeds(t);
          t.fs = levels.includes("medium") ? "medium" : levels[0] || "medium";
        }
      }
    }
    renderTstatControls(); updateClimateWidgets();
    for (const id of ids) sendCmd(id, "setFanMode", fm);
    if (tstatSession.central) tstatSession.centralTstat.fm = fm;
    if (fm === "on") {
      for (const id of ids) {
        const t = thermostats.find((x) => x.i === id);
        if (t?.fs) sendCmd(id, "setFanSpeed", t.fs);
      }
    }
    for (const id of ids) reconcileTstat(id);
  }

  function setFanSpeed(lv) {
    if (!tstatSession || !tstatSession.ids?.length) return;
    const ids = tstatSession.ids;
    for (const id of ids) for (const t of thermostats) if (t.i === id && deviceHasFanSpeed(t)) t.fs = lv;
    renderTstatControls();
    if (tstatSession.central) tstatSession.centralTstat.fs = lv;
    for (const id of ids) sendCmd(id, "setFanSpeed", lv);
  }

  function setComfortFanSpeed(lv) {
    if (!tstatSession || !tstatSession.ids?.length) return;
    const ids = tstatSession.ids.filter((id) => {
      const t = thermostats.find((x) => x.i === id);
      return t && deviceHasComfortFan(t);
    });
    if (!ids.length) return;
    applyTstatFanModeOptimistic(ids, lv);
    renderTstatControls();
    if (tstatSession.central) {
      tstatSession.centralTstat.cfs = lv;
      tstatSession.centralTstat.fm = lv;
    }
    for (const id of ids) {
      const t = thermostats.find((x) => x.i === id);
      sendCmd(id, t?.hasCfs ? "setComfortFanSpeed" : "setFanMode", lv);
    }
    for (const id of ids) reconcileTstat(id);
  }

  function setVanePosition(pos) {
    if (!tstatSession || !tstatSession.ids?.length) return;
    const ids = tstatSession.ids.filter((id) => {
      const t = thermostats.find((x) => x.i === id);
      return t && deviceHasVane(t);
    });
    if (!ids.length) return;
    for (const id of ids) {
      const t = thermostats.find((x) => x.i === id);
      if (!t) continue;
      t.vp = pos;
      tstatVaneLock.set(id, { until: Date.now() + LEVEL_OPTIMISTIC_MS, position: pos });
    }
    renderTstatControls();
    if (tstatSession.central) tstatSession.centralTstat.vp = pos;
    for (const id of ids) sendCmd(id, "setVanePosition", pos);
    for (const id of ids) reconcileTstat(id);
  }

  function positionTstatPopup(anchorEl) {
    const popup = ensureTstatPopup();
    const panel = popup._panel;
    // Centered on screen; size is handled by CSS (responsive).
    panel.style.width = "";
    panel.style.left = "";
    panel.style.top = "";
  }

  function openCentralTstatPopup() {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    if (!thermostats.length) return;
    const ids = thermostats.map((t) => t.i);
    const first = thermostats[0];
    tstatSession = {
      rid: null,
      anchorEl: CENTRAL_TSTAT_BTN,
      ids: ids.slice(),
      allIds: ids.slice(),
      unit: normalizeTstatUnit(first?.u),
      edit: "heat",
      central: true,
      centralTstat: buildCentralTstat(thermostats, normalizeTstatUnit(first?.u)),
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatHeadExtras();
    positionTstatPopup(CENTRAL_TSTAT_BTN);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ tstatSession: tstatSession, tstatPopup: popup });
  }

  function openTstatPopup(rid, anchorEl) {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const roomKey = normalizeRoomId(rid);
    const list = thermoByRoom.get(roomKey) || [];
    if (!list.length) return;
    if (list.length === 1) {
      openTstatPopupForDevice(list[0].i, anchorEl);
      return;
    }
    const ids = list.map((x) => x.i);
    // Start on one device so mode/fan caps are always that unit's own list.
    // Target picker can switch among roommates (or select several for setpoints).
    tstatSession = {
      rid: roomKey,
      anchorEl,
      ids: [list[0].i],
      allIds: ids.slice(),
      unit: normalizeTstatUnit(list[0].u),
      edit: "heat",
      roomGroup: true,
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatHeadExtras();
    positionTstatPopup(anchorEl);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ tstatSession: tstatSession, tstatPopup: popup });
  }

  function openTstatPopupForDevice(tstatId, anchorEl) {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    const t = thermostats.find((x) => x.i === tstatId);
    if (!t) return;
    tstatSession = {
      rid: normalizeRoomId(t.r),
      anchorEl,
      ids: [t.i],
      unit: normalizeTstatUnit(t.u),
      edit: "heat",
    };
    const popup = ensureTstatPopup();
    renderTstatDial();
    renderTstatControls();
    updateTstatFavButton();
    positionTstatPopup(anchorEl);
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ tstatSession: tstatSession, tstatPopup: popup });
  }

  function closeTstatPopup() {
    closeCentralTstatTargetMenu();
    if (tstatPopup) {
      tstatPopup.setAttribute("hidden", "");
      tstatPopup.classList.remove("open");
    }
    tstatSession = null;
    publishMld({ tstatSession: null, tstatPopup: tstatPopup });
  }

  function ensureMusicMasterPopup() {
    if (musicMasterPopup) return musicMasterPopup;
    const popup = ce("div", "music-master-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "All music");

    const panel = ce("div", "music-master-panel");
    const head = ce("div", "music-master-head");
    const title = ce("div", "music-master-title");
    title.textContent = "All music";
    const closeBtn = ce("button", "music-master-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    head.appendChild(title);
    head.appendChild(closeBtn);

    const body = ce("div", "music-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    appendPopup(popup);

    bindPopupDismiss(popup, panel, closeBtn, closeMusicMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && popup.classList.contains("open")) closeMusicMasterPopup();
    });

    popup._body = body;
    musicMasterPopup = popup;
    return popup;
  }

  function renderMusicMasterBody() {
    const popup = ensureMusicMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const any = (cap) => music.some((d) => musicControls(d)[cap]);
    const canPlay = any("play");
    const canPause = any("pause");
    const canStop = any("stop");
    const canVolume = any("volume");

    const transport = ce("div", "music-master-transport");
    const playBtn = ce("button", "music-btn music-btn-primary");
    playBtn.type = "button";
    playBtn.setAttribute("aria-label", "Play all");
    playBtn.innerHTML = MUSIC_PLAY_SVG;
    playBtn.disabled = !canPlay;
    playBtn.addEventListener("click", () => postCall("broadcastMusic", "play"));
    const pauseBtn = ce("button", "music-btn music-btn-primary");
    pauseBtn.type = "button";
    pauseBtn.setAttribute("aria-label", "Pause all");
    pauseBtn.innerHTML = MUSIC_PAUSE_SVG;
    pauseBtn.disabled = !canPause;
    pauseBtn.addEventListener("click", () => postCall("broadcastMusic", "pause"));
    const stopBtn = ce("button", "music-btn");
    stopBtn.type = "button";
    stopBtn.setAttribute("aria-label", "Stop all");
    stopBtn.innerHTML = MUSIC_STOP_SVG;
    stopBtn.disabled = !canStop;
    stopBtn.addEventListener("click", () => postCall("broadcastMusic", "stop"));
    transport.appendChild(playBtn);
    transport.appendChild(pauseBtn);
    transport.appendChild(stopBtn);
    body.appendChild(transport);

    const volRow = ce("div", "music-master-volume");
    const volLabel = ce("span", "music-master-volume-label");
    volLabel.textContent = "Volume";
    const volDown = ce("button", "music-btn music-master-vol-btn");
    volDown.type = "button";
    volDown.setAttribute("aria-label", "Volume down for all");
    volDown.textContent = "\u2212";
    volDown.disabled = !canVolume;
    volDown.addEventListener("click", () => postCall("broadcastMusicVolume", -MUSIC_VOL_STEP));
    const volUp = ce("button", "music-btn music-master-vol-btn");
    volUp.type = "button";
    volUp.setAttribute("aria-label", "Volume up for all");
    volUp.textContent = "+";
    volUp.disabled = !canVolume;
    volUp.addEventListener("click", () => postCall("broadcastMusicVolume", MUSIC_VOL_STEP));
    volRow.appendChild(volLabel);
    volRow.appendChild(volDown);
    volRow.appendChild(volUp);
    body.appendChild(volRow);
  }

  function openMusicMasterPopup() {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeFanMasterPopup();
    closeShadeMasterPopup();
    postCall("closeQuickPopup");
    if (!music.length) return;
    renderMusicMasterBody();
    const popup = ensureMusicMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ musicMasterPopup: popup });
  }

  function closeMusicMasterPopup() {
    if (!musicMasterPopup) return;
    musicMasterPopup.setAttribute("hidden", "");
    musicMasterPopup.classList.remove("open");
    publishMld({ musicMasterPopup: null });
  }

  function closeMasterTargetMenu(state) {
    if (state.cleanup) {
      state.cleanup();
      state.cleanup = null;
    }
    if (state.menu) {
      state.menu.remove();
      state.menu = null;
    }
    state.anchor = null;
  }

  function repositionMasterTargetMenu(state) {
    const menu = state.menu;
    const anchorBtn = state.anchor;
    if (!menu || !anchorBtn?.isConnected) return;
    const rect = anchorBtn.getBoundingClientRect();
    const menuW = menu.offsetWidth;
    const menuH = menu.offsetHeight;
    let top = rect.bottom + 6;
    if (top + menuH > window.innerHeight - 8) top = rect.top - menuH - 6;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function updateMasterTargetButton(btn, session, labels, getDeviceName) {
    if (!btn) return;
    if (!session) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const labelEl = btn.querySelector(".tstat-target-btn-label");
    const allCount = (session.allIds || []).length;
    const selCount = session.ids.length;
    let label;
    if (selCount === 0) label = "No " + labels.unit + " selected";
    else if (selCount === allCount) label = labels.all + " (" + allCount + ")";
    else if (selCount === 1) label = getDeviceName(session.ids[0]) || ("1 " + labels.one);
    else label = selCount + " of " + allCount + " " + labels.unit;
    if (labelEl) labelEl.textContent = label;
    btn.setAttribute("aria-label", "Choose " + labels.unit + " to control: " + label);
  }

  function syncMasterTargetMenu(state, session, datasetKey) {
    if (!state.menu || !session) return;
    const allIds = session.allIds || [];
    const selectedSet = new Set(session.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));
    const selectAllBtn = state.menu.querySelector(".tstat-target-all");
    if (selectAllBtn) {
      selectAllBtn.classList.toggle("active", allSelected);
      selectAllBtn.setAttribute("aria-selected", allSelected ? "true" : "false");
    }
    for (const b of state.menu.querySelectorAll(".tstat-target-opt:not(.tstat-target-all)")) {
      const id = Number(b.dataset[datasetKey]);
      const on = selectedSet.has(id);
      b.classList.toggle("active", on);
      if (on) b.setAttribute("aria-selected", "true");
      else b.removeAttribute("aria-selected");
    }
  }

  function openMasterTargetMenu(state, anchorBtn, config) {
    closeMasterTargetMenu(state);
    const session = config.getSession();
    if (!session) return;

    const menu = ce("div", "tstat-target-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-multiselectable", "true");

    const allIds = session.allIds || [];
    const selectedSet = new Set(session.ids);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedSet.has(id));

    const selectAllBtn = ce("button", "tstat-target-opt tstat-target-all");
    selectAllBtn.type = "button";
    selectAllBtn.setAttribute("role", "option");
    const selectAllCheck = ce("span", "tstat-target-check");
    const selectAllInfo = ce("span", "tstat-target-info");
    const selectAllName = ce("span", "tstat-target-name");
    selectAllName.textContent = "Select all";
    selectAllInfo.appendChild(selectAllName);
    selectAllBtn.appendChild(selectAllCheck);
    selectAllBtn.appendChild(selectAllInfo);
    if (allSelected) {
      selectAllBtn.classList.add("active");
      selectAllBtn.setAttribute("aria-selected", "true");
    }
    selectAllBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      const currentSelected = new Set(session.ids);
      const currentlyAll = allIds.length > 0 && allIds.every((id) => currentSelected.has(id));
      config.onApply(currentlyAll ? [] : allIds.slice());
    });
    menu.appendChild(selectAllBtn);

    for (const dev of config.getPool()) {
      const b = ce("button", "tstat-target-opt");
      b.type = "button";
      b.setAttribute("role", "option");
      b.dataset[config.datasetKey] = String(dev.i);
      const check = ce("span", "tstat-target-check");
      const info = ce("span", "tstat-target-info");
      const name = ce("span", "tstat-target-name");
      name.textContent = dev.n || (config.deviceFallback + " " + dev.i);
      const room = ce("span", "tstat-target-room");
      room.textContent = postCall("roomLabel", dev.r) || String(dev.r ?? "");
      info.appendChild(name);
      info.appendChild(room);
      b.appendChild(check);
      b.appendChild(info);
      if (selectedSet.has(dev.i)) {
        b.classList.add("active");
        b.setAttribute("aria-selected", "true");
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        hapticTap();
        const next = new Set(session.ids);
        if (next.has(dev.i)) next.delete(dev.i);
        else next.add(dev.i);
        config.onApply([...next]);
      });
      menu.appendChild(b);
    }

    document.body.appendChild(menu);
    state.menu = menu;
    state.anchor = anchorBtn;
    repositionMasterTargetMenu(state);
    anchorBtn.setAttribute("aria-expanded", "true");

    const onOutside = (e) => {
      if (menu.contains(e.target) || anchorBtn.contains(e.target)) return;
      if (config.onCloseMenu) config.onCloseMenu();
      else closeMasterTargetMenu(state);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (config.onCloseMenu) config.onCloseMenu();
        else closeMasterTargetMenu(state);
      }
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);

    state.cleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
      anchorBtn.setAttribute("aria-expanded", "false");
      state.anchor = null;
    };
  }

  function closeFanMasterTargetMenu() {
    closeMasterTargetMenu(fanMasterTargetState);
    fanMasterTargetMenu = null;
    fanMasterTargetMenuAnchor = null;
    fanMasterTargetMenuCleanup = null;
  }

  function closeShadeMasterTargetMenu() {
    closeMasterTargetMenu(shadeMasterTargetState);
    shadeMasterTargetMenu = null;
    shadeMasterTargetMenuAnchor = null;
    shadeMasterTargetMenuCleanup = null;
  }

  function applyFanMasterSelection(selectedIds) {
    if (!fanMasterSession) return;
    const allIds = fanMasterSession.allIds || ceilingFans.map((f) => f.i);
    fanMasterSession.ids = selectedIds.filter((id) => allIds.includes(id));
    publishMld({ fanMasterSession });
    updateFanMasterHead();
    renderFanMasterBody();
    syncMasterTargetMenu(fanMasterTargetState, fanMasterSession, "fanId");
  }

  function applyShadeMasterSelection(selectedIds) {
    if (!shadeMasterSession) return;
    const allIds = shadeMasterSession.allIds || windowShades.map((s) => s.i);
    shadeMasterSession.ids = selectedIds.filter((id) => allIds.includes(id));
    publishMld({ shadeMasterSession });
    updateShadeMasterHead();
    renderShadeMasterBody();
    syncMasterTargetMenu(shadeMasterTargetState, shadeMasterSession, "shadeId");
  }

  function updateFanMasterHead() {
    const popup = fanMasterPopup;
    if (!popup) return;
    updateMasterTargetButton(
      popup._targetBtn,
      fanMasterSession,
      { all: "All fans", unit: "fans", one: "fan" },
      (id) => ceilingFans.find((f) => f.i === id)?.n
    );
    const favBtn = popup._favBtn;
    if (!favBtn) return;
    if (!fanMasterSession?.ids?.length || fanMasterSession.ids.length !== 1 || !isFavoriteableDeviceId(fanMasterSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, fanMasterSession.ids[0]);
  }

  function updateShadeMasterHead() {
    const popup = shadeMasterPopup;
    if (!popup) return;
    updateMasterTargetButton(
      popup._targetBtn,
      shadeMasterSession,
      { all: "All blinds", unit: "blinds", one: "blind" },
      (id) => windowShades.find((s) => s.i === id)?.n
    );
    const favBtn = popup._favBtn;
    if (!favBtn) return;
    if (!shadeMasterSession?.ids?.length || shadeMasterSession.ids.length !== 1 || !isFavoriteableDeviceId(shadeMasterSession.ids[0])) {
      favBtn.hidden = true;
      return;
    }
    favBtn.hidden = false;
    syncFavButton(favBtn, shadeMasterSession.ids[0]);
  }

  function openFanMasterTargetMenu(anchorBtn) {
    closeFanMasterTargetMenu();
    if (!fanMasterSession) return;
    openMasterTargetMenu(fanMasterTargetState, anchorBtn, {
      getSession: () => fanMasterSession,
      onApply: applyFanMasterSelection,
      getPool: () => postCall("sortByRoomThenFullName", ceilingFans) || ceilingFans.slice(),
      datasetKey: "fanId",
      deviceFallback: "Fan",
      onCloseMenu: closeFanMasterTargetMenu,
    });
    fanMasterTargetMenu = fanMasterTargetState.menu;
    fanMasterTargetMenuAnchor = fanMasterTargetState.anchor;
    fanMasterTargetMenuCleanup = fanMasterTargetState.cleanup;
  }

  function openShadeMasterTargetMenu(anchorBtn) {
    closeShadeMasterTargetMenu();
    if (!shadeMasterSession) return;
    openMasterTargetMenu(shadeMasterTargetState, anchorBtn, {
      getSession: () => shadeMasterSession,
      onApply: applyShadeMasterSelection,
      getPool: () => postCall("sortByRoomThenFullName", windowShades) || windowShades.slice(),
      datasetKey: "shadeId",
      deviceFallback: "Shade",
      onCloseMenu: closeShadeMasterTargetMenu,
    });
    shadeMasterTargetMenu = shadeMasterTargetState.menu;
    shadeMasterTargetMenuAnchor = shadeMasterTargetState.anchor;
    shadeMasterTargetMenuCleanup = shadeMasterTargetState.cleanup;
  }

  function ensureFanMasterPopup() {
    if (fanMasterPopup) return fanMasterPopup;
    const popup = ce("div", "fan-master-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "All fans");

    const panel = ce("div", "fan-master-panel");
    const head = ce("div", "fan-master-head");
    const leading = ce("div", "fan-master-head-leading");
    const title = ce("div", "fan-master-title");
    title.textContent = "All fans";
    const targetBtn = ce("button", "tstat-target-btn");
    targetBtn.type = "button";
    targetBtn.setAttribute("aria-haspopup", "listbox");
    targetBtn.setAttribute("aria-expanded", "false");
    const targetLabel = ce("span", "tstat-target-btn-label");
    const targetCaret = ce("span", "tstat-target-btn-caret");
    targetCaret.setAttribute("aria-hidden", "true");
    targetCaret.textContent = "\u25be";
    targetBtn.appendChild(targetLabel);
    targetBtn.appendChild(targetCaret);
    targetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (fanMasterTargetMenu) closeFanMasterTargetMenu();
      else openFanMasterTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.hidden = true;
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (fanMasterSession?.ids?.length !== 1) return;
      const id = fanMasterSession.ids[0];
      if (id == null || !isFavoriteableDeviceId(id)) return;
      hapticTap();
      postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "fan-master-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    leading.appendChild(title);
    leading.appendChild(targetBtn);
    leading.appendChild(favBtn);
    head.appendChild(leading);
    head.appendChild(closeBtn);

    const body = ce("div", "fan-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    appendPopup(popup);

    bindPopupDismiss(popup, panel, closeBtn, closeFanMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !popup.classList.contains("open")) return;
      if (fanMasterTargetMenu) { closeFanMasterTargetMenu(); return; }
      closeFanMasterPopup();
    });

    popup._body = body;
    popup._title = title;
    popup._targetBtn = targetBtn;
    popup._favBtn = favBtn;
    fanMasterPopup = popup;
    return popup;
  }

  function renderFanMasterBody() {
    const popup = ensureFanMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const selectedIds = new Set(fanMasterSession?.ids || []);
    const selectedFans = ceilingFans.filter((f) => selectedIds.has(f.i));
    const noneSelected = !selectedFans.length;
    const anyOn = !noneSelected && selectedFans.some((f) => effectiveFanOn(f));

    const controls = ce("div", "fan-controls fan-master-controls" + (anyOn ? " is-on" : ""));
    const power = ce("button", "fan-power");
    power.type = "button";
    power.innerHTML = FAN_BTN_SVG;
    power.disabled = noneSelected;
    power.setAttribute("aria-label", anyOn ? "Turn all fans off" : "Turn all fans on");
    power.setAttribute("aria-pressed", anyOn ? "true" : "false");
    power.addEventListener("click", () => postCall("broadcastFanPower"));
    if (selectedFans.length) {
      const ref = selectedFans[0];
      syncFanBladeSpin(power, ref, anyOn, effectiveFanSpeed(ref));
    }
    controls.appendChild(power);
    body.appendChild(controls);

    const speeds = intersectionCeilingFanSpeeds(selectedFans);
    if (speeds.length) {
      const row = ce("div", "fan-master-speeds");

      for (const sp of speeds) {
        const btn = ce("button", "fan-master-speed-btn");
        btn.type = "button";
        btn.textContent = ceilingFanSpeedLabel(sp);
        btn.disabled = noneSelected;
        btn.addEventListener("click", () => postCall("broadcastFanSpeed", sp));
        row.appendChild(btn);
      }
      body.appendChild(row);
    }
  }

  function openFanMasterPopup() {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeShadeMasterPopup();
    postCall("closeQuickPopup");
    if (!ceilingFans.length) return;
    const ids = ceilingFans.map((f) => f.i);
    fanMasterSession = { ids: ids.slice(), allIds: ids.slice() };
    publishMld({ fanMasterSession });
    renderFanMasterBody();
    updateFanMasterHead();
    const popup = ensureFanMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ fanMasterPopup: popup });
  }

  function closeFanMasterPopup() {
    closeFanMasterTargetMenu();
    if (!fanMasterPopup) return;
    fanMasterPopup.setAttribute("hidden", "");
    fanMasterPopup.classList.remove("open");
    fanMasterSession = null;
    publishMld({ fanMasterPopup: null, fanMasterSession: null });
  }

  function ensureShadeMasterPopup() {
    if (shadeMasterPopup) return shadeMasterPopup;
    const popup = ce("div", "shade-master-popup");
    popup.hidden = true;
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-label", "All blinds");

    const panel = ce("div", "shade-master-panel");
    const head = ce("div", "shade-master-head");
    const leading = ce("div", "shade-master-head-leading");
    const title = ce("div", "shade-master-title");
    title.textContent = "All blinds";
    const targetBtn = ce("button", "tstat-target-btn");
    targetBtn.type = "button";
    targetBtn.setAttribute("aria-haspopup", "listbox");
    targetBtn.setAttribute("aria-expanded", "false");
    const targetLabel = ce("span", "tstat-target-btn-label");
    const targetCaret = ce("span", "tstat-target-btn-caret");
    targetCaret.setAttribute("aria-hidden", "true");
    targetCaret.textContent = "\u25be";
    targetBtn.appendChild(targetLabel);
    targetBtn.appendChild(targetCaret);
    targetBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (shadeMasterTargetMenu) closeShadeMasterTargetMenu();
      else openShadeMasterTargetMenu(targetBtn);
    });
    const favBtn = ce("button", "tstat-fav");
    favBtn.type = "button";
    favBtn.hidden = true;
    favBtn.innerHTML = FAVORITES_SVG;
    favBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (shadeMasterSession?.ids?.length !== 1) return;
      const id = shadeMasterSession.ids[0];
      if (id == null || !isFavoriteableDeviceId(id)) return;
      hapticTap();
      postCall("toggleFavorite", id);
    });
    const closeBtn = ce("button", "shade-master-close");
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "\u00d7";
    leading.appendChild(title);
    leading.appendChild(targetBtn);
    leading.appendChild(favBtn);
    head.appendChild(leading);
    head.appendChild(closeBtn);

    const body = ce("div", "shade-master-body");
    panel.appendChild(head);
    panel.appendChild(body);
    popup.appendChild(panel);
    appendPopup(popup);

    bindPopupDismiss(popup, panel, closeBtn, closeShadeMasterPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !popup.classList.contains("open")) return;
      if (shadeMasterTargetMenu) { closeShadeMasterTargetMenu(); return; }
      closeShadeMasterPopup();
    });

    popup._body = body;
    popup._title = title;
    popup._targetBtn = targetBtn;
    popup._favBtn = favBtn;
    shadeMasterPopup = popup;
    return popup;
  }

  function renderShadeMasterBody() {
    const popup = ensureShadeMasterPopup();
    const body = popup._body;
    body.innerHTML = "";
    const selectedIds = new Set(shadeMasterSession?.ids || []);
    const selectedShades = windowShades.filter((s) => selectedIds.has(s.i));
    const noneSelected = !selectedShades.length;

    const actions = ce("div", "shade-master-actions");
    const openBtn = ce("button", "quick-lock-btn shade-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    openBtn.disabled = noneSelected;
    openBtn.addEventListener("click", () => postCall("broadcastShadeCmd", "open"));
    const closeBtn = ce("button", "quick-lock-btn shade-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    closeBtn.disabled = noneSelected;
    closeBtn.addEventListener("click", () => postCall("broadcastShadeCmd", "close"));
    actions.appendChild(openBtn);
    let stopBtn = null;
    if (selectedShades.some((s) => shadeHasStop(s))) {
      stopBtn = ce("button", "quick-lock-btn shade-btn shade-stop-btn");
      stopBtn.type = "button";
      stopBtn.innerHTML = SHADE_STOP_SVG + '<span class="quick-lock-btn-label">Stop</span>';
      stopBtn.disabled = noneSelected;
      stopBtn.addEventListener("click", () => postCall("broadcastShadeCmd", "stop"));
      actions.appendChild(stopBtn);
    }
    actions.appendChild(closeBtn);
    body.appendChild(actions);
    popup._openBtn = openBtn;
    popup._closeBtn = closeBtn;
    popup._stopBtn = stopBtn;

    const positioned = selectedShades.filter((s) => shadeHasPosition(s));
    if (positioned.length) {
      const sliderWrap = ce("div", "shade-master-slider-wrap");
      const levelLabel = ce("span", "shade-level-label");
      const pos = averageShadePosition(positioned);
      levelLabel.textContent = pos + "%";
      const slider = ce("div", "slider shade-slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-fill"));
      slider.appendChild(inner);
      slider.appendChild(ce("div", "slider-thumb"));
      if (noneSelected) slider.classList.add("disabled");
      postCall("setSliderLevel", slider, pos);
      sliderWrap.appendChild(levelLabel);
      sliderWrap.appendChild(slider);
      body.appendChild(sliderWrap);
      popup._sliderWrap = sliderWrap;
      popup._levelLabel = levelLabel;
      popup._slider = slider;
      if (!noneSelected) {
        postCall("attachBulkShadeDrag", sliderWrap, slider, (lvl) => { levelLabel.textContent = lvl + "%"; });
      }
    } else {
      popup._sliderWrap = null;
      popup._levelLabel = null;
      popup._slider = null;
    }
    updateShadeMasterBody();
  }

  function updateShadeMasterBody() {
    const popup = shadeMasterPopup;
    if (!popup || popup.hidden) return;
    const selectedIds = new Set(shadeMasterSession?.ids || []);
    const selectedShades = windowShades.filter((s) => selectedIds.has(s.i));
    const noneSelected = !selectedShades.length;
    const allOpen = !noneSelected && selectedShades.every((s) => {
      const st = effectiveShadeState(s);
      return st === "open" || st === "opening";
    });
    const allClosed = !noneSelected && selectedShades.every((s) => {
      const st = effectiveShadeState(s);
      return st === "closed" || st === "closing";
    });
    const anyMoving = !noneSelected && selectedShades.some((s) => shadeIsMoving(s));

    if (popup._openBtn) {
      popup._openBtn.classList.toggle("active", allOpen);
      popup._openBtn.classList.toggle("moving", anyMoving && allOpen);
      // Keep buttons clickable so Open/Close stay responsive (can reverse direction).
      popup._openBtn.disabled = noneSelected;
    }
    if (popup._closeBtn) {
      popup._closeBtn.classList.toggle("active", allClosed);
      popup._closeBtn.classList.toggle("moving", anyMoving && allClosed);
      popup._closeBtn.disabled = noneSelected;
    }
    if (popup._stopBtn) {
      popup._stopBtn.classList.toggle("active", anyMoving);
      popup._stopBtn.disabled = noneSelected;
    }

    const positioned = selectedShades.filter((s) => shadeHasPosition(s));
    if (popup._slider && popup._levelLabel && positioned.length && !popup._slider.classList.contains("dragging")) {
      const pos = averageShadePosition(positioned);
      postCall("setSliderLevel", popup._slider, pos);
      popup._levelLabel.textContent = pos + "%";
    }
  }

  function openShadeMasterPopup() {
    cancelAllSlideGestures();
    closeTstatPopup();
    if (colorSession) closeColorPopup(false);
    closeMusicMasterPopup();
    closeFanMasterPopup();
    postCall("closeQuickPopup");
    if (!windowShades.length) return;
    const ids = windowShades.map((s) => s.i);
    shadeMasterSession = { ids: ids.slice(), allIds: ids.slice() };
    publishMld({ shadeMasterSession });
    const popup = ensureShadeMasterPopup();
    popup.removeAttribute("hidden");
    popup.classList.add("open");
    publishMld({ shadeMasterPopup: popup });
    renderShadeMasterBody();
    updateShadeMasterHead();
  }

  function closeShadeMasterPopup() {
    closeShadeMasterTargetMenu();
    if (!shadeMasterPopup) return;
    shadeMasterPopup.setAttribute("hidden", "");
    shadeMasterPopup.classList.remove("open");
    shadeMasterSession = null;
    publishMld({ shadeMasterPopup: null, shadeMasterSession: null });
  }

  function reconcileTstat(id) {
    setTimeout(() => postCall("refreshDevice", id), 600);
    setTimeout(() => postCall("refreshDevice", id), 1800);
  }

  function updateClimateWidgets() {
    for (const [rid, rec] of climateEls) {
      const info = roomClimateInfo(rid);
      if (!info) continue;
      rec.tempEl.textContent = formatRoomTemp(info.device);
      if (rec.iconEl) {
        rec.iconEl.classList.remove("state-off", "state-heat", "state-cool", "state-fan");
        if (info.controllable) {
          const cls = roomTstatState(rid);
          rec.iconEl.classList.add(cls);
          rec.el.setAttribute("aria-label", "Thermostat — " + cls.replace("state-", "") + ", " + formatRoomTemp(info.device));
        }
      }
    }
    if (tstatSession) {
      renderTstatDial();
      renderTstatControls();
    }
  }

  function setStatus(msg, isErr) {
    if (!msg) { STATUS_EL.hidden = true; STATUS_EL.textContent = ""; return; }
    STATUS_EL.hidden = false;
    STATUS_EL.textContent = msg;
    STATUS_EL.classList.toggle("error", !!isErr);
  }
  function flash(msg, isErr) { setStatus(msg, isErr); clearTimeout(flash._t); flash._t = setTimeout(() => setStatus(""), 2200); }

  function hapticTap(pattern) {
    if (!cfg.enableHaptics) return;
    if (!window.isSecureContext) return;
    const vibrate = navigator.vibrate;
    if (typeof vibrate !== "function") return;
    try {
      vibrate.call(navigator, pattern || 15);
    } catch {}
  }

  function effectiveTheme(theme) {
    const pref = THEME_OPTIONS.includes(theme) ? theme : "auto";
    if (pref === "auto") {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch {
        return "dark";
      }
    }
    return pref;
  }

  function updateThemeSegmentUI(theme) {
    if (!MENU_THEME_SEGMENT) return;
    for (const btn of MENU_THEME_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      const selected = btn.dataset.theme === theme;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    }
  }

  function updateCamerasColsSegmentUI(cols) {
    if (!MENU_CAMERAS_COLS_SEGMENT) return;
    const key = String(cols);
    for (const btn of MENU_CAMERAS_COLS_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      const selected = btn.dataset.cols === key;
      btn.setAttribute("aria-checked", selected ? "true" : "false");
    }
  }

  function updateCamerasLayoutMenuVisibility() {
    if (!MENU_CAMERAS_LAYOUT) return;
    MENU_CAMERAS_LAYOUT.hidden = !(tabMode && activeTab === "cameras");
  }

  function updateSensorsOrgMenuVisibility() {
    if (!MENU_SENSORS_ORG) return;
    MENU_SENSORS_ORG.hidden = !(tabMode && activeTab === "sensors");
  }

  function updateAddEmbedMenuVisibility() {
    const show = !!(tabMode && activeTab === "favorites");
    if (MENU_ADD_TILE) MENU_ADD_TILE.hidden = !show;
    else if (MENU_ADD_EMBED_BTN) MENU_ADD_EMBED_BTN.hidden = !show;
  }

  function updateReorderMenuLabel() {
    if (!MENU_REORDER_BTN) return;
    const onFavorites =
      (tabMode && activeTab === "favorites") || quickPopupOpenType === "favorites";
    MENU_REORDER_BTN.textContent = onFavorites ? "Reorder/Resize" : "Reorder";
  }

  function applyCamerasCols(cols) {
    const n = cols === 2 || cols === 3 ? cols : 1;
    cfg.camerasCols = n;
    saveCamerasColsPref(n);
    updateCamerasColsSegmentUI(n);
    const grid = tabViewEl?.querySelector(".cameras-grid");
    if (grid) grid.dataset.cols = String(n);
  }

  function applyTheme(theme) {
    cfg.theme = THEME_OPTIONS.includes(theme) ? theme : "auto";
    const effective = effectiveTheme(cfg.theme);
    document.documentElement.setAttribute("data-theme", effective);
    document.documentElement.style.colorScheme = effective;
    const meta = qs('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", effective === "light" ? "#eef1f7" : "#0b0d12");
    updateThemeSegmentUI(cfg.theme);
    postCall("refreshHtmlTileIframes");
  }

  function applyDashboardName(name) {
    const title = String(name || "").trim() || "mDash";
    cfg.dashboardName = title;
    if (DASHBOARD_TITLE_EL) DASHBOARD_TITLE_EL.textContent = title;
    document.title = title;
  }

  // ---------- local / cloud mode switching ----------
  function isCloudOrigin() {
    return location.hostname === "cloud.hubitat.com" || location.protocol === "https:";
  }

  function isLocalOrigin() {
    return location.protocol === "http:" && location.hostname !== "cloud.hubitat.com";
  }

  function isAndroid() {
    try {
      if (navigator.userAgentData?.platform === "Android") return true;
    } catch {}
    return /Android/i.test(navigator.userAgent || "");
  }

  function isStandaloneDisplay() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches;
    } catch {
      return false;
    }
  }

  function initAndroidLocalImmersive() {
    if (!isLocalOrigin() || !isAndroid() || isStandaloneDisplay()) return;

    document.documentElement.classList.add("android-browser-local");

    function isModalOpen() {
      try {
        if (document.fullscreenElement) return true;
      } catch {}
      return !!document.querySelector(
        ".quick-popup.open, .ct-popup.open, .tstat-popup.open, .music-master-popup.open, .confirm-popup.open, .pin-pad-popup.open, .dash-gate-popup.open, .camera-overlay-popup.open"
      );
    }

    function nudgeScroll() {
      if (isModalOpen()) return;
      if (window.scrollY <= 1) {
        try { window.scrollTo(0, 1); } catch {}
      }
    }

    nudgeScroll();
    requestAnimationFrame(nudgeScroll);
    setTimeout(nudgeScroll, 50);
    setTimeout(nudgeScroll, 300);

    let nudgeTimer = null;
    window.addEventListener("scroll", () => {
      if (window.scrollY > 1) return;
      if (nudgeTimer) return;
      nudgeTimer = setTimeout(() => {
        nudgeTimer = null;
        nudgeScroll();
      }, 120);
    }, { passive: true });

    window.addEventListener("orientationchange", () => {
      setTimeout(nudgeScroll, 200);
    }, { passive: true });
  }

  function loadStoredLocalUrl() {
    try { return localStorage.getItem(LOCAL_URL_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function saveStoredLocalUrl(url) {
    try {
      const v = String(url || "").trim();
      if (v) localStorage.setItem(LOCAL_URL_STORAGE_KEY, v);
      else localStorage.removeItem(LOCAL_URL_STORAGE_KEY);
    } catch {}
  }

  function loadStoredCloudUrl() {
    try { return localStorage.getItem(CLOUD_URL_STORAGE_KEY) || ""; } catch { return ""; }
  }

  function saveStoredCloudUrl(url) {
    try {
      const v = String(url || "").trim();
      if (v) localStorage.setItem(CLOUD_URL_STORAGE_KEY, v);
      else localStorage.removeItem(CLOUD_URL_STORAGE_KEY);
    } catch {}
  }

  function preferCloudMode() {
    try { return localStorage.getItem(PREFER_CLOUD_STORAGE_KEY) === "1"; } catch { return false; }
  }

  function setPreferCloudMode(on) {
    try {
      if (on) localStorage.setItem(PREFER_CLOUD_STORAGE_KEY, "1");
      else localStorage.removeItem(PREFER_CLOUD_STORAGE_KEY);
    } catch {}
  }

  function consumePreferCloudParam() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("mld_prefer_cloud") !== "1") return;
      setPreferCloudMode(true);
      params.delete("mld_prefer_cloud");
      const qs = params.toString();
      history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
    } catch {}
  }

  function refreshLocalUrlFromConfig() {
    if (cfg.localUrl) {
      saveStoredLocalUrl(cfg.localUrl);
      if (MENU_LOCAL_URL_EL && document.activeElement !== MENU_LOCAL_URL_EL) {
        MENU_LOCAL_URL_EL.value = cfg.localUrl;
      }
    }
    if (cfg.cloudUrl) saveStoredCloudUrl(cfg.cloudUrl);
  }

  function navigateToLocal(url) {
    const target = String(url || loadStoredLocalUrl() || "").trim();
    if (!target) return false;
    setPreferCloudMode(false);
    location.replace(target);
    return true;
  }

  function navigateToCloud() {
    let target = String(cfg.cloudUrl || loadStoredCloudUrl() || "").trim();
    if (!target) return false;
    setPreferCloudMode(true);
    const sep = target.includes("?") ? "&" : "?";
    target = target + sep + "mld_prefer_cloud=1";
    location.replace(target);
    return true;
  }

  function updateLocalModeMenuUI() {
    const localUrl = loadStoredLocalUrl() || cfg.localUrl || "";
    const onCloud = isCloudOrigin();
    const onLocal = isLocalOrigin();
    if (MENU_OPEN_LOCAL_BTN) {
      MENU_OPEN_LOCAL_BTN.hidden = !(onCloud && !!localUrl);
    }
    if (MENU_OPEN_CLOUD_BTN) {
      MENU_OPEN_CLOUD_BTN.hidden = !(onLocal && !!cfg.cloudUrl);
    }
    if (MENU_LOCAL_URL_EL && document.activeElement !== MENU_LOCAL_URL_EL) {
      MENU_LOCAL_URL_EL.value = localUrl;
    }
  }

  function hideLocalModeBanner() {
    if (localModeBannerEl) {
      localModeBannerEl.remove();
      localModeBannerEl = null;
    }
  }

  function isPrivateLanHostname(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
    if (host.endsWith(".local")) return true;
    if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
      return true;
    }
    const octets = host.split(".").map(Number);
    if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    return octets[0] === 10 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254);
  }

  function buildLocalProbeUrl(localUrl) {
    try {
      const src = new URL(localUrl);
      if (src.protocol !== "http:" || !isPrivateLanHostname(src.hostname)) return "";
      const probePath = src.pathname.replace(/\/dashboard\/?$/, "/lan-probe");
      if (probePath === src.pathname) return "";
      const token = src.searchParams.get("access_token");
      if (!token) return "";
      const u = new URL(src.origin + probePath);
      u.searchParams.set("access_token", token);
      u.searchParams.set("mld_lan_probe", crypto.randomUUID());
      return u.href;
    } catch {
      return "";
    }
  }

  async function probeLocalHubReachable(localUrl, timeoutMs = 30000) {
    const probeUrl = buildLocalProbeUrl(localUrl);
    if (!probeUrl) return false;
    const nonce = new URL(probeUrl).searchParams.get("mld_lan_probe");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(probeUrl, {
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
        targetAddressSpace: "local",
      });
      if (!response.ok) return false;
      return (await response.text()).trim() === nonce;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  let localModeProbeStarted = false;

  function maybeStartLocalModeProbe() {
    if (localModeProbeStarted || localBannerDismissed || !isCloudOrigin() || !isAndroid()) return;
    if (preferCloudMode()) return;
    const localUrl = loadStoredLocalUrl();
    if (!localUrl) return;
    localModeProbeStarted = true;
    probeLocalHubReachable(localUrl).then((reachable) => {
      if (reachable && loadStoredLocalUrl() === localUrl) showLocalModeBanner(localUrl);
    });
  }

  function showLocalModeBanner(verifiedLocalUrl) {
    if (localModeBannerEl || localBannerDismissed || !isCloudOrigin() || !isAndroid()) return;
    const localUrl = String(verifiedLocalUrl || "").trim();
    if (!localUrl) return;

    const banner = document.createElement("div");
    banner.className = "local-mode-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Switch to local mode");

    const text = document.createElement("span");
    text.className = "local-mode-banner-text";
    text.textContent = "Local hub reachable — switch to faster mode?";

    const switchBtn = document.createElement("button");
    switchBtn.type = "button";
    switchBtn.className = "ghost-btn local-mode-banner-switch";
    switchBtn.textContent = "Switch";

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "ghost-btn icon-btn local-mode-banner-dismiss";
    dismissBtn.setAttribute("aria-label", "Dismiss");
    dismissBtn.textContent = "\u00d7";

    switchBtn.addEventListener("click", () => navigateToLocal(localUrl));
    dismissBtn.addEventListener("click", () => {
      localBannerDismissed = true;
      hideLocalModeBanner();
    });

    banner.appendChild(text);
    banner.appendChild(switchBtn);
    banner.appendChild(dismissBtn);

    if (APP_EL && ROOMS_EL) APP_EL.insertBefore(banner, ROOMS_EL);
    else if (APP_EL) APP_EL.appendChild(banner);
    localModeBannerEl = banner;
  }

  // Returns true when navigating away (caller should stop init).
  function applyLocalModeStrategy() {
    consumePreferCloudParam();
    refreshLocalUrlFromConfig();

    if (isLocalOrigin()) {
      updateLocalModeMenuUI();
      return false;
    }

    if (!isCloudOrigin()) {
      updateLocalModeMenuUI();
      return false;
    }

    if (preferCloudMode()) {
      updateLocalModeMenuUI();
      return false;
    }

    const localUrl = loadStoredLocalUrl();
    if (!localUrl) {
      updateLocalModeMenuUI();
      return false;
    }

    if (isAndroid()) maybeStartLocalModeProbe();

    updateLocalModeMenuUI();
    return false;
  }

  function rebuildDevicesByRoom() {
    devicesByRoom.clear();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!devicesByRoom.has(rid)) devicesByRoom.set(rid, []);
      devicesByRoom.get(rid).push(dev);
    }
  }

  function rebuildOutletsByRoom() {
    outletsByRoom.clear();
    for (const out of outlets) {
      const rid = normalizeRoomId(out.r);
      if (!outletsByRoom.has(rid)) outletsByRoom.set(rid, []);
      outletsByRoom.get(rid).push(out);
    }
  }

  function applyTstatSessionModeLock() {
    if (tstatSession?.modeLockUntil > Date.now() && tstatSession.lockedMode) {
      for (const t of thermostats) {
        if (!tstatSession.ids.includes(t.i)) continue;
        t.tm = tstatSession.lockedMode;
      }
    }
  }

  function emptyState(html) {
    ROOMS_EL.innerHTML = html;
    roomEls.clear(); devMap.clear();
  }

  function loadingState() {
    emptyState('<div class="loading"><div class="spinner"></div>Loading lights…</div>');
  }

  function noDevicesState() {
    emptyState(
      '<div class="empty">' +
      '<h2>No devices configured</h2>' +
      'Open the Modern Dashboard app on your hub and select your lights, outlets, or thermostats.' +
      '</div>'
    );
  }

  function sortRoomsByOrder(allRooms, order) {
    const list = Array.isArray(allRooms) ? allRooms : [];
    if (!order?.length) {
      return list.slice().sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
      );
    }
    const byId = new Map(list.map(r => [r.id, r]));
    const sorted = [];
    const seen = new Set();
    for (const rawId of order) {
      const id = normalizeRoomId(rawId);
      if (id === -1) continue;
      if (byId.has(id)) {
        sorted.push(byId.get(id));
        seen.add(id);
      }
    }
    const newcomers = list.filter(r => !seen.has(r.id)).sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" })
    );
    sorted.push(...newcomers);
    return sorted;
  }

  function sortCamerasByOrder(allCams, order) {
    const list = Array.isArray(allCams) ? allCams : [];
    if (!order?.length) return list.slice();
    const byId = new Map(list.map(c => [Number(c.i), c]));
    const sorted = [];
    const seen = new Set();
    for (const rawId of order) {
      const id = Number(rawId);
      if (byId.has(id)) {
        sorted.push(byId.get(id));
        seen.add(id);
      }
    }
    for (const c of list) {
      if (!seen.has(Number(c.i))) sorted.push(c);
    }
    return sorted;
  }

  function ensureRoomsFromDevices() {
    if (rooms.length) return;
    const byId = new Map();
    const addRef = (item) => {
      const id = normalizeRoomId(item?.r);
      if (id === -1) return;
      if (!byId.has(id)) byId.set(id, { id, name: "Room " + id });
    };
    for (const dev of devices) addRef(dev);
    for (const out of outlets) addRef(out);
    for (const t of thermostats) addRef(t);
    for (const s of tempSensors) addRef(s);
    for (const s of sensors) addRef(s);
    for (const lk of locks) addRef(lk);
    if (!byId.size) return;
    replaceList(rooms, [...byId.values()].sort((a, b) => a.id - b.id));
    syncRoomMap();
  }

  function contentRoomIds() {
    const ids = new Set();
    for (const rid of devicesByRoom.keys()) ids.add(rid);
    if (outletsInLightsRooms()) {
      for (const rid of outletsByRoom.keys()) ids.add(rid);
    }
    for (const rid of thermoByRoom.keys()) ids.add(rid);
    for (const rid of sensorByRoom.keys()) ids.add(rid);
    return ids;
  }

  function outletsInLightsRooms() {
    return !outletsSeparateTab;
  }

  function roomShowsClimate(rid) {
    return roomClimateEnabled !== false && roomHasClimate(rid);
  }

  function getDisplayRoomIds(groups, hasContent) {
    const knownIds = new Set(rooms.map(r => r.id));
    const allIds = new Set(knownIds);
    for (const id of contentRoomIds()) allIds.add(id);
    const hasUnassigned = groups.has(-1) || (outletsInLightsRooms() && outletsByRoom.has(-1)) || roomShowsClimate(-1);
    let order;
    if (cfg.roomOrder?.length) {
      order = cfg.roomOrder.map(normalizeRoomId).filter(id => {
        if (id === -1) return hasUnassigned;
        return allIds.has(id);
      });
      const inOrder = new Set(order.filter(id => id !== -1));
      const newcomers = [...allIds].filter(id => !inOrder.has(id));
      if (newcomers.length) {
        newcomers.sort((a, b) => {
          const an = roomMap.get(a) || "";
          const bn = roomMap.get(b) || "";
          return String(an).localeCompare(String(bn), undefined, { sensitivity: "base" }) || (a - b);
        });
        const uIdx = order.indexOf(-1);
        if (uIdx >= 0) order = order.slice(0, uIdx).concat(newcomers, order.slice(uIdx));
        else order = order.concat(newcomers);
      }
      if (hasUnassigned && !order.includes(-1)) order.push(-1);
    } else {
      order = rooms.map(r => r.id);
      for (const id of allIds) {
        if (id !== -1 && !order.includes(id)) order.push(id);
      }
      if (hasUnassigned && !order.includes(-1)) order.push(-1);
    }
    return order.filter(rid => hasContent(rid));
  }

  function getDefaultNavOrder() {
    return ["lights", ...QUICK_NAV.map(n => n.popup)];
  }

  function getDisplayNavOrder() {
    const defaults = getDefaultNavOrder();
    if (!cfg.navOrder?.length) return defaults.slice();
    const known = new Set(defaults);
    const order = cfg.navOrder.filter(k => known.has(k));
    for (const key of defaults) {
      if (!order.includes(key)) order.push(key);
    }
    return order;
  }

  function applyNavOrder(order) {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    for (const key of order) {
      const rec = navEls.get(key);
      if (rec?.wrap) nav.appendChild(rec.wrap);
    }
  }

  // Tip + quick-nav scroll fade (in core so post/post2 stay under cloud MQTT limit)
  function updateQuickNavScrollFade() {
    const nav = document.querySelector(".quick-nav");
    if (!nav || nav.hidden || cfg.enableDrawer) {
      if (nav) {
        nav.classList.remove("has-overflow-start", "has-overflow-end");
      }
      return;
    }
    const max = nav.scrollWidth - nav.clientWidth;
    const hasOverflow = max > 4;
    const atStart = nav.scrollLeft <= 2;
    const atEnd = nav.scrollLeft >= max - 2;
    nav.classList.toggle("has-overflow-start", hasOverflow && !atStart);
    nav.classList.toggle("has-overflow-end", hasOverflow && !atEnd);
  }

  function setupQuickNavScrollFade() {
    const nav = document.querySelector(".quick-nav");
    if (!nav || nav.dataset.scrollFadeBound) return;
    nav.dataset.scrollFadeBound = "1";
    nav.addEventListener("scroll", updateQuickNavScrollFade, { passive: true });
    window.addEventListener("resize", () => {
      updateQuickNavScrollFade();
      document.querySelectorAll(".quick-fav-ctl-mode").forEach(fitTstatModeLabel);
    });
    updateQuickNavScrollFade();
  }

  function setupIconTipAffordances() {
    const roots = [
      document.querySelector(".quick-nav"),
      document.querySelector(".topbar-actions"),
    ].filter(Boolean);
    for (const root of roots) {
      for (const btn of root.querySelectorAll(".ghost-btn.icon-btn")) postCall("applyTip", btn);
    }
    postCall("applyTip", document.getElementById("drawer-toggle"));
    postCall("applyTip", ALL_OFF_BTN, "Tap to turn off · Hold & slide to save home state");
    postCall("applyTip", ALL_ON_BTN, "Tap to turn on · Hold & slide to restore home state");

    const tipRoot = APP_EL || document;
    if (tipRoot.dataset?.tipBound || tipRoot === document && document.documentElement.dataset.tipBound) return;
    if (tipRoot.dataset) tipRoot.dataset.tipBound = "1";
    else document.documentElement.dataset.tipBound = "1";

    let tipEl = null;
    let tipTimer = null;
    let tipBtn = null;
    let hideTimer = null;

    function ensureTipEl() {
      if (tipEl) return tipEl;
      tipEl = document.createElement("div");
      tipEl.className = "mld-tip";
      tipEl.setAttribute("role", "tooltip");
      tipEl.hidden = true;
      document.body.appendChild(tipEl);
      return tipEl;
    }

    function placeTip(btn) {
      const tip = btn.getAttribute("data-tip");
      if (!tip) return;
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      const el = ensureTipEl();
      el.textContent = tip;
      el.hidden = false;
      const r = btn.getBoundingClientRect();
      const pad = 8;
      const tw = el.offsetWidth || 0;
      const th = el.offsetHeight || 0;
      let left = r.left + r.width / 2 - tw / 2;
      left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
      let top = r.top - th - 6;
      if (top < pad) top = r.bottom + 6;
      el.style.left = Math.round(left) + "px";
      el.style.top = Math.round(top) + "px";
      requestAnimationFrame(() => el.classList.add("is-visible"));
    }

    function hideTip() {
      if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; }
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      tipBtn = null;
      if (!tipEl) return;
      tipEl.classList.remove("is-visible");
      hideTimer = setTimeout(() => {
        if (tipEl && !tipEl.classList.contains("is-visible")) tipEl.hidden = true;
      }, 160);
    }

    if (globalThis.__MLD) globalThis.__MLD._tipHide = hideTip;

    function showTipFor(btn, delay) {
      hideTip();
      tipBtn = btn;
      const run = () => { if (tipBtn === btn) placeTip(btn); };
      if (delay) tipTimer = setTimeout(run, delay);
      else run();
    }

    const tipSelector = "button[data-tip]";
    const isSlideTipBtn = (btn) => btn.matches(".topbar-off-btn, .topbar-on-btn, .btn-off, .btn-on");

    tipRoot.addEventListener("pointerover", (e) => {
      const btn = e.target.closest?.(tipSelector);
      if (!btn || e.pointerType === "touch") return;
      if (btn.closest("#app-drawer")) return;
      if (tipBtn === btn && tipEl && !tipEl.hidden) return;
      showTipFor(btn, 0);
    }, true);
    tipRoot.addEventListener("pointerout", (e) => {
      if (e.pointerType === "touch") return;
      const btn = e.target.closest?.(tipSelector);
      if (!btn || tipBtn !== btn) return;
      const related = e.relatedTarget?.closest?.(tipSelector);
      if (related === btn) return;
      hideTip();
    }, true);
    tipRoot.addEventListener("focusin", (e) => {
      const btn = e.target.closest?.(tipSelector);
      if (!btn || btn.closest("#app-drawer")) return;
      showTipFor(btn, 0);
    });
    tipRoot.addEventListener("focusout", (e) => {
      const btn = e.target.closest?.(tipSelector);
      if (!btn || tipBtn !== btn) return;
      const related = e.relatedTarget?.closest?.(tipSelector);
      if (related === btn) return;
      hideTip();
    });
    tipRoot.addEventListener("pointerdown", (e) => {
      const btn = e.target.closest?.(tipSelector);
      if (!btn) return;
      if (btn.closest("#app-drawer")) return;
      // Mouse: clear tip so it doesn't sit over a slide gesture.
      if (e.pointerType === "mouse") { hideTip(); return; }
      // Touch: show slide tips immediately; icon tips after a short hold.
      showTipFor(btn, isSlideTipBtn(btn) ? 0 : 420);
    }, true);
    tipRoot.addEventListener("pointerup", hideTip, true);
    tipRoot.addEventListener("pointercancel", hideTip, true);
    tipRoot.addEventListener("scroll", hideTip, true);
  }

  async function saveRoomOrder(order) {
    if (!order?.length) {
      flash("No rooms to save", true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const paths = ["room-order", "settings/room-order"];
    let lastMsg = "Could not save room order";
    for (const path of paths) {
      try {
        let r = await fetch(withToken(path), {
          method: "POST",
          cache: "no-store",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
        if (r.status === 404) continue;
        r = await fetch(withToken(path + "?order=" + encodeURIComponent(order.join(","))), {
          method: "GET",
          cache: "no-store",
          headers,
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    flash(lastMsg === "Could not save room order"
      ? "Could not save room order — update the hub app code and try again"
      : lastMsg, true);
    return false;
  }

  // Keep order persistence in core so mld-app-post.js retains File Manager headroom.
  async function saveDeviceIdOrder(order, noun, paths, emptyMsg) {
    if (!order?.length) {
      flash(emptyMsg || ("No " + noun + " to save"), true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const fail = "Could not save " + noun + " order";
    let lastMsg = fail;
    for (const path of paths) {
      try {
        let r = await fetch(withToken(path), {
          method: "POST",
          cache: "no-store",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ order }),
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
        if (r.status === 404) continue;
        r = await fetch(withToken(path + "?order=" + encodeURIComponent(order.join(","))), {
          method: "GET",
          cache: "no-store",
          headers,
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    flash(lastMsg === fail ? (fail + " — update the hub app code and try again") : lastMsg, true);
    return false;
  }

  async function saveCameraOrder(order) {
    return saveDeviceIdOrder(order, "camera", ["camera-order", "settings/camera-order"], "No cameras to save");
  }

  async function saveThermostatOrder(order) {
    return saveDeviceIdOrder(order, "thermostat", ["thermostat-order", "settings/thermostat-order"], "No thermostats to save");
  }

  function isTstatReorderActive() {
    return tstatReorderActive;
  }

  function sortThermostatsByOrder(list, order) {
    const items = Array.isArray(list) ? list.slice() : [];
    const fallback = () => postCall("sortByRoomThenFullName", items) || items;
    if (!order?.length) return fallback();
    const byId = new Map(items.map((t) => [Number(t.i), t]));
    const sorted = [];
    const seen = new Set();
    for (const rawId of order) {
      const id = Number(rawId);
      const t = byId.get(id);
      if (!t) continue;
      sorted.push(t);
      seen.add(id);
    }
    const rest = items.filter((t) => !seen.has(Number(t.i)));
    const restSorted = postCall("sortByRoomThenFullName", rest);
    sorted.push(...(Array.isArray(restSorted) ? restSorted : rest));
    return sorted;
  }

  function tstatReorderGrid() {
    return postCall("currentBody")?.querySelector?.(".quick-fav-grid") || null;
  }

  function currentTstatOrderFromDom() {
    const grid = tstatReorderGrid();
    if (!grid) return thermostats.map((t) => Number(t.i));
    return Array.from(grid.querySelectorAll(".quick-fav-tstat"))
      .map((el) => Number(el.dataset.tstatId))
      .filter((id) => Number.isFinite(id));
  }

  function updateTstatDraftOrderFromDom() {
    tstatReorderDraftOrder = currentTstatOrderFromDom();
  }

  function clearTstatReorderEls() {
    tstatReorderEls.clear();
  }

  function registerTstatReorderControls(id, moveUp, moveDown) {
    tstatReorderEls.set(Number(id), { moveUp, moveDown });
  }

  function updateTstatMoveButtons() {
    if (!tstatReorderActive) return;
    const grid = tstatReorderGrid();
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(".quick-fav-tstat"));
    cards.forEach((card, i) => {
      const rec = tstatReorderEls.get(Number(card.dataset.tstatId));
      if (!rec?.moveUp || !rec?.moveDown) return;
      rec.moveUp.disabled = i === 0;
      rec.moveDown.disabled = i === cards.length - 1;
    });
  }

  function moveTstat(id, delta) {
    const grid = tstatReorderGrid();
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(".quick-fav-tstat"));
    const idx = cards.findIndex((c) => Number(c.dataset.tstatId) === Number(id));
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cards.length) return;
    const card = cards[idx];
    const sibling = cards[newIdx];
    if (delta < 0) grid.insertBefore(card, sibling);
    else grid.insertBefore(sibling, card);
    updateTstatDraftOrderFromDom();
    updateTstatMoveButtons();
    hapticTap();
  }

  function attachTstatReorder(card, handle) {
    let active = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let floatOffsetY = 0;
    let placeholder = null;

    function visibleCards() {
      const el = tstatReorderGrid();
      if (!el) return [];
      return Array.from(el.querySelectorAll(".quick-fav-tstat:not(.tstat-dragging)"));
    }

    function movePlaceholderForY(y) {
      if (!placeholder) return;
      const el = tstatReorderGrid();
      if (!el) return;
      const cards = visibleCards();
      let insertBefore = null;
      for (const item of cards) {
        const rect = item.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = item;
          break;
        }
      }
      if (insertBefore) el.insertBefore(placeholder, insertBefore);
      else el.appendChild(placeholder);
    }

    function positionFloat(clientY) {
      card.style.top = (clientY - floatOffsetY) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      reorderBusy = true;
      const rect = card.getBoundingClientRect();
      floatOffsetY = e.clientY - rect.top;
      placeholder = ce("div", "tstat-drag-placeholder");
      placeholder.style.height = rect.height + "px";
      card.parentNode.insertBefore(placeholder, card);
      card.classList.add("tstat-dragging");
      card.style.width = rect.width + "px";
      card.style.left = rect.left + "px";
      card.style.top = rect.top + "px";
      positionFloat(e.clientY);
      movePlaceholderForY(e.clientY);
    }

    function commitDrag() {
      const el = tstatReorderGrid();
      if (placeholder?.parentNode && el) {
        el.insertBefore(card, placeholder);
        placeholder.remove();
      }
      card.classList.remove("tstat-dragging");
      card.style.width = "";
      card.style.left = "";
      card.style.top = "";
      placeholder = null;
      updateTstatDraftOrderFromDom();
      updateTstatMoveButtons();
    }

    function onMove(e) {
      if (!active) return;
      if (!dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (Math.hypot(dx, dy) < REORDER_DRAG_THRESHOLD) return;
        beginDrag(e);
      }
      positionFloat(e.clientY);
      movePlaceholderForY(e.clientY);
    }

    function onUp() {
      if (!active) return;
      if (dragging) commitDrag();
      active = false;
      dragging = false;
      reorderBusy = false;
    }

    postCall("bindReorderPointer", handle, () => tstatReorderActive, (e) => {
      active = true;
      startX = e.clientX;
      startY = e.clientY;
    }, onMove, onUp);
  }

  function enterTstatReorderMode() {
    if (thermostats.length < 2) {
      flash("Need at least two thermostats to reorder");
      return;
    }
    tstatReorderSnapshot = cfg.thermostatOrder?.length ? cfg.thermostatOrder.map(Number) : null;
    tstatReorderDraftOrder = null;
    tstatReorderEls.clear();
    postCall("stopPolling");
    reorderMode = true;
    tstatReorderActive = true;
    APP_EL?.classList.add("reorder-mode", "reorder-mode-thermostats");
    postCall("closeTopbarOverflowMenu");
    if (SEARCH_EL) {
      SEARCH_EL.value = "";
      postCall("applySearch");
    }
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = false;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = false;
    postCall("renderThermostatsPopup");
    updateTstatMoveButtons();
  }

  function exitTstatReorderMode(resumePoll) {
    tstatReorderActive = false;
    tstatReorderDraftOrder = null;
    tstatReorderSnapshot = null;
    tstatReorderEls.clear();
    reorderMode = false;
    reorderBusy = false;
    APP_EL?.classList.remove("reorder-mode", "reorder-mode-thermostats");
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = true;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = true;
    if (resumePoll) {
      postCall("startPolling");
      postCall("refresh");
    } else {
      postCall("renderThermostatsPopup");
    }
  }

  async function finishTstatReorderMode() {
    const order = tstatReorderDraftOrder ?? currentTstatOrderFromDom();
    const saved = await saveThermostatOrder(order);
    if (!saved) return false;
    cfg.thermostatOrder = order.length ? order.slice() : null;
    lastDataSig = "";
    exitTstatReorderMode(true);
    flash("Order saved");
    return true;
  }

  function cancelTstatReorderMode() {
    cfg.thermostatOrder = tstatReorderSnapshot?.length ? tstatReorderSnapshot.slice() : null;
    lastDataSig = "";
    exitTstatReorderMode(false);
  }

  // ---------- HTML attribute favorite tiles (core; keeps post.js under File Manager size limits) ----------
  function applyHtmlTileZoomToCard(card, zoom) {
    if (!card) return;
    const z = normalizeHtmlZoom(zoom);
    card.dataset.htmlZoom = String(z);
    card.style.setProperty("--html-zoom", String(z / 100));
  }

  function htmlTileThemeTokens(tile) {
    const rootStyles = getComputedStyle(document.documentElement);
    return {
      font: rootStyles.getPropertyValue("--font-sans").trim() || "system-ui, sans-serif",
      color: rootStyles.getPropertyValue("--text").trim() || "#f5f7fb",
      colorScheme: document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
      roomsCss: tile?.roomsCss || "",
      alignCss: tile?.alignCss || "",
      zoom: normalizeHtmlZoom(tile?.zoom),
    };
  }

  function sanitizeHtmlTileMarkup(raw) {
    const doc = new DOMParser().parseFromString(String(raw || ""), "text/html");
    for (const node of doc.querySelectorAll("script,meta[http-equiv]")) {
      if (node.tagName === "SCRIPT" || String(node.getAttribute("http-equiv") || "").toLowerCase() === "refresh") {
        node.remove();
      }
    }
    for (const el of doc.querySelectorAll("*")) {
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        const compactValue = String(attr.value || "").replace(/[\u0000-\u0020]+/g, "").toLowerCase();
        if (name.startsWith("on") || name === "srcdoc" || compactValue.includes("javascript:")) {
          el.removeAttribute(attr.name);
        }
      }
    }
    for (const style of doc.querySelectorAll("style")) {
      style.textContent = String(style.textContent || "").replace(/javascript\s*:/gi, "");
    }
    return doc;
  }

  function htmlTileStubUrlFromDoc(doc) {
    if (!doc?.body) return "";
    const frames = Array.from(doc.body.querySelectorAll("iframe[src]"));
    if (frames.length !== 1) return "";
    const frame = frames[0];
    for (const child of Array.from(doc.body.children)) {
      if (child !== frame && child.tagName !== "STYLE") return "";
    }
    const copy = doc.body.cloneNode(true);
    copy.querySelector("iframe[src]")?.remove();
    for (const style of copy.querySelectorAll("style")) style.remove();
    if (String(copy.textContent || "").trim()) return "";
    const src = String(frame.getAttribute("src") || "").trim();
    try {
      const url = new URL(src);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function htmlTileSrcdocFromDoc(doc, tokens) {
    const cleanCss = (value) => String(value || "").replace(/<\/style/gi, "<\\/style");
    const cleanCssValue = (value, fallback) => {
      const cleaned = String(value || "").replace(/[;{}<>]/g, "").trim();
      return cleaned || fallback;
    };
    const style = doc.createElement("style");
    style.setAttribute("data-mld-theme-bridge", "");
    const zoomPct = normalizeHtmlZoom(tokens?.zoom);
    style.textContent =
      ":root{color-scheme:" + cleanCssValue(tokens?.colorScheme, "dark") + ";}" +
      "html{zoom:" + (zoomPct / 100) + ";}" +
      "html,body{margin:0;padding:0;background:transparent;color:" + cleanCssValue(tokens?.color, "#f5f7fb") +
      ";font-family:" + cleanCssValue(tokens?.font, "system-ui, sans-serif") + ";}" +
      cleanCss(tokens?.roomsCss) + "\n" + cleanCss(tokens?.alignCss);
    doc.head.appendChild(style);
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  // One DOMParser pass: sanitize, then either stub URL or inline srcdoc.
  function prepareHtmlTileFrame(raw, tokens) {
    const doc = sanitizeHtmlTileMarkup(raw);
    const stubUrl = htmlTileStubUrlFromDoc(doc);
    if (stubUrl) return { kind: "stub", stubUrl };
    return { kind: "inline", srcdoc: htmlTileSrcdocFromDoc(doc, tokens) };
  }

  function configureHtmlTileIframe(iframe, tile, unavailableEl) {
    if (!iframe || !tile) return;
    const card = iframe.closest(".fav-html-card");
    if (card) applyHtmlTileZoomToCard(card, tile.zoom);
    const raw = tile.html == null ? "" : String(tile.html);
    iframe.dataset.html = raw;
    iframe.dataset.htmlTileId = tile.id;
    delete iframe.dataset.htmlMode;
    iframe.removeAttribute("srcdoc");
    iframe.src = "about:blank";
    const showUnavailable = (message) => {
      iframe.dataset.htmlMode = "unavailable";
      iframe.hidden = true;
      if (unavailableEl) {
        unavailableEl.hidden = false;
        unavailableEl.textContent = message;
      }
    };
    if (tile.error) {
      showUnavailable(tile.error === "too_large"
        ? "This HTML value is too large to display in the dashboard."
        : String(tile.error));
    } else if (!raw.trim()) {
      showUnavailable("No HTML is currently available for this source.");
    } else {
      const prepared = prepareHtmlTileFrame(raw, htmlTileThemeTokens(tile));
      if (prepared.kind === "stub" && !isLocalOrigin()) {
        const mixed = location.protocol === "https:" && new URL(prepared.stubUrl).protocol === "http:";
        showUnavailable(mixed
          ? "This local HTTP content is unavailable over a secure cloud connection."
          : "This HTML iframe source is available only from the local dashboard.");
      } else {
        iframe.hidden = false;
        if (unavailableEl) unavailableEl.hidden = true;
        if (prepared.kind === "stub") {
          iframe.dataset.htmlMode = "stub";
          iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
          iframe.src = prepared.stubUrl;
        } else {
          iframe.dataset.htmlMode = "inline";
          iframe.setAttribute("sandbox", "");
          iframe.srcdoc = prepared.srcdoc;
        }
      }
    }
    htmlTileIframes.set(tile.id, iframe);
  }

  function ensureHtmlTileLoaded(card) {
    if (!card || card.dataset.htmlLoaded === "1") return;
    const id = card.dataset.htmlTileId;
    const iframe = card.querySelector(".fav-html-iframe");
    const unavailable = card.querySelector(".fav-html-unavailable");
    const tile = htmlTiles.find((candidate) => candidate.id === id);
    if (!iframe || !tile) return;
    card.dataset.htmlLoaded = "1";
    configureHtmlTileIframe(iframe, tile, unavailable);
  }

  function observeFavHtmlCard(card) {
    if (!card) return;
    if (!("IntersectionObserver" in window)) {
      ensureHtmlTileLoaded(card);
      return;
    }
    if (!favHtmlObserver) {
      favHtmlObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) ensureHtmlTileLoaded(entry.target);
        }
      }, { root: null, rootMargin: "80px", threshold: 0.05 });
    }
    favHtmlObserver.observe(card);
  }

  function refreshHtmlTileIframes() {
    for (const [id, iframe] of htmlTileIframes) {
      if (!iframe?.isConnected) {
        htmlTileIframes.delete(id);
        continue;
      }
      if (iframe.dataset.htmlMode !== "inline") continue;
      const tile = htmlTiles.find((candidate) => candidate.id === id);
      if (!tile) continue;
      iframe.dataset.html = tile.html == null ? "" : String(tile.html);
      const prepared = prepareHtmlTileFrame(iframe.dataset.html, htmlTileThemeTokens(tile));
      if (prepared.kind === "inline") iframe.srcdoc = prepared.srcdoc;
      else configureHtmlTileIframe(iframe, tile, iframe.parentElement?.querySelector(".fav-html-unavailable"));
    }
  }

  function applyHtmlTileLiveAttr(deviceId, attr, value) {
    const parsedDeviceId = Number(deviceId);
    const attribute = String(attr || "");
    const tile = htmlTiles.find((candidate) =>
      Number(candidate.deviceId) === parsedDeviceId && candidate.attribute === attribute
    );
    if (!tile) return false;
    tile.html = value == null ? "" : String(value);
    delete tile.error;
    const iframe = htmlTileIframes.get(tile.id);
    // Not mounted yet (lazy): state is updated; paint happens when the card intersects.
    if (iframe?.isConnected) {
      const card = iframe.closest(".fav-html-card");
      if (card && card.dataset.htmlLoaded !== "1") return true;
      configureHtmlTileIframe(iframe, tile, iframe.parentElement?.querySelector(".fav-html-unavailable"));
      if (card) card.dataset.htmlLoaded = "1";
    }
    return true;
  }
