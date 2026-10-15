

  function currentNavOrderFromDom() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return [];
    return Array.from(nav.querySelectorAll(".nav-reorder-item"))
      .map(el => el.dataset.navKey)
      .filter(Boolean);
  }

  function updateNavDraftOrderFromDom() {
    navReorderDraftOrder = currentNavOrderFromDom();
  }

  function showAllNavForReorder() {
    const nav = document.querySelector(".quick-nav");
    let anyVisible = false;
    for (const [key, rec] of navEls) {
      const show = key === "lights" ? tabMode : quickNavPopupHasContent(key);
      if (rec.wrap) rec.wrap.hidden = !show;
      if (rec.btn) rec.btn.hidden = !show;
      if (show) anyVisible = true;
    }
    if (nav) nav.hidden = !anyVisible;
  }

  function cleanupNavDragState() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    nav.querySelectorAll(".nav-drag-placeholder").forEach((el) => el.remove());
    for (const [, rec] of navEls) {
      if (!rec?.wrap) continue;
      rec.wrap.classList.remove("nav-dragging");
      rec.wrap.style.width = "";
      rec.wrap.style.left = "";
      rec.wrap.style.top = "";
    }
  }

  async function saveNavOrder(order) {
    if (!order?.length) {
      flash("No icons to save", true);
      return false;
    }
    const headers = { "Accept": "application/json" };
    const paths = ["nav-order", "settings/nav-order"];
    let lastMsg = "Could not save icon order";
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
    flash(lastMsg === "Could not save icon order"
      ? "Could not save icon order — update the hub app code and try again"
      : lastMsg, true);
    return false;
  }

  async function postJson(path, body) {
    try {
      const r = await fetch(withToken(path), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        let msg = "Request failed";
        try {
          const j = await r.json();
          if (j?.error) msg = String(j.error);
        } catch {}
        flash(msg, true);
        return { ok: false };
      }
      let data = {};
      try { data = await r.json(); } catch {}
      applyDashSessionFromResponse(data);
      return { ok: true, data };
    } catch {
      flash("Request failed", true);
      return { ok: false };
    }
  }

  async function postJsonSilent(path, body) {
    try {
      const r = await fetch(withToken(path), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      let data = {};
      try { data = await r.json(); } catch {}
      applyDashSessionFromResponse(data);
      return { ok: r.ok, status: r.status, data, error: data?.error };
    } catch {
      return { ok: false, error: "Request failed" };
    }
  }

  async function setHsmApi(mode, pin, padApi) {
    const modeDef = [...HSM_INTRUSION_MODES, ...HSM_MONITORING_MODES].find((m) => m.cmd === mode);
    const prevStatus = hsmStatus;
    const prevAlert = hsmAlert;
    const prevAlertDesc = hsmAlertDesc;

    // Optimistic UI before the hub round-trip (cloud especially).
    if (mode === "cancelAlerts") {
      hsmAlert = "";
      hsmAlertDesc = "";
      setHsmLock();
      if (currentCategory() === "security") renderSecurityPopup();
    } else if (modeDef?.status) {
      // armAll only changes allDisarmed → disarmed; don't clobber armed* intrusion state.
      if (mode === "armAll") {
        if (String(hsmStatus || "").toLowerCase() === "alldisarmed") hsmStatus = modeDef.status;
      } else {
        hsmStatus = modeDef.status;
      }
      setHsmLock();
      if (currentCategory() === "security") renderSecurityPopup();
    }

    let result = await postJsonSilent("hsm", { mode, pin });
    if (!result.ok) {
      hsmStatus = prevStatus;
      hsmAlert = prevAlert;
      hsmAlertDesc = prevAlertDesc;
      clearHsmLock();
      if (currentCategory() === "security") renderSecurityPopup();
      if (result.status === 403 || result.error === "wrong pin") {
        padApi?.shake();
        return false;
      }
      if (result.error) flash(String(result.error), true);
      else flash("Could not change security status", true);
      padApi?.close();
      return false;
    }
    padApi?.close();
    // Hub often still reports the previous arm state in the command response.
    // Keep optimistic target unless the returned status already reflects this command.
    if (result.data?.status && hsmStatusSatisfiesCommand(mode, result.data.status)) {
      hsmStatus = result.data.status;
    }
    if (result.data?.alert !== undefined) hsmAlert = result.data.alert || "";
    if (result.data?.alertDesc !== undefined) hsmAlertDesc = result.data.alertDesc || "";
    if (currentCategory() === "security") renderSecurityPopup();
    return true;
  }

  async function setHubModeApi(mode) {
    // Silent POST first — Hubitat often rejects JSON POST while GET still works;
    // postJson would flash a false error before the fallback succeeds.
    let result = await postJsonSilent("hub-mode", { mode });
    if (result.ok) return true;
    try {
      const r = await fetch(withToken("hub-mode?mode=" + encodeURIComponent(mode)), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not set hub mode";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not set hub mode", true);
    }
    return false;
  }

  async function activateSceneApi(id) {
    let result = await postJson("scene/activate", { id });
    if (result.ok) return true;
    try {
      const r = await fetch(withToken("scene/activate?id=" + encodeURIComponent(id)), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not activate scene";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not activate scene", true);
    }
    return false;
  }

  async function bulkLightsApi(cmd, scope, roomId) {
    const body = { cmd, scope };
    if (scope === "room") body.roomId = roomId;
    let result = await postJson("lights/bulk", body);
    if (result.ok) return true;
    try {
      let url = "lights/bulk?cmd=" + encodeURIComponent(cmd) + "&scope=" + encodeURIComponent(scope);
      if (scope === "room") url += "&roomId=" + encodeURIComponent(roomId);
      const r = await fetch(withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not control lights";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not control lights", true);
    }
    return false;
  }

  async function snapshotSaveApi(scope, roomId) {
    const body = { scope };
    if (scope === "room") body.roomId = roomId;
    let result = await postJson("snapshot/save", body);
    if (result.ok) return true;
    try {
      let url = "snapshot/save?scope=" + encodeURIComponent(scope);
      if (scope === "room") url += "&roomId=" + encodeURIComponent(roomId);
      const r = await fetch(withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not save state";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not save state", true);
    }
    return false;
  }

  async function snapshotRestoreApi(scope, roomId) {
    const body = { scope };
    if (scope === "room") body.roomId = roomId;
    let result = await postJson("snapshot/restore", body);
    if (result.ok) return true;
    try {
      let url = "snapshot/restore?scope=" + encodeURIComponent(scope);
      if (scope === "room") url += "&roomId=" + encodeURIComponent(roomId);
      const r = await fetch(withToken(url), {
        method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
      });
      if (r.ok) return true;
      let msg = "Could not restore state";
      try { const j = await r.json(); if (j?.error) msg = String(j.error); } catch {}
      flash(msg, true);
    } catch {
      flash("Could not restore state", true);
    }
    return false;
  }

  async function saveFavorites(ids, sizes) {
    const paths = ["favorites"];
    let lastMsg = "Could not save favorites";
    const payload = { ids };
    if (sizes) payload.sizes = sizes;
    for (const path of paths) {
      try {
        let r = await fetch(withToken(path), {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.ok) {
          // Adopt server-normalized sizes / layout if provided.
          try {
            const body = await r.json();
            if (body?.sizes && typeof body.sizes === "object") {
              favoriteSizes = {};
              for (const k of Object.keys(body.sizes)) favoriteSizes[Number(k)] = String(body.sizes[k]);
              saveFavoriteSizesCache(favoriteSizes);
            }
            if (Array.isArray(body?.favoritesLayout) || Array.isArray(body?.embedCards) || Array.isArray(body?.timeCards) || Array.isArray(body?.notificationCards)) {
              applyEmbedConfigFromData({ config: body }, { allowDuringReorder: true });
            }
          } catch {}
          return true;
        }
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
        if (r.status === 404) continue;
        r = await fetch(withToken(path + "?ids=" + encodeURIComponent(ids.join(","))), {
          method: "GET", cache: "no-store", headers: { "Accept": "application/json" },
        });
        if (r.ok) return true;
        try {
          const body = await r.json();
          if (body?.error) lastMsg = String(body.error);
        } catch {}
      } catch {}
    }
    flash(lastMsg, true);
    return false;
  }

  function hubModeLocked() {
    return hubModeLockUntil > Date.now();
  }

  function clearHubModeLock() {
    if (hubModeLockTimer) {
      clearTimeout(hubModeLockTimer);
      hubModeLockTimer = null;
    }
    hubModeLockUntil = 0;
  }

  function setHubModeLock() {
    clearHubModeLock();
    hubModeLockUntil = Date.now() + LEVEL_OPTIMISTIC_MS;
    hubModeLockTimer = setTimeout(() => {
      hubModeLockTimer = null;
      hubModeLockUntil = 0;
      if (currentCategory() === "hub-mode") renderHubModePopup();
    }, LEVEL_OPTIMISTIC_MS);
  }

  function hsmLocked() {
    return hsmLockUntil > Date.now();
  }

  function hsmStatusSatisfiesCommand(mode, status) {
    const s = String(status || "").toLowerCase();
    switch (mode) {
      case "disarm": return s === "disarmed";
      case "disarmAll": return s === "alldisarmed";
      case "armAway": return s === "armedaway" || s === "armingaway";
      case "armHome": return s === "armedhome" || s === "arminghome";
      case "armNight": return s === "armednight" || s === "armingnight";
      case "armAll": return s !== "alldisarmed";
      default: return false;
    }
  }

  function clearHsmLock() {
    if (hsmLockTimer) {
      clearTimeout(hsmLockTimer);
      hsmLockTimer = null;
    }
    hsmLockUntil = 0;
  }

  function setHsmLock() {
    clearHsmLock();
    hsmLockUntil = Date.now() + LEVEL_OPTIMISTIC_MS;
    hsmLockTimer = setTimeout(() => {
      hsmLockTimer = null;
      hsmLockUntil = 0;
      refresh().then(() => {
        if (currentCategory() === "security") renderSecurityPopup();
      }).catch(() => {
        if (currentCategory() === "security") renderSecurityPopup();
      });
    }, LEVEL_OPTIMISTIC_MS);
  }

  function roomLabel(rid) {
    if (rid == null || rid === -1) return "Unassigned";
    return roomMap.get(rid) || "Room";
  }

  function compareByRoomThenFullName(a, b) {
    const ra = roomLabel(a.r).localeCompare(roomLabel(b.r), undefined, { sensitivity: "base" });
    if (ra !== 0) return ra;
    return String(a.n || "").localeCompare(String(b.n || ""), undefined, { sensitivity: "base" });
  }

  function sortByRoomThenFullName(devs) {
    return devs.slice().sort(compareByRoomThenFullName);
  }

  function snapshotRoomKey(roomKey) {
    return "room:" + roomKey;
  }

  function snapshotHouseKey() {
    return "house";
  }

  function setRoomGestureLock(on) {
    if (on) {
      roomGestureLockCount++;
      APP_EL?.classList.add("room-gesture-lock");
    } else {
      roomGestureLockCount = Math.max(0, roomGestureLockCount - 1);
      if (roomGestureLockCount === 0) APP_EL?.classList.remove("room-gesture-lock");
    }
  }

  const SLIDE_HOLD_MS = 400;
  const SLIDE_FALLBACK_COMMIT_PX = 86;
  const SLIDE_MIN_COMMIT_PX = 52;
  const SLIDE_TAP_MOVE = 10;
  const TIP_ROOM_OFF = "Tap to turn off · Hold & slide to save";
  const TIP_ROOM_ON = "Tap to turn on · Hold & slide to restore";

  function applyTip(btn, text) {
    if (!btn) return;
    const tip = text || btn.getAttribute("title") || btn.getAttribute("aria-label") || "";
    if (!tip) return;
    btn.setAttribute("data-tip", tip);
    // Avoid native + custom tip stacking; keep aria-label for a11y.
    btn.removeAttribute("title");
  }

  // Clears floating tips when a slide-to-save/restore reveal starts.
  // setupIconTipAffordances installs the real hide fn on __MLD._tipHide.
  function tipCtlHide() {
    const hide = globalThis.__MLD && globalThis.__MLD._tipHide;
    if (typeof hide === "function") hide();
  }

  function attachRoomSlideAction(track, primaryBtn, actionBtn, opts) {
    const { direction, onTap, onCommit, canCommit, clickFallback } = opts;
    let pointerId = null;
    let downX = 0;
    let downY = 0;
    let downT = 0;
    let holdTimer = null;
    let holdActive = false;
    let holdBlocked = false;
    let sliding = false;
    let slidePx = 0;
    let slideMaxPx = SLIDE_FALLBACK_COMMIT_PX;
    let gestureHandled = false;
    let suppressClick = false;
    let gestureRegistered = false;

    track.addEventListener("contextmenu", (e) => e.preventDefault());
    track.addEventListener("selectstart", (e) => e.preventDefault());
    track.addEventListener("lostpointercapture", (e) => {
      if (e.pointerId === pointerId) reset();
    });

    function actionWidth() {
      const rectW = actionBtn?.getBoundingClientRect?.().width || 0;
      const styleW = actionBtn ? parseFloat(getComputedStyle(actionBtn).maxWidth) || 0 : 0;
      return Math.max(rectW, styleW, SLIDE_FALLBACK_COMMIT_PX);
    }

    function setupSlideMetrics() {
      const primaryRect = primaryBtn.getBoundingClientRect();
      const actionStyle = actionBtn ? getComputedStyle(actionBtn) : null;
      const actionW = actionWidth();
      const thumbW = parseFloat(getComputedStyle(track).getPropertyValue("--slide-thumb-size")) || 28;
      const margin = actionStyle
        ? (direction === "left" ? parseFloat(actionStyle.marginRight) || 0 : parseFloat(actionStyle.marginLeft) || 0)
        : 0;
      const primaryW = primaryRect.width || 64;
      const start = direction === "left"
        ? actionW + margin + Math.max(0, (primaryW - thumbW) / 2)
        : Math.max(0, (primaryW - thumbW) / 2);
      slideMaxPx = Math.max(SLIDE_MIN_COMMIT_PX, Math.round((primaryW / 2) + margin + (actionW / 2)));
      track.style.setProperty("--slide-thumb-left", Math.round(start) + "px");
      applySlide();
    }

    function commitDistance() {
      return slideMaxPx || SLIDE_FALLBACK_COMMIT_PX;
    }

    function applySlide() {
      const signed = direction === "left" ? -slidePx : slidePx;
      track.style.setProperty("--slide-thumb-x", signed + "px");
      track.style.setProperty("--slide-progress", Math.min(1, slidePx / commitDistance()).toFixed(3));
    }

    function reset() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      holdActive = false;
      holdBlocked = false;
      sliding = false;
      slidePx = 0;
      slideMaxPx = SLIDE_FALLBACK_COMMIT_PX;
      suppressClick = false;
      track.style.removeProperty("--slide-thumb-x");
      track.style.removeProperty("--slide-thumb-left");
      track.style.removeProperty("--slide-progress");
      track.classList.remove("slide-confirm-active", "slide-confirm-revealed", "slide-confirm-target", "room-slide-active", "room-slide-revealed", "room-slide-target");
      setRoomGestureLock(false);
      try { track.releasePointerCapture(pointerId); } catch {}
      try { primaryBtn.releasePointerCapture(pointerId); } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      pointerId = null;
      if (gestureRegistered) {
        gestureRegistered = false;
        const idx = activeSlideGestures.indexOf(reset);
        if (idx >= 0) activeSlideGestures.splice(idx, 1);
      }
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - downX;
      const dy = e.clientY - downY;
      if (!holdActive) {
        if (Math.abs(dx) > SLIDE_TAP_MOVE || Math.abs(dy) > SLIDE_TAP_MOVE) {
          if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
          }
        }
        return;
      }
      if (!sliding) {
        if (Math.abs(dy) > Math.abs(dx) * 1.6 && Math.abs(dy) > 28) {
          reset();
          return;
        }
        sliding = true;
      }
      e.preventDefault();
      const maxSlide = commitDistance();
      if (direction === "left") {
        slidePx = Math.min(maxSlide, Math.max(0, -dx));
      } else {
        slidePx = Math.min(maxSlide, Math.max(0, dx));
      }
      applySlide();
      const atTarget = slidePx >= maxSlide;
      track.classList.toggle("slide-confirm-target", atTarget);
      track.classList.toggle("room-slide-target", atTarget);
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      const elapsed = Date.now() - downT;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);

      if (holdBlocked) {
        reset();
        return;
      }

      if (!holdActive && elapsed <= SLIDE_HOLD_MS + 80 && dx <= SLIDE_TAP_MOVE && dy <= SLIDE_TAP_MOVE) {
        reset();
        if (clickFallback) return;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; }, 0);
        onTap();
        return;
      }

      if (holdActive && slidePx >= commitDistance() && (!canCommit || canCommit())) {
        suppressClick = true;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; suppressClick = false; }, 0);
        reset();
        onCommit();
        return;
      }

      if (holdActive && slidePx > 0 && canCommit && !canCommit()) {
        flash("No saved state", true);
      }
      if (holdActive) {
        suppressClick = true;
        gestureHandled = true;
        setTimeout(() => { gestureHandled = false; suppressClick = false; }, 0);
      }
      reset();
    }

    primaryBtn.addEventListener("pointerdown", (e) => {
      if (reorderMode) return;
      if (e.button != null && e.button !== 0) return;
      if (pointerId != null) reset();
      if (!clickFallback) e.preventDefault();
      e.stopPropagation();
      pointerId = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;
      downT = Date.now();
      holdActive = false;
      holdBlocked = false;
      sliding = false;
      slidePx = 0;
      gestureHandled = false;
      suppressClick = false;
      if (!gestureRegistered) {
        gestureRegistered = true;
        activeSlideGestures.push(reset);
      }
      try { track.setPointerCapture(pointerId); } catch {
        try { primaryBtn.setPointerCapture(pointerId); } catch {}
      }
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (pointerId == null) return;
        if (canCommit && !canCommit()) {
          holdBlocked = true;
          flash("No saved state", true);
          return;
        }
        holdActive = true;
        suppressClick = true;
        tipCtlHide();
        track.classList.add("slide-confirm-active", "slide-confirm-revealed", "room-slide-active", "room-slide-revealed");
        setupSlideMetrics();
        setRoomGestureLock(true);
        hapticTap();
      }, SLIDE_HOLD_MS);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    });

    primaryBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (suppressClick || gestureHandled) {
        e.preventDefault();
        return;
      }
      if (clickFallback) onTap();
    });

    if (actionBtn) {
      actionBtn.addEventListener("pointerdown", (e) => e.preventDefault());
    }
  }

  function updateRoomSnapshotUi() {
    for (const [rid, rec] of roomEls) {
      const has = !!snapshots[snapshotRoomKey(rid)];
      rec.card.classList.toggle("room-has-snapshot", has);
      rec.card.classList.toggle("room-no-snapshot", !has);
      if (rec.restoreBtn) {
        rec.restoreBtn.disabled = !has;
        rec.restoreBtn.setAttribute("aria-disabled", has ? "false" : "true");
      }
    }
    const hasHouse = !!snapshots[snapshotHouseKey()];
    if (ALL_ON_TRACK) {
      ALL_ON_TRACK.classList.toggle("house-has-snapshot", hasHouse);
      ALL_ON_TRACK.classList.toggle("house-no-snapshot", !hasHouse);
    }
    if (ALL_ON_RESTORE_BTN) {
      ALL_ON_RESTORE_BTN.disabled = !hasHouse;
      ALL_ON_RESTORE_BTN.setAttribute("aria-disabled", hasHouse ? "false" : "true");
    }
  }

  function getFavoriteEntries() {
    const deviceById = new Map();
    for (const id of favorites) {
      // Prefer fan over light when the same device is in both pickers.
      const fan = ceilingFans.find(x => x.i === id);
      if (fan) { deviceById.set(id, { type: "fan", dev: fan }); continue; }
      const dev = devices.find(d => d.i === id);
      if (dev) { deviceById.set(id, { type: "light", dev }); continue; }
      const outlet = outlets.find(o => o.i === id);
      if (outlet) { deviceById.set(id, { type: "outlet", dev: outlet }); continue; }
      const t = thermostats.find(x => x.i === id);
      if (t) { deviceById.set(id, { type: "thermostat", dev: t }); continue; }
      const valve = valves.find(x => x.i === id);
      if (valve) { deviceById.set(id, { type: "sensor", dev: normalizeValveForCard(valve) }); continue; }
      const mp = music.find(x => x.i === id);
      if (mp) { deviceById.set(id, { type: "music", dev: mp }); continue; }
      const lk = locks.find(x => x.i === id);
      if (lk) { deviceById.set(id, { type: "lock", dev: lk }); continue; }
      const garage = garageDoors.find(x => x.i === id);
      if (garage) { deviceById.set(id, { type: "garage", dev: garage }); continue; }
      const shade = windowShades.find(x => x.i === id);
      if (shade) { deviceById.set(id, { type: "shade", dev: shade }); continue; }
      const ts = tempSensors.find(x => x.i === id);
      const sen = sensors.find(x => x.i === id);
      const sensorDev = MLDDomain.buildMergedSensorCard(ts, sen);
      if (sensorDev) { deviceById.set(id, { type: "sensor", dev: sensorDev }); continue; }
    }
    const embedById = new Map((Array.isArray(embedCards) ? embedCards : []).map((c) => [c.id, c]));
    const timeById = new Map((Array.isArray(timeCards) ? timeCards : []).map((c) => [c.id, c]));
    const notifById = new Map((Array.isArray(notificationCards) ? notificationCards : []).map((c) => [c.id, c]));
    const htmlById = new Map((Array.isArray(htmlTiles) ? htmlTiles : []).map((tile) => [tile.id, tile]));
    const layout = normalizeFavoritesLayout(
      Array.isArray(favoritesLayout) ? favoritesLayout : [],
      favorites,
      Array.isArray(embedCards) ? embedCards : [],
      Array.isArray(timeCards) ? timeCards : [],
      Array.isArray(notificationCards) ? notificationCards : [],
      Array.isArray(htmlTiles) ? htmlTiles : []
    );
    const out = [];
    const seen = new Set();
    for (const key of layout) {
      if (seen.has(key)) continue;
      if (key.startsWith("d:")) {
        const entry = deviceById.get(Number(key.slice(2)));
        if (!entry) continue;
        seen.add(key);
        out.push(entry);
      } else if (key.startsWith("e:")) {
        const card = embedById.get("e_" + key.slice(2));
        if (!card) continue;
        seen.add(key);
        out.push({ type: "embed", card });
      } else if (key.startsWith("t:")) {
        const card = timeById.get("t_" + key.slice(2));
        if (!card) continue;
        seen.add(key);
        out.push({ type: "time", card });
      } else if (key.startsWith("n:")) {
        const card = notifById.get("n_" + key.slice(2));
        if (!card) continue;
        seen.add(key);
        out.push({ type: "notifications", card });
      } else if (key.startsWith("h:")) {
        const tile = htmlById.get(key.slice(2));
        if (!tile) continue;
        seen.add(key);
        out.push({ type: "html", tile });
      }
    }
    for (const [id, entry] of deviceById) {
      const key = deviceFavoriteKey(id);
      if (!seen.has(key)) out.push(entry);
    }
    for (const card of Array.isArray(embedCards) ? embedCards : []) {
      const key = embedFavoriteKey(card.id);
      if (!seen.has(key)) out.push({ type: "embed", card });
    }
    for (const card of Array.isArray(timeCards) ? timeCards : []) {
      const key = timeFavoriteKey(card.id);
      if (!seen.has(key)) out.push({ type: "time", card });
    }
    for (const card of Array.isArray(notificationCards) ? notificationCards : []) {
      const key = notificationFavoriteKey(card.id);
      if (!seen.has(key)) out.push({ type: "notifications", card });
    }
    return out;
  }

  function updateAllFavButtons() {
    for (const [, rec] of devMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of outletMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of favDevMap) syncFavButton(rec.el.querySelector(".tile-fav"), rec.data.i);
    for (const [, rec] of sensorCardMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favSensorMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favMusicMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favLockMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favGarageMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favShadeMap) syncFavButton(rec.favBtn, rec.i);
    for (const [, rec] of favFanMap) syncFavButton(rec.favBtn, rec.i);
    updateTstatFavButton();
    if (fanMasterPopup?.classList.contains("open")) postCall("updateFanMasterHead");
    if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterHead");
  }

  function attachFavButton(btn, id) {
    btn.innerHTML = FAVORITES_SVG;
    syncFavButton(btn, id);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      toggleFavorite(id);
    });
  }

  async function toggleFavorite(id) {
    if (postCall("isFavoritesReorderActive")) {
      flash("Finish reordering favorites first", true);
      return;
    }
    const numId = Number(id);
    if (!isFavoriteableDeviceId(numId)) return;
    const idx = favorites.indexOf(numId);
    const wasFav = idx >= 0;
    const prevSizes = { ...favoriteSizes };
    if (wasFav) favorites.splice(idx, 1);
    else favorites.push(numId);
    if (wasFav) delete favoriteSizes[numId];
    saveFavoriteSizesCache(favoriteSizes);
    updateAllFavButtons();
    updateQuickNavVisibility();
    if (currentCategory() === "favorites") renderFavoritesPopup();
    else if (quickPopupOpenType === "locks") renderLocksPopup();
    else if (quickPopupOpenType === "music") renderMusicPopup();
    else if (quickPopupOpenType === "blinds") refreshBlindsPopup();
    else if (quickPopupOpenType === "fans") refreshFansPopup();
    const ok = await saveFavorites(favorites, normalizedFavoriteSizes(favorites));
    if (!ok) {
      if (wasFav) favorites.push(numId);
      else favorites.splice(favorites.indexOf(numId), 1);
      favoriteSizes = prevSizes;
      saveFavoriteSizesCache(favoriteSizes);
      updateAllFavButtons();
      updateQuickNavVisibility();
      if (currentCategory() === "favorites") renderFavoritesPopup();
      else if (quickPopupOpenType === "locks") renderLocksPopup();
      else if (quickPopupOpenType === "music") renderMusicPopup();
      else if (quickPopupOpenType === "blinds") refreshBlindsPopup();
      else if (quickPopupOpenType === "fans") refreshFansPopup();
    }
  }

  function currentRoomOrderFromDom() {
    return Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden)"))
      .map(el => Number(el.dataset.roomId));
  }

  function updateDraftOrderFromDom() {
    reorderDraftOrder = currentRoomOrderFromDom();
  }

  function updateMoveButtons() {
    if (!reorderMode) return;
    const cards = Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden)"));
    cards.forEach((card, i) => {
      const rec = roomEls.get(Number(card.dataset.roomId));
      if (!rec?.moveUp || !rec?.moveDown) return;
      rec.moveUp.disabled = i === 0;
      rec.moveDown.disabled = i === cards.length - 1;
    });
  }

  function moveRoom(rid, delta) {
    const cards = Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden)"));
    const idx = cards.findIndex(c => Number(c.dataset.roomId) === rid);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= cards.length) return;
    const card = cards[idx];
    const sibling = cards[newIdx];
    if (delta < 0) ROOMS_EL.insertBefore(card, sibling);
    else ROOMS_EL.insertBefore(sibling, card);
    updateDraftOrderFromDom();
    updateMoveButtons();
    hapticTap();
  }

  function enterReorderMode() {
    if (tabMode && activeTab === "cameras" && cameras.length) {
      if (!isLocalOrigin()) {
        flash("Camera reorder requires the local dashboard URL", true);
        return;
      }
      postCall("enterCameraReorderMode");
      return;
    }
    if (tabMode && activeTab === "favorites") {
      postCall("enterFavoritesReorderMode");
      return;
    }
    if (postCall("currentCategory") === "thermostats" || (tabMode && activeTab === "thermostats")) {
      postCall("enterTstatReorderMode");
      return;
    }
    reorderSnapshot = cfg.roomOrder?.length ? cfg.roomOrder.slice() : null;
    reorderDraftOrder = currentRoomOrderFromDom();
    navReorderSnapshot = cfg.navOrder?.length ? cfg.navOrder.slice() : null;
    navReorderDraftOrder = currentNavOrderFromDom();
    for (const [, rec] of roomEls) rec.card.classList.remove("collapsed");
    updateExpandAllBtn();
    stopPolling();
    reorderMode = true;
    APP_EL?.classList.toggle("reorder-mode", true);
    closeTopbarOverflowMenu();
    relocateNavForReorder();
    showAllNavForReorder();
    if (SEARCH_EL) {
      SEARCH_EL.value = "";
      applySearch();
    }
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = false;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = false;
    updateMoveButtons();
  }

  function exitReorderMode(resumePoll) {
    reorderMode = false;
    reorderBusy = false;
    reorderDraftOrder = null;
    reorderSnapshot = null;
    navReorderDraftOrder = null;
    navReorderSnapshot = null;
    APP_EL?.classList.toggle("reorder-mode", false);
    restoreNavAfterReorder();
    cleanupNavDragState();
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = true;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = true;
    updateQuickNavVisibility();
    if (resumePoll) {
      startPolling();
      refresh();
    } else {
      applySearch();
    }
  }

  async function finishReorderMode() {
    if (postCall("isCameraReorderActive")) {
      await postCall("finishCameraReorderMode");
      return;
    }
    if (postCall("isFavoritesReorderActive")) {
      await postCall("finishFavoritesReorderMode");
      return;
    }
    if (postCall("isTstatReorderActive")) {
      await postCall("finishTstatReorderMode");
      return;
    }
    const order = reorderDraftOrder ?? currentRoomOrderFromDom();
    const navOrder = navReorderDraftOrder ?? currentNavOrderFromDom();
    const [roomsSaved, navSaved] = await Promise.all([
      saveRoomOrder(order),
      saveNavOrder(navOrder),
    ]);
    if (!roomsSaved || !navSaved) return;
    cfg.roomOrder = order.length ? order.slice() : null;
    cfg.navOrder = navOrder.length ? navOrder.slice() : null;
    lastDataSig = "";
    exitReorderMode(true);
    flash("Order saved");
  }

  function cancelReorderMode() {
    if (postCall("isCameraReorderActive")) {
      postCall("cancelCameraReorderMode");
      return;
    }
    if (postCall("isFavoritesReorderActive")) {
      postCall("cancelFavoritesReorderMode");
      return;
    }
    if (postCall("isTstatReorderActive")) {
      postCall("cancelTstatReorderMode");
      return;
    }
    cfg.roomOrder = reorderSnapshot ? reorderSnapshot.slice() : null;
    cfg.navOrder = navReorderSnapshot ? navReorderSnapshot.slice() : null;
    lastDataSig = "";
    exitReorderMode(false);
    postCall("applyNavOrder", postCall("getDisplayNavOrder"));
    buildDom();
  }

  let topbarOverflowDismiss = null;

  function closeTopbarOverflowMenu() {
    if (!OVERFLOW_MENU || !OVERFLOW_BTN) return;
    OVERFLOW_MENU.hidden = true;
    OVERFLOW_BTN.setAttribute("aria-expanded", "false");
    if (topbarOverflowDismiss) {
      document.removeEventListener("click", topbarOverflowDismiss.onClick);
      document.removeEventListener("keydown", topbarOverflowDismiss.onKey);
      topbarOverflowDismiss = null;
    }
  }

  function openTopbarOverflowMenu() {
    if (!OVERFLOW_MENU || !OVERFLOW_BTN || reorderMode) return;
    updateLocalModeMenuUI();
    updateCamerasLayoutMenuVisibility();
    updateSensorsOrgMenuVisibility();
    updateAddEmbedMenuVisibility();
    updateReorderMenuLabel();
    OVERFLOW_MENU.hidden = false;
    OVERFLOW_BTN.setAttribute("aria-expanded", "true");
    const onClick = (e) => {
      if (OVERFLOW_MENU.contains(e.target) || OVERFLOW_BTN.contains(e.target)) return;
      closeTopbarOverflowMenu();
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeTopbarOverflowMenu();
    };
    topbarOverflowDismiss = { onClick, onKey };
    setTimeout(() => {
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
    }, 0);
  }

  function toggleTopbarOverflowMenu() {
    if (!OVERFLOW_MENU) return;
    if (OVERFLOW_MENU.hidden) openTopbarOverflowMenu();
    else closeTopbarOverflowMenu();
  }

  // iOS Safari: skip setPointerCapture (it fires pointercancel) and lock touchmove.
  function bindReorderPointer(handle, enabled, onDown, onMove, onUp) {
    handle.addEventListener("pointerdown", (e) => {
      if (!enabled()) return;
      if (e.button != null && e.button !== 0) return;
      e.stopPropagation();
      if (e.pointerType !== "touch") e.preventDefault();
      const pointerId = e.pointerId;
      const ua = navigator.userAgent || "";
      const ios = /iP(ad|hone|od)/.test(ua)
        || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (!ios) {
        try { handle.setPointerCapture(pointerId); } catch {}
      }
      document.body.classList.add("reorder-dragging");
      const pass = { passive: false };
      function preventTouch(ev) { ev.preventDefault(); }
      function move(ev) {
        if (ev.pointerId !== pointerId) return;
        ev.preventDefault();
        onMove(ev);
      }
      let ended = false;
      function stop(ev) {
        if (ended) return;
        if (ev && ev.pointerId != null && ev.pointerId !== pointerId) return;
        ended = true;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        window.removeEventListener("touchmove", preventTouch);
        document.body.classList.remove("reorder-dragging");
        try { handle.releasePointerCapture(pointerId); } catch {}
        onUp(ev);
      }
      window.addEventListener("pointermove", move, pass);
      window.addEventListener("pointerup", stop, pass);
      window.addEventListener("pointercancel", stop, pass);
      window.addEventListener("touchmove", preventTouch, pass);
      onDown(e, stop);
    });
  }

  function attachRoomReorder(card, handle) {
    let active = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let floatOffsetY = 0;
    let placeholder = null;

    function visibleRooms() {
      return Array.from(ROOMS_EL.querySelectorAll(".room:not(.hidden):not(.room-dragging)"));
    }

    function movePlaceholderForY(y) {
      if (!placeholder) return;
      const roomCards = visibleRooms();
      let insertBefore = null;
      for (const roomCard of roomCards) {
        const rect = roomCard.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = roomCard;
          break;
        }
      }
      if (insertBefore) ROOMS_EL.insertBefore(placeholder, insertBefore);
      else ROOMS_EL.appendChild(placeholder);
    }

    function positionFloat(clientY) {
      card.style.top = (clientY - floatOffsetY) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      reorderBusy = true;
      const rect = card.getBoundingClientRect();
      floatOffsetY = e.clientY - rect.top;
      placeholder = ce("div", "room-drag-placeholder");
      placeholder.style.height = rect.height + "px";
      card.parentNode.insertBefore(placeholder, card);
      card.classList.add("room-dragging");
      card.style.width = rect.width + "px";
      card.style.left = rect.left + "px";
      card.style.top = rect.top + "px";
      positionFloat(e.clientY);
      movePlaceholderForY(e.clientY);
    }

    function commitDrag() {
      if (placeholder?.parentNode) {
        ROOMS_EL.insertBefore(card, placeholder);
        placeholder.remove();
      }
      card.classList.remove("room-dragging");
      card.style.width = "";
      card.style.left = "";
      card.style.top = "";
      placeholder = null;
      updateDraftOrderFromDom();
      updateMoveButtons();
    }

    function onMove(e) {
      if (!active) return;
      if (!dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragThresholdExceeded(dx, dy, REORDER_DRAG_THRESHOLD)) return;
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

    bindReorderPointer(handle, () => reorderMode, (e) => {
      active = true;
      startX = e.clientX;
      startY = e.clientY;
    }, onMove, onUp);
  }

  function attachNavReorder(wrap, handle) {
    let active = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let floatOffsetX = 0;
    let placeholder = null;
    const nav = () => document.querySelector(".quick-nav");

    function visibleItems() {
      const el = nav();
      if (!el) return [];
      return Array.from(el.querySelectorAll(".nav-reorder-item:not(.nav-dragging)"));
    }

    function movePlaceholderForX(x) {
      if (!placeholder) return;
      const el = nav();
      if (!el) return;
      const items = visibleItems();
      let insertBefore = null;
      for (const item of items) {
        const rect = item.getBoundingClientRect();
        if (x < rect.left + rect.width / 2) {
          insertBefore = item;
          break;
        }
      }
      if (insertBefore) {
        const stack = insertBefore.closest(".fav-reorder-compact-stack");
        if (stack?.parentNode === el) el.insertBefore(placeholder, stack);
        else insertBefore.parentNode.insertBefore(placeholder, insertBefore);
      } else {
        el.appendChild(placeholder);
      }
    }

    function positionFloat(clientX) {
      wrap.style.left = (clientX - floatOffsetX) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      reorderBusy = true;
      const rect = wrap.getBoundingClientRect();
      floatOffsetX = e.clientX - rect.left;
      placeholder = ce("div", "nav-drag-placeholder");
      placeholder.style.width = rect.width + "px";
      placeholder.style.height = rect.height + "px";
      wrap.parentNode.insertBefore(placeholder, wrap);
      wrap.classList.add("nav-dragging");
      wrap.style.width = rect.width + "px";
      wrap.style.left = rect.left + "px";
      wrap.style.top = rect.top + "px";
      positionFloat(e.clientX);
      movePlaceholderForX(e.clientX);
    }

    function commitDrag() {
      const el = nav();
      if (placeholder?.parentNode && el) el.insertBefore(wrap, placeholder);
      placeholder?.remove();
      wrap.classList.remove("nav-dragging");
      wrap.style.width = "";
      wrap.style.left = "";
      wrap.style.top = "";
      placeholder = null;
      updateNavDraftOrderFromDom();
    }

    function onMove(e) {
      if (!active) return;
      if (!dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragThresholdExceeded(dx, dy, REORDER_DRAG_THRESHOLD)) return;
        beginDrag(e);
      }
      positionFloat(e.clientX);
      movePlaceholderForX(e.clientX);
    }

    function onUp() {
      if (!active) return;
      try {
        if (dragging) commitDrag();
      } finally {
        if (placeholder?.parentNode) {
          placeholder.remove();
          placeholder = null;
        }
        if (wrap.classList.contains("nav-dragging")) {
          wrap.classList.remove("nav-dragging");
          wrap.style.width = "";
          wrap.style.left = "";
          wrap.style.top = "";
        }
        active = false;
        dragging = false;
        reorderBusy = false;
      }
    }

    bindReorderPointer(handle, () => reorderMode, (e) => {
      active = true;
      startX = e.clientX;
      startY = e.clientY;
    }, onMove, onUp);
  }

  function setupNavReorderItems() {
    const nav = document.querySelector(".quick-nav");
    if (!nav || nav.dataset.reorderReady) return;
    nav.dataset.reorderReady = "1";
    const entries = [{ key: "lights", btn: QUICK_LIGHTS_BTN }];
    for (const { id, popup } of QUICK_NAV) entries.push({ key: popup, btn: document.getElementById(id) });
    for (const { key, btn } of entries) {
      if (!btn) continue;
      btn.dataset.navKey = key;
      const wrap = ce("div", "nav-reorder-item");
      wrap.dataset.navKey = key;
      nav.insertBefore(wrap, btn);
      wrap.appendChild(btn);
      const handle = ce("button", "nav-drag-handle");
      handle.type = "button";
      handle.setAttribute("aria-label", "Drag to reorder");
      handle.innerHTML = DRAG_HANDLE_SVG;
      wrap.appendChild(handle);
      attachNavReorder(wrap, handle);
      navEls.set(key, { wrap, btn, handle });
    }
  }

  function relocateNavForReorder() {
    if (!cfg.enableDrawer || navReorderDrawerRelocated) return;
    const d = resolveDrawerDom();
    const nav = document.querySelector(".quick-nav");
    if (!d || !nav || nav.parentElement === d.topbar) return;
    if (drawerOpen || drawerClosing) closeDrawer();
    d.topbar.appendChild(nav);
    navReorderDrawerRelocated = true;
  }

  function restoreNavAfterReorder() {
    if (!navReorderDrawerRelocated) return;
    const d = resolveDrawerDom();
    const nav = document.querySelector(".quick-nav");
    if (d && nav) d.navSlot.appendChild(nav);
    navReorderDrawerRelocated = false;
  }

  function captureUiScroll() {
    const snap = { y: window.scrollY || document.documentElement.scrollTop || 0 };
    const panel = document.querySelector(".quick-popup.open .quick-panel");
    if (panel) snap.panelY = panel.scrollTop;
    const scrollBody = (tabMode && activeTab !== "lights" && tabViewEl)
      ? tabViewEl
      : document.querySelector(".quick-popup.open .quick-body");
    const list = scrollBody && scrollBody.querySelector(".quick-list");
    if (list) snap.listY = list.scrollTop;
    return snap;
  }

  function restoreUiScroll(snap) {
    if (!snap) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const scrollBody = (tabMode && activeTab !== "lights" && tabViewEl)
          ? tabViewEl
          : document.querySelector(".quick-popup.open .quick-body");
        const list = scrollBody && scrollBody.querySelector(".quick-list");
        if (snap.listY != null && list) list.scrollTop = snap.listY;
        const panel = document.querySelector(".quick-popup.open .quick-panel");
        if (snap.panelY != null && panel) panel.scrollTop = snap.panelY;
        if (snap.y > 0) window.scrollTo(0, snap.y);
      });
    });
  }

  function render(d) {
    replaceList(hubModes, d.hubModes);
    if (!hubModeLocked()) currentHubMode = d.currentHubMode || "";
    if (!hsmLocked()) {
      hsmStatus = d.hsmStatus || "";
      hsmAlert = d.hsmAlert || "";
      hsmAlertDesc = d.hsmAlertDesc || "";
    }
    hsmEnabled = !!d.hsmEnabled;
    hsmPinRequired = !!d.hsmPinRequired;
    thermostatsPopupEnabled = d.thermostatsPopupEnabled !== false;
    outletsSeparateTab = !!d.outletsSeparateTab;
    hubModePopupEnabled = d.hubModePopupEnabled !== false;
    scenesPopupEnabled = d.scenesPopupEnabled !== false;
    roomClimateEnabled = d.roomClimateEnabled !== false;
    schedulerEnabled = d.schedulerEnabled !== false;
    if (d.triggersEnabled != null) triggersEnabled = !!d.triggersEnabled;
    if (d.alertsArmed != null) applyAlertsArmed(!!d.alertsArmed);
    if (d.alertsArmSwitchId != null) {
      const n = Number(d.alertsArmSwitchId);
      alertsArmSwitchId = Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(d.triggerSourceIds)) {
      triggerSourceIds = new Set(
        d.triggerSourceIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      );
    }
    unlockPinEnabled = !!d.unlockPinEnabled;
    unlockPinRequired = !!d.unlockPinRequired;
    postCall("applyNotificationsFromData", d);
    void postCall("fetchTriggerActions");
    replaceList(scenes, d.scenes);
    replaceList(locks, d.locks);
    replaceList(garageDoors, d.garageDoors);
    replaceList(windowShades, d.windowShades);
    replaceList(ceilingFans, d.ceilingFans);
    replaceList(valves, Array.isArray(d.valves) ? d.valves : []);
    replaceList(music, d.music);
    replaceList(cameras, sortCamerasByOrder(Array.isArray(d.cameras) ? d.cameras : [], cfg.cameraOrder));
    if (Array.isArray(d.config?.favorites) && !postCall("isFavoritesReorderActive") && !embedEditorOpen && !globalThis.__MLD?.embedEditorOpen) {
      replaceList(favorites, d.config.favorites.map(Number));
      const favSet = new Set(favorites);
      for (const k of Object.keys(favoriteSizes)) {
        if (!favSet.has(Number(k))) delete favoriteSizes[Number(k)];
      }
    }
    const htmlCfgChanged = applyHtmlCatalogFromData(d);
    const embedCfgChanged = applyEmbedConfigFromData(d);
    syncEmbedStateToMld();
    reapplyLockOptimistic();
    reapplyGarageOptimistic();
    reapplyShadeOptimistic();
    reapplyFanOptimistic();
    try { reapplyValveOptimistic(); } catch {}
    reapplyMusicOptimistic();
    reapplySetpointOptimistic();

    replaceList(rooms, sortRoomsByOrder(d.rooms || [], cfg.roomOrder));
    syncRoomMap();
    replaceList(devices, d.devices);
    replaceList(outlets, d.outlets);
    replaceList(thermostats, d.thermostats);
    replaceList(tempSensors, d.tempSensors);
    replaceList(sensors, d.sensors);
    const favSizesChanged = applyFavoriteSizesFromConfig(d);
    snapshots = d.snapshots && typeof d.snapshots === "object" ? d.snapshots : {};
    rebuildDevicesByRoom();
    rebuildOutletsByRoom();
    reapplySwitchOptimistic();
    reapplyTstatDeviceModeLocks();
    reapplyTstatFanModeLocks();
    reapplyTstatVaneLocks();
    applyTstatSessionModeLock();

    repopulateThermoByRoom();
    repopulateSensorByRoom();
    ensureRoomsFromDevices();
    updateQuickNavVisibility();

    if (!devices.length && !outlets.length && !thermostats.length && !tempSensors.length) { noDevicesState(); return; }

    const groups = new Map();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const hasContent = (rid) => (groups.get(normalizeRoomId(rid))?.length || roomShowsClimate(rid));
    const displayOrder = getDisplayRoomIds(groups, hasContent);

    const sig = displayOrder.join(",") + "|" + devices.map(x => x.i).join(",")
      + "|" + outlets.map(x => x.i).join(",") + "|" + (outletsSeparateTab ? 1 : 0)
      + "|" + thermostats.map(x => x.i).join(",") + "|" + tempSensors.map(x => x.i).join(",")
      + "|" + (roomClimateEnabled ? 1 : 0);
    const fullRerender = sig !== lastDataSig;
    lastDataSig = sig;

    const scrollSnap = captureUiScroll();
    if (fullRerender && !reorderMode) buildDom();
    updateRoomSnapshotUi();
    updateStates();
    updateClimateWidgets();
    applySearch();
    refreshQuickPopupIfOpen();
    if ((favSizesChanged || embedCfgChanged || htmlCfgChanged) && currentCategory() === "favorites") renderFavoritesPopup();
    restoreUiScroll(scrollSnap);
  }

  function buildDom() {
    ROOMS_EL.innerHTML = "";
    roomEls.clear(); devMap.clear(); outletMap.clear(); climateEls.clear();

    // group devices by room id (null/undefined -> -1 Unassigned)
    const groups = new Map();
    for (const dev of devices) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    const outletGroups = new Map();
    if (outletsInLightsRooms()) {
      for (const out of outlets) {
        const rid = normalizeRoomId(out.r);
        if (!outletGroups.has(rid)) outletGroups.set(rid, []);
        outletGroups.get(rid).push(out);
      }
    }

    // a room is shown if it has lights, outlets (when in rooms), thermostats, or temp sensors
    const hasContent = (rid) => {
      const key = normalizeRoomId(rid);
      const hasOutlets = outletsInLightsRooms() && (outletGroups.get(key)?.length || 0) > 0;
      return (groups.get(key)?.length || hasOutlets || roomShowsClimate(key));
    };

    const orderedIds = getDisplayRoomIds(groups, hasContent);

    for (const rid of orderedIds) {
      const roomKey = normalizeRoomId(rid);
      const name = roomKey === -1 ? "Unassigned" : (roomMap.get(roomKey) || "Room");
      const devs = sortDevicesInRoom(groups.get(roomKey) || [], name);
      const roomOutlets = outletsInLightsRooms()
        ? sortDevicesInRoom(outletGroups.get(roomKey) || [], name)
        : [];

      const card = ce("section", "room");
      card.dataset.roomId = roomKey;
      card.dataset.roomName = String(name).toLowerCase();

      const head = ce("div", "room-head");
      const dragHandle = ce("button", "room-drag-handle");
      dragHandle.type = "button";
      dragHandle.setAttribute("aria-label", "Drag to reorder");
      dragHandle.innerHTML = DRAG_HANDLE_SVG;
      head.appendChild(dragHandle);

      const title = ce("div", "room-title");
      const nameEl = ce("div", "room-name"); nameEl.textContent = name;
      const meta = ce("div", "room-meta");
      title.appendChild(nameEl); title.appendChild(meta);
      head.appendChild(title);

      const moveBtns = ce("div", "room-move-btns");
      const moveUp = ce("button", "room-move-btn");
      moveUp.type = "button";
      moveUp.setAttribute("aria-label", "Move room up");
      moveUp.innerHTML = MOVE_UP_SVG;
      moveUp.addEventListener("click", (e) => { e.stopPropagation(); moveRoom(roomKey, -1); });
      const moveDown = ce("button", "room-move-btn");
      moveDown.type = "button";
      moveDown.setAttribute("aria-label", "Move room down");
      moveDown.innerHTML = MOVE_DOWN_SVG;
      moveDown.addEventListener("click", (e) => { e.stopPropagation(); moveRoom(roomKey, 1); });
      moveBtns.appendChild(moveUp); moveBtns.appendChild(moveDown);
      head.appendChild(moveBtns);

      // climate widget (thermostat or temp sensor) — left of Off button
      const climate = roomClimateEnabled ? roomClimateInfo(roomKey) : null;
      if (climate) {
        const el = ce(climate.controllable ? "button" : "div",
          "room-climate" + (climate.controllable ? " room-climate-control" : " room-climate-sensor"));
        if (climate.controllable) el.type = "button";
        let iconEl = null;
        if (climate.controllable) {
          iconEl = ce("span", "room-tstat-icon state-off");
          iconEl.innerHTML = TSTAT_SVG;
          el.appendChild(iconEl);
        }
        const tempEl = ce("span", "room-tstat-temp");
        tempEl.textContent = formatRoomTemp(climate.device);
        el.appendChild(tempEl);
        if (climate.controllable) {
          el.addEventListener("click", (e) => {
            e.stopPropagation();
            if (colorSession) closeColorPopup(true);
            if (quickPopup?.classList.contains("open")) closeQuickPopup();
            openTstatPopup(roomKey, el);
          });
        }
        head.appendChild(el);
        climateEls.set(roomKey, { el, iconEl, tempEl, controllable: climate.controllable });
      }

      let offTrack = null;
      let onTrack = null;
      let saveBtn = null;
      let restoreBtn = null;
      if (devs.length > 0) {
        const toggle = ce("div", "room-toggle");

        offTrack = ce("div", "slide-confirm-track room-slide-track room-slide-off");
        saveBtn = ce("button", "slide-confirm-action room-snap-action room-snap-save");
        saveBtn.type = "button";
        saveBtn.textContent = "Save Current State";
        saveBtn.setAttribute("aria-label", "Save current state");
        saveBtn.tabIndex = -1;
        const offBtn = ce("button", "btn-off");
        offBtn.type = "button";
        offBtn.textContent = "Off";
        applyTip(offBtn, TIP_ROOM_OFF);
        offTrack.appendChild(saveBtn);
        offTrack.appendChild(offBtn);
        offTrack.appendChild(ce("span", "slide-confirm-thumb"));

        onTrack = ce("div", "slide-confirm-track room-slide-track room-slide-on");
        const onBtn = ce("button", "btn-on");
        onBtn.type = "button";
        onBtn.textContent = "On";
        applyTip(onBtn, TIP_ROOM_ON);
        restoreBtn = ce("button", "slide-confirm-action room-snap-action room-snap-restore");
        restoreBtn.type = "button";
        restoreBtn.textContent = "Restore Saved State";
        restoreBtn.setAttribute("aria-label", "Restore saved state");
        restoreBtn.tabIndex = -1;
        restoreBtn.disabled = true;
        restoreBtn.setAttribute("aria-disabled", "true");
        onTrack.appendChild(onBtn);
        onTrack.appendChild(restoreBtn);
        onTrack.appendChild(ce("span", "slide-confirm-thumb"));

        toggle.appendChild(offTrack);
        toggle.appendChild(onTrack);
        head.appendChild(toggle);

        attachRoomSlideAction(offTrack, offBtn, saveBtn, {
          direction: "left",
          onTap: () => roomAll(roomKey, "off"),
          onCommit: () => {
            snapshotSaveApi("room", roomKey).then((ok) => {
              if (!ok) return;
              const snapDevs = devicesByRoom.get(roomKey) || [];
              snapshots[snapshotRoomKey(roomKey)] = { ts: Date.now(), count: snapDevs.length };
              updateRoomSnapshotUi();
              flash(roomLabel(roomKey) + " saved");
            });
          },
          canCommit: () => true,
        });

        attachRoomSlideAction(onTrack, onBtn, restoreBtn, {
          direction: "right",
          onTap: () => roomAll(roomKey, "on"),
          onCommit: () => {
            snapshotRestoreApi("room", roomKey).then((ok) => {
              if (ok) flash("Restoring " + roomLabel(roomKey) + "…");
            });
          },
          canCommit: () => !!snapshots[snapshotRoomKey(roomKey)],
        });
      }

      const col = ce("button", "room-collapse"); col.type = "button"; col.setAttribute("aria-label", "Collapse room");
      col.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
      col.addEventListener("click", (e) => {
        e.stopPropagation();
        card.classList.toggle("collapsed");
        persistCollapsed();
        updateExpandAllBtn();
      });
      head.appendChild(col);

      const body = ce("div", "room-body");

      card.appendChild(head); card.appendChild(body);
      ROOMS_EL.appendChild(card);

      attachRoomReorder(card, dragHandle);
      roomEls.set(roomKey, { card, body, meta, moveUp, moveDown, offTrack, onTrack, saveBtn, restoreBtn });

      for (const dev of devs) body.appendChild(makeTile(dev));
      for (const out of roomOutlets) body.appendChild(makeOutletTile(out));
    }

    restoreCollapsed();
    updateRoomMeta();
    updateRoomSnapshotUi();
    updateClimateWidgets();
    updateMoveButtons();
  }

  function makeTile(dev, context) {
    const inFavorites = context === "favorites";
    const isDim = !!dev.d;
    const tile = ce("section", "tile " + (isDim ? "dimmer" : "switch"));
    tile.dataset.id = dev.i;
    tile.dataset.name = String(dev.n || "").toLowerCase();

    const fullName = dev.n || ("Device " + dev.i);
    const roomName = dev.r != null && dev.r !== -1 ? roomMap.get(dev.r) : null;
    const displayName = inFavorites ? fullName : ((dev.n ? stripRoomPrefix(dev.n, roomName) : null) || fullName);

    const head = ce("div", "tile-head");
    const name = ce("div", "tile-name");
    name.textContent = displayName;
    if (dev.n && displayName !== dev.n) name.title = dev.n;
    const bulb = ce("button", "tile-bulb");
    bulb.type = "button";
    bulb.setAttribute("aria-label", "Toggle " + displayName);
    bulb.setAttribute("aria-pressed", dev.s ? "true" : "false");
    head.appendChild(name); head.appendChild(bulb);
    tile.appendChild(head);

    attachBulbTap(bulb, dev);
    if (isDim) attachColorNameClick(name, dev, displayName);

    if (isDim) {
      const slider = ce("div", "slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-dim"));
      slider.appendChild(inner);
      const thumb = ce("div", "slider-thumb");
      slider.appendChild(thumb);
      tile.appendChild(slider);
      attachDrag(tile, slider);
    }

    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, dev.i);

    const foot = ce("div", "tile-foot");
    const state = ce("span", "tile-state"); state.textContent = dev.s ? "On" : "Off";
    const level = ce("span", "tile-level");
    level.textContent = formatFootText(dev, isDim);
    const footStart = ce("div", "tile-foot-start");
    footStart.appendChild(fav);
    footStart.appendChild(state);
    foot.appendChild(footStart);
    foot.appendChild(level);
    tile.appendChild(foot);

    attachSwitchTap(tile, dev.i);

    const rec = { el: tile, data: dev, isDim, levelEl: level, stateEl: state, sliderEl: isDim ? qs(".slider", tile) : null };
    if (inFavorites) favDevMap.set(dev.i, rec);
    else devMap.set(dev.i, rec);
    return tile;
  }

  function makeOutletTile(outlet, context) {
    const inFavorites = context === "favorites";
    const inOutletsTab = context === "outlets";
    const tile = ce("section", "tile switch outlet" + (inOutletsTab ? " outlet-tab-card" : ""));
    tile.dataset.id = outlet.i;
    tile.dataset.name = String(outlet.n || "").toLowerCase();

    const fullName = outlet.n || ("Outlet " + outlet.i);
    const roomName = outlet.r != null && outlet.r !== -1 ? roomMap.get(outlet.r) : null;
    const truncate = !inFavorites && !inOutletsTab;
    const displayName = truncate
      ? ((outlet.n ? stripRoomPrefix(outlet.n, roomName) : null) || fullName)
      : fullName;

    const socket = ce("button", "tile-socket" + (inOutletsTab ? " outlet-tab-socket" : ""));
    socket.type = "button";
    socket.setAttribute("aria-label", "Toggle " + displayName);
    socket.setAttribute("aria-pressed", outlet.s ? "true" : "false");
    const face = ce("span", "tile-socket-face");
    face.appendChild(ce("span", "tile-socket-slot tile-socket-slot-l"));
    face.appendChild(ce("span", "tile-socket-slot tile-socket-slot-r"));
    face.appendChild(ce("span", "tile-socket-ground"));
    socket.appendChild(face);
    attachOutletSocketTap(socket, outlet.i);

    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, outlet.i);

    const state = ce("span", "tile-state");
    state.textContent = outlet.s ? "On" : "Off";
    const level = ce("span", "tile-level");
    level.textContent = "Outlet";
    const name = ce("div", "tile-name" + (inOutletsTab ? " outlet-tab-name" : ""));
    name.textContent = displayName;
    if (outlet.n && displayName !== outlet.n) name.title = outlet.n;

    if (inOutletsTab) {
      const visual = ce("div", "outlet-tab-visual");
      visual.appendChild(socket);
      const status = ce("div", "outlet-tab-status");
      status.appendChild(state);
      const foot = ce("div", "outlet-tab-foot");
      foot.appendChild(level);
      foot.appendChild(name);
      tile.appendChild(fav);
      tile.appendChild(visual);
      tile.appendChild(status);
      tile.appendChild(foot);
    } else {
      const head = ce("div", "tile-head");
      head.appendChild(name);
      head.appendChild(socket);
      tile.appendChild(head);
      const foot = ce("div", "tile-foot");
      const footStart = ce("div", "tile-foot-start");
      footStart.appendChild(fav);
      footStart.appendChild(state);
      foot.appendChild(footStart);
      foot.appendChild(level);
      tile.appendChild(foot);
    }

    attachSwitchTap(tile, outlet.i);

    const rec = { el: tile, data: outlet, isDim: false, isOutlet: true, levelEl: level, stateEl: state, sliderEl: null };
    if (inFavorites) favDevMap.set(outlet.i, rec);
    else outletMap.set(outlet.i, rec);
    return tile;
  }

  function attachOutletSocketTap(socket, id) {
    socket.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleOutlet(id);
    });
  }

  // Tap detector for switch tiles: ignores scrolls, long-presses, and taps on the name.
  function attachSwitchTap(tile, id) {
    const TAP_MOVE = 10;
    const TAP_MAX_MS = 500;
    let downX = 0, downY = 0, downT = 0, active = false;
    const isOutlet = tile.classList.contains("outlet");
    const isDimmer = tile.classList.contains("dimmer");

    tile.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest(".tile-bulb")) return;
      if (e.target.closest(".tile-socket")) return;
      if (e.target.closest(".tile-fav")) return;
      active = true;
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });

    tile.addEventListener("pointerup", (e) => {
      if (!active) return;
      active = false;
      if (e.target.closest(".tile-bulb")) return;
      if (e.target.closest(".tile-socket")) return;
      if (e.target.closest(".tile-name")) return;
      if (e.target.closest(".tile-fav")) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > TAP_MOVE || dy > TAP_MOVE) return;
      if (Date.now() - downT > TAP_MAX_MS) return;
      if (isDimmer) {
        if (!tile.classList.contains("fav-size-compact")) return;
        if (colorSession && colorSession.id !== id) closeColorPopup(true);
        if (tstatSession) closeTstatPopup();
        toggleDimmer(id);
        return;
      }
      if (isOutlet) toggleOutlet(id);
      else toggleSwitch(id);
    }, { passive: true });

    tile.addEventListener("pointercancel", () => { active = false; }, { passive: true });
  }

  function attachBulbTap(bulb, dev) {
    const id = dev.i;
    const isDim = !!dev.d;
    bulb.addEventListener("click", (e) => {
      e.stopPropagation();
      if (colorSession && colorSession.id !== id) closeColorPopup(true);
      if (tstatSession) closeTstatPopup();
      if (isDim) toggleDimmer(id); else toggleSwitch(id);
    });
  }

  function attachColorNameClick(nameEl, dev, displayName) {
    const id = dev.i;
    const label = displayName || dev.n || "light";
    nameEl.classList.add("color-capable");
    nameEl.setAttribute("role", "button");
    nameEl.setAttribute("tabindex", "0");
    nameEl.setAttribute("aria-label", (dev.ct || dev.rgb ? "Light settings" : "Brightness") + " — " + label);

    function open(e) {
      e.stopPropagation();
      if (tstatSession) closeTstatPopup();
      if (colorSession && colorSession.id !== id) closeColorPopup(true);
      const rec = devMap.get(id) || favDevMap.get(id);
      const tile = nameEl.closest(".tile");
      const compactFav = tile?.classList.contains("fav-size-compact");
      const popupOpts = compactFav ? { defaultTab: "level" } : null;
      openColorPopup(id, nameEl, rec?.data || dev, label, popupOpts);
    }

    nameEl.addEventListener("click", open);
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(e); }
    });
  }

  function clampLevel(level) {
    const n = Number(level);
    if (isNaN(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function setSliderLevel(slider, level) {
    slider.style.setProperty("--level", clampLevel(level));
  }

  function syncTileState(rec, dev) {
    if (!rec) return;
    rec.data = dev;
    const on = effectiveSwitch(dev);
    rec.el.classList.toggle("on", on);
    rec.el.classList.toggle("off", !on);
    rec.stateEl.textContent = on ? "On" : "Off";
    const bulb = qs(".tile-bulb", rec.el);
    if (bulb) bulb.setAttribute("aria-pressed", on ? "true" : "false");
    const socket = qs(".tile-socket", rec.el);
    if (socket) socket.setAttribute("aria-pressed", on ? "true" : "false");
    const nameEl = qs(".tile-name", rec.el);
    if (nameEl) nameEl.classList.toggle("color-capable", rec.isDim);
    if (rec.isOutlet) {
      rec.levelEl.textContent = outletsSeparateTab ? roomLabel(dev.r) : "Outlet";
    } else {
      rec.levelEl.textContent = formatFootText(
        rec.isDim ? { ...dev, l: effectiveLevel(dev) } : dev,
        rec.isDim
      );
    }
    if (rec.isDim) {
      const displayL = effectiveLevel(dev);
      if (!rec.el.classList.contains("dragging") && displayL != null) {
        setSliderLevel(rec.sliderEl, displayL);
      }
    }
    syncFavButton(rec.el.querySelector(".tile-fav"), dev.i);
  }

  function updateStates() {
    for (const dev of devices) {
      syncTileState(devMap.get(dev.i), dev);
      syncTileState(favDevMap.get(dev.i), dev);
    }
    for (const out of outlets) {
      syncTileState(outletMap.get(out.i), out);
      syncTileState(favDevMap.get(out.i), out);
    }
    updateRoomMeta();
  }

  function updateRoomMeta() {
    for (const [rid, rec] of roomEls) {
      const devs = devicesByRoom.get(rid) || [];
      const roomOutlets = outletsInLightsRooms() ? (outletsByRoom.get(rid) || []) : [];
      const onCount = devs.filter((d) => effectiveSwitch(d)).length;
      const total = devs.length;
      const outletOn = roomOutlets.filter((o) => effectiveSwitch(o)).length;
      const outletTotal = roomOutlets.length;
      const hasClimate = roomShowsClimate(rid);
      let text;
      if (total > 0) {
        text = onCount ? onCount + " of " + total + " on" : (total + " light" + (total === 1 ? "" : "s"));
        if (outletsInLightsRooms() && outletTotal > 0) {
          text += " · " + outletTotal + " outlet" + (outletTotal === 1 ? "" : "s");
          if (outletOn) text += " (" + outletOn + " on)";
        }
      } else if (outletsInLightsRooms() && outletTotal > 0) {
        text = outletOn
          ? outletOn + " of " + outletTotal + " outlet" + (outletTotal === 1 ? "" : "s") + " on"
          : (outletTotal + " outlet" + (outletTotal === 1 ? "" : "s"));
      } else if (hasClimate && thermoByRoom.has(rid)) {
        const t = (thermoByRoom.get(rid) || [])[0];
        const tm = String(t?.tm || "").toLowerCase();
        text = tm && tm !== "off" ? tm : "Thermostat";
      } else if (hasClimate && sensorByRoom.has(rid)) {
        text = (sensorByRoom.get(rid)[0]?.n) || "Temperature";
      } else {
        text = "";
      }
      rec.meta.textContent = text;
      let state = "mixed";
      if (total > 0) {
        if (onCount === 0) state = "all-off";
        else if (onCount === total) state = "all-on";
      } else if (outletsInLightsRooms() && outletTotal > 0 || hasClimate) {
        state = "all-off";
      }
      rec.card.classList.remove("room-all-on", "room-all-off", "room-mixed", "room-on");
      rec.card.classList.add("room-" + state);
    }
  }

  // ---------- dimmer drag ----------
  function attachDrag(tile, slider) {
    const id = Number(tile.dataset.id);
    const levelEl = qs(".tile-level", tile);
    const INTENT = 8;
    const TAP_MOVE = 10;
    let dragging = false;
    let aborted = false;
    let startX = 0, startY = 0;
    let lastCommit = 0;
    let pendingLevel = null;
    let downLevel = null;

    function pctFromEvent(e) {
      return trackPctFromEvent(slider, e);
    }
    function setVisual(p) {
      const level = clampLevel(p);
      setSliderLevel(slider, level);
      if (levelEl) levelEl.textContent = level + "%";
    }
    function commitLevel(p) {
      setVisual(p);
      setLevelOptimistic(id, p);
      sendCmd(id, "setLevel", p);
      const dev = devices.find((d) => d.i === id);
      if (dev) {
        dev.s = p > 0 ? 1 : 0;
        dev.l = p;
        updateStates();
      }
    }
    function cleanup() {
      dragging = false;
      aborted = false;
      slider.classList.remove("dragging");
      tile.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    }
    function start(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = false;
      aborted = false;
      startX = e.clientX; startY = e.clientY;
      downLevel = pctFromEvent(e);
      pendingLevel = downLevel;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    function move(e) {
      if (aborted) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          aborted = true;
          cleanup();
          return;
        }
        dragging = true;
        slider.classList.add("dragging");
        tile.classList.add("dragging");
      }
      e.preventDefault();
      const p = pctFromEvent(e);
      setVisual(p);
      pendingLevel = p;
      const now = Date.now();
      if (now - lastCommit > 350) {
        lastCommit = now;
        setLevelOptimistic(id, p);
        sendCmd(id, "setLevel", p);
      }
    }
    function end(e) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (aborted) { cleanup(); return; }
      if (dragging) {
        const p = pendingLevel == null ? 0 : pendingLevel;
        slider.classList.remove("dragging");
        tile.classList.remove("dragging");
        dragging = false;
        commitLevel(p);
        return;
      }
      // tap-to-jump: only if finger barely moved
      if (e && e.clientX != null) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= TAP_MOVE && dy <= TAP_MOVE) commitLevel(downLevel);
      }
      cleanup();
    }
    slider.addEventListener("pointerdown", start);
  }

  function attachShadeDrag(tile, slider, shadeId, onLevelChange) {
    const INTENT = 8;
    const TAP_MOVE = 10;
    let dragging = false;
    let aborted = false;
    let startX = 0, startY = 0;
    let lastCommit = 0;
    let pendingLevel = null;
    let downLevel = null;

    function pctFromEvent(e) {
      return trackPctFromEvent(slider, e);
    }
    function setVisual(p) {
      const level = clampLevel(p);
      setSliderLevel(slider, level);
      if (onLevelChange) onLevelChange(level);
    }
    function commitLevel(p) {
      setVisual(p);
      sendShadeCmd(shadeId, "setPosition", p);
    }
    function cleanup() {
      dragging = false;
      aborted = false;
      slider.classList.remove("dragging");
      tile.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    }
    function start(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = false;
      aborted = false;
      startX = e.clientX; startY = e.clientY;
      downLevel = pctFromEvent(e);
      pendingLevel = downLevel;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    function move(e) {
      if (aborted) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          aborted = true;
          cleanup();
          return;
        }
        dragging = true;
        slider.classList.add("dragging");
        tile.classList.add("dragging");
      }
      e.preventDefault();
      const p = pctFromEvent(e);
      setVisual(p);
      pendingLevel = p;
      const now = Date.now();
      if (now - lastCommit > 350) {
        lastCommit = now;
        sendShadeCmd(shadeId, "setPosition", p);
      }
    }
    function end(e) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (aborted) { cleanup(); return; }
      if (dragging) {
        const p = pendingLevel == null ? 0 : pendingLevel;
        slider.classList.remove("dragging");
        tile.classList.remove("dragging");
        dragging = false;
        commitLevel(p);
        return;
      }
      if (e && e.clientX != null) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= TAP_MOVE && dy <= TAP_MOVE) commitLevel(downLevel);
      }
      cleanup();
    }
    slider.addEventListener("pointerdown", start);
  }

  function attachBulkShadeDrag(tile, slider, onLevelChange) {
    const INTENT = 8;
    const TAP_MOVE = 10;
    let dragging = false;
    let aborted = false;
    let startX = 0, startY = 0;
    let lastCommit = 0;
    let pendingLevel = null;
    let downLevel = null;

    function pctFromEvent(e) {
      return trackPctFromEvent(slider, e);
    }
    function setVisual(p) {
      const level = clampLevel(p);
      setSliderLevel(slider, level);
      if (onLevelChange) onLevelChange(level);
    }
    function commitLevel(p) {
      setVisual(p);
      broadcastShadeCmd("setPosition", p);
    }
    function cleanup() {
      dragging = false;
      aborted = false;
      slider.classList.remove("dragging");
      tile.classList.remove("dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    }
    function start(e) {
      if (e.button != null && e.button !== 0) return;
      dragging = false;
      aborted = false;
      startX = e.clientX; startY = e.clientY;
      downLevel = pctFromEvent(e);
      pendingLevel = downLevel;
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", end, { passive: false });
      window.addEventListener("pointercancel", end, { passive: false });
    }
    function move(e) {
      if (aborted) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < INTENT && Math.abs(dy) < INTENT) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          aborted = true;
          cleanup();
          return;
        }
        dragging = true;
        slider.classList.add("dragging");
        tile.classList.add("dragging");
      }
      e.preventDefault();
      const p = pctFromEvent(e);
      setVisual(p);
      pendingLevel = p;
      const now = Date.now();
      if (now - lastCommit > 350) {
        lastCommit = now;
        broadcastShadeCmd("setPosition", p, { quiet: true, skipMasterUpdate: true });
      }
    }
    function end(e) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (aborted) { cleanup(); return; }
      if (dragging) {
        const p = pendingLevel == null ? 0 : pendingLevel;
        slider.classList.remove("dragging");
        tile.classList.remove("dragging");
        dragging = false;
        commitLevel(p);
        return;
      }
      if (e && e.clientX != null) {
        const dx = Math.abs(e.clientX - startX);
        const dy = Math.abs(e.clientY - startY);
        if (dx <= TAP_MOVE && dy <= TAP_MOVE) commitLevel(downLevel);
      }
      cleanup();
    }
    slider.addEventListener("pointerdown", start);
  }

  // ---------- commands ----------
  // Diagnostic shown when the user enables haptics, so we can tell exactly why
  // the device isn't buzzing (secure context, API presence, or call acceptance).
  function testHaptics() {
    const secure = window.isSecureContext;
    const vibrate = navigator.vibrate;
    const hasApi = typeof vibrate === "function";
    let accepted = false;
    if (secure && hasApi) {
      try { accepted = !!vibrate.call(navigator, [60, 40, 60]); } catch {}
    }
    const parts = [];
    parts.push(secure ? "HTTPS ok" : "no HTTPS (local URL?)");
    parts.push(hasApi ? "API ok" : "no vibrate API");
    if (secure && hasApi) parts.push(accepted ? "call ok" : "call rejected");
    flash("Haptics: " + parts.join(" · "), !accepted);
  }

  function toggleSwitch(id) {
    hapticTap();
    const dev = devices.find((d) => d.i === id);
    if (!dev) return;
    const on = effectiveSwitch(dev);
    const next = on ? "off" : "on";
    setSwitchOptimistic(id, next === "on" ? 1 : 0);
    updateStates();
    sendCmd(id, next).then((r) => {
      if (!r?.ok) { clearSwitchOptimistic(id); refreshDevice(id); }
    });
  }

  function toggleOutlet(id) {
    hapticTap();
    const out = outlets.find((d) => d.i === id);
    if (!out) return;
    const on = effectiveSwitch(out);
    const next = on ? "off" : "on";
    setSwitchOptimistic(id, next === "on" ? 1 : 0);
    updateStates();
    sendCmd(id, next).then((r) => {
      if (!r?.ok) { clearSwitchOptimistic(id); refresh(); }
    });
  }

  function toggleDimmer(id) {
    hapticTap();
    const dev = devices.find((d) => d.i === id);
    if (!dev) return;
    if (effectiveSwitch(dev)) {
      setSwitchOptimistic(id, 0, 0);
      setLevelOptimistic(id, 0);
      updateStates();
      sendCmd(id, "off").then((r) => {
        if (!r?.ok) { clearSwitchOptimistic(id); refreshDevice(id); }
      });
    } else {
      setSwitchOptimistic(id, 1, null);
      updateStates();
      sendCmd(id, "on").then((r) => {
        if (!r?.ok) { clearSwitchOptimistic(id); refreshDevice(id); }
      });
      reconcileDevice(id);
    }
  }

  // After turning a dimmer on, learn the level the light restored to.
  // Locally the eventsocket pushes it instantly; remotely we poll the device.
  function reconcileDevice(id) {
    setTimeout(() => refreshDevice(id), 500);
    setTimeout(() => refreshDevice(id), 1500); // retry once in case the hub is slow
  }

  async function refreshDevice(id) {
    try {
      const d = await getJson("device?id=" + id);
      if (!d || d.i == null) return;
      const numId = Number(d.i);

      const shade = windowShades.find(x => x.i === numId);
      if (shade && (d.st != null || d.pos != null)) {
        if (d.st != null) shade.st = d.st;
        if (d.pos != null) shade.pos = d.pos;
        const opt = shadeOptimistic.get(numId);
        if (opt && shadeOptimisticSatisfied(opt, shade)) clearShadeOptimistic(numId);
        refreshShadeViews();
      }

      const rec = devMap.get(numId) || favDevMap.get(numId);
      if (rec && !rec.isOutlet) {
        const dev = devices.find((x) => x.i === numId);
        if (dev) {
          if (d.s != null) dev.s = d.s ? 1 : 0;
          if (rec.isDim && d.l != null) dev.l = d.l;
          if (rec.data.ct && d.k != null) dev.k = d.k;
          if (rec.data.rgb && d.h != null) dev.h = d.h;
          if (rec.data.rgb && d.sat != null) dev.sat = d.sat;
        }
        const opt = switchOptimistic.get(numId);
        if (opt && !!dev?.s === !!opt.s) clearSwitchOptimistic(numId);
        updateStates();
        if (shade && (d.st != null || d.pos != null)) return;
        return;
      }
      // thermostat reconcile
      const t = thermostats.find(x => x.i === Number(d.i));
      if (t) {
        const modeLocked = tstatModeLocked(t.i);
        if (d.tm != null && !modeLocked) t.tm = d.tm;
        if (d.os != null && !modeLocked) t.os = d.os;
        applyTstatSetpoints(t, { hsp: d.hsp, csp: d.csp });
        if (d.temp != null) t.temp = Number(d.temp);
        if (d.hasFm != null) t.hasFm = d.hasFm;
        if (d.fm != null && !tstatFanModeLocked(t.i)) {
          t.fm = d.fm;
          if (t.hasCfs) t.cfs = d.fm;
        }
        if (d.hasFs != null) t.hasFs = d.hasFs;
        if (d.fs != null) t.fs = d.fs;
        if (d.hasCm != null) t.hasCm = d.hasCm;
        if (d.hasCfs != null) t.hasCfs = d.hasCfs;
        if (d.cfs != null && !tstatFanModeLocked(t.i)) {
          t.cfs = d.cfs;
          t.fm = d.cfs;
        }
        if (d.hasVp != null) t.hasVp = d.hasVp;
        if (d.vp != null && !tstatVaneLocked(t.i)) t.vp = d.vp;
        if (d.vpLev != null) t.vpLev = d.vpLev;
        updateClimateWidgets();
        updateRoomMeta();
        refreshOpenTstatQuickPopups();
        return;
      }
      const s = tempSensors.find(x => x.i === Number(d.i));
      const sen = sensors.find(x => x.i === Number(d.i));
      const lock = locks.find(x => x.i === Number(d.i));
      const garage = garageDoors.find(x => x.i === Number(d.i));
      const fan = ceilingFans.find(x => x.i === Number(d.i));
      const valve = valves.find(x => x.i === Number(d.i));
      const mp = music.find(x => x.i === Number(d.i));
      const hasControlRole = !!(lock || garage || shade || fan || valve || mp);
      if (s && sen && !hasControlRole) {
        syncDualSensorSources(s, sen, d);
        updateClimateWidgets();
        updateRoomMeta();
        refreshSensorViews();
        return;
      }
      if (s && !sen && !hasControlRole) {
        MLDDomain.applyTempSensorPayload(s, d);
        updateClimateWidgets();
        updateRoomMeta();
        refreshSensorViews();
        return;
      }
      if (sen && !hasControlRole) {
        MLDDomain.applySensorPayload(sen, d);
        refreshSensorViews();
        return;
      }
      if (lock) {
        if (d.lk != null) lock.lk = d.lk ? 1 : 0;
        if (d.st != null) lock.st = d.st;
        const opt = lockOptimistic.get(Number(d.i));
        if (opt && lockOptimisticSatisfied(opt, lock)) clearLockOptimistic(Number(d.i));
        if (currentCategory() === "locks") renderLocksPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (garage) {
        if (d.st != null) garage.st = d.st;
        const opt = garageOptimistic.get(Number(d.i));
        if (opt && garageOptimisticSatisfied(opt, garage)) clearGarageOptimistic(Number(d.i));
        if (currentCategory() === "locks") renderLocksPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (shade && (d.st != null || d.pos != null)) return;
      if (fan) {
        if (d.s != null) fan.s = d.s ? 1 : 0;
        if (d.sp != null) fan.sp = d.sp;
        const opt = fanOptimistic.get(Number(d.i));
        if (opt) {
          let matched = true;
          if (opt.s != null && !!fan.s !== !!opt.s) matched = false;
          if (opt.sp != null && String(fan.sp || "").toLowerCase() !== String(opt.sp).toLowerCase()) matched = false;
          if (matched) clearFanOptimistic(Number(d.i));
        }
        updateFanTile(fan);
        if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (valve) {
        if (d.st != null) valve.st = d.st;
        const opt = valveOptimistic.get(Number(d.i));
        if (opt?.st != null && valve.st === opt.st) clearValveOptimistic(Number(d.i));
        if (currentCategory() === "sensors") refreshSensorsPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        return;
      }
      if (mp) {
        if (d.st != null) mp.st = d.st;
        if (d.v != null) mp.v = d.v;
        if (d.tr != null) mp.tr = d.tr;
        if (d.m != null) mp.m = d.m;
        if (d.f != null) mp.f = d.f;
        const mopt = musicOptimistic.get(Number(d.i));
        if (mopt && (mopt.st == null || mp.st === mopt.st) && (mopt.v == null || mp.v === mopt.v)) {
          clearMusicOptimistic(Number(d.i));
        }
        if (currentCategory() === "music") renderMusicPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
      }
    } catch {}
  }

  function reconcileLock(id) {
    setTimeout(() => refreshDevice(id), 7000);
  }

  function reconcileShade(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  function reconcileFan(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  function reconcileMusic(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  async function sendMusicCmd(id, cmd, val) {
    const dev = music.find(m => m.i === id);
    if (!dev) return;
    const ctrl = musicControls(dev);
    if (cmd === "play" && !ctrl.play) return;
    if (cmd === "pause" && !ctrl.pause) return;
    if (cmd === "stop" && !ctrl.stop) return;
    if (cmd === "previousTrack" && !ctrl.prev) return;
    if (cmd === "nextTrack" && !ctrl.next) return;
    if (cmd === "setVolume" && !ctrl.volume) return;
    if ((cmd === "mute" || cmd === "unmute") && !ctrl.mute) return;
    hapticTap();
    let patch = {};
    if (cmd === "play") patch = { st: "playing" };
    else if (cmd === "pause") patch = { st: "paused" };
    else if (cmd === "stop") patch = { st: "stopped" };
    else if (cmd === "setVolume") patch = { v: Math.max(0, Math.min(100, Number(val))) };
    const feature = postCall("ensureEnvironmentMediaFeature");
    if (feature) return feature.command("music", id, cmd, val, patch);
    if (patch.st != null || patch.v != null) setMusicOptimistic(id, patch);
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) clearMusicOptimistic(id);
    reconcileMusic(id);
    if (currentCategory() === "music") renderMusicPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    return result;
  }

  function broadcastMusic(cmd) {
    if (!music.length) return;
    hapticTap();
    for (const dev of music) {
      const ctrl = musicControls(dev);
      if (cmd === "play" && !ctrl.play) continue;
      if (cmd === "pause" && !ctrl.pause) continue;
      if (cmd === "stop" && !ctrl.stop) continue;
      sendMusicCmd(dev.i, cmd);
    }
  }

  async function broadcastMusicVolume(delta) {
    const capable = music.filter((d) => musicControls(d).volume);
    if (!capable.length) return;
    hapticTap();
    for (const dev of capable) {
      const base = effectiveMusicVolume(dev) ?? 0;
      const next = Math.max(0, Math.min(100, base + delta));
      setMusicOptimistic(dev.i, { v: next });
      sendCmd(dev.i, "setVolume", next).then((result) => {
        if (!result.ok) { clearMusicOptimistic(dev.i); reconcileMusic(dev.i); }
        else reconcileMusic(dev.i);
        if (currentCategory() === "music") renderMusicPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
      });
    }
    if (currentCategory() === "music") renderMusicPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
  }

  function reconcileGarage(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
    setTimeout(() => refreshDevice(id), 8000);
    setTimeout(() => refreshDevice(id), 14000);
  }

  async function sendGarageCmd(id, cmd, pin) {
    const door = garageDoors.find((g) => g.i === id);
    if (!door) return { ok: false };
    hapticTap();
    const patch = cmd === "open" ? { st: "opening" } : cmd === "close" ? { st: "closing" } : null;
    if (patch) {
      setGarageOptimistic(id, patch);
      if (currentCategory() === "locks") renderLocksPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
    const result = await sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      clearGarageOptimistic(id);
      reconcileGarage(id);
      if (currentCategory() === "locks") renderLocksPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileGarage(id);
    }
    return result;
  }

  async function sendLockCmd(id, cmd, pin) {
    const lock = locks.find(l => l.i === id);
    if (!lock) return { ok: false };
    const lk = cmd === "lock" ? 1 : 0;
    const st = cmd === "lock" ? "locking" : "unlocking";
    hapticTap();
    setLockOptimistic(id, lk, st);
    if (currentCategory() === "locks") renderLocksPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    const result = await sendCmd(id, cmd, null, pin);
    if (!result.ok) {
      clearLockOptimistic(id);
      reconcileLock(id);
      if (currentCategory() === "locks") renderLocksPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileLock(id);
    }
    return result;
  }

  async function sendShadeCmd(id, cmd, val, opts) {
    const quiet = opts?.quiet;
    const skipOptimistic = opts?.skipOptimistic;
    const shade = windowShades.find(s => s.i === id);
    if (!shade) return { ok: false };
    if (!quiet) hapticTap();
    if (!skipOptimistic) {
      let patch = {};
      if (cmd === "open") patch = { st: "opening" };
      else if (cmd === "close") patch = { st: "closing" };
      else if (cmd === "setPosition") patch = { pos: Math.max(0, Math.min(100, Number(val))) };
      if (patch.st != null || patch.pos != null) {
        setShadeOptimistic(id, patch);
        if (!quiet) {
          if (currentCategory() === "blinds") refreshBlindsPopup();
          else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
        }
      }
    }
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) {
      clearShadeOptimistic(id);
      reconcileShade(id);
      if (!quiet) {
        if (currentCategory() === "blinds") refreshBlindsPopup();
        else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
      }
      if (shadeMasterPopup?.classList.contains("open")) postCall("updateShadeMasterBody");
    } else {
      reconcileShade(id);
    }
    return result;
  }

  async function sendFanCmd(id, cmd, val) {
    const fan = ceilingFans.find((f) => f.i === id);
    if (!fan) return { ok: false };
    hapticTap();
    let patch = null;
    if (cmd === "on") patch = { s: 1 };
    else if (cmd === "off") patch = { s: 0, sp: "off" };
    else if (cmd === "setSpeed") {
      const sp = String(val || "").trim();
      const spLower = sp.toLowerCase();
      patch = { sp: spLower, s: spLower === "off" ? 0 : 1 };
    }
    const feature = postCall("ensureEnvironmentMediaFeature");
    if (feature) return feature.command("ceilingFans", id, cmd, val, patch);
    if (patch) setFanOptimistic(id, patch);
    const result = await sendCmd(id, cmd, val);
    if (!result.ok) clearFanOptimistic(id);
    reconcileFan(id);
    updateFanTile(fan);
    if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    return result;
  }

  function fanMasterTargetIds() {
    if (!fanMasterSession) return [];
    return fanMasterSession.ids || [];
  }

  function shadeMasterTargetIds() {
    if (!shadeMasterSession) return [];
    return shadeMasterSession.ids || [];
  }

  function broadcastFanPower() {
    const ids = fanMasterTargetIds();
    if (!ids.length) return;
    const fans = ids.map((id) => ceilingFans.find((f) => f.i === id)).filter(Boolean);
    if (!fans.length) return;
    const anyOn = fans.some((f) => effectiveFanOn(f));
    const cmd = anyOn ? "off" : "on";
    for (const fan of fans) sendFanCmd(fan.i, cmd);
    if (currentCategory() === "fans") refreshFansPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    if (fanMasterPopup?.classList.contains("open")) postCall("renderFanMasterBody");
  }

  function broadcastFanSpeed(speed) {
    const ids = fanMasterTargetIds();
    if (!ids.length) return;
    const sp = String(speed || "").toLowerCase();
    for (const id of ids) {
      const fan = ceilingFans.find((f) => f.i === id);
      if (!fan) continue;
      if (sp === "off") sendFanCmd(fan.i, "off");
      else if (ceilingFanSupportsSpeed(fan, sp)) sendFanCmd(fan.i, "setSpeed", sp);
    }
    if (currentCategory() === "fans") refreshFansPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    if (fanMasterPopup?.classList.contains("open")) postCall("renderFanMasterBody");
  }

  function broadcastShadeCmd(cmd, val, opts) {
    const ids = shadeMasterTargetIds();
    if (!ids.length) return;
    const quiet = opts?.quiet;
    const skipMasterUpdate = opts?.skipMasterUpdate;
    if (!quiet) hapticTap();

    const shades = [];
    for (const id of ids) {
      const shade = windowShades.find((s) => s.i === id);
      if (!shade) continue;
      if (cmd === "setPosition" && !shadeHasPosition(shade)) continue;
      if (cmd === "stop" && !shadeHasStop(shade)) continue;
      shades.push(shade);
    }
    if (!shades.length) return;

    // Bulk Open/Close jump to the settled end-state so the master popup gets
    // immediate active/slider feedback (individual tiles still use opening/closing).
    for (const shade of shades) {
      let patch = {};
      if (cmd === "open") patch = { st: "open", pos: shadeHasPosition(shade) ? 100 : undefined };
      else if (cmd === "close") patch = { st: "closed", pos: shadeHasPosition(shade) ? 0 : undefined };
      else if (cmd === "setPosition") patch = { pos: Math.max(0, Math.min(100, Number(val))) };
      if (patch.st != null || patch.pos != null) setShadeOptimistic(shade.i, patch);
    }

    for (const shade of shades) {
      sendShadeCmd(shade.i, cmd, val, { quiet: true, skipOptimistic: true });
    }

    if (!skipMasterUpdate && shadeMasterPopup?.classList.contains("open")) {
      postCall("updateShadeMasterBody");
    }
    if (!quiet) {
      if (currentCategory() === "blinds") refreshBlindsPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
  }

  function applySwitchCmdOptimistic(dev, cmd) {
    const id = dev.i;
    if (cmd === "on") {
      setSwitchOptimistic(id, 1, dev.d ? null : undefined);
    } else {
      setSwitchOptimistic(id, 0, dev.d ? 0 : undefined);
      if (dev.d) setLevelOptimistic(id, 0);
    }
  }

  function roomAll(rid, cmd) {
    hapticTap();
    const devs = devicesByRoom.get(rid) || [];
    if (!devs.length) return;
    const hasDimmer = devs.some(d => d.d);
    for (const dev of devs) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    bulkLightsApi(cmd, "room", rid);
    if (cmd === "on" && hasDimmer) setTimeout(refresh, 900); // reconcile restored levels
  }

  function allLights(cmd) {
    if (!devices.length) return;
    const hasDimmer = devices.some(d => d.d);
    for (const dev of devices) applySwitchCmdOptimistic(dev, cmd);
    updateStates();
    bulkLightsApi(cmd, "house");
    if (cmd === "on" && hasDimmer) setTimeout(refresh, 900);
  }

  function ensureQuickPopup() {
    if (quickPopup) {
      syncQuickPopupRef(quickPopup);
      return quickPopup;
    }
    const el = ce("div", "quick-popup");
    syncQuickPopupRef(el);
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    const panel = ce("div", "quick-panel");
    const head = ce("div", "quick-head");
    const title = ce("h2", "quick-title");
    const close = ce("button", "quick-close");
    close.type = "button";
    close.setAttribute("aria-label", "Close");
    close.textContent = "\u00d7";
    const body = ce("div", "quick-body");
    head.appendChild(title);
    head.appendChild(close);
    panel.appendChild(head);
    panel.appendChild(body);
    el.appendChild(panel);
    appendPopup(el);

    bindPopupDismiss(el, panel, close, closeQuickPopup);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) closeQuickPopup();
    });

    el._title = title;
    el._body = body;
    return el;
  }

  const WIDE_POPUP_TYPES = new Set(["favorites", "sensors", "thermostats", "blinds", "fans", "outlets", "scheduling"]);
  const HUB_MODE_POPUP_TYPE = "hub-mode";

  function syncQuickPopupWidth(popup, type) {
    popup.classList.toggle("quick-popup-wide", WIDE_POPUP_TYPES.has(type) && !inTabView());
    popup.classList.toggle("quick-popup-hub-mode", type === HUB_MODE_POPUP_TYPE);
  }

  function syncQuickPopupWidthForOpen(popup) {
    const type = inTabView() ? activeTab : quickPopupOpenType;
    if (type) syncQuickPopupWidth(popup, type);
  }

  function updateFavoriteGarageRow(door) {
    const rec = favGarageMap.get(door.i);
    if (!rec) return;
    rec.meta.textContent = roomLabel(door.r) + " · " + garageStatusLabel(door);
    const isOpen = garageIsOpen(door);
    rec.closeBtn.classList.toggle("active", !isOpen);
    rec.openBtn.classList.toggle("active", isOpen);
  }

  function makeGarageRow(door, context) {
    const inFav = context === "favorites";
    const row = ce("div", "quick-lock-row");
    row.dataset.name = String(door.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "quick-lock-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = door.n || ("Garage " + door.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(door.r) + " · " + garageStatusLabel(door);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, door.i);
    head.appendChild(fav);
    row.appendChild(head);

    const actions = ce("div", "quick-lock-actions");
    const closeBtn = ce("button", "quick-lock-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    const openBtn = ce("button", "quick-lock-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    const isOpen = garageIsOpen(door);
    if (!isOpen) closeBtn.classList.add("active");
    else openBtn.classList.add("active");
    closeBtn.addEventListener("click", () => {
      // Resolve current door — favorites rows outlive replaceList()/poll object identity.
      const cur = garageDoors.find((g) => g.i === door.i) || door;
      const st = effectiveGarageState(cur);
      // Allow reverse while opening; only skip if already closed/closing.
      if (st === "closed" || st === "closing") return;
      sendGarageCmd(door.i, "close");
    });
    openBtn.addEventListener("click", () => {
      const cur = garageDoors.find((g) => g.i === door.i) || door;
      const st = effectiveGarageState(cur);
      // Allow reverse while closing; only skip if already open/opening.
      if (st === "open" || st === "opening") return;
      if (unlockPinRequired) promptGarageOpenPin(door.i, door.n);
      else sendGarageCmd(door.i, "open");
    });
    actions.appendChild(closeBtn);
    actions.appendChild(openBtn);
    row.appendChild(actions);

    if (inFav) {
      favGarageMap.set(door.i, { el: row, meta, closeBtn, openBtn, favBtn: fav, i: door.i });
    }
    return row;
  }

  function lockFavoriteMetaText(lock, row) {
    const compact = row?.classList.contains("fav-size-compact")
      || resolveFavoriteSize({ type: "lock", dev: lock }) === "compact";
    if (compact) return lockStatusLabel(lock);
    return roomLabel(lock.r) + " · " + lockStatusLabel(lock);
  }

  function toggleLockFavorite(lock) {
    const cur = locks.find((l) => l.i === lock.i) || lock;
    if (lockIsMoving(cur)) return;
    if (effectiveLock(cur)) {
      if (unlockPinRequired) promptUnlockPin(cur.i, cur.n);
      else sendLockCmd(cur.i, "unlock");
    } else {
      sendLockCmd(cur.i, "lock");
    }
  }

  // Compact favorites: whole-tile tap toggles lock/unlock (ignores scroll / fav star).
  function attachLockTap(row, lock) {
    const TAP_MOVE = 10;
    const TAP_MAX_MS = 500;
    let downX = 0, downY = 0, downT = 0, active = false;

    row.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      if (!row.classList.contains("fav-size-compact")) return;
      if (e.target.closest(".tile-fav")) return;
      if (e.target.closest(".quick-lock-btn")) return;
      active = true;
      downX = e.clientX; downY = e.clientY; downT = Date.now();
    }, { passive: true });

    row.addEventListener("pointerup", (e) => {
      if (!active) return;
      active = false;
      if (!row.classList.contains("fav-size-compact")) return;
      if (e.target.closest(".tile-fav")) return;
      if (e.target.closest(".quick-lock-btn")) return;
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);
      if (dx > TAP_MOVE || dy > TAP_MOVE) return;
      if (Date.now() - downT > TAP_MAX_MS) return;
      toggleLockFavorite(lock);
    }, { passive: true });

    row.addEventListener("pointercancel", () => { active = false; }, { passive: true });
  }

  function makeLockRow(lock, context) {
    const inFav = context === "favorites";
    const row = ce("div", "quick-lock-row");
    row.dataset.name = String(lock.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "quick-lock-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = lock.n || ("Lock " + lock.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = inFav
      ? lockFavoriteMetaText(lock)
      : (roomLabel(lock.r) + " · " + lockStatusLabel(lock));
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, lock.i);
    head.appendChild(fav);
    row.appendChild(head);

    let art = null;
    if (inFav) {
      art = ce("div", "quick-lock-art");
      art.innerHTML = effectiveLock(lock) ? LOCK_CLOSED_SVG : LOCK_OPEN_SVG;
      art.setAttribute("aria-hidden", "true");
      row.appendChild(art);
    }

    const actions = ce("div", "quick-lock-actions");
    const lockBtn = ce("button", "quick-lock-btn");
    lockBtn.type = "button";
    lockBtn.innerHTML = LOCK_BTN_SVG + '<span class="quick-lock-btn-label">Lock</span>';
    const unlockBtn = ce("button", "quick-lock-btn");
    unlockBtn.type = "button";
    unlockBtn.innerHTML = UNLOCK_BTN_SVG + '<span class="quick-lock-btn-label">Unlock</span>';
    const isLocked = effectiveLock(lock);
    if (isLocked) lockBtn.classList.add("active");
    else unlockBtn.classList.add("active");
    lockBtn.addEventListener("click", () => {
      const cur = locks.find((l) => l.i === lock.i) || lock;
      if (lockIsMoving(cur) || effectiveLock(cur)) return;
      sendLockCmd(cur.i, "lock");
    });
    unlockBtn.addEventListener("click", () => {
      const cur = locks.find((l) => l.i === lock.i) || lock;
      if (lockIsMoving(cur) || !effectiveLock(cur)) return;
      if (unlockPinRequired) promptUnlockPin(cur.i, cur.n);
      else sendLockCmd(cur.i, "unlock");
    });
    actions.appendChild(lockBtn);
    actions.appendChild(unlockBtn);
    row.appendChild(actions);

    if (inFav) {
      const locked = effectiveLock(lock);
      row.classList.toggle("is-locked", locked);
      row.classList.toggle("is-unlocked", !locked);
      row.setAttribute("aria-pressed", locked ? "true" : "false");
      attachLockTap(row, lock);
      favLockMap.set(lock.i, { el: row, meta, art, lockBtn, unlockBtn, favBtn: fav });
    }
    return row;
  }

  function updateFavoriteLockRow(lock) {
    const rec = favLockMap.get(lock.i);
    if (!rec) return;
    rec.meta.textContent = lockFavoriteMetaText(lock, rec.el);
    const isLocked = effectiveLock(lock);
    rec.el.classList.toggle("is-locked", isLocked);
    rec.el.classList.toggle("is-unlocked", !isLocked);
    rec.el.setAttribute("aria-pressed", isLocked ? "true" : "false");
    if (rec.art) rec.art.innerHTML = isLocked ? LOCK_CLOSED_SVG : LOCK_OPEN_SVG;
    rec.lockBtn.classList.toggle("active", isLocked);
    rec.unlockBtn.classList.toggle("active", !isLocked);
  }

  function renderLocksPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-locks";
    body.innerHTML = "";
    if (!locks.length && !garageDoors.length) {
      body.textContent = "No locks or garage doors selected — add them in the Hubitat app settings";
      return;
    }
    if (unlockPinEnabled && !unlockPinRequired) {
      const hint = ce("p", "quick-lock-pin-hint");
      hint.textContent = "Set unlock PIN in Hubitat app settings";
      body.appendChild(hint);
    }
    const entries = [];
    for (const lock of locks) entries.push({ kind: "lock", dev: lock });
    for (const door of garageDoors) entries.push({ kind: "garage", dev: door });
    entries.sort((a, b) => compareByRoomThenFullName(a.dev, b.dev));
    const list = ce("div", "quick-list");
    for (const entry of entries) {
      if (entry.kind === "lock") list.appendChild(makeLockRow(entry.dev, "popup"));
      else list.appendChild(makeGarageRow(entry.dev, "popup"));
    }
    body.appendChild(list);
  }

  function entryNeedsControlledFavoriteSize(entry) {
    if (["thermostat", "lock", "shade", "fan", "music"].includes(entry.type)) return true;
    return entry.type === "sensor" && entry.dev?.t === "valve";
  }

  // Semantic size profiles: persisted preset strings stay stable; UI shows names.
  const FAVORITE_SIZE_LABELS = {
    compact: { short: "Compact", long: "Compact" },
    standard: { short: "Standard", long: "Standard" },
    wide: { short: "Wide", long: "Wide" },
    square: { short: "Square", long: "Square" },
    portrait: { short: "Portrait", long: "Portrait" },
    full: { short: "Full row", long: "Full row" },
    tall: { short: "Tall", long: "Tall" },
    large: { short: "Large", long: "Large" },
    viewport: { short: "Fill screen", long: "Fill screen" },
  };
  // Legacy hub values for controlled tiles map to square.
  const CONTROLLED_FAVORITE_SIZE_ALIASES = {
    wide: "square",
    standard: "square",
    compact: "square",
  };
  const CONTROLLED_FAVORITE_SIZE_PROFILE = {
    default: "square",
    allowed: ["square", "full", "tall"],
  };
  const EMBED_FAVORITE_SIZE_PROFILE = {
    default: "tall",
    allowed: ["compact", "standard", "wide", "square", "portrait", "full", "tall", "large", "viewport"],
  };
  const HTML_FAVORITE_SIZE_PROFILE = {
    default: "tall",
    allowed: ["compact", "standard", "wide", "square", "portrait", "full", "tall", "large", "viewport"],
  };
  const TIME_FAVORITE_SIZE_PROFILE = {
    default: "square",
    allowed: ["compact", "standard", "square", "wide", "tall", "large"],
  };
  const NOTIFICATION_FAVORITE_SIZE_PROFILE = {
    default: "tall",
    allowed: ["compact", "standard", "square", "wide", "tall", "large", "full", "viewport"],
  };

  function favoriteSizeProfile(entry) {
    if (entry?.type === "embed") return EMBED_FAVORITE_SIZE_PROFILE;
    if (entry?.type === "html") return HTML_FAVORITE_SIZE_PROFILE;
    if (entry?.type === "time") return TIME_FAVORITE_SIZE_PROFILE;
    if (entry?.type === "notifications") return NOTIFICATION_FAVORITE_SIZE_PROFILE;
    // Locks keep square/full/tall plus compact toggle tiles (legacy wide/standard → square).
    if (entry?.type === "lock") return { default: "square", allowed: ["compact", "square", "full", "tall"] };
    // Thermostats keep square/full/tall plus compact readout tiles.
    if (entry?.type === "thermostat") return { default: "square", allowed: ["compact", "square", "full", "tall"] };
    if (entryNeedsControlledFavoriteSize(entry)) return CONTROLLED_FAVORITE_SIZE_PROFILE;
    const t = entry.type;
    if (t === "garage") return { default: "full", allowed: ["full", "square", "wide"] };
    if (t === "light") {
      return { default: "standard", allowed: ["standard", "wide", "compact"] };
    }
    if (t === "outlet") return { default: "standard", allowed: ["standard", "wide", "compact"] };
    if (t === "sensor") return { default: "standard", allowed: ["standard", "wide", "compact", "square"] };
    return { default: "standard", allowed: ["standard"] };
  }

  function coerceFavoriteSize(entry, size) {
    const profile = favoriteSizeProfile(entry);
    if (!size) return profile.default;
    if (profile.allowed.includes(size)) return size;
    if (entryNeedsControlledFavoriteSize(entry) && CONTROLLED_FAVORITE_SIZE_ALIASES[size]) {
      return CONTROLLED_FAVORITE_SIZE_ALIASES[size];
    }
    return profile.default;
  }

  function favoriteSizeShortLabel(size) {
    return FAVORITE_SIZE_LABELS[size]?.short || "Standard";
  }

  function favoriteSizeLongLabel(size) {
    return FAVORITE_SIZE_LABELS[size]?.long || "Standard";
  }

  function findDeviceFavoriteEntry(id) {
    const want = Number(id);
    return getFavoriteEntries().find((e) => e?.type !== "embed" && e?.type !== "html" && e?.type !== "time" && e?.type !== "notifications" && Number(e?.dev?.i) === want);
  }

  function normalizedFavoriteSizes(order) {
    const out = {};
    for (const id of order) {
      const size = favoriteSizes[id];
      const entry = findDeviceFavoriteEntry(id);
      if (entry) {
        if (!size) continue;
        const profile = favoriteSizeProfile(entry);
        const coerced = coerceFavoriteSize(entry, size);
        if (coerced !== profile.default && profile.allowed.includes(coerced)) out[id] = coerced;
      } else if (size && FAVORITE_SIZE_PRESET_SET.has(size)) {
        // Device metadata can lag — keep the known size for the hub save.
        out[id] = size;
      }
    }
    return out;
  }

  function applyFavoriteSizesFromConfig(d) {
    if (!d.config?.favoriteSizes || typeof d.config.favoriteSizes !== "object") return false;
    if (postCall("isFavoritesReorderActive")) return false;
    const prevSig = Object.keys(favoriteSizes).sort((a, b) => a - b)
      .map((id) => id + ":" + favoriteSizes[id]).join(",");
    const next = {};
    const favSet = new Set(favorites);
    for (const k of Object.keys(d.config.favoriteSizes)) {
      const id = Number(k);
      if (!favSet.has(id)) continue;
      const size = String(d.config.favoriteSizes[k]);
      const entry = findDeviceFavoriteEntry(id);
      if (entry) {
        const profile = favoriteSizeProfile(entry);
        const coerced = coerceFavoriteSize(entry, size);
        if (coerced !== profile.default && profile.allowed.includes(coerced)) next[id] = coerced;
      } else if (FAVORITE_SIZE_PRESET_SET.has(size)) {
        // Device metadata can lag on the first paint — keep the server size until the entry resolves.
        next[id] = size;
      }
    }
    favoriteSizes = next;
    const nextSig = Object.keys(next).sort((a, b) => a - b)
      .map((id) => id + ":" + next[id]).join(",");
    if (prevSig !== nextSig) saveFavoriteSizesCache(favoriteSizes);
    return prevSig !== nextSig;
  }

  // ---------- hub notifications (post.js; keeps post2 under hub limit) ----------
  function pruneNotifSnoozeMap(map) {
    const now = Date.now();
    const next = {};
    let changed = false;
    for (const [id, until] of Object.entries(map || {})) {
      const ts = Number(until);
      if (!id || !Number.isFinite(ts) || ts <= now) {
        changed = true;
        continue;
      }
      next[id] = ts;
    }
    return { map: next, changed };
  }

  function isNotifSnoozed(id) {
    if (!id) return false;
    const pruned = pruneNotifSnoozeMap(loadNotifSnoozeMap());
    if (pruned.changed) saveNotifSnoozeMap(pruned.map);
    const until = Number(pruned.map[id]);
    return Number.isFinite(until) && until > Date.now();
  }

  // Local snooze was removed from Dismiss/Escape (those now hub-ack). Keep
  // isNotifSnoozed/clearNotifSnooze so leftover localStorage entries still expire.

  function clearNotifSnooze(id) {
    if (!id) return;
    const map = loadNotifSnoozeMap();
    if (!(id in map)) return;
    delete map[id];
    saveNotifSnoozeMap(map);
  }

  function scheduleNotifSnoozeWake() {
    if (notifSnoozeTimer) {
      clearTimeout(notifSnoozeTimer);
      notifSnoozeTimer = null;
    }
    const map = pruneNotifSnoozeMap(loadNotifSnoozeMap()).map;
    let soonest = Infinity;
    for (const until of Object.values(map)) {
      const ts = Number(until);
      if (Number.isFinite(ts) && ts < soonest) soonest = ts;
    }
    if (!Number.isFinite(soonest) || soonest === Infinity) return;
    const delay = Math.max(250, soonest - Date.now() + 50);
    notifSnoozeTimer = setTimeout(() => {
      notifSnoozeTimer = null;
      syncNotificationPopup();
      scheduleNotifSnoozeWake();
    }, delay);
  }

  function nextUnreadNotification() {
    for (const item of hubNotifications) {
      if (!item?.id) continue;
      if (isNotifSnoozed(item.id)) continue;
      return item;
    }
    return null;
  }

  function ensureNotificationPopup() {
    if (notifPopup) return notifPopup;
    const el = ce("div", "notification-popup");
    notifPopup = el;
    el.hidden = true;
    el.setAttribute("role", "alertdialog");
    el.setAttribute("aria-modal", "false");
    el.setAttribute("aria-labelledby", "mld-notif-title");
    el.setAttribute("aria-describedby", "mld-notif-msg");
    const panel = ce("div", "notification-panel");
    const title = ce("h2", "notification-title");
    title.id = "mld-notif-title";
    title.textContent = "Notification";
    const time = ce("p", "notification-time");
    time.hidden = true;
    const from = ce("p", "notification-from");
    from.hidden = true;
    const msg = ce("p", "notification-msg");
    msg.id = "mld-notif-msg";
    const actions = ce("div", "notification-actions");
    const closeBtn = ce("button", "notification-close");
    closeBtn.type = "button";
    closeBtn.textContent = "Dismiss";
    const ackBtn = ce("button", "notification-ack");
    ackBtn.type = "button";
    ackBtn.textContent = "Mark as Read";
    actions.appendChild(closeBtn);
    actions.appendChild(ackBtn);
    panel.appendChild(title);
    panel.appendChild(time);
    panel.appendChild(from);
    panel.appendChild(msg);
    panel.appendChild(actions);
    el.appendChild(panel);
    appendPopup(el);

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      const id = notifShowingId;
      if (!id) return;
      void acknowledgeNotification(id);
    });
    ackBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      void acknowledgeNotification(notifShowingId);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!el.classList.contains("open")) return;
      // Camera overlay owns Escape while open.
      if (activeCameraOverlayId) return;
      e.preventDefault();
      const id = notifShowingId;
      if (!id || notifAckInFlight) return;
      void acknowledgeNotification(id);
    });

    el._time = time;
    el._from = from;
    el._msg = msg;
    el._close = closeBtn;
    el._ack = ackBtn;
    return el;
  }

  function hideNotificationPopup() {
    const popup = notifPopup || document.querySelector(".notification-popup");
    if (!popup) return;
    popup.hidden = true;
    popup.classList.remove("open");
    notifShowingId = null;
  }

  function unlockNotifAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      if (!notifAudioCtx) notifAudioCtx = new AC();
      if (notifAudioCtx.state === "suspended") void notifAudioCtx.resume();
      return true;
    } catch {
      return false;
    }
  }

  function playNotifWebChime() {
    try {
      if (!unlockNotifAudio() || !notifAudioCtx) return false;
      const ctx = notifAudioCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.start(t);
      osc.stop(t + 0.5);
      return true;
    } catch {
      return false;
    }
  }

  function dismissNotifChimeNotifications(tag) {
    try {
      if (!navigator.serviceWorker?.ready) return;
      navigator.serviceWorker.ready.then((reg) => {
        reg.getNotifications({ tag }).then((list) => {
          for (const n of list) {
            try { n.close(); } catch {}
          }
        }).catch(() => {});
      }).catch(() => {});
    } catch {}
  }

  function playNotificationOsSound(item) {
    if (!cfg.enableNotifSound) return;
    if (!item?.id || item.id === notifLastSoundId) return;
    notifLastSoundId = item.id;

    // Dashboard popup is foreground UI — Web Audio is reliable here. OS notifications
    // are often silent while the page is focused, and closing them instantly blocked sound.
    if (!document.hidden && playNotifWebChime()) return;

    if (typeof Notification === "undefined" || Notification.permission !== "granted") {
      playNotifWebChime();
      return;
    }

    const tag = "mld-notif-chime";
    const title = "mDash";
    const opts = {
      body: " ",
      tag,
      renotify: true,
      silent: false,
      requireInteraction: false,
    };
    const dismissAfterMs = 1500;
    const scheduleDismiss = () => {
      setTimeout(() => dismissNotifChimeNotifications(tag), dismissAfterMs);
    };
    try {
      if (navigator.serviceWorker?.ready) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, opts)
            .then(() => scheduleDismiss())
            .catch(() => {
              try {
                const n = new Notification(title, opts);
                setTimeout(() => { try { n.close(); } catch {} }, dismissAfterMs);
              } catch {
                playNotifWebChime();
              }
            });
        }).catch(() => {
          try {
            const n = new Notification(title, opts);
            setTimeout(() => { try { n.close(); } catch {} }, dismissAfterMs);
          } catch {
            playNotifWebChime();
          }
        });
      } else {
        const n = new Notification(title, opts);
        setTimeout(() => { try { n.close(); } catch {} }, dismissAfterMs);
      }
    } catch {
      playNotifWebChime();
    }
  }

  function showNotificationPopup(item) {
    if (!item?.id) return;
    if (isDashboardGateOpen()) return;
    const popup = ensureNotificationPopup();
    const changed = notifShowingId !== item.id;
    notifShowingId = item.id;
    popup._msg.textContent = String(item.text || "");
    const when = formatNotificationTileTime(item.ts);
    if (when) {
      popup._time.hidden = false;
      popup._time.textContent = when;
    } else {
      popup._time.hidden = true;
      popup._time.textContent = "";
    }
    if (item.deviceName) {
      popup._from.hidden = false;
      popup._from.textContent = String(item.deviceName);
    } else {
      popup._from.hidden = true;
      popup._from.textContent = "";
    }
    popup._close.disabled = notifAckInFlight;
    popup._ack.disabled = notifAckInFlight;
    popup.hidden = false;
    popup.classList.add("open");
    if (changed) playNotificationOsSound(item);
  }

  function syncNotificationPopup() {
    if (isDashboardGateOpen()) {
      hideNotificationPopup();
      return;
    }
    if (activeCameraOverlayId) {
      hideNotificationPopup();
      return;
    }
    const next = nextUnreadNotification();
    if (!next) {
      hideNotificationPopup();
      scheduleNotifSnoozeWake();
      return;
    }
    showNotificationPopup(next);
    scheduleNotifSnoozeWake();
  }

  function applyNotificationsFromData(d) {
    const list = Array.isArray(d?.notifications) ? d.notifications : [];
    hubNotifications = list.map((n) => ({
      id: n?.id != null ? String(n.id) : "",
      text: n?.text != null ? String(n.text) : "",
      ts: Number(n?.ts) || 0,
      deviceId: n?.deviceId != null ? Number(n.deviceId) : null,
      deviceName: n?.deviceName != null ? String(n.deviceName) : "",
    })).filter((n) => n.id && n.text);
    const ids = Array.isArray(d?.notificationDeviceIds) ? d.notificationDeviceIds : [];
    if (ids.length || d?.notificationDeviceIds != null) {
      notificationDeviceIds = new Set(ids.map(Number).filter((n) => Number.isFinite(n)));
    }
    const alive = new Set(hubNotifications.map((n) => n.id));
    const snooze = loadNotifSnoozeMap();
    let snoozeChanged = false;
    for (const id of Object.keys(snooze)) {
      if (!alive.has(id)) {
        delete snooze[id];
        snoozeChanged = true;
      }
    }
    if (snoozeChanged) saveNotifSnoozeMap(snooze);
    if (notifShowingId && !alive.has(notifShowingId)) notifShowingId = null;
    syncNotificationPopup();
    applyTileNotificationsFromData(d);
  }

  function applyTileNotificationsFromData(d) {
    if (!d || (d.tileNotifications == null && d.tileNotificationDeviceIds == null)) return;
    const list = Array.isArray(d?.tileNotifications) ? d.tileNotifications : [];
    hubTileNotifications = list.map((n) => ({
      id: n?.id != null ? String(n.id) : "",
      text: n?.text != null ? String(n.text) : "",
      ts: Number(n?.ts) || 0,
      deviceId: n?.deviceId != null ? Number(n.deviceId) : null,
      deviceName: n?.deviceName != null ? String(n.deviceName) : "",
    })).filter((n) => n.id && n.text);
    hubTileNotifications.sort((a, b) => b.ts - a.ts);
    const ids = Array.isArray(d?.tileNotificationDeviceIds) ? d.tileNotificationDeviceIds : [];
    if (ids.length || d?.tileNotificationDeviceIds != null) {
      tileNotificationDeviceIds = new Set(ids.map(Number).filter((n) => Number.isFinite(n)));
    }
    refreshNotificationTiles();
  }

  function formatNotificationTileTime(ts) {
    const n = Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    try {
      return new Date(n).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return "";
    }
  }

  function refreshNotificationTiles() {
    const root = tabMode ? favoritesPersistEl : currentBody();
    if (!root) return;
    for (const card of root.querySelectorAll(".fav-notif-card")) {
      paintNotificationTileCard(card);
    }
  }

  function paintNotificationTileCard(cardEl) {
    if (!cardEl?._list) return;
    const listEl = cardEl._list;
    listEl.replaceChildren();
    const items = hubTileNotifications.slice().sort((a, b) => b.ts - a.ts);
    if (!items.length) {
      const empty = ce("li", "fav-notif-empty");
      empty.textContent = "No notifications";
      listEl.appendChild(empty);
      return;
    }
    for (const item of items) {
      const row = ce("li", "fav-notif-item");
      const bullet = ce("span", "fav-notif-bullet");
      bullet.setAttribute("aria-hidden", "true");
      bullet.textContent = "\u2022";
      const content = ce("div", "fav-notif-content");
      const text = ce("div", "fav-notif-text");
      text.textContent = item.text;
      const meta = ce("div", "fav-notif-meta");
      const parts = [];
      if (item.deviceName) parts.push(item.deviceName);
      const when = formatNotificationTileTime(item.ts);
      if (when) parts.push(when);
      meta.textContent = parts.join(" \u00b7 ");
      content.appendChild(text);
      content.appendChild(meta);
      const dismiss = ce("button", "fav-notif-dismiss");
      dismiss.type = "button";
      dismiss.setAttribute("aria-label", "Mark as read");
      dismiss.textContent = "\u00d7";
      dismiss.addEventListener("click", (e) => {
        e.stopPropagation();
        void acknowledgeTileNotification(item.id, dismiss);
      });
      row.appendChild(bullet);
      row.appendChild(content);
      row.appendChild(dismiss);
      listEl.appendChild(row);
    }
  }

  function makeNotificationsFavoriteCard(card) {
    const el = ce("article", "fav-notif-card");
    el.dataset.notifId = card.id;
    el.setAttribute("aria-label", "Notifications");

    const head = ce("div", "fav-notif-head");
    const title = ce("div", "fav-notif-title");
    title.textContent = "Notifications";
    head.appendChild(title);
    el.appendChild(head);

    const actions = ce("div", "fav-notif-actions");
    const menuBtn = ce("button", "fav-notif-menu-btn");
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", "Notifications tile options");
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.textContent = "\u22ef";
    const menu = ce("div", "fav-notif-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    const delBtn = ce("button", "fav-notif-menu-item danger");
    delBtn.type = "button";
    delBtn.setAttribute("role", "menuitem");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      const ok = await confirmAction({ message: "Delete this notifications tile?", confirmLabel: "Delete", danger: true });
      if (ok) await deleteNotificationCard(card.id);
    });
    menu.appendChild(delBtn);
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavTileOverflowMenu(menuBtn, menu);
    });
    actions.appendChild(menuBtn);
    actions.appendChild(menu);
    el.appendChild(actions);

    const body = ce("div", "fav-notif-body");
    const list = ce("ul", "fav-notif-list");
    el._list = list;
    body.appendChild(list);
    el.appendChild(body);
    paintNotificationTileCard(el);
    return el;
  }

  async function notificationCardsApi(payload) {
    try {
      const r = await fetch(withToken("notification-cards"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(String(body?.error || "Could not save notifications tile"), true);
        return null;
      }
      applyEmbedConfigFromData({ config: body }, { allowDuringReorder: true });
      return body;
    } catch {
      flash("Could not save notifications tile", true);
      return null;
    }
  }

  async function deleteNotificationCard(id) {
    const body = await notificationCardsApi({ action: "delete", id });
    if (!body) return false;
    if (currentCategory() === "favorites") renderFavoritesPopup();
    updateQuickNavVisibility();
    flash("Notifications tile deleted");
    return true;
  }

  async function addNotificationTile() {
    if (notificationCards.length >= MAX_NOTIFICATION_CARDS) {
      flash("Notifications tile limit reached (" + MAX_NOTIFICATION_CARDS + ")", true);
      return false;
    }
    const body = await notificationCardsApi({ action: "create", size: "tall" });
    if (!body) return false;
    if (currentCategory() === "favorites") renderFavoritesPopup();
    updateQuickNavVisibility();
    flash("Notifications tile added");
    return true;
  }

  async function fetchNotifications() {
    if (isDashboardGateOpen()) return;
    if (notifFetchInFlight) {
      notifFetchQueued = true;
      return notifFetchInFlight;
    }
    notifFetchInFlight = (async () => {
      try {
        const r = await fetch(withToken("notifications"), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j) applyNotificationsFromData(j);
      } catch {
        // Next poll /data still carries notifications as fallback.
      } finally {
        notifFetchInFlight = null;
        if (notifFetchQueued) {
          notifFetchQueued = false;
          void fetchNotifications();
        }
      }
    })();
    return notifFetchInFlight;
  }

  function scheduleNotificationFetchFromWs() {
    // eventsocket can beat the SmartApp subscribe handler; brief delay lets the
    // hub queue update before we pull the slim /notifications payload.
    if (notifWsFetchTimer) clearTimeout(notifWsFetchTimer);
    notifWsFetchTimer = setTimeout(() => {
      notifWsFetchTimer = null;
      void fetchNotifications();
      void fetchTileNotifications();
    }, 180);
  }

  function scheduleTileNotificationFetchFromWs() {
    if (notifTileWsFetchTimer) clearTimeout(notifTileWsFetchTimer);
    notifTileWsFetchTimer = setTimeout(() => {
      notifTileWsFetchTimer = null;
      void fetchTileNotifications();
    }, 180);
  }

  async function fetchTileNotifications() {
    if (isDashboardGateOpen()) return;
    if (!notificationCards.length && !tileNotificationDeviceIds.size) return;
    if (notifTileFetchInFlight) {
      notifTileFetchQueued = true;
      return notifTileFetchInFlight;
    }
    notifTileFetchInFlight = (async () => {
      try {
        const r = await fetch(withToken("tile-notifications"), {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const j = await r.json().catch(() => null);
        if (r.ok && j) applyTileNotificationsFromData(j);
      } catch {
        // Next poll /data still carries tile notifications as fallback.
      } finally {
        notifTileFetchInFlight = null;
        if (notifTileFetchQueued) {
          notifTileFetchQueued = false;
          void fetchTileNotifications();
        }
      }
    })();
    return notifTileFetchInFlight;
  }

  async function acknowledgeTileNotification(id, dismissBtn) {
    if (!id || notifTileAckIds.has(id)) return;
    notifTileAckIds.add(id);
    if (dismissBtn) {
      dismissBtn.disabled = true;
      dismissBtn.setAttribute("aria-busy", "true");
    }
    try {
      const r = await fetch(withToken("tile-notifications/ack"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        flash((j && j.error) ? String(j.error) : "Could not mark as read", true);
        return;
      }
      if (Array.isArray(j.tileNotifications)) {
        applyTileNotificationsFromData({
          tileNotifications: j.tileNotifications,
          tileNotificationDeviceIds: [...tileNotificationDeviceIds],
        });
      } else {
        hubTileNotifications = hubTileNotifications.filter((n) => n.id !== id);
        refreshNotificationTiles();
      }
    } catch {
      flash("Could not mark as read", true);
    } finally {
      notifTileAckIds.delete(id);
      if (dismissBtn && dismissBtn.isConnected) {
        dismissBtn.disabled = false;
        dismissBtn.removeAttribute("aria-busy");
      }
    }
  }

  async function acknowledgeNotification(id) {
    if (!id || notifAckInFlight) return;
    notifAckInFlight = true;
    const popup = ensureNotificationPopup();
    popup._close.disabled = true;
    popup._ack.disabled = true;
    try {
      const r = await fetch(withToken("notifications/ack"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ id }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        flash((j && j.error) ? String(j.error) : "Could not mark as read", true);
        return;
      }
      clearNotifSnooze(id);
      if (Array.isArray(j.notifications)) {
        applyNotificationsFromData({
          notifications: j.notifications,
          notificationDeviceIds: [...notificationDeviceIds],
        });
      } else {
        hubNotifications = hubNotifications.filter((n) => n.id !== id);
        syncNotificationPopup();
      }
    } catch {
      flash("Could not mark as read", true);
    } finally {
      notifAckInFlight = false;
      if (notifPopup) {
        notifPopup._close.disabled = false;
        notifPopup._ack.disabled = false;
      }
      syncNotificationPopup();
    }
  }

  async function requestNotifSoundPermission() {
    if (typeof Notification === "undefined") {
      flash("Notification sounds are not supported here", true);
      return false;
    }
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") {
      flash("Notification permission blocked in browser settings", true);
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      return result === "granted";
    } catch {
      flash("Could not request notification permission", true);
      return false;
    }
  }

  // ---------- dashboard triggers (tones + action transport; camera overlay in post3) ----------
  function prunePlayedTriggerTones(nowMs) {
    for (const [id, exp] of playedTriggerToneIds) {
      if (!exp || exp <= nowMs) playedTriggerToneIds.delete(id);
    }
  }

  function stopAlertTone() {
    try { if (typeof alertToneStop === "function") alertToneStop(); } catch {}
    alertToneStop = null;
  }

  function playAlertTonePattern(toneId) {
    if (!cfg.enableNotifSound || !alertsArmed) return false;
    if (document.hidden) return false;
    if (!unlockNotifAudio() || !notifAudioCtx) return false;
    stopAlertTone();
    const ctx = notifAudioCtx;
    const nodes = [];
    const stopAll = () => {
      for (const n of nodes) {
        try { n.stop(); } catch {}
        try { n.disconnect(); } catch {}
      }
      nodes.length = 0;
    };
    alertToneStop = stopAll;
    try {
      const t0 = ctx.currentTime;
      const beep = (freq, start, dur, gainPeak) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.value = 0.0001;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.exponentialRampToValueAtTime(gainPeak, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
        osc.start(start);
        osc.stop(start + dur + 0.02);
        nodes.push(osc);
      };
      if (toneId === "alert") {
        beep(660, t0, 0.18, 0.14);
        beep(880, t0 + 0.22, 0.18, 0.14);
        beep(660, t0 + 0.44, 0.28, 0.16);
      } else {
        // chime (default)
        beep(784, t0, 0.22, 0.12);
        beep(1046, t0 + 0.18, 0.35, 0.1);
      }
      setTimeout(() => {
        if (alertToneStop === stopAll) {
          stopAll();
          alertToneStop = null;
        }
      }, 1200);
      return true;
    } catch {
      stopAll();
      alertToneStop = null;
      return false;
    }
  }

  function applyAlertsArmed(next) {
    const on = !!next;
    if (alertsArmed && !on) stopAlertTone();
    alertsArmed = on;
    postCall("syncAlertsArmUi");
  }

  function captionTextForTriggerAction(action) {
    if (!action) return "";
    if (action.caption) return String(action.caption);
    if (action.notificationId) {
      const linked = hubNotifications.find((n) => n.id === action.notificationId);
      if (linked?.text) return String(linked.text);
    }
    const unread = nextUnreadNotification();
    return unread?.text ? String(unread.text) : "";
  }

  function applyTriggerActionsFromData(d) {
    if (!d) return;
    if (d.triggersEnabled != null) triggersEnabled = !!d.triggersEnabled;
    if (d.alertsArmed != null) applyAlertsArmed(d.alertsArmed);
    if (d.alertsArmSwitchId != null) {
      const n = Number(d.alertsArmSwitchId);
      alertsArmSwitchId = Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(d.triggerSourceIds)) {
      triggerSourceIds = new Set(
        d.triggerSourceIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
      );
    }
    if (!Array.isArray(d.triggerActions)) return;
    const nowMs = Date.now();
    prunePlayedTriggerTones(nowMs);
    hubTriggerActions = d.triggerActions.filter((a) => a && a.id);
    const live = hubTriggerActions.filter((a) => {
      const camOk = a.cameraId != null && Number(a.cameraExpiresAt) > nowMs;
      const toneOk = a.toneId && Number(a.toneExpiresAt) > nowMs;
      return camOk || toneOk || a.notificationId;
    });
    hubTriggerActions = live;

    // Trigger rules often enqueue a linked notification; refresh that queue so
    // captions / post-overlay popups do not wait for the next /data poll.
    if (live.some((a) => a.notificationId)) {
      void fetchNotifications();
    }

    // Prefer newest camera action.
    let camAction = null;
    for (let i = live.length - 1; i >= 0; i--) {
      const a = live[i];
      if (a.cameraId != null && Number(a.cameraExpiresAt) > nowMs) {
        camAction = a;
        break;
      }
    }
    if (camAction && isLocalOrigin() && !isDashboardGateOpen()) {
      void (async () => {
        const ready = await postCall("ensurePost3Loaded");
        if (ready === false) {
          // Keep text alerts usable if the cameras/scheduler chunk fails to load.
          syncNotificationPopup();
          return;
        }
        postCall("showTriggerCameraOverlay", camAction);
        postCall("setTriggerCameraCaption", captionTextForTriggerAction(camAction));
      })();
      hideNotificationPopup();
    } else if (activeCameraOverlayId) {
      const still = live.some((a) => a.id === activeCameraOverlayId && Number(a.cameraExpiresAt) > nowMs);
      if (!still) postCall("teardownTriggerCameraOverlay", "hub");
      syncNotificationPopup();
    } else {
      syncNotificationPopup();
    }

    for (const a of live) {
      if (!a.toneId || Number(a.toneExpiresAt) <= nowMs) continue;
      if (playedTriggerToneIds.has(a.id)) continue;
      playedTriggerToneIds.set(a.id, Number(a.toneExpiresAt) || (nowMs + 15000));
      playAlertTonePattern(String(a.toneId));
      break; // one tone per reconcile
    }
  }

  async function fetchTriggerActions() {
    if (!triggersEnabled && hubTriggerActions.length === 0) return;
    if (isDashboardGateOpen()) return;
    if (triggerFetchInFlight) {
      triggerFetchQueued = true;
      return triggerFetchInFlight;
    }
    triggerFetchInFlight = (async () => {
      try {
        const r = await fetch(withToken("trigger-actions"), { cache: "no-store", headers: { Accept: "application/json" } });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) return;
        applyTriggerActionsFromData(j);
      } catch {}
      finally {
        triggerFetchInFlight = null;
        if (triggerFetchQueued) {
          triggerFetchQueued = false;
          void fetchTriggerActions();
        }
      }
    })();
    return triggerFetchInFlight;
  }

  function scheduleTriggerFetchFromWs() {
    if (triggerWsFetchTimer) clearTimeout(triggerWsFetchTimer);
    triggerWsFetchTimer = setTimeout(() => {
      triggerWsFetchTimer = null;
      void fetchTriggerActions();
      // Rules often enqueue popup text with the action.
      scheduleNotificationFetchFromWs();
    }, 180);
  }

  async function acknowledgeTriggerAction(id) {
    if (!id || triggerAckInFlight) return;
    triggerAckInFlight = true;
    try {
      const r = await fetch(withToken("trigger-actions/ack"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) applyTriggerActionsFromData(j);
      else hubTriggerActions = hubTriggerActions.filter((a) => a.id !== id);
    } catch {
      hubTriggerActions = hubTriggerActions.filter((a) => a.id !== id);
    } finally {
      triggerAckInFlight = false;
    }
  }

  async function setAlertsArmed(armed) {
    try {
      const r = await fetch(withToken("alerts/arm"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ armed: !!armed }),
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) {
        flash((j && j.error) ? String(j.error) : "Could not update alert arm", true);
        return;
      }
      applyAlertsArmed(!!j.alertsArmed);
      postCall("syncAlertsArmUi");
      flash(j.alertsArmed ? "Trigger tones armed" : "Trigger tones shunted");
    } catch {
      flash("Could not update alert arm", true);
    }
  }

  function cameraOverlayEmbedUrl(baseUrl) {
    if (!baseUrl) return "";
    try {
      const u = new URL(baseUrl, location.href);
      if (/stream\.html$/i.test(u.pathname)) u.pathname = u.pathname.replace(/stream\.html$/i, "webrtc.html");
      u.searchParams.set("media", "video");
      return u.toString();
    } catch {
      return baseUrl;
    }
  }

  function clearCameraOverlayDismissTimer() {
    if (cameraOverlayDismissTimer) {
      clearTimeout(cameraOverlayDismissTimer);
      cameraOverlayDismissTimer = null;
    }
  }

  function ensureTriggerCameraOverlay() {
    if (cameraOverlayPopup) return cameraOverlayPopup;
    const el = ce("div", "camera-overlay-popup");
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "mld-cam-overlay-title");
    const scrim = ce("div", "camera-overlay-scrim");
    const panel = ce("div", "camera-overlay-panel");
    const chrome = ce("div", "camera-overlay-chrome");
    const title = ce("h2", "camera-overlay-title");
    title.id = "mld-cam-overlay-title";
    const caption = ce("p", "camera-overlay-caption");
    caption.setAttribute("aria-live", "polite");
    caption.hidden = true;
    const dismiss = ce("button", "camera-overlay-dismiss");
    dismiss.type = "button";
    dismiss.textContent = "Dismiss";
    chrome.appendChild(title);
    chrome.appendChild(caption);
    chrome.appendChild(dismiss);
    const mediaHost = ce("div", "camera-overlay-media");
    panel.appendChild(chrome);
    panel.appendChild(mediaHost);
    el.appendChild(scrim);
    el.appendChild(panel);
    appendPopup(el);
    const dismissFn = () => {
      hapticTap();
      void dismissTriggerCameraOverlay();
    };
    dismiss.addEventListener("click", (e) => { e.stopPropagation(); dismissFn(); });
    scrim.addEventListener("click", dismissFn);
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!el.classList.contains("open")) return;
      e.preventDefault();
      dismissFn();
    });
    el._title = title;
    el._caption = caption;
    el._dismiss = dismiss;
    el._mediaHost = mediaHost;
    cameraOverlayPopup = el;
    return el;
  }

  function stopTriggerOverlayMedia() {
    const el = cameraOverlayPopup;
    if (!el?._mediaHost) return;
    const iframe = el._mediaHost.querySelector("iframe");
    const img = el._mediaHost.querySelector("img");
    if (iframe) postCall("stopCameraMedia", iframe, "webrtc");
    if (img) postCall("stopCameraMedia", img, "mjpg");
    el._mediaHost.replaceChildren();
  }

  function teardownTriggerCameraOverlay(reason) {
    clearCameraOverlayDismissTimer();
    stopTriggerOverlayMedia();
    const el = cameraOverlayPopup;
    if (el) {
      el.hidden = true;
      el.classList.remove("open");
    }
    activeCameraOverlayId = null;
    activeCameraOverlayCamId = null;
    if (cameraOverlayFocusRestore) {
      try { cameraOverlayFocusRestore.focus?.(); } catch {}
      cameraOverlayFocusRestore = null;
    }
    if (reason !== "replace" && reason !== "pause") syncNotificationPopup();
  }

  function pauseTriggerCameraOverlay() {
    if (!activeCameraOverlayId) return;
    clearCameraOverlayDismissTimer();
    stopTriggerOverlayMedia();
  }

  function setTriggerCameraCaption(text) {
    const el = ensureTriggerCameraOverlay();
    const t = String(text || "").trim();
    if (!t) {
      el._caption.hidden = true;
      el._caption.textContent = "";
      return;
    }
    el._caption.hidden = false;
    el._caption.textContent = t;
  }

  function scheduleTriggerOverlayDismiss(action) {
    clearCameraOverlayDismissTimer();
    const exp = Number(action?.cameraExpiresAt);
    if (!Number.isFinite(exp)) return;
    const ms = Math.max(0, exp - Date.now());
    cameraOverlayDismissTimer = setTimeout(() => {
      cameraOverlayDismissTimer = null;
      void dismissTriggerCameraOverlay();
    }, ms);
  }

  function showTriggerCameraOverlay(action) {
    if (!action?.id || !isLocalOrigin() || isDashboardGateOpen()) return;
    const camId = Number(action.cameraId);
    if (!Number.isFinite(camId)) return;
    const exp = Number(action.cameraExpiresAt);
    if (!Number.isFinite(exp) || exp <= Date.now()) return;
    const cam = cameras.find((c) => Number(c.i) === camId);
    if (!cam) return;

    const sameCam = activeCameraOverlayId && activeCameraOverlayCamId === camId;
    if (activeCameraOverlayId && activeCameraOverlayId !== action.id && !sameCam) {
      teardownTriggerCameraOverlay("replace");
    }

    activeCameraOverlayId = action.id;
    activeCameraOverlayCamId = camId;
    const el = ensureTriggerCameraOverlay();
    const name = String(cam.n || "Camera");
    el._title.textContent = name;
    el.setAttribute("aria-label", name + " camera alert");
    setTriggerCameraCaption(action.caption || "");

    if (!sameCam || !el._mediaHost.querySelector("iframe, img")) {
      stopTriggerOverlayMedia();
      const streamType = postCall("cameraStreamType", cam) || (String(cam.u || "").includes(".mjpg") ? "mjpg" : "webrtc");
      let url = "";
      if (streamType === "mjpg") url = cam.u || "";
      else {
        const play = postCall("cameraTileStreamUrl", cam, true) || cam.u || "";
        url = cameraOverlayEmbedUrl(play);
      }
      if (!url) {
        teardownTriggerCameraOverlay("hub");
        return;
      }
      let media;
      if (streamType === "mjpg") {
        media = ce("img", "camera-overlay-mjpeg");
        media.alt = name;
      } else {
        media = ce("iframe", "camera-overlay-iframe");
        media.title = name;
        media.setAttribute("allow", "autoplay");
        media.setAttribute("loading", "eager");
      }
      el._mediaHost.appendChild(media);
      postCall("startCameraMedia", media, streamType, url);
    }

    el.hidden = false;
    el.classList.add("open");
    if (!cameraOverlayFocusRestore) cameraOverlayFocusRestore = document.activeElement;
    try { el._dismiss.focus(); } catch {}
    scheduleTriggerOverlayDismiss(action);
    hideNotificationPopup();
  }

  async function dismissTriggerCameraOverlay() {
    const id = activeCameraOverlayId;
    teardownTriggerCameraOverlay("dismiss");
    if (id) await acknowledgeTriggerAction(id);
  }


  async function removeHtmlFavoriteTile(id) {
    const key = htmlFavoriteKey(id);
    if (!favoritesLayout.includes(key)) return true;
    const previousLayout = favoritesLayout.slice();
    const nextLayout = favoritesLayout.filter((candidate) => candidate !== key);
    replaceList(favoritesLayout, nextLayout);
    if (currentCategory() === "favorites") renderFavoritesPopup();
    const saved = await persistFavoriteLayout(nextLayout);
    if (!saved) {
      replaceList(favoritesLayout, previousLayout);
      if (currentCategory() === "favorites") renderFavoritesPopup();
      return false;
    }
    updateQuickNavVisibility();
    flash("HTML tile removed");
    return true;
  }

  function makeHtmlFavoriteCard(tile) {
    const el = ce("article", "fav-html-card");
    el.dataset.htmlTileId = tile.id;
    const title = tile.title || tile.attribute || "HTML";
    const head = ce("div", "fav-embed-head");
    const titleEl = ce("div", "fav-embed-title");
    titleEl.textContent = title;
    head.appendChild(titleEl);
    const actions = ce("div", "fav-embed-actions");
    const expandBtn = ce("button", "fav-embed-expand");
    expandBtn.type = "button";
    expandBtn.textContent = "Expand";
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      ensureHtmlTileLoaded(el);
      expandEmbedCard(el, expandBtn);
    });
    const menuBtn = ce("button", "fav-embed-menu-btn fav-html-menu-btn");
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", "HTML tile options");
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.textContent = "\u22ef";
    const menu = ce("div", "fav-embed-menu fav-html-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    const renameBtn = ce("button", "fav-embed-menu-item");
    renameBtn.type = "button";
    renameBtn.setAttribute("role", "menuitem");
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      openHtmlTileTitleEditor(tile);
    });
    const removeBtn = ce("button", "fav-embed-menu-item danger");
    removeBtn.type = "button";
    removeBtn.setAttribute("role", "menuitem");
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      const ok = await confirmAction({ message: "Remove this HTML tile from favorites?", confirmLabel: "Remove", danger: true });
      if (ok) await removeHtmlFavoriteTile(tile.id);
    });
    menu.appendChild(renameBtn);
    menu.appendChild(removeBtn);
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavTileOverflowMenu(menuBtn, menu);
    });
    actions.appendChild(expandBtn);
    actions.appendChild(menuBtn);
    actions.appendChild(menu);
    head.appendChild(actions);
    el.appendChild(head);

    const media = ce("div", "fav-html-media");
    const iframe = ce("iframe", "fav-html-iframe");
    iframe.setAttribute("title", title);
    iframe.loading = "lazy";
    iframe.referrerPolicy = "no-referrer";
    iframe.src = "about:blank";
    const unavailable = ce("div", "fav-html-unavailable");
    unavailable.hidden = true;
    media.appendChild(iframe);
    media.appendChild(unavailable);
    el.appendChild(media);
    applyHtmlTileZoomToCard(el, tile.zoom);
    htmlTileIframes.set(tile.id, iframe);
    observeFavHtmlCard(el);
    return el;
  }
