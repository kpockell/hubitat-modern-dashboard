  // ---------- shades / fans / music / sensors / scenes (post3; keeps post2 under cloud MQTT limit) ----------
  function makeShadeTile(shade, context) {
    const inFav = context === "favorites";
    const tile = ce("div", "shade-tile" + (inFav ? " quick-fav-span" : ""));
    tile.dataset.name = String(shade.n || "").toLowerCase();
    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "shade-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = shade.n || ("Shade " + shade.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(shade.r) + " · " + shadeStatusLabel(shade);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, shade.i);
    head.appendChild(fav);
    tile.appendChild(head);

    const moving = shadeIsMoving(shade);
    const pos = effectiveShadePosition(shade);
    const hasPos = shadeHasPosition(shade);
    let levelLabel = null;
    let slider = null;
    if (hasPos) {
      const sliderWrap = ce("div", "shade-slider-wrap");
      levelLabel = ce("span", "shade-level-label");
      levelLabel.textContent = (pos != null ? pos : "—") + "%";
      slider = ce("div", "slider shade-slider");
      const inner = ce("div", "slider-inner");
      inner.appendChild(ce("div", "slider-fill"));
      slider.appendChild(inner);
      slider.appendChild(ce("div", "slider-thumb"));
      setSliderLevel(slider, pos != null ? pos : 0);
      if (moving) slider.classList.add("disabled");
      sliderWrap.appendChild(levelLabel);
      sliderWrap.appendChild(slider);
      tile.appendChild(sliderWrap);
      if (!moving) {
        attachShadeDrag(tile, slider, shade.i, (lvl) => { levelLabel.textContent = lvl + "%"; });
      }
    }

    const actions = ce("div", "shade-actions");
    const openBtn = ce("button", "quick-lock-btn shade-btn");
    openBtn.type = "button";
    openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
    const closeBtn = ce("button", "quick-lock-btn shade-btn");
    closeBtn.type = "button";
    closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
    const st = effectiveShadeState(shade);
    if (st === "open") openBtn.classList.add("active");
    else if (st === "closed") closeBtn.classList.add("active");
    if (moving) {
      openBtn.classList.add("moving");
      closeBtn.classList.add("moving");
      openBtn.disabled = true;
      closeBtn.disabled = true;
    }
    openBtn.addEventListener("click", () => {
      if (!shadeIsMoving(shade) && effectiveShadeState(shade) !== "open") sendShadeCmd(shade.i, "open");
    });
    closeBtn.addEventListener("click", () => {
      if (!shadeIsMoving(shade) && effectiveShadeState(shade) !== "closed") sendShadeCmd(shade.i, "close");
    });
    actions.appendChild(openBtn);
    let stopBtn = null;
    if (shadeHasStop(shade)) {
      stopBtn = ce("button", "quick-lock-btn shade-btn shade-stop-btn");
      stopBtn.type = "button";
      stopBtn.innerHTML = SHADE_STOP_SVG + '<span class="quick-lock-btn-label">Stop</span>';
      stopBtn.addEventListener("click", () => sendShadeCmd(shade.i, "stop"));
      actions.appendChild(stopBtn);
    }
    actions.appendChild(closeBtn);
    tile.appendChild(actions);

    const shadeRec = { el: tile, meta, levelLabel, slider, openBtn, closeBtn, stopBtn, favBtn: fav };
    if (inFav) favShadeMap.set(shade.i, shadeRec);
    else if (context === "popup") shadePopupMap.set(shade.i, shadeRec);
    return tile;
  }

  function updateShadeTile(shade) {
    const rec = shadePopupMap.get(shade.i) || favShadeMap.get(shade.i);
    if (!rec) return;
    const moving = shadeIsMoving(shade);
    const pos = effectiveShadePosition(shade);
    rec.meta.textContent = roomLabel(shade.r) + " · " + shadeStatusLabel(shade);
    if (rec.levelLabel) rec.levelLabel.textContent = (pos != null ? pos : "—") + "%";
    if (rec.slider) {
      setSliderLevel(rec.slider, pos != null ? pos : 0);
      rec.slider.classList.toggle("disabled", moving);
    }
    const st = effectiveShadeState(shade);
    rec.openBtn.classList.toggle("active", st === "open");
    rec.closeBtn.classList.toggle("active", st === "closed");
    rec.openBtn.classList.toggle("moving", moving);
    rec.closeBtn.classList.toggle("moving", moving);
    rec.openBtn.disabled = moving;
    rec.closeBtn.disabled = moving;
    if (rec.stopBtn) rec.stopBtn.classList.toggle("active", moving);
  }

  function updateFavoriteShadeTile(shade) {
    updateShadeTile(shade);
  }

  function shadesListSignature() {
    return windowShades.map((s) => s.i).join(",");
  }

  function refreshBlindsPopup() {
    if (currentCategory() !== "blinds") return;
    const listSig = shadesListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-list") || listSig !== blindsPopupSig) {
      renderBlindsPopup();
      return;
    }
    for (const shade of windowShades) updateShadeTile(shade);
  }

  function renderBlindsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-blinds");
    body.innerHTML = "";
    shadePopupMap.clear();
    blindsPopupSig = shadesListSignature();
    if (!windowShades.length) {
      body.textContent = "No shades selected — add shades in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(windowShades);
    const list = ce("div", "quick-list");
    for (const shade of sorted) list.appendChild(makeShadeTile(shade, "popup"));
    body.appendChild(list);
  }

  function toggleCeilingFan(id) {
    const fan = ceilingFans.find((f) => f.i === id);
    if (!fan) return;
    sendFanCmd(id, effectiveFanOn(fan) ? "off" : "on");
  }

  function stepCeilingFanSpeed(id, delta) {
    const fan = ceilingFans.find((f) => f.i === id);
    if (!fan) return;
    const speeds = ceilingFanSpeeds(fan);
    if (!speeds.length) return;
    const on = effectiveFanOn(fan);
    const cur = String(effectiveFanSpeed(fan) || "").toLowerCase();
    let idx = speeds.indexOf(cur);
    if (!on || cur === "off") {
      if (delta > 0) sendFanCmd(id, "on");
      return;
    }
    if (idx < 0) {
      if (delta < 0) sendFanCmd(id, "off");
      else sendFanCmd(id, "setSpeed", speeds[0]);
      return;
    }
    const next = idx + delta;
    if (next < 0) {
      sendFanCmd(id, "off");
      return;
    }
    if (next >= speeds.length) return;
    sendFanCmd(id, "setSpeed", speeds[next]);
  }

  function makeFanTile(fan, context) {
    const inFav = context === "favorites";
    const on = effectiveFanOn(fan);
    const sp = String(effectiveFanSpeed(fan) || "").toLowerCase();
    const speeds = ceilingFanSpeeds(fan);
    const idx = speeds.indexOf(sp);
    const tile = ce("div", "fan-tile" + (on ? " is-on" : "") + (inFav ? " quick-fav-span" : ""));
    tile.dataset.name = String(fan.n || "").toLowerCase();
    tile.dataset.speed = on ? sp : "off";

    const head = ce("div", "quick-fav-row-head");
    const info = ce("div", "shade-info");
    const name = ce("span", "quick-fav-name");
    name.textContent = fan.n || ("Fan " + fan.i);
    const meta = ce("span", "quick-fav-meta");
    meta.textContent = roomLabel(fan.r) + " · " + fanStatusLabel(fan);
    info.appendChild(name);
    info.appendChild(meta);
    head.appendChild(info);
    const fav = ce("button", "tile-fav");
    fav.type = "button";
    attachFavButton(fav, fan.i);
    head.appendChild(fav);
    tile.appendChild(head);

    const controls = ce("div", "fan-controls");
    const minus = ce("button", "fan-step");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease fan speed");
    minus.disabled = !on;
    minus.addEventListener("click", () => stepCeilingFanSpeed(fan.i, -1));

    const power = ce("button", "fan-power");
    power.type = "button";
    power.innerHTML = FAN_BTN_SVG;
    power.setAttribute("aria-label", on ? "Turn fan off" : "Turn fan on");
    power.setAttribute("aria-pressed", on ? "true" : "false");
    power.addEventListener("click", () => toggleCeilingFan(fan.i));
    syncFanBladeSpin(power, fan, on, sp);

    const plus = ce("button", "fan-step");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase fan speed");
    plus.disabled = on && idx >= 0 && idx >= speeds.length - 1;
    plus.addEventListener("click", () => stepCeilingFanSpeed(fan.i, 1));

    controls.appendChild(minus);
    controls.appendChild(power);
    controls.appendChild(plus);
    tile.appendChild(controls);

    const speedLabel = ce("div", "fan-speed-label");
    speedLabel.textContent = fanStatusLabel(fan);
    tile.appendChild(speedLabel);

    if (inFav) {
      favFanMap.set(fan.i, { el: tile, meta, speedLabel, minus, plus, power, favBtn: fav });
    } else if (context === "popup") {
      fansPopupMap.set(fan.i, { el: tile, meta, speedLabel, minus, plus, power, favBtn: fav });
    }
    return tile;
  }

  function updateFanTile(fan) {
    const rec = fansPopupMap.get(fan.i) || favFanMap.get(fan.i);
    if (!rec) return;
    const on = effectiveFanOn(fan);
    const sp = String(effectiveFanSpeed(fan) || "").toLowerCase();
    const speeds = ceilingFanSpeeds(fan);
    const idx = speeds.indexOf(sp);
    rec.el.classList.toggle("is-on", on);
    rec.el.dataset.speed = on ? sp : "off";
    rec.meta.textContent = roomLabel(fan.r) + " · " + fanStatusLabel(fan);
    rec.speedLabel.textContent = fanStatusLabel(fan);
    rec.minus.disabled = !on;
    rec.plus.disabled = on && idx >= 0 && idx >= speeds.length - 1;
    rec.power.setAttribute("aria-label", on ? "Turn fan off" : "Turn fan on");
    rec.power.setAttribute("aria-pressed", on ? "true" : "false");
    syncFanBladeSpin(rec.power, fan, on, sp);
  }

  function fansListSignature() {
    return ceilingFans.map((f) => f.i).join(",");
  }

  function refreshFansPopup() {
    if (currentCategory() !== "fans") return;
    const listSig = fansListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-list") || listSig !== fansPopupSig) {
      renderFansPopup();
      return;
    }
    for (const fan of ceilingFans) updateFanTile(fan);
  }

  function renderFansPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-fans");
    body.innerHTML = "";
    fansPopupMap.clear();
    fansPopupSig = fansListSignature();
    if (!ceilingFans.length) {
      body.textContent = "No fans selected — add ceiling fans in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(ceilingFans);
    const list = ce("div", "quick-list");
    for (const fan of sorted) list.appendChild(makeFanTile(fan, "popup"));
    body.appendChild(list);
  }

  function renderOutletsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-outlets");
    body.innerHTML = "";
    outletMap.clear();
    if (!outlets.length) {
      body.textContent = "No outlets configured — add outlets in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(outlets);
    const grid = ce("div", "quick-fav-grid");
    for (const out of sorted) grid.appendChild(makeOutletTile(out, "outlets"));
    body.appendChild(grid);
    updateStates();
  }

  function normalizeTempSensorForCard(s) {
    return tempPrimaryCardFromRec(s);
  }

  function syncDualSensorSources(s, sen, d) {
    if (sen && d) applySensorPayload(sen, d);
    if (s && d) {
      if (d.temp != null) s.temp = Number(d.temp);
      if (d.bat != null) s.bat = Number(d.bat);
      if (Array.isArray(d.ex) && !sen) {
        s.ex = d.ex.map((e) => ({ k: e.k, v: e.v, u: e.u ?? null }));
      }
    }
    if (s && sen) syncTempSensorFromSensorEntry(s, sen);
  }

  function applySensorLiveAttr(deviceId, attrName, value, unit) {
    const id = Number(deviceId);
    const s = tempSensors.find((x) => x.i === id);
    const sen = sensors.find((x) => x.i === id);
    const nm = String(attrName || "");
    let changed = false;
    let climate = false;
    if (s) {
      if (nm === "temperature") {
        const n = Number(value);
        if (!isNaN(n)) {
          s.temp = Math.round(n);
          changed = true;
          climate = true;
        }
      } else if (nm === "battery") {
        const n = Number(value);
        if (!isNaN(n)) {
          s.bat = Math.round(n);
          changed = true;
        }
      } else if (applyTempSensorWsAttr(s, nm, value, unit)) {
        changed = true;
      }
    }
    if (sen && applySensorWsAttr(sen, nm, value, unit)) {
      changed = true;
      if (nm === "temperature") climate = true;
    }
    if (s && sen && nm !== "temperature") syncTempSensorFromSensorEntry(s, sen);
    if (changed && climate) {
      updateClimateWidgets();
      updateRoomMeta();
    }
    return changed;
  }

  function refreshSensorViews() {
    if (currentCategory() === "sensors") refreshSensorsPopup();
    else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
  }


  let musicVolTimer = null;

  function makeMusicRow(dev, context) {
    const inFav = context === "favorites";
    const ctrl = musicControls(dev);
    const playing = isMusicPlaying(effectiveMusicStatus(dev));
    const status = effectiveMusicStatus(dev);
    const vol = effectiveMusicVolume(dev);
    const muted = dev.m === "muted";
    const canPlayPause = ctrl.play || ctrl.pause;

    const row = ce("div", "music-row" + (playing ? " is-playing" : "") + (inFav ? " quick-fav-span" : ""));
    row.dataset.name = String(dev.n || "").toLowerCase();

    const art = ce("div", "music-art" + (playing ? " playing" : ""));
    art.innerHTML = MUSIC_ART_SVG;
    const eq = ce("div", "music-eq");
    eq.setAttribute("aria-hidden", "true");
    for (let b = 0; b < 4; b++) {
      const bar = ce("span");
      bar.style.setProperty("animation-delay", (b * 140) + "ms");
      eq.appendChild(bar);
    }
    art.appendChild(eq);
    let muteBadge = null;
    if (muted && ctrl.mute) {
      muteBadge = ce("span", "music-muted-badge");
      muteBadge.textContent = "Muted";
      art.appendChild(muteBadge);
    }

    const infoHead = ce("div", "music-info-head");
    const info = ce("div", "music-info");
    const name = ce("span", "music-name");
    name.textContent = dev.n || ("Player " + dev.i);
    const track = ce("span", "music-track");
    track.textContent = dev.tr ? dev.tr : (playing ? "Streaming…" : "—");
    const meta = ce("span", "music-meta");
    meta.textContent = roomLabel(dev.r) + " · " + musicStatusLabel(dev);
    info.appendChild(name);
    info.appendChild(track);
    info.appendChild(meta);
    infoHead.appendChild(info);
    const favBtn = ce("button", "tile-fav");
    favBtn.type = "button";
    attachFavButton(favBtn, dev.i);
    infoHead.appendChild(favBtn);

    const transportCount = (ctrl.prev ? 1 : 0) + (canPlayPause ? 1 : 0) + (ctrl.stop ? 1 : 0) + (ctrl.next ? 1 : 0);
    const transport = ce("div", "music-transport" + (transportCount <= 3 ? " is-compact" : ""));
    let playPauseBtn = null;
    let stopBtn = null;
    if (ctrl.prev) {
      const prevBtn = ce("button", "music-btn");
      prevBtn.type = "button";
      prevBtn.setAttribute("aria-label", "Previous track");
      prevBtn.innerHTML = MUSIC_PREV_SVG;
      prevBtn.addEventListener("click", () => sendMusicCmd(dev.i, "previousTrack"));
      transport.appendChild(prevBtn);
    }
    if (canPlayPause) {
      playPauseBtn = ce("button", "music-btn music-btn-primary");
      playPauseBtn.type = "button";
      const isPlay = !playing;
      playPauseBtn.setAttribute("aria-label", isPlay ? "Play" : "Pause");
      playPauseBtn.innerHTML = isPlay ? MUSIC_PLAY_SVG : MUSIC_PAUSE_SVG;
      if (playing) playPauseBtn.classList.add("active");
      playPauseBtn.addEventListener("click", () => {
        sendMusicCmd(dev.i, playing ? "pause" : "play");
      });
      transport.appendChild(playPauseBtn);
    }
    if (ctrl.stop) {
      stopBtn = ce("button", "music-btn");
      stopBtn.type = "button";
      stopBtn.setAttribute("aria-label", "Stop");
      stopBtn.innerHTML = MUSIC_STOP_SVG;
      if (status === "stopped") stopBtn.classList.add("active");
      stopBtn.addEventListener("click", () => sendMusicCmd(dev.i, "stop"));
      transport.appendChild(stopBtn);
    }
    if (ctrl.next) {
      const nextBtn = ce("button", "music-btn");
      nextBtn.type = "button";
      nextBtn.setAttribute("aria-label", "Next track");
      nextBtn.innerHTML = MUSIC_NEXT_SVG;
      nextBtn.addEventListener("click", () => sendMusicCmd(dev.i, "nextTrack"));
      transport.appendChild(nextBtn);
    }

    const volWrap = ce("div", "music-volume");
    const volIcon = ce("span", "music-volume-icon");
    volIcon.textContent = vol == null ? "♪" : (vol === 0 || muted ? "🔇" : (vol < 34 ? "🔈" : (vol < 67 ? "🔉" : "🔊")));
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = String(vol == null ? 0 : vol);
    slider.className = "music-volume-slider";
    slider.setAttribute("aria-label", "Volume");
    slider.style.setProperty("--vol", String(vol == null ? 0 : vol) + "%");
    if (vol == null || !ctrl.volume) slider.disabled = true;
    let pendingVol = null;
    slider.addEventListener("input", () => {
      pendingVol = Number(slider.value);
      slider.style.setProperty("--vol", String(pendingVol) + "%");
      setMusicOptimistic(dev.i, { v: pendingVol });
      const volNow = Number(slider.value);
      volIcon.textContent = volNow === 0 || muted ? "🔇" : (volNow < 34 ? "🔈" : (volNow < 67 ? "🔉" : "🔊"));
      if (musicVolTimer) clearTimeout(musicVolTimer);
      musicVolTimer = setTimeout(() => {
        const v = pendingVol;
        pendingVol = null;
        musicVolTimer = null;
        if (v == null) return;
        sendMusicCmd(dev.i, "setVolume", v);
      }, 280);
    });
    volWrap.appendChild(volIcon);
    volWrap.appendChild(slider);

    row.appendChild(art);
    row.appendChild(infoHead);
    const right = ce("div", "music-right");
    if (transport.childElementCount) right.appendChild(transport);
    if (ctrl.volume) right.appendChild(volWrap);
    row.appendChild(right);

    if (inFav) {
      favMusicMap.set(dev.i, {
        el: row, art, track, meta, playPauseBtn, stopBtn, volIcon, slider, muteBadge, favBtn, i: dev.i,
      });
    }
    return row;
  }

  function updateFavoriteMusicRow(dev) {
    const rec = favMusicMap.get(dev.i);
    if (!rec) return;
    const ctrl = musicControls(dev);
    const playing = isMusicPlaying(effectiveMusicStatus(dev));
    const status = effectiveMusicStatus(dev);
    const vol = effectiveMusicVolume(dev);
    const muted = dev.m === "muted";
    rec.el.classList.toggle("is-playing", playing);
    rec.art.classList.toggle("playing", playing);
    rec.track.textContent = dev.tr ? dev.tr : (playing ? "Streaming…" : "—");
    rec.meta.textContent = roomLabel(dev.r) + " · " + musicStatusLabel(dev);
    if (rec.playPauseBtn) {
      rec.playPauseBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
      rec.playPauseBtn.innerHTML = playing ? MUSIC_PAUSE_SVG : MUSIC_PLAY_SVG;
      rec.playPauseBtn.classList.toggle("active", playing);
    }
    if (rec.stopBtn) rec.stopBtn.classList.toggle("active", status === "stopped");
    if (rec.slider && vol != null) {
      rec.slider.value = String(vol);
      rec.slider.style.setProperty("--vol", String(vol) + "%");
    }
    if (rec.volIcon) {
      rec.volIcon.textContent = vol == null ? "♪" : (vol === 0 || muted ? "🔇" : (vol < 34 ? "🔈" : (vol < 67 ? "🔉" : "🔊")));
    }
    if (ctrl.mute) {
      if (muted && !rec.muteBadge) {
        rec.muteBadge = ce("span", "music-muted-badge");
        rec.muteBadge.textContent = "Muted";
        rec.art.appendChild(rec.muteBadge);
      } else if (!muted && rec.muteBadge) {
        rec.muteBadge.remove();
        rec.muteBadge = null;
      }
    }
  }

  function renderMusicPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-music");
    body.innerHTML = "";
    if (!music.length) {
      body.textContent = "No speakers selected — add music players or additional speakers in the Hubitat app settings";
      return;
    }
    const sorted = sortByRoomThenFullName(music);
    const list = ce("div", "quick-list music-list");
    for (const dev of sorted) list.appendChild(makeMusicRow(dev, "popup"));
    body.appendChild(list);
  }

  function renderHubModePopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-hub-mode";
    body.innerHTML = "";
    if (!hubModes.length) {
      body.textContent = "No hub modes configured";
      return;
    }
    const grid = ce("div", "hub-mode-grid");
    for (const mode of hubModes) {
      const meta = hubModeMeta(mode);
      const b = ce("button", "hub-mode-btn");
      b.type = "button";
      b.innerHTML = meta.svg;
      const label = ce("span", "hub-mode-label");
      label.textContent = mode;
      b.appendChild(label);
      if (mode === currentHubMode) b.classList.add("active");
      b.addEventListener("click", async () => {
        if (mode === currentHubMode) return;
        hapticTap();
        const prev = currentHubMode;
        currentHubMode = mode;
        setHubModeLock();
        renderHubModePopup();
        const ok = await setHubModeApi(mode);
        if (!ok) {
          currentHubMode = prev;
          clearHubModeLock();
          renderHubModePopup();
        }
      });
      grid.appendChild(b);
    }
    body.appendChild(grid);
  }

  function ensurePinPadPopup() {
    if (pinPadPopup) return pinPadPopup;
    pinPadPopup = ce("div", "pin-pad-popup");
    pinPadPopup.hidden = true;
    pinPadPopup.setAttribute("role", "dialog");
    pinPadPopup.setAttribute("aria-modal", "true");
    const panel = ce("div", "pin-pad-panel");
    const title = ce("h2", "pin-pad-title");
    const error = ce("p", "pin-pad-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");
    const dots = ce("div", "pin-dots");
    const keys = ce("div", "pin-keys");
    const actions = ce("div", "pin-actions");
    const cancel = ce("button", "ghost-btn pin-cancel");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const submit = ce("button", "confirm-btn pin-submit");
    submit.type = "button";
    submit.textContent = "Submit";
    actions.appendChild(cancel);
    actions.appendChild(submit);
    panel.appendChild(title);
    panel.appendChild(error);
    panel.appendChild(dots);
    panel.appendChild(keys);
    panel.appendChild(actions);
    pinPadPopup.appendChild(panel);
    appendPopup(pinPadPopup);

    bindPopupDismiss(pinPadPopup, panel, null, () => {
      pinPadState?.onCancel?.();
      closePinPad();
    });
    cancel.addEventListener("click", (e) => {
      e.stopPropagation();
      pinPadState?.onCancel?.();
      closePinPad();
    });
    submit.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      if (!pinPadState?.pin?.length) return;
      pinPadState?.onSubmit?.(pinPadState.pin);
    });
    document.addEventListener("keydown", (e) => {
      if (!pinPadPopup.classList.contains("open")) return;
      if (e.key === "Escape") {
        pinPadState?.onCancel?.();
        closePinPad();
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        appendPinDigit(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        backspacePinDigit();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (pinPadState?.pin?.length) pinPadState.onSubmit?.(pinPadState.pin);
      }
    });

    pinPadPopup._title = title;
    pinPadPopup._error = error;
    pinPadPopup._dots = dots;
    pinPadPopup._keys = keys;
    pinPadPopup._submit = submit;
    return pinPadPopup;
  }

  function showPinPadError(message) {
    if (!pinPadPopup?._error) return;
    pinPadPopup._error.textContent = message;
    pinPadPopup._error.hidden = false;
  }

  function clearPinPadError() {
    if (!pinPadPopup?._error) return;
    pinPadPopup._error.textContent = "";
    pinPadPopup._error.hidden = true;
  }

  function renderPinPadDots() {
    if (!pinPadPopup || !pinPadState) return;
    const len = pinPadState.pin.length;
    pinPadPopup._dots.innerHTML = "";
    for (let i = 0; i < Math.max(4, len); i++) {
      const dot = ce("span", "pin-dot");
      if (i < len) dot.classList.add("filled");
      pinPadPopup._dots.appendChild(dot);
    }
    pinPadPopup._submit.disabled = len === 0;
  }

  function appendPinDigit(d) {
    if (!pinPadState || pinPadState.pin.length >= 8) return;
    hapticTap();
    clearPinPadError();
    pinPadState.pin += d;
    renderPinPadDots();
  }

  function backspacePinDigit() {
    if (!pinPadState || !pinPadState.pin.length) return;
    hapticTap();
    clearPinPadError();
    pinPadState.pin = pinPadState.pin.slice(0, -1);
    renderPinPadDots();
  }

  function closePinPad() {
    if (!pinPadPopup) return;
    pinPadPopup.hidden = true;
    pinPadPopup.classList.remove("open");
    pinPadPopup.classList.remove("shake");
    clearPinPadError();
    pinPadState = null;
  }

  function openPinPad({ title, onSubmit, onCancel }) {
    cancelAllSlideGestures();
    const popup = ensurePinPadPopup();
    pinPadState = { pin: "", onSubmit, onCancel };
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    popup._keys.innerHTML = "";
    for (let d = 1; d <= 9; d++) {
      const key = ce("button", "pin-key");
      key.type = "button";
      key.textContent = String(d);
      key.addEventListener("click", (e) => {
        e.stopPropagation();
        appendPinDigit(String(d));
      });
      popup._keys.appendChild(key);
    }
    const blank = ce("span", "pin-key-spacer");
    popup._keys.appendChild(blank);
    const zero = ce("button", "pin-key");
    zero.type = "button";
    zero.textContent = "0";
    zero.addEventListener("click", (e) => {
      e.stopPropagation();
      appendPinDigit("0");
    });
    popup._keys.appendChild(zero);
    const back = ce("button", "pin-key pin-key-back");
    back.type = "button";
    back.setAttribute("aria-label", "Backspace");
    back.textContent = "\u232b";
    back.addEventListener("click", (e) => {
      e.stopPropagation();
      backspacePinDigit();
    });
    popup._keys.appendChild(back);
    renderPinPadDots();
    clearPinPadError();
    popup.hidden = false;
    popup.classList.remove("shake");
    popup.classList.add("open");
    popup._submit.focus();

    return {
      close: closePinPad,
      shake() {
        popup.classList.remove("shake");
        void popup.offsetWidth;
        popup.classList.add("shake");
        showPinPadError("Wrong PIN. Try again.");
        if (pinPadState) pinPadState.pin = "";
        renderPinPadDots();
      },
    };
  }

  function promptGarageOpenPin(garageId, garageName) {
    hapticTap();
    const pad = openPinPad({
      title: "Enter PIN to open" + (garageName ? " " + garageName : ""),
      onSubmit: async (pin) => {
        const result = await sendGarageCmd(garageId, "open", pin);
        if (!result?.ok && (result?.status === 403 || result?.error === "wrong pin")) {
          pad.shake();
          return;
        }
        if (result?.ok) {
          pad.close();
          return;
        }
        if (result?.error === "pin not configured") flash("Set unlock PIN in Hubitat app settings", true);
        pad.close();
      },
    });
  }

  function promptUnlockPin(lockId, lockName) {
    hapticTap();
    const pad = openPinPad({
      title: "Enter PIN to unlock" + (lockName ? " " + lockName : ""),
      onSubmit: async (pin) => {
        const result = await sendLockCmd(lockId, "unlock", pin);
        if (!result?.ok && (result?.status === 403 || result?.error === "wrong pin")) {
          pad.shake();
          return;
        }
        if (result?.ok) {
          pad.close();
          return;
        }
        if (result?.error === "pin not configured") flash("Set unlock PIN in Hubitat app settings", true);
        pad.close();
      },
    });
  }

  function runHsmAction(title, cmd) {
    hapticTap();
    if (hsmPinRequired) {
      const pad = openPinPad({
        title: "Enter PIN to " + title,
        onSubmit: (pin) => setHsmApi(cmd, pin, pad),
      });
      return;
    }
    setHsmApi(cmd, null, null);
  }

  function appendHsmModeButtons(container, modes, { skipActive = true } = {}) {
    for (const mode of modes) {
      const b = ce("button", "tstat-mode quick-hsm-mode");
      b.type = "button";
      b.innerHTML = (mode.svg || "") + '<span class="quick-hsm-mode-label">' + mode.label + "</span>";
      if (hsmModeIsActive(hsmStatus, mode)) {
        b.classList.add("active");
        const activeClass = hsmModeActiveClass(mode, hsmStatus);
        if (activeClass) b.classList.add(activeClass);
      }
      b.addEventListener("click", () => {
        if (skipActive && hsmModeIsActive(hsmStatus, mode)) return;
        runHsmAction(mode.label, mode.cmd);
      });
      container.appendChild(b);
    }
  }

  function renderSecurityPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-security";
    body.innerHTML = "";
    if (!hsmEnabled) {
      body.textContent = "Enable HSM control in the Hubitat app settings";
      return;
    }

    const statusTone = hsmStatusTone(hsmStatus, hsmAlert);
    const statusWrap = ce("div", "quick-hsm-status quick-hsm-status--" + statusTone);
    if (hsmHasActiveAlert(hsmAlert)) statusWrap.classList.add("alert");
    const statusLabel = ce("span", "quick-hsm-status-label");
    statusLabel.textContent = hsmStatusLabel(hsmStatus);
    statusWrap.appendChild(statusLabel);
    const monMeta = ce("span", "quick-hsm-status-meta quick-hsm-status-meta--" + hsmMonitoringTone(hsmStatus));
    monMeta.textContent = hsmMonitoringLabel(hsmStatus);
    statusWrap.appendChild(monMeta);
    body.appendChild(statusWrap);

    if (hsmHasActiveAlert(hsmAlert)) {
      const alertBanner = ce("div", "quick-hsm-alert-banner");
      const alertText = ce("span", "quick-hsm-alert");
      alertText.textContent = hsmAlertLabel(hsmAlert, hsmAlertDesc);
      alertBanner.appendChild(alertText);
      const cancelBtn = ce("button", "quick-hsm-cancel-btn");
      cancelBtn.type = "button";
      cancelBtn.innerHTML = HSM_CANCEL_ALERT_SVG + '<span class="quick-hsm-cancel-label">Cancel Alert</span>';
      cancelBtn.addEventListener("click", () => {
        runHsmAction("cancel alert", "cancelAlerts");
      });
      alertBanner.appendChild(cancelBtn);
      body.appendChild(alertBanner);
    }

    const intrSection = ce("div", "quick-hsm-section");
    const intrTitle = ce("h3", "quick-hsm-section-title");
    intrTitle.textContent = "Intrusion";
    intrSection.appendChild(intrTitle);
    if (hsmIntrusionArmed(hsmStatus)) {
      const intrMeta = ce("p", "quick-hsm-section-meta quick-hsm-section-meta--" + hsmIntrusionTone(hsmStatus));
      intrMeta.textContent = hsmStatusLabel(hsmStatus);
      intrSection.appendChild(intrMeta);
    }
    const intrModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(intrModes, HSM_INTRUSION_MODES);
    intrSection.appendChild(intrModes);
    body.appendChild(intrSection);

    const monSection = ce("div", "quick-hsm-section");
    const monTitle = ce("h3", "quick-hsm-section-title");
    monTitle.textContent = "Leak & Environmental";
    monSection.appendChild(monTitle);
    const monDesc = ce("p", "quick-hsm-section-meta quick-hsm-section-meta--" + hsmMonitoringTone(hsmStatus));
    monDesc.textContent = hsmMonitoringLabel(hsmStatus);
    monSection.appendChild(monDesc);
    const monModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(monModes, HSM_MONITORING_MODES);
    monSection.appendChild(monModes);
    body.appendChild(monSection);

    const ruleSection = ce("div", "quick-hsm-section");
    const ruleTitle = ce("h3", "quick-hsm-section-title");
    ruleTitle.textContent = "Custom Rules";
    ruleSection.appendChild(ruleTitle);
    const ruleDesc = ce("p", "quick-hsm-section-meta");
    ruleDesc.textContent = "Hubitat Safety Monitor custom monitoring rules";
    ruleSection.appendChild(ruleDesc);
    const ruleModes = ce("div", "tstat-modes quick-hsm-modes");
    appendHsmModeButtons(ruleModes, HSM_RULE_MODES, { skipActive: false });
    ruleSection.appendChild(ruleModes);
    body.appendChild(ruleSection);
  }

  async function sendValveCmd(id, cmd) {
    const valve = valves.find((v) => v.i === id);
    if (!valve) return { ok: false };
    hapticTap();
    const patch = cmd === "open" ? { st: "opening" } : cmd === "close" ? { st: "closing" } : null;
    if (patch) {
      setValveOptimistic(id, patch);
      if (currentCategory() === "sensors") refreshSensorsPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    }
    const result = await sendCmd(id, cmd);
    if (!result.ok) {
      clearValveOptimistic(id);
      reconcileValve(id);
      if (currentCategory() === "sensors") refreshSensorsPopup();
      else if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
    } else {
      reconcileValve(id);
    }
    return result;
  }

  function reconcileValve(id) {
    setTimeout(() => refreshDevice(id), 700);
    setTimeout(() => refreshDevice(id), 2200);
  }

  // ---------- sensors popup ----------
  const SENSOR_TYPE_ORDER = Object.keys(SENSOR_TYPE_META);

  function sensorTypeOrder(t) {
    const idx = SENSOR_TYPE_ORDER.indexOf(t);
    return idx >= 0 ? idx : SENSOR_TYPE_ORDER.length;
  }

  function sortSensorsInRoom(devs, roomName) {
    return devs.slice().sort((a, b) => {
      const ta = sensorTypeOrder(a.t) - sensorTypeOrder(b.t);
      if (ta !== 0) return ta;
      return compareDevicesInRoom(a, b, roomName);
    });
  }

  function groupSensorsByRoom(merged) {
    const groups = new Map();
    for (const dev of merged) {
      const rid = normalizeRoomId(dev.r);
      if (!groups.has(rid)) groups.set(rid, []);
      groups.get(rid).push(dev);
    }
    return groups;
  }

  function groupRoomSensorsByType(devs) {
    const types = [];
    let lastType = null;
    for (const dev of devs) {
      if (dev.t !== lastType) {
        types.push({ type: dev.t, devs: [] });
        lastType = dev.t;
      }
      types[types.length - 1].devs.push(dev);
    }
    return types;
  }

  function mergedSensorList() {
    const byId = new Map();
    for (const s of tempSensors) {
      byId.set(String(s.i), normalizeTempSensorForCard(s));
    }
    for (const s of sensors) {
      const tempRec = tempSensors.find((x) => x.i === s.i);
      byId.set(String(s.i), buildMergedSensorCard(tempRec, s));
    }
    // Valve controls take priority if a valve also exposes a sensor capability.
    for (const v of valves) byId.set(String(v.i), normalizeValveForCard(v));
    const out = [...byId.values()];
    out.sort((a, b) => {
      const ta = sensorTypeOrder(a.t) - sensorTypeOrder(b.t);
      if (ta !== 0) return ta;
      return String(a.n || "").localeCompare(String(b.n || ""), undefined, { sensitivity: "base" });
    });
    return out;
  }

  function sensorsPopupSignature() {
    return mergedSensorList().map((d) => `${d.i}:${d.r}:${d.t}:${d.v}:${d.a}:${d.le ?? ""}:${sensorBatteryPct(d)}:${(d.ex || []).map((e) => e.k + e.v).join(".")}`).join("|");
  }

  function sensorTypesWithCounts() {
    const counts = new Map();
    for (const d of mergedSensorList()) {
      for (const t of sensorCardFilterTypes(d)) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => sensorTypeLabel(a[0]).localeCompare(sensorTypeLabel(b[0])));
  }

  function sensorMatchesFilter(dev) {
    if (!sensorTypeFilter.size) return true;
    const types = sensorCardFilterTypes(dev);
    for (const t of sensorTypeFilter) {
      if (types.has(t)) return true;
    }
    return false;
  }

  function syncSensorFilterBtn() {
    if (!sensorFilterBtnEl) return;
    const n = sensorTypeFilter.size;
    sensorFilterBtnEl.classList.toggle("is-active", n > 0 || sensorFilterOpen);
    let badge = sensorFilterBtnEl.querySelector(".sensor-filter-btn-badge");
    if (n > 0) {
      if (!badge) {
        badge = ce("span", "sensor-filter-btn-badge");
        sensorFilterBtnEl.appendChild(badge);
      }
      badge.textContent = String(n);
      badge.hidden = false;
    } else if (badge) badge.hidden = true;
  }

  function syncSensorFilterChips() {
    if (!sensorFilterChipsEl) return;
    for (const btn of sensorFilterChipsEl.querySelectorAll(".sensor-filter-chip")) {
      const t = btn.dataset.type;
      const on = t === "all" ? !sensorTypeFilter.size : sensorTypeFilter.has(t);
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  function applySensorTypeFilter() {
    let visible = 0;
    for (const dev of mergedSensorList()) {
      const rec = sensorCardMap.get(dev.i);
      if (!rec) continue;
      const show = sensorMatchesFilter(dev);
      rec.el.hidden = !show;
      if (show && !rec.el.classList.contains("search-hidden")) visible++;
    }
    for (const [, rec] of sensorRoomEls) {
      const visibleCards = rec.body.querySelectorAll(".sensor-card:not([hidden]):not(.search-hidden)");
      rec.card.classList.toggle("hidden", visibleCards.length === 0);
    }
    if (sensorFilterEmptyEl) sensorFilterEmptyEl.hidden = visible > 0;
    syncSensorFilterBtn();
    syncSensorFilterChips();
  }

  function buildSensorFilterBar() {
    const toolbar = ce("div", "sensor-toolbar");
    const filterBtn = ce("button", "sensor-filter-btn");
    filterBtn.type = "button";
    filterBtn.innerHTML = FILTER_SVG + '<span class="sensor-filter-btn-label">Filter</span>';
    filterBtn.setAttribute("aria-expanded", sensorFilterOpen ? "true" : "false");
    filterBtn.setAttribute("aria-label", "Filter sensors by type");
    toolbar.appendChild(filterBtn);
    sensorFilterBtnEl = filterBtn;

    const chips = ce("div", "sensor-filter-chips");
    chips.hidden = !sensorFilterOpen;
    chips.classList.toggle("is-open", sensorFilterOpen);
    const allBtn = ce("button", "sensor-filter-chip");
    allBtn.type = "button";
    allBtn.dataset.type = "all";
    allBtn.textContent = "All";
    allBtn.setAttribute("aria-pressed", !sensorTypeFilter.size ? "true" : "false");
    if (!sensorTypeFilter.size) allBtn.classList.add("active");
    allBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sensorTypeFilter.clear();
      applySensorTypeFilter();
    });
    chips.appendChild(allBtn);
    for (const [t, n] of sensorTypesWithCounts()) {
      const btn = ce("button", "sensor-filter-chip sensor-filter-chip--" + t);
      btn.type = "button";
      btn.dataset.type = t;
      btn.textContent = sensorTypeLabel(t) + " " + n;
      btn.setAttribute("aria-pressed", sensorTypeFilter.has(t) ? "true" : "false");
      if (sensorTypeFilter.has(t)) btn.classList.add("active");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (sensorTypeFilter.has(t)) sensorTypeFilter.delete(t);
        else sensorTypeFilter.add(t);
        applySensorTypeFilter();
      });
      chips.appendChild(btn);
    }
    sensorFilterChipsEl = chips;
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      sensorFilterOpen = !sensorFilterOpen;
      chips.hidden = !sensorFilterOpen;
      chips.classList.toggle("is-open", sensorFilterOpen);
      filterBtn.setAttribute("aria-expanded", sensorFilterOpen ? "true" : "false");
      syncSensorFilterBtn();
    });
    syncSensorFilterBtn();
    return { toolbar, chips };
  }

  function sensorBatteryPct(dev) {
    const ex = dev.ex || [];
    const entry = ex.find((e) => e.k === "battery");
    if (entry?.v != null && entry.v !== "") {
      const n = Number(entry.v);
      if (!isNaN(n)) return Math.round(n);
    }
    const bat = dev.bat ?? dev._ref?.bat;
    if (bat != null && bat !== "") {
      const n = Number(bat);
      if (!isNaN(n)) return Math.round(n);
    }
    return null;
  }

  function sensorBatteryLabel(dev) {
    const pct = sensorBatteryPct(dev);
    return pct != null ? pct + "% battery" : "";
  }

  function sensorCompactKindLabel(dev, pill) {
    const t = dev.t || "generic";
    if (t === "illuminance") return "Lux";
    if (t === "humidity") return "Humidity";
    if (t === "temp") return "Temp";
    if (t === "generic") {
      const ex = sortSensorExForDisplay(dev.ex, sensorExFooterExcludeForType(t), t);
      if (ex.length) {
        const k = String(ex[0].k || "").toLowerCase();
        if (k === "illuminance") return "Lux";
        return humanizeAttr(ex[0].k);
      }
    }
    const typeLbl = sensorTypeLabel(t);
    if (typeLbl !== "Sensor") return typeLbl;
    const p = String(pill || "").trim();
    return p || typeLbl;
  }

  function sensorExFooter(dev) {
    const ex = sortSensorExForDisplay(dev.ex, sensorExFooterExcludeForType(dev.t), dev.t);
    if (!ex.length) return "";
    const parts = [];
    for (const e of ex.slice(0, 4)) {
      let txt = humanizeAttr(e.k);
      const v = e.v;
      if (v != null && v !== "") {
        if (e.k === "temperature") txt += " " + Math.round(Number(v)) + tstatTempSuffix(e.u);
        else if (e.k === "humidity") txt += " " + Math.round(Number(v)) + "%";
        else if (e.k === "illuminance") txt += " " + Math.round(Number(v)) + " lx";
        else txt += " " + v + (e.u ? " " + e.u : "");
      }
      parts.push(txt);
    }
    return parts.join(" · ");
  }

  function applySensorCardState(card, dev, rec) {
    const meta = SENSOR_TYPE_META[dev.t] || SENSOR_TYPE_META.generic;
    card.style.setProperty("--sensor-accent", meta.accent);
    let hero, pill, alert;
    if (dev.t === "temp") {
      hero = formatRoomTemp(dev._ref || dev);
      pill = "Temp";
      alert = false;
    } else if (dev.t === "valve") {
      const d = sensorDisplay({ ...dev, v: effectiveValveState(dev._ref || dev) });
      hero = d.hero; pill = d.pill; alert = d.alert;
    } else {
      const d = sensorDisplay(dev);
      hero = d.hero; pill = d.pill; alert = d.alert;
    }
    for (const cls of Array.from(card.classList)) {
      if (cls.startsWith("sensor-card--")) card.classList.remove(cls);
    }
    card.classList.add("sensor-card--" + (dev.t || "generic"));
    card.classList.toggle("is-alert", !!alert);
    rec.heroEl.textContent = hero;
    if (pill) {
      rec.pillEl.hidden = false;
      rec.pillTxt.textContent = pill;
      rec.dot.classList.toggle("is-active", !!alert);
    } else {
      rec.pillEl.hidden = true;
    }
    rec.footEl.textContent = sensorCardFootText(dev, sensorExFooter);
    rec.footEl.hidden = !rec.footEl.textContent;
    if (rec.kindEl) rec.kindEl.textContent = sensorCompactKindLabel(dev, pill);
    const batTxt = sensorBatteryLabel(dev);
    rec.batteryEl.textContent = batTxt;
    rec.batteryEl.hidden = !batTxt;
    if (rec.actionsEl) rec.actionsEl.hidden = !batTxt;
    const lastTxt = sensorLastEventLine(dev);
    card.setAttribute("aria-label", (dev.n || "Sensor") + ", " + roomLabel(dev.r) + ", " + sensorTypeLabel(dev.t) + (pill ? ", " + pill : "") + (lastTxt ? ", " + lastTxt : "") + (batTxt ? ", " + batTxt : ""));
    if (dev.t === "valve" && rec.openBtn && rec.closeBtn) {
      const valve = dev._ref || dev;
      const moving = valveIsMoving(valve);
      const st = effectiveValveState(valve);
      rec.openBtn.classList.toggle("active", st === "open");
      rec.closeBtn.classList.toggle("active", st === "closed");
      rec.openBtn.classList.toggle("moving", moving);
      rec.closeBtn.classList.toggle("moving", moving);
      rec.openBtn.disabled = moving;
      rec.closeBtn.disabled = moving;
    }
  }

  function makeSensorCard(dev, context) {
    const meta = SENSOR_TYPE_META[dev.t] || SENSOR_TYPE_META.generic;
    const card = ce("div", "sensor-card sensor-card--" + (dev.t || "generic"));
    card.style.setProperty("--sensor-accent", meta.accent);
    card.dataset.name = String(dev.n || "").toLowerCase();
    const top = ce("div", "sensor-card-top");
    const icon = ce("span", "sensor-card-icon");
    icon.innerHTML = meta.svg;
    const pill = ce("span", "sensor-card-pill");
    const dot = ce("span", "sensor-card-dot");
    const pillTxt = ce("span", "sensor-card-pill-txt");
    pill.appendChild(dot);
    pill.appendChild(pillTxt);
    top.appendChild(icon);
    top.appendChild(pill);
    const fav = ce("button", "sensor-card-fav tile-fav");
    fav.type = "button";
    attachFavButton(fav, dev.i);
    top.appendChild(fav);
    const hero = ce("div", "sensor-card-value");
    const name = ce("div", "sensor-card-name");
    const fullName = dev.n || ("Sensor " + dev.i);
    const roomName = dev.r != null && dev.r !== -1 ? roomMap.get(dev.r) : null;
    const displayName = context === "sensors"
      ? ((dev.n ? stripRoomPrefix(dev.n, roomName) : null) || fullName)
      : fullName;
    name.textContent = displayName;
    if (dev.n && displayName !== dev.n) name.title = dev.n;
    const kind = ce("div", "sensor-card-kind");
    const metaRow = ce("div", "sensor-card-meta");
    metaRow.textContent = context === "sensors"
      ? (cfg.sensorsFlat ? roomLabel(dev.r) + " · " + sensorTypeLabel(dev.t) : sensorTypeLabel(dev.t))
      : roomLabel(dev.r) + " · " + sensorTypeLabel(dev.t);
    const foot = ce("div", "sensor-card-foot");
    const actions = ce("div", "sensor-card-actions");
    const battery = ce("div", "sensor-card-battery");
    actions.appendChild(battery);
    card.appendChild(top);
    card.appendChild(hero);
    card.appendChild(name);
    card.appendChild(kind);
    card.appendChild(metaRow);
    card.appendChild(foot);
    const rec = { el: card, heroEl: hero, pillEl: pill, pillTxt, dot, footEl: foot, batteryEl: battery, actionsEl: actions, favBtn: fav, kindEl: kind, t: dev.t, i: dev.i };
    if (dev.t === "valve") {
      const controls = ce("div", "sensor-card-controls");
      const openBtn = ce("button", "quick-lock-btn sensor-valve-btn");
      openBtn.type = "button";
      openBtn.innerHTML = SHADE_OPEN_SVG + '<span class="quick-lock-btn-label">Open</span>';
      const closeBtn = ce("button", "quick-lock-btn sensor-valve-btn");
      closeBtn.type = "button";
      closeBtn.innerHTML = SHADE_CLOSE_SVG + '<span class="quick-lock-btn-label">Close</span>';
      const valveRef = dev._ref || dev;
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!valveIsMoving(valveRef) && effectiveValveState(valveRef) !== "open") sendValveCmd(valveRef.i, "open");
      });
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!valveIsMoving(valveRef) && effectiveValveState(valveRef) !== "closed") sendValveCmd(valveRef.i, "close");
      });
      controls.appendChild(openBtn);
      controls.appendChild(closeBtn);
      card.appendChild(controls);
      rec.openBtn = openBtn;
      rec.closeBtn = closeBtn;
    }
    card.appendChild(actions);
    applySensorCardState(card, dev, rec);
    if (context === "favorites") favSensorMap.set(dev.i, rec);
    else sensorCardMap.set(dev.i, rec);
    return card;
  }

  function makeFavoriteSensorCard(dev) {
    return makeSensorCard(dev, "favorites");
  }

  function updateSensorCard(dev) {
    // Update both maps: after visiting Sensors then Favorites, sensorCardMap can
    // still hold detached cards that would otherwise steal updates from fav cards.
    const sen = sensorCardMap.get(dev.i);
    if (sen) applySensorCardState(sen.el, dev, sen);
    const fav = favSensorMap.get(dev.i);
    if (fav && fav !== sen) applySensorCardState(fav.el, dev, fav);
  }

  function appendSensorGridsByType(body, devs) {
    const typeGroups = groupRoomSensorsByType(devs);
    for (const tg of typeGroups) {
      if (typeGroups.length > 1) {
        const label = ce("div", "sensor-type-label");
        label.textContent = sensorTypeLabel(tg.type);
        body.appendChild(label);
      }
      const grid = ce("div", "sensor-grid");
      for (const dev of tg.devs) grid.appendChild(makeSensorCard(dev, "sensors"));
      body.appendChild(grid);
    }
  }

  function buildSensorRoomSection(roomKey, devs) {
    const name = roomKey === -1 ? "Unassigned" : (roomMap.get(roomKey) || "Room");
    const card = ce("section", "room sensor-room");
    card.dataset.roomId = roomKey;
    card.dataset.roomName = String(name).toLowerCase();

    const head = ce("div", "room-head");
    const title = ce("div", "room-title");
    const nameEl = ce("div", "room-name");
    nameEl.textContent = name;
    const meta = ce("div", "room-meta");
    meta.textContent = devs.length + (devs.length === 1 ? " sensor" : " sensors");
    title.appendChild(nameEl);
    title.appendChild(meta);
    head.appendChild(title);

    const col = ce("button", "room-collapse");
    col.type = "button";
    col.setAttribute("aria-label", "Collapse room");
    col.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
    col.addEventListener("click", (e) => {
      e.stopPropagation();
      card.classList.toggle("collapsed");
      persistSensorsCollapsed();
      updateExpandAllBtn();
    });
    head.appendChild(col);
    head.addEventListener("click", () => {
      card.classList.toggle("collapsed");
      persistSensorsCollapsed();
      updateExpandAllBtn();
    });

    const body = ce("div", "room-body sensor-room-body");
    card.appendChild(head);
    card.appendChild(body);

    const sorted = sortSensorsInRoom(devs, name);
    appendSensorGridsByType(body, sorted);

    sensorRoomEls.set(roomKey, { card, body, meta });
    return card;
  }

  function renderSensorsPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-sensors");
    body.innerHTML = "";
    sensorCardMap.clear();
    sensorRoomEls.clear();
    sensorCollapsedBeforeSearch = null;
    favSensorMap.clear();
    sensorFilterChipsEl = null;
    sensorFilterBtnEl = null;
    sensorFilterEmptyEl = null;
    const merged = mergedSensorList();
    sensorsPopupSig = sensorsPopupSignature();
    if (!merged.length) {
      body.textContent = "No sensors selected — add temperature, other sensors, or valves in Hubitat app settings";
      return;
    }
    const wrap = ce("div", "sensor-popup-wrap");
    const { toolbar, chips } = buildSensorFilterBar();
    const roomsEl = ce("div", "sensor-rooms");
    if (cfg.sensorsFlat) {
      roomsEl.classList.add("sensor-rooms--flat");
      appendSensorGridsByType(roomsEl, merged);
    } else {
      const sensorGroups = groupSensorsByRoom(merged);
      const hasSensors = (rid) => (sensorGroups.get(normalizeRoomId(rid))?.length || 0) > 0;
      const orderedIds = getDisplayRoomIds(sensorGroups, hasSensors);
      for (const rid of orderedIds) {
        const roomKey = normalizeRoomId(rid);
        const devs = sensorGroups.get(roomKey) || [];
        if (!devs.length) continue;
        roomsEl.appendChild(buildSensorRoomSection(roomKey, devs));
      }
    }
    const empty = ce("div", "sensor-filter-empty");
    empty.textContent = "No sensors match this filter";
    empty.hidden = true;
    sensorFilterEmptyEl = empty;
    wrap.appendChild(toolbar);
    wrap.appendChild(chips);
    wrap.appendChild(roomsEl);
    wrap.appendChild(empty);
    body.appendChild(wrap);
    restoreSensorsCollapsed();
    applySensorTypeFilter();
    updateExpandAllBtn();
  }

  function refreshSensorsPopup() {
    if (currentCategory() !== "sensors") return;
    const sig = sensorsPopupSignature();
    const body = currentBody();
    if (!body.querySelector(".sensor-rooms") || sig !== sensorsPopupSig) {
      renderSensorsPopup();
      return;
    }
    for (const dev of mergedSensorList()) updateSensorCard(dev);
    applySensorTypeFilter();
  }



  function renderScenesPopup() {
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    const body = popup._body;
    body.className = "quick-body quick-body-scenes";
    body.innerHTML = "";
    if (!scenes.length) {
      body.textContent = "No scenes on this hub";
      return;
    }
    const list = ce("div", "quick-list");
    for (const sc of scenes) {
      const b = ce("button", "quick-list-btn");
      b.type = "button";
      b.textContent = sc.n || ("Scene " + sc.id);
      b.addEventListener("click", async () => {
        b.disabled = true;
        hapticTap();
        const ok = await activateSceneApi(sc.id);
        b.disabled = false;
        if (ok) flash("Scene activated");
      });
      list.appendChild(b);
    }
    body.appendChild(list);
  }


  // ---------- cameras module (ships as mld-app-post3.js) ----------
  let camerasObserver = null;
  const camerasStopTimers = new Map();
  let camerasRenderedSig = "";
  let cameraReorderActive = false;
  let cameraReorderSnapshot = null;
  let cameraReorderDraftOrder = null;
  const cameraReorderEls = new Map();

  function isCameraReorderActive() {
    return cameraReorderActive;
  }

  function currentCameraOrderFromDom() {
    const grid = tabViewEl?.querySelector(".cameras-grid");
    if (!grid) return cameras.map(c => Number(c.i));
    return Array.from(grid.querySelectorAll(".camera-tile"))
      .map(el => Number(el.dataset.camId))
      .filter(id => Number.isFinite(id));
  }

  function updateCameraDraftOrderFromDom() {
    cameraReorderDraftOrder = currentCameraOrderFromDom();
  }

  function updateCameraMoveButtons() {
    if (!cameraReorderActive) return;
    const grid = tabViewEl?.querySelector(".cameras-grid");
    if (!grid) return;
    const tiles = Array.from(grid.querySelectorAll(".camera-tile"));
    tiles.forEach((tile, i) => {
      const rec = cameraReorderEls.get(Number(tile.dataset.camId));
      if (!rec?.moveUp || !rec?.moveDown) return;
      rec.moveUp.disabled = i === 0;
      rec.moveDown.disabled = i === tiles.length - 1;
    });
  }

  function moveCamera(camId, delta) {
    const grid = tabViewEl?.querySelector(".cameras-grid");
    if (!grid) return;
    const tiles = Array.from(grid.querySelectorAll(".camera-tile"));
    const idx = tiles.findIndex(t => Number(t.dataset.camId) === camId);
    if (idx < 0) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= tiles.length) return;
    const tile = tiles[idx];
    const sibling = tiles[newIdx];
    if (delta < 0) grid.insertBefore(tile, sibling);
    else grid.insertBefore(sibling, tile);
    updateCameraDraftOrderFromDom();
    updateCameraMoveButtons();
    hapticTap();
  }

  function attachCameraReorder(tile, handle) {
    let active = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let floatOffsetY = 0;
    let placeholder = null;
    const grid = () => tabViewEl?.querySelector(".cameras-grid");

    function visibleTiles() {
      const el = grid();
      if (!el) return [];
      return Array.from(el.querySelectorAll(".camera-tile:not(.camera-dragging)"));
    }

    function movePlaceholderForY(y) {
      if (!placeholder) return;
      const el = grid();
      if (!el) return;
      const tiles = visibleTiles();
      let insertBefore = null;
      for (const t of tiles) {
        const rect = t.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) {
          insertBefore = t;
          break;
        }
      }
      if (insertBefore) el.insertBefore(placeholder, insertBefore);
      else el.appendChild(placeholder);
    }

    function positionFloat(clientY) {
      tile.style.top = (clientY - floatOffsetY) + "px";
    }

    function beginDrag(e) {
      dragging = true;
      reorderBusy = true;
      const rect = tile.getBoundingClientRect();
      floatOffsetY = e.clientY - rect.top;
      placeholder = ce("div", "camera-drag-placeholder");
      placeholder.style.height = rect.height + "px";
      tile.parentNode.insertBefore(placeholder, tile);
      tile.classList.add("camera-dragging");
      tile.style.width = rect.width + "px";
      tile.style.left = rect.left + "px";
      tile.style.top = rect.top + "px";
      positionFloat(e.clientY);
      movePlaceholderForY(e.clientY);
    }

    function commitDrag() {
      const el = grid();
      if (placeholder?.parentNode && el) {
        el.insertBefore(tile, placeholder);
        placeholder.remove();
      }
      tile.classList.remove("camera-dragging");
      tile.style.width = "";
      tile.style.left = "";
      tile.style.top = "";
      placeholder = null;
      updateCameraDraftOrderFromDom();
      updateCameraMoveButtons();
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

    bindReorderPointer(handle, () => cameraReorderActive, (e) => {
      active = true;
      startX = e.clientX;
      startY = e.clientY;
    }, onMove, onUp);
  }

  function enterCameraReorderMode() {
    if (!isLocalOrigin()) {
      flash("Camera reorder requires the local dashboard URL", true);
      return;
    }
    cameraReorderSnapshot = cfg.cameraOrder?.length ? cfg.cameraOrder.map(Number) : null;
    cameraReorderDraftOrder = null;
    cameraReorderEls.clear();
    stopCamerasStreams();
    stopPolling();
    reorderMode = true;
    cameraReorderActive = true;
    APP_EL?.classList.add("reorder-mode", "cameras-reorder-mode");
    postCall("closeTopbarOverflowMenu");
    if (SEARCH_EL) {
      SEARCH_EL.value = "";
      applySearch();
    }
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = false;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = false;
    camerasRenderedSig = "";
    renderCamerasPopup();
    updateCameraMoveButtons();
  }

  function exitCameraReorderMode(resumePoll) {
    cameraReorderActive = false;
    cameraReorderDraftOrder = null;
    cameraReorderSnapshot = null;
    cameraReorderEls.clear();
    reorderMode = false;
    reorderBusy = false;
    APP_EL?.classList.remove("reorder-mode", "cameras-reorder-mode");
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = true;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = true;
    if (resumePoll) {
      startPolling();
      refresh();
    } else {
      camerasRenderedSig = "";
      renderCamerasPopup();
    }
  }

  async function finishCameraReorderMode() {
    const order = cameraReorderDraftOrder ?? currentCameraOrderFromDom();
    const saved = await saveCameraOrder(order);
    if (!saved) return false;
    cfg.cameraOrder = order.length ? order.slice() : null;
    replaceList(cameras, sortCamerasByOrder(cameras, cfg.cameraOrder));
    lastDataSig = "";
    exitCameraReorderMode(true);
    flash("Order saved");
    return true;
  }

  function cancelCameraReorderMode() {
    cfg.cameraOrder = cameraReorderSnapshot?.length ? cameraReorderSnapshot.slice() : null;
    replaceList(cameras, sortCamerasByOrder(cameras, cfg.cameraOrder));
    lastDataSig = "";
    exitCameraReorderMode(false);
  }

  function camerasListSig() {
    return cameras.map(c => `${c.i}:${c.n}:${c.t || ""}:${c.u || ""}:${c.uh || ""}`).join("|");
  }

  function cameraStreamType(cam) {
    if (cam?.t === "mjpg" || cam?.t === "webrtc") return cam.t;
    const u = cam?.u || "";
    return u.includes(".mjpg") ? "mjpg" : "webrtc";
  }

  function cameraTileStreamType(tile) {
    return tile?.dataset.streamType === "mjpg" ? "mjpg" : "webrtc";
  }

  function cameraTileMedia(tile) {
    if (!tile) return null;
    return cameraTileStreamType(tile) === "mjpg"
      ? tile.querySelector("img.camera-mjpeg")
      : tile.querySelector("iframe.camera-iframe");
  }

  function cameraTileStreamUrl(cam, hi) {
    if (!cam) return "";
    if (cameraStreamType(cam) === "mjpg") return cam.u || "";
    const base = hi ? (cam.uh || cam.u) : cam.u;
    return cameraEmbedUrl(base || "");
  }

  /** Normalize to go2rtc webrtc.html with audio track available (player starts muted; unmute in iframe). */
  function isBlankIframe(iframe) {
    const src = iframe?.src || "";
    return !src || src === "about:blank" || src.endsWith("about:blank");
  }

  function isStoppedCameraMedia(media, type) {
    if (!media) return true;
    if (type === "mjpg") return !media.getAttribute("src");
    return isBlankIframe(media);
  }

  function startCameraMedia(media, type, url) {
    if (!media || !url) return;
    if (type === "mjpg") media.setAttribute("src", url);
    else media.src = url;
  }

  function stopCameraMedia(media, type) {
    if (!media) return;
    if (type === "mjpg") media.removeAttribute("src");
    else media.src = "about:blank";
  }

  function cameraEmbedUrl(baseUrl) {
    if (!baseUrl) return "";
    try {
      const u = new URL(baseUrl, location.href);
      if (/stream\.html$/i.test(u.pathname)) u.pathname = u.pathname.replace(/stream\.html$/i, "webrtc.html");
      u.searchParams.set("media", "video+audio");
      return u.toString();
    } catch {
      return baseUrl;
    }
  }

  function cameraTilePlayUrl(tile) {
    if (!tile) return "";
    const onHi = tile.dataset.hdActive === "1";
    return onHi ? (tile.dataset.streamUrlHi || tile.dataset.streamUrl) : tile.dataset.streamUrl;
  }

  function syncCameraHdBtn(tile, btn) {
    const hdBtn = btn || tile?.querySelector(".camera-hd-btn");
    if (!hdBtn) return;
    const onHi = tile?.dataset.hdActive === "1";
    hdBtn.textContent = onHi ? "SD" : "HD";
    hdBtn.setAttribute("aria-pressed", onHi ? "true" : "false");
    hdBtn.classList.toggle("camera-hd-active", onHi);
    hdBtn.setAttribute("aria-label", onHi ? "Switch to standard definition stream" : "Switch to high definition stream");
  }

  function toggleCameraHd(tile) {
    if (!tile?.dataset.streamUrlHi || tile.dataset.streamUrlHi === tile.dataset.streamUrl) return;
    const onHi = tile.dataset.hdActive === "1";
    tile.dataset.hdActive = onHi ? "" : "1";
    syncCameraHdBtn(tile);
    const media = cameraTileMedia(tile);
    const url = cameraTilePlayUrl(tile);
    if (media && url) startCameraMedia(media, "webrtc", url);
    hapticTap();
  }

  function stopCamerasStreams() {
    if (camerasObserver) {
      camerasObserver.disconnect();
      camerasObserver = null;
    }
    for (const t of camerasStopTimers.values()) clearTimeout(t);
    camerasStopTimers.clear();
    const grid = tabViewEl?.querySelector(".cameras-grid");
    if (grid) {
      for (const tile of grid.querySelectorAll(".camera-tile")) {
        stopCameraMedia(cameraTileMedia(tile), cameraTileStreamType(tile));
      }
    }
    camerasRenderedSig = "";
  }

  function camerasRenderedSigKey() {
    return camerasListSig() + (isLocalOrigin() ? ":local" : ":remote");
  }

  function renderCamerasMessage(body, heading, message) {
    const wrap = ce("div", "cameras-empty");
    const h = ce("h2");
    h.textContent = heading;
    const p = ce("p");
    p.textContent = message;
    wrap.appendChild(h);
    wrap.appendChild(p);
    body.appendChild(wrap);
  }

  function armCameraNameHide(tile) {
    if (cameraReorderActive) return;
    const nameEl = tile?.querySelector(".camera-name");
    if (!nameEl) return;
    if (nameEl._nameHideTimer) clearTimeout(nameEl._nameHideTimer);
    nameEl.classList.remove("camera-name-hidden");
    nameEl._nameHideTimer = setTimeout(() => {
      nameEl.classList.add("camera-name-hidden");
      nameEl._nameHideTimer = null;
    }, 3000);
  }

  function refreshCamerasPopup() {
    if (!isLocalOrigin()) return;
    if (cameraReorderActive) return;
    const sig = camerasRenderedSigKey();
    if (sig === camerasRenderedSig && tabViewEl?.querySelector(".cameras-grid, .cameras-empty")) return;
    renderCamerasPopup();
  }

  function renderCamerasPopup() {
    stopCamerasStreams();
    if (!isLocalOrigin()) return;
    const body = currentBody();
    setQuickBodyClass(body, "cameras-tab tab-body");
    body.innerHTML = "";
    camerasRenderedSig = camerasRenderedSigKey();
    if (!cameras.length) {
      renderCamerasMessage(body, "No cameras", "Add go2rtc or native RTSP cameras in the Hubitat app settings.");
      return;
    }
    const grid = ce("div", "cameras-grid");
    grid.dataset.cols = cameraReorderActive
      ? "1"
      : String(cfg.camerasCols === 2 || cfg.camerasCols === 3 ? cfg.camerasCols : 1);
    const HYSTERESIS_MS = 200;
    cameraReorderEls.clear();
    for (const cam of cameras) {
      const tile = ce("article", "camera-tile");
      tile.dataset.camId = String(cam.i);
      tile.dataset.name = String(cam.n || "").toLowerCase();
      const streamType = cameraStreamType(cam);
      tile.dataset.streamType = streamType;
      const lowUrl = cameraTileStreamUrl(cam, false);
      const hiUrl = streamType === "webrtc" ? cameraTileStreamUrl(cam, true) : "";
      const streamAvailable = !!lowUrl;
      tile.dataset.streamUrl = lowUrl;
      tile.dataset.streamUrlHi = hiUrl || lowUrl;
      if (!streamAvailable) tile.classList.add("camera-tile-unavailable");
      const media = ce("div", "camera-media");
      let player;
      if (streamType === "mjpg") {
        player = ce("img", "camera-mjpeg");
        player.setAttribute("alt", cam.n || "Camera");
        player.loading = "lazy";
      } else {
        player = ce("iframe", "camera-iframe");
        player.setAttribute("title", cam.n || "Camera");
        player.setAttribute("allow", "autoplay; encrypted-media; fullscreen");
        player.loading = "lazy";
        player.src = "about:blank";
      }
      media.appendChild(player);
      if (!streamAvailable) {
        const unavail = ce("div", "camera-unavailable");
        unavail.textContent = "Stream unavailable";
        media.appendChild(unavail);
      }
      const nameEl = ce("span", "camera-name");
      nameEl.textContent = cam.n || "Camera";
      media.appendChild(nameEl);
      if (streamType === "webrtc" && hiUrl && hiUrl !== lowUrl && streamAvailable && !cameraReorderActive) {
        const hdBtn = ce("button", "camera-hd-btn");
        hdBtn.type = "button";
        hdBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleCameraHd(tile);
        });
        media.appendChild(hdBtn);
        syncCameraHdBtn(tile, hdBtn);
      }
      const reorderOverlay = ce("div", "camera-reorder-overlay");
      const dragHandle = ce("button", "camera-drag-handle");
      dragHandle.type = "button";
      dragHandle.setAttribute("aria-label", "Drag to reorder");
      dragHandle.innerHTML = DRAG_HANDLE_SVG;
      const moveBtns = ce("div", "camera-move-btns");
      const moveUp = ce("button", "camera-move-btn");
      moveUp.type = "button";
      moveUp.setAttribute("aria-label", "Move camera up");
      moveUp.innerHTML = MOVE_UP_SVG;
      moveUp.addEventListener("click", (e) => { e.stopPropagation(); moveCamera(Number(cam.i), -1); });
      const moveDown = ce("button", "camera-move-btn");
      moveDown.type = "button";
      moveDown.setAttribute("aria-label", "Move camera down");
      moveDown.innerHTML = MOVE_DOWN_SVG;
      moveDown.addEventListener("click", (e) => { e.stopPropagation(); moveCamera(Number(cam.i), 1); });
      moveBtns.appendChild(moveUp);
      moveBtns.appendChild(moveDown);
      reorderOverlay.appendChild(dragHandle);
      reorderOverlay.appendChild(moveBtns);
      attachCameraReorder(tile, dragHandle);
      cameraReorderEls.set(Number(cam.i), { moveUp, moveDown });
      tile.appendChild(media);
      tile.appendChild(reorderOverlay);
      grid.appendChild(tile);
    }
    body.appendChild(grid);
    if (cameraReorderActive) {
      updateCameraMoveButtons();
      return;
    }
    if (!("IntersectionObserver" in window)) {
      const tiles = grid.querySelectorAll(".camera-tile");
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        const media = cameraTileMedia(tile);
        const type = cameraTileStreamType(tile);
        const url = cameraTilePlayUrl(tile);
        if (i < 3 && media && url) startCameraMedia(media, type, url);
        armCameraNameHide(tile);
      }
      return;
    }
    camerasObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const tile = entry.target;
        const media = cameraTileMedia(tile);
        const type = cameraTileStreamType(tile);
        const url = cameraTilePlayUrl(tile);
        const key = String(tile.dataset.camId || tile.dataset.name || url || "");
        if (entry.isIntersecting) {
          if (media && url) {
            const pending = camerasStopTimers.get(key);
            if (pending) { clearTimeout(pending); camerasStopTimers.delete(key); }
            if (isStoppedCameraMedia(media, type)) startCameraMedia(media, type, url);
          }
          armCameraNameHide(tile);
        } else if (media && url && !camerasStopTimers.has(key)) {
          camerasStopTimers.set(key, setTimeout(() => {
            camerasStopTimers.delete(key);
            stopCameraMedia(media, type);
          }, HYSTERESIS_MS));
        }
      }
    }, { root: null, rootMargin: "0px", threshold: 0.15 });
    for (const tile of grid.querySelectorAll(".camera-tile")) camerasObserver.observe(tile);
  }

  // ---------- scheduler module (ships as mld-app-post3.js) ----------
  const SCHED_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const SCHED_DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const SCHED_OFFSET_PRESETS = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
  let schedules = [];
  let schedulesLoadState = "idle";
  let schedulesLoadedAt = 0;
  let schedulesLoadPromise = null;
  let schedulesRefreshEpoch = 0;
  let schedulesMutationChain = Promise.resolve();
  let schedulesMutationPending = 0;
  let schedulesCloudOmitted = false;
  let schedSaveInFlight = false;
  const schedRowInFlight = new Set();
  let hubTimeZone = "";
  let hubNowMs = 0;
  let sunTimes = { sunrise: null, sunset: null };
  let schedUse24Hour = false;
  let schedDraft = null;     // in-progress create/edit draft
  let schedStep = 1;         // 1 | 2 | 3
  let schedEditingId = null;
  let schedNameCustom = false;

  function applySchedulesResponse(res) {
    const list = Array.isArray(res) ? res : res?.schedules;
    if (!Array.isArray(list)) return;
    schedules = list;
    schedulesLoadState = "loaded";
    schedulesLoadedAt = Date.now();
  }

  function applySchedulesFromData(data, requestEpoch) {
    if (!data) return;
    schedulerEnabled = data.schedulerEnabled !== false;
    if (typeof data.hubTimeZone === "string") hubTimeZone = data.hubTimeZone.trim();
    const hn = Number(data.hubNow);
    if (hn > 0) hubNowMs = hn;
    if (!schedulerEnabled) {
      schedDraft = null;
      schedEditingId = null;
      schedStep = 1;
      schedNameCustom = false;
      schedulesLoadState = "idle";
      schedulesLoadedAt = 0;
      schedulesCloudOmitted = false;
    }
    if (data.schedules === null) schedulesCloudOmitted = true;
    else if (Array.isArray(data.schedules)) {
      schedulesCloudOmitted = false;
      const stale = typeof requestEpoch === "number" && requestEpoch !== schedulesRefreshEpoch;
      if (!stale && !schedulesMutationPending) {
        if (data.schedulesError && !data.schedules.length) {
          schedules = [];
          schedulesLoadState = "error";
        } else applySchedulesResponse(data.schedules);
      }
    }
    if (data.sunTimes && typeof data.sunTimes === "object") {
      sunTimes = { sunrise: data.sunTimes.sunrise ?? null, sunset: data.sunTimes.sunset ?? null };
    }
    schedUse24Hour = data.schedUse24Hour === true;
    if (schedulerViewIsActive() && schedulerEnabled) {
      if (schedulesCloudOmitted) void ensureSchedulesLoaded();
      renderSchedulerActive();
    }
  }

  async function ensureSchedulesLoaded(opts) {
    if (!schedulerEnabled) return;
    const force = !!(opts && opts.force);
    if (!force && schedulesLoadState === "loaded" && (!schedulesCloudOmitted || Date.now() - schedulesLoadedAt < 15e3)) return;
    if (schedulesMutationPending) return;
    if (schedulesLoadPromise) return schedulesLoadPromise;
    const had = schedulesLoadState === "loaded";
    const epoch = schedulesRefreshEpoch;
    if (!had) schedulesLoadState = "loading";
    schedulesLoadPromise = getJson("schedules").then((res) => {
      if (epoch !== schedulesRefreshEpoch) return;
      applySchedulesResponse(res);
      if (schedulesLoadState !== "loaded" && !had) schedulesLoadState = "error";
    }).catch((e) => {
      if (epoch !== schedulesRefreshEpoch) return;
      console.warn("Modern Dashboard: schedules fetch failed", e);
      if (!had) schedulesLoadState = "error";
    }).finally(() => { schedulesLoadPromise = null; });
    return schedulesLoadPromise;
  }

  function schedulerViewIsActive() {
    if (inTabView()) return activeTab === "scheduling";
    return quickPopupOpenType === "scheduling";
  }

  function schedulerHasContent() {
    return schedulerEnabled;
  }

  function schedulerResponseEpoch() {
    return schedulesRefreshEpoch;
  }

  function schedParseTime24(str) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(str || "").trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return { h, min };
  }

  function schedFormatTime24(h, min) {
    return String(h).padStart(2, "0") + ":" + String(min).padStart(2, "0");
  }

  function schedTime24To12(str) {
    const t = schedParseTime24(str);
    if (!t) return str || "";
    let h12 = t.h % 12;
    if (h12 === 0) h12 = 12;
    const ap = t.h < 12 ? "AM" : "PM";
    return h12 + ":" + String(t.min).padStart(2, "0") + " " + ap;
  }

  function schedTime12To24(h12, min, ap) {
    let h = Number(h12);
    const m = Number(min);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
    const mer = String(ap || "").toUpperCase();
    if (mer !== "AM" && mer !== "PM") return "";
    h = Math.round(h);
    const mm = Math.round(m);
    if (h < 1 || h > 12 || mm < 0 || mm > 59) return "";
    if (mer === "AM") { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
    return schedFormatTime24(h, mm);
  }

  function schedFmtClockTime(str24) {
    if (!str24) return "";
    return schedUse24Hour ? str24 : schedTime24To12(str24);
  }

  function schedFmtDateTimeLocal(iso) {
    const core = String(iso || "").slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(core)) return iso || "";
    return core.slice(0, 10) + " " + schedFmtClockTime(core.slice(11));
  }

  const SCHED_WHEEL_ITEM_H = 44;

  function schedCreateScrollWheel(min, max, fmtVal, initial, onSelect) {
    const col = ce("div", "sched-wheel-col");
    const viewport = ce("div", "sched-wheel-viewport");
    viewport.setAttribute("tabindex", "0");
    const list = ce("div", "sched-wheel-list");
    const pad = ce("div", "sched-wheel-pad");
    list.appendChild(pad);
    const values = [];
    const itemEls = [];
    for (let v = min; v <= max; v++) {
      values.push(v);
      const item = ce("div", "sched-wheel-item");
      item.textContent = fmtVal(v);
      list.appendChild(item);
      itemEls.push(item);
    }
    list.appendChild(pad.cloneNode());
    viewport.appendChild(list);
    col.appendChild(viewport);

    let lastVal = initial;
    let snapTimer = null;
    const paintCenter = () => {
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(viewport.scrollTop / SCHED_WHEEL_ITEM_H)));
      itemEls.forEach((el, i) => el.classList.toggle("is-centered", i === idx));
    };
    const snap = () => {
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(viewport.scrollTop / SCHED_WHEEL_ITEM_H)));
      const top = idx * SCHED_WHEEL_ITEM_H;
      if (Math.abs(viewport.scrollTop - top) > 1) viewport.scrollTo({ top, behavior: "smooth" });
      paintCenter();
      const v = values[idx];
      if (v !== lastVal) {
        lastVal = v;
        hapticTap(8);
        onSelect(v);
      }
    };
    const onScroll = () => {
      paintCenter();
      clearTimeout(snapTimer);
      snapTimer = setTimeout(snap, 90);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    viewport.addEventListener("scrollend", snap);

    const scrollTo = (v, smooth) => {
      const idx = values.indexOf(v);
      if (idx < 0) return;
      lastVal = v;
      viewport.scrollTo({ top: idx * SCHED_WHEEL_ITEM_H, behavior: smooth ? "smooth" : "auto" });
    };

    requestAnimationFrame(() => scrollTo(initial, false));
    return { col, scrollTo, destroy: () => { clearTimeout(snapTimer); viewport.removeEventListener("scroll", onScroll); viewport.removeEventListener("scrollend", snap); } };
  }

  function schedOpenTimeWheelSheet(state, onDone) {
    const overlay = ce("div", "sched-time-sheet open");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Select time");
    const panel = ce("div", "sched-time-sheet-panel");
    const head = ce("div", "sched-time-sheet-head");
    const title = ce("div", "sched-time-sheet-title");
    title.textContent = "Select time";
    const doneBtn = ce("button", "sched-time-sheet-done");
    doneBtn.type = "button";
    doneBtn.textContent = "Done";
    head.appendChild(title);
    head.appendChild(doneBtn);
    panel.appendChild(head);

    const wheels = ce("div", "sched-time-wheels");
    let draftH24 = state.h24;
    let draftMin = state.min;
    let draftAp = state.ap;
    const wheelsCleanup = [];

    const applyHour12 = (h12) => {
      const mer = draftAp === "PM";
      draftH24 = h12 === 12 ? (mer ? 12 : 0) : (mer ? h12 + 12 : h12);
    };

    const hourWheel = schedCreateScrollWheel(
      state.use24h ? 0 : 1,
      state.use24h ? 23 : 12,
      (v) => state.use24h ? String(v).padStart(2, "0") : String(v),
      state.use24h ? draftH24 : (draftH24 % 12 || 12),
      (v) => { if (state.use24h) draftH24 = v; else applyHour12(v); }
    );
    wheels.appendChild(hourWheel.col);
    wheelsCleanup.push(hourWheel);

    const sep = ce("span", "sched-time-wheels-sep");
    sep.textContent = ":";
    sep.setAttribute("aria-hidden", "true");
    wheels.appendChild(sep);

    const minWheel = schedCreateScrollWheel(0, 59, (v) => String(v).padStart(2, "0"), draftMin, (v) => { draftMin = v; });
    wheels.appendChild(minWheel.col);
    wheelsCleanup.push(minWheel);

    if (!state.use24h) {
      const apWheel = schedCreateScrollWheel(0, 1, (v) => (v === 0 ? "AM" : "PM"), draftAp === "AM" ? 0 : 1, (v) => {
        draftAp = v === 0 ? "AM" : "PM";
        const h12 = draftH24 % 12 || 12;
        draftH24 = draftAp === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
        hourWheel.scrollTo(h12, true);
      });
      wheels.appendChild(apWheel.col);
      wheelsCleanup.push(apWheel);
    }

    panel.appendChild(wheels);
    overlay.appendChild(panel);

    const close = (apply) => {
      wheelsCleanup.forEach((w) => w.destroy());
      overlay.remove();
      if (apply) onDone({ h24: draftH24, min: draftMin, ap: draftAp });
    };
    doneBtn.addEventListener("click", () => { hapticTap(); close(true); });
    bindPopupDismiss(overlay, panel, null, () => close(false));
    appendPopup(overlay);
    if (state.focusCol === "minute") requestAnimationFrame(() => minWheel.col.querySelector(".sched-wheel-viewport")?.focus());
    else requestAnimationFrame(() => hourWheel.col.querySelector(".sched-wheel-viewport")?.focus());
  }

  function schedBindStepHold(btn, stepFn) {
    let delayTimer = null;
    let repeatTimer = null;
    const clear = () => {
      if (delayTimer) clearTimeout(delayTimer);
      if (repeatTimer) clearInterval(repeatTimer);
      delayTimer = repeatTimer = null;
    };
    const run = () => {
      hapticTap();
      stepFn();
    };
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      run();
      delayTimer = setTimeout(() => { repeatTimer = setInterval(run, 80); }, 400);
    });
    btn.addEventListener("pointerup", clear);
    btn.addEventListener("pointercancel", clear);
  }

  function schedAppendTimeStep(btnRow, glyph, ariaLabel, stepFn) {
    const b = ce("button", "sched-time-step");
    b.type = "button";
    b.textContent = glyph;
    b.setAttribute("aria-label", ariaLabel);
    schedBindStepHold(b, stepFn);
    btnRow.appendChild(b);
  }

  function schedAppendTimeColumn(parent, label, getVal, setVal, min, max, fmtVal, onTapVal) {
    const col = ce("div", "sched-time-col");
    const lbl = ce("span", "sched-time-col-label");
    lbl.textContent = label;
    col.appendChild(lbl);
    const valBtn = ce("button", "sched-time-val sched-time-val-btn");
    valBtn.type = "button";
    valBtn.setAttribute("aria-label", "Select " + label.toLowerCase());
    valBtn.setAttribute("aria-live", "polite");
    const refreshVal = () => { valBtn.textContent = fmtVal(getVal()); };
    refreshVal();
    valBtn.addEventListener("click", () => {
      hapticTap();
      onTapVal?.();
    });
    col.appendChild(valBtn);
    const btnRow = ce("div", "sched-time-step-row");
    schedAppendTimeStep(btnRow, "\u2212", "Decrease " + label.toLowerCase(), () => {
      const v = getVal();
      setVal(v <= min ? max : v - 1);
      refreshVal();
    });
    schedAppendTimeStep(btnRow, "+", "Increase " + label.toLowerCase(), () => {
      const v = getVal();
      setVal(v >= max ? min : v + 1);
      refreshVal();
    });
    col.appendChild(btnRow);
    parent.appendChild(col);
    return { refreshVal };
  }

  function schedAppendClockPicker(parent, time24, onTime24) {
    const parsed = schedParseTime24(time24) || { h: 19, min: 30 };
    let h24 = parsed.h;
    let min = parsed.min;
    let ap = h24 < 12 ? "AM" : "PM";
    const wrap = ce("div", "sched-time-stepper");
    const sync = () => {
      const t = schedUse24Hour
        ? schedFormatTime24(h24, min)
        : schedTime12To24(h24 % 12 || 12, min, ap);
      if (t) onTime24(t);
    };
    const openSheet = (focusCol) => {
      schedOpenTimeWheelSheet(
        { h24, min, ap, use24h: schedUse24Hour, focusCol },
        ({ h24: h, min: m, ap: a }) => {
          h24 = h;
          min = m;
          if (!schedUse24Hour) ap = a;
          hourCol.refreshVal();
          minCol.refreshVal();
          if (!schedUse24Hour) {
            apSeg.querySelectorAll(".sched-seg").forEach((btn) => {
              btn.classList.toggle("is-active", btn.textContent === ap);
            });
          }
          sync();
        }
      );
    };
    const hourCol = schedAppendTimeColumn(
      wrap,
      "Hour",
      () => schedUse24Hour ? h24 : (h24 % 12 || 12),
      (v) => {
        if (schedUse24Hour) h24 = v;
        else {
          const mer = ap === "PM";
          h24 = v === 12 ? (mer ? 12 : 0) : (mer ? v + 12 : v);
        }
        sync();
      },
      schedUse24Hour ? 0 : 1,
      schedUse24Hour ? 23 : 12,
      (v) => schedUse24Hour ? String(v).padStart(2, "0") : String(v),
      () => openSheet("hour")
    );
    const sep = ce("span", "sched-time-sep");
    sep.textContent = ":";
    sep.setAttribute("aria-hidden", "true");
    wrap.appendChild(sep);
    const minCol = schedAppendTimeColumn(
      wrap,
      "Minute",
      () => min,
      (v) => { min = v; sync(); },
      0,
      59,
      (v) => String(v).padStart(2, "0"),
      () => openSheet("minute")
    );
    let apSeg = null;
    if (!schedUse24Hour) {
      const apCol = ce("div", "sched-time-col sched-time-ap-col");
      const apLbl = ce("span", "sched-time-col-label");
      apLbl.textContent = "AM / PM";
      apCol.appendChild(apLbl);
      apSeg = ce("div", "sched-segment sched-time-ap");
      for (const p of ["AM", "PM"]) {
        const b = ce("button", "sched-seg " + (ap === p ? "is-active" : ""));
        b.type = "button";
        b.textContent = p;
        b.addEventListener("click", () => {
          hapticTap();
          ap = p;
          const h12 = h24 % 12 || 12;
          h24 = p === "AM" ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
          apSeg.querySelectorAll(".sched-seg").forEach((btn) => {
            btn.classList.toggle("is-active", btn.textContent === ap);
          });
          hourCol.refreshVal();
          sync();
        });
        apSeg.appendChild(b);
      }
      apCol.appendChild(apSeg);
      wrap.appendChild(apCol);
    }
    parent.appendChild(wrap);
  }

  function schedHubTimeHint() {
    let browser = "";
    try { browser = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
    if (!hubTimeZone || !browser || hubTimeZone === browser) return null;
    const hint = ce("p", "sched-hint");
    hint.textContent = "Times use hub time (" + hubTimeZone + ")";
    return hint;
  }

  function fmtSchedTime(ms) {
    if (ms == null) return "\u2014";
    try {
      const d = new Date(Number(ms));
      if (isNaN(d.getTime())) return "\u2014";
      const opts = schedUse24Hour
        ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true };
      if (hubTimeZone) opts.timeZone = hubTimeZone;
      return d.toLocaleString([], opts);
    } catch { return "\u2014"; }
  }

  function fmtSchedRelativeFuture(ms) {
    const n = Number(ms);
    if (ms == null || isNaN(n)) return "";
    const diff = n - Date.now();
    if (diff < 0) return "";
    if (diff < 45000) return "Soon";
    if (diff < 3600000) {
      const mins = Math.max(1, Math.floor(diff / 60000));
      return "in " + mins + " min";
    }
    if (diff < 86400000) {
      const hrs = Math.max(1, Math.floor(diff / 3600000));
      return "in " + hrs + " hr";
    }
    return "";
  }

  function schedSunLabel(which, offsetMin) {
    const base = which === "sunrise" ? "Sunrise" : "Sunset";
    const off = Number(offsetMin) || 0;
    if (off === 0) return base;
    if (off > 0) return base + " +" + off + "m";
    return base + " " + off + "m";
  }

  function schedTriggerWhen(tr) {
    const w = String(tr?.when || "").trim().toLowerCase();
    return w === "sunrise" || w === "sunset" ? w : "clock";
  }

  // Hubitat may unwrap a one-item JSON array to a scalar (e.g. devices: 37).
  // Never iterate a string: [..."37"] / new Set("37") becomes ["3","7"].
  function schedIdList(raw) {
    if (raw == null || raw === "") return [];
    const arr = Array.isArray(raw) ? raw : [raw];
    const out = [];
    const seen = new Set();
    for (const id of arr) {
      if (id == null || id === "") continue;
      if (typeof id === "object") continue;
      const sid = String(id).trim();
      if (!sid || sid === "null" || sid === "undefined") continue;
      if (seen.has(sid)) continue;
      seen.add(sid);
      out.push(sid);
    }
    return out;
  }

  function schedThermoThenBits(ac) {
    const mode = String(ac.mode || "").trim();
    const modeKey = mode.toLowerCase();
    const bits = [];
    const heat = ac.heat;
    const cool = ac.cool;
    if (modeKey === "off") bits.push("Off");
    else if (modeKey === "cool") bits.push(cool != null && cool !== "" ? "Cool " + cool + "\u00b0" : "Cool");
    else if (modeKey === "heat") bits.push(heat != null && heat !== "" ? "Heat " + heat + "\u00b0" : "Heat");
    else {
      if (modeKey === "auto") bits.push("Auto");
      else if (mode) bits.push(mode.charAt(0).toUpperCase() + mode.slice(1));
      if (heat != null && heat !== "") bits.push("Heat " + heat + "\u00b0");
      if (cool != null && cool !== "") bits.push("Cool " + cool + "\u00b0");
    }
    const fan = String(ac.fanMode || "").trim();
    if (fan && fan.toLowerCase() !== "auto") bits.push("Fan " + fan);
    return bits;
  }

  function schedActionDescription(action, catalogs) {
    const ac = action || {};
    const target = String(ac.target || "");
    if (target === "lights" || target === "outlets") {
      const states = Array.isArray(ac.states) ? ac.states : [];
      const n = states.length;
      const label = target === "lights" ? "light" : "outlet";
      const labelPl = target === "lights" ? "lights" : "outlets";
      if (!n) return "No " + labelPl + " selected";
      const allOn = states.every((st) => st.on === true);
      const allOff = states.every((st) => st.on !== true);
      const noun = n === 1 ? label : labelPl;
      if (allOn) {
        const withLevel = states.filter((st) => st.level != null);
        if (withLevel.length === states.length && withLevel.every((st) => st.level === withLevel[0].level)) {
          const lv = withLevel[0].level;
          return lv === 100 ? "Turn on " + n + " " + noun : "Turn on " + n + " " + noun + " \u00b7 " + lv + "%";
        }
        return "Turn on " + n + " " + noun;
      }
      if (allOff) return "Turn off " + n + " " + noun;
      return "Set " + n + " " + noun;
    }
    if (target === "thermostats") {
      const ids = schedIdList(ac.devices);
      if (!ids.length) return "No thermostats selected";
      const tstats = (catalogs && catalogs.thermostats) || [];
      const names = ids.map((id) => {
        const t = tstats.find((x) => String(x.i) === id);
        const nm = t && t.n ? String(t.n).trim() : "";
        return nm || ("Thermostat " + id);
      });
      let scope;
      if (names.length === 1) scope = names[0];
      else if (names.length === 2) scope = names[0] + " & " + names[1];
      else scope = ids.length + " thermostats";
      return [scope].concat(schedThermoThenBits(ac)).filter(Boolean).join(" \u00b7 ");
    }
    if (target === "hubMode") {
      const mode = ac.mode ? String(ac.mode).trim() : "";
      return mode ? "Set hub mode to " + mode : "Change hub mode";
    }
    return "No action";
  }

  function schedOnlyInModesList(s) {
    return Array.isArray(s?.onlyInModes)
      ? s.onlyInModes.map((m) => String(m || "").trim()).filter(Boolean)
      : [];
  }

  function schedModeRestrictionState(s) {
    const modes = schedOnlyInModesList(s);
    if (!modes.length) return "none";
    if (String(s?.trigger?.kind || "") === "mode") return "none";
    const cur = String(currentHubMode || "").trim();
    if (!cur) return "unknown";
    return modes.includes(cur) ? "allowed" : "blocked";
  }

  function schedNextRunText(s) {
    if (!s.enabled) return { primary: "Paused", secondary: "", muted: false };
    const tr = s.trigger || {};
    const kind = String(tr.kind || "");
    const restriction = schedModeRestrictionState(s);
    const modes = schedOnlyInModesList(s);
    if (kind === "mode") {
      const mode = tr.mode ? String(tr.mode).trim() : "";
      return { primary: mode ? ("When mode is " + mode) : "On mode change", secondary: "", muted: false };
    }
    if (s.nextFire != null) {
      const rel = fmtSchedRelativeFuture(s.nextFire);
      const abs = fmtSchedTime(s.nextFire);
      if (restriction === "blocked") {
        return {
          primary: "Won't run in " + currentHubMode + " mode",
          secondary: "Next check " + (rel || abs) + " · only " + modes.join(", "),
          muted: true,
        };
      }
      const secondary = rel ? abs : "";
      if (restriction === "unknown" && modes.length) {
        return {
          primary: rel || abs,
          secondary: (secondary ? secondary + " · " : "") + "Only in " + modes.join(", "),
          muted: false,
        };
      }
      return { primary: rel || abs, secondary, muted: false };
    }
    if ((kind === "daily" || kind === "weekly") && schedTriggerWhen(tr) !== "clock") {
      const sun = schedSunLabel(schedTriggerWhen(tr), tr.offsetMin);
      if (restriction === "blocked") {
        return {
          primary: "Won't run in " + currentHubMode + " mode",
          secondary: "At " + sun.toLowerCase() + " · only " + modes.join(", "),
          muted: true,
        };
      }
      return { primary: sun, secondary: "", muted: false };
    }
    if (kind === "once") return { primary: "Past or invalid", secondary: "", muted: false };
    return { primary: "Pending", secondary: "", muted: false };
  }

  function schedLastResultNote(s) {
    const lr = s?.lastResult;
    if (!lr || lr.ok) return "";
    const m = (lr.missing || []).length, f = (lr.failed || []).length;
    return [m && (m + " missing"), f && (f + " failed"), !lr.succeeded && "no devices ran"].filter(Boolean).join(" \u00b7 ");
  }

  function schedLastRunText(s) {
    if (s.lastFired == null) return { primary: "Not yet run", secondary: "", muted: false };
    const rel = typeof formatSensorLastEvent === "function" ? formatSensorLastEvent(s.lastFired) : "";
    const note = schedLastResultNote(s);
    const secondary = [rel ? fmtSchedTime(s.lastFired) : "", note].filter(Boolean).join(" \u00b7 ");
    return { primary: rel || fmtSchedTime(s.lastFired), secondary, muted: !!note };
  }

  function schedSearchText(s) {
    const parts = [s?.name || "Untitled schedule"];
    if (s?.summary) parts.push(s.summary);
    const tr = s?.trigger || {};
    if (tr.time) {
      parts.push(tr.time);
      const t12 = schedTime24To12(tr.time);
      if (t12 && t12 !== tr.time) parts.push(t12);
    }
    if (schedTriggerWhen(tr) !== "clock") {
      parts.push(schedSunLabel(schedTriggerWhen(tr), tr.offsetMin));
    }
    if (tr.at) {
      parts.push(tr.at);
      const atFmt = schedFmtDateTimeLocal(tr.at);
      if (atFmt && atFmt !== tr.at) parts.push(atFmt);
    }
    if (s?.nextFire != null) {
      parts.push(fmtSchedTime(s.nextFire));
      parts.push(fmtSchedRelativeFuture(s.nextFire));
    }
    if (s?.lastFired != null) parts.push(fmtSchedTime(s.lastFired));
    return parts.join(" ").trim().toLowerCase();
  }

  function schedAppendRuleLine(parent, key, value) {
    const line = ce("div", "sched-rule-line");
    const keyEl = ce("span", "sched-rule-key");
    keyEl.textContent = key;
    const valEl = ce("span", "sched-rule-val");
    valEl.textContent = value;
    line.appendChild(keyEl);
    line.appendChild(valEl);
    parent.appendChild(line);
  }

  function schedAppendStatusItem(parent, label, text) {
    const item = ce("div", "sched-status-item" + (text.muted ? " is-muted" : ""));
    const lbl = ce("span", "sched-status-lbl");
    lbl.textContent = label;
    const val = ce("span", "sched-status-val");
    val.textContent = text.primary;
    item.appendChild(lbl);
    item.appendChild(val);
    if (text.secondary) {
      const sub = ce("span", "sched-status-sub");
      sub.textContent = text.secondary;
      item.appendChild(sub);
    }
    parent.appendChild(item);
  }

  function openSchedForEdit(s) {
    schedDraft = JSON.parse(JSON.stringify(s));
    schedDraft.trigger = schedDraft.trigger || { kind: "daily", when: "clock", time: "19:30", offsetMin: 0, mode: "" };
    if (!schedDraft.trigger.when) schedDraft.trigger.when = "clock";
    if (schedDraft.trigger.offsetMin == null) schedDraft.trigger.offsetMin = 0;
    if (!schedDraft.trigger.mode) schedDraft.trigger.mode = "";
    schedDraft.onlyInModes = Array.isArray(schedDraft.onlyInModes) ? schedDraft.onlyInModes : [];
    schedDraft.action = schedDraft.action || { target: "lights", states: [] };
    schedEditingId = s.id;
    schedStep = 1;
    schedNameCustom = !!(schedDraft.name && String(schedDraft.name).trim());
    renderSchedulerActive();
  }

  function newSchedDraft() {
    return {
      name: "",
      enabled: true,
      trigger: { kind: "daily", when: "clock", time: "19:30", offsetMin: 0, days: [], at: "", mode: "" },
      onlyInModes: [],
      action: { target: "lights", states: [], "devices": [], mode: "heat", heat: 68, cool: 72, fanMode: "auto" }
    };
  }

  async function schedApi(path, body) {
    try {
      const r = await fetch(withToken("schedules/" + path), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(body || {})
      });
      return await r.json();
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  }

  function schedMutationApi(path, body) {
    schedulesRefreshEpoch++;
    schedulesMutationPending++;
    const task = schedulesMutationChain.then(() => schedApi(path, body));
    schedulesMutationChain = task.catch(() => {});
    return task.finally(() => {
      schedulesMutationPending = Math.max(0, schedulesMutationPending - 1);
      // Invalidate /data polls that began while this mutation was in flight.
      schedulesRefreshEpoch++;
    });
  }

  function schedBeginRowOp(id) {
    const key = String(id || "");
    if (!key || schedRowInFlight.has(key)) return false;
    schedRowInFlight.add(key);
    return true;
  }

  function schedEndRowOp(id) {
    schedRowInFlight.delete(String(id || ""));
  }

  function renderSchedulerView() {
    void ensureSchedulesLoaded({ force: true }).then(() => {
      if (schedulerViewIsActive()) renderSchedulerActive();
    });
    renderSchedulerActive();
  }

  function renderSchedulerActive() {
    if (!schedulerViewIsActive()) return;
    const popup = ensureQuickPopup();
    syncQuickPopupRef(popup);
    syncQuickPopupWidthForOpen(popup);
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-scheduler");
    body.innerHTML = "";
    if (schedDraft) {
      body.appendChild(renderSchedWorkflow());
    } else {
      body.appendChild(renderSchedList());
    }
    applySearch();
  }

  // ---------- saved schedules list ----------
  function renderSchedList() {
    const wrap = ce("div", "sched-list-wrap");
    const header = ce("div", "sched-section-head");
    const title = ce("h3", "sched-section-title");
    title.textContent = "Schedules";
    header.appendChild(title);
    const addBtn = ce("button", "ghost-btn sched-add-btn");
    addBtn.type = "button";
    addBtn.textContent = "+ New schedule";
    addBtn.addEventListener("click", () => {
      schedDraft = newSchedDraft();
      schedEditingId = null;
      schedStep = 1;
      schedNameCustom = false;
      renderSchedulerActive();
    });
    header.appendChild(addBtn);
    wrap.appendChild(header);

    if (schedulesLoadState === "loading" && !schedules.length) {
      const empty = ce("div", "empty");
      empty.textContent = "Loading schedules\u2026";
      wrap.appendChild(empty);
      return wrap;
    }
    if (schedulesLoadState === "error" && !schedules.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "Couldn\u2019t load schedules. ";
      const retry = ce("button", "ghost-btn");
      retry.type = "button";
      retry.textContent = "Retry";
      retry.addEventListener("click", () => {
        schedulesLoadState = "idle";
        void ensureSchedulesLoaded({ force: true }).then(() => {
          if (schedulerViewIsActive()) renderSchedulerActive();
        });
      });
      empty.appendChild(retry);
      wrap.appendChild(empty);
      return wrap;
    }
    if (!schedules.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = "No schedules yet. Tap \u201cNew schedule\u201d to create one.";
      wrap.appendChild(empty);
      return wrap;
    }

    const list = ce("div", "sched-list");
    for (const s of schedules) {
      list.appendChild(renderSchedRow(s));
    }
    wrap.appendChild(list);
    return wrap;
  }

  function renderSchedRow(s) {
    const row = ce("div", "sched-row" + (s.enabled ? "" : " is-off"));
    row.dataset.name = schedSearchText(s);
    const rowBusy = schedRowInFlight.has(String(s.id || ""));

    const head = ce("div", "sched-row-head");
    const nameEl = ce("div", "sched-row-name");
    nameEl.textContent = s.name || "Untitled schedule";
    head.appendChild(nameEl);

    const toggle = ce("button", "sched-toggle " + (s.enabled ? "is-on" : "is-off"));
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", s.enabled ? "true" : "false");
    toggle.textContent = s.enabled ? "Enabled" : "Disabled";
    toggle.disabled = rowBusy;
    toggle.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!schedBeginRowOp(s.id)) return;
      hapticTap();
      renderSchedulerActive();
      try {
        const res = await schedMutationApi("toggle", { id: s.id });
        applySchedulesResponse(res);
        if (!res?.ok) flash(res?.error || "Toggle failed", true);
      } finally {
        schedEndRowOp(s.id);
        renderSchedulerActive();
      }
    });
    head.appendChild(toggle);
    row.appendChild(head);

    const rule = ce("div", "sched-row-rule");
    schedAppendRuleLine(rule, "When", s.summary || "");
    schedAppendRuleLine(rule, "Then", schedActionDescription(s.action, { thermostats }));
    row.appendChild(rule);

    const onlyModes = Array.isArray(s.onlyInModes) ? s.onlyInModes.filter(Boolean) : [];
    if (onlyModes.length) {
      const modesEl = ce("div", "sched-row-modes");
      modesEl.textContent = "Only in: " + onlyModes.join(", ");
      row.appendChild(modesEl);
    }

    const status = ce("div", "sched-row-status");
    schedAppendStatusItem(status, onlyModes.length ? "Next trigger" : "Next run", schedNextRunText(s));
    schedAppendStatusItem(status, "Last ran", schedLastRunText(s));
    row.appendChild(status);

    const foot = ce("div", "sched-row-foot");
    const editBtn = ce("button", "ghost-btn sched-icon-btn");
    editBtn.type = "button";
    editBtn.textContent = "Edit";
    editBtn.disabled = rowBusy;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      openSchedForEdit(s);
    });
    foot.appendChild(editBtn);

    const testBtn = ce("button", "ghost-btn sched-icon-btn");
    testBtn.type = "button";
    testBtn.textContent = "Run actions now";
    testBtn.title = "Ignores pause and mode rules";
    testBtn.disabled = rowBusy;
    testBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!schedBeginRowOp(s.id)) return;
      hapticTap();
      renderSchedulerActive();
      try {
        const res = await schedApi("test", { id: s.id });
        const resultOk = res?.ok === true && res?.lastResult?.ok !== false;
        flash(resultOk ? "Ran actions now" : (res?.error || "Actions did not complete"), !resultOk);
      } finally {
        schedEndRowOp(s.id);
        renderSchedulerActive();
      }
    });
    foot.appendChild(testBtn);

    const delBtn = ce("button", "ghost-btn sched-icon-btn sched-del-btn");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.disabled = rowBusy;
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this schedule?")) return;
      if (!schedBeginRowOp(s.id)) return;
      hapticTap();
      renderSchedulerActive();
      try {
        const res = await schedMutationApi("delete", { id: s.id });
        applySchedulesResponse(res);
        if (!res?.ok) flash(res?.error || "Delete failed", true);
      } finally {
        schedEndRowOp(s.id);
        renderSchedulerActive();
      }
    });
    foot.appendChild(delBtn);
    row.appendChild(foot);

    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      if (schedRowInFlight.has(String(s.id || ""))) return;
      hapticTap();
      openSchedForEdit(s);
    });
    return row;
  }

  // ---------- workflow ----------
  function renderSchedWorkflow() {
    const wrap = ce("div", "sched-workflow");
    const head = ce("div", "sched-workflow-head");
    const title = ce("h3", "sched-section-title");
    title.textContent = schedEditingId ? "Edit schedule" : "New schedule";
    head.appendChild(title);
    const cancelBtn = ce("button", "ghost-btn sched-cancel-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      schedDraft = null;
      schedEditingId = null;
      schedNameCustom = false;
      renderSchedulerActive();
    });
    head.appendChild(cancelBtn);
    wrap.appendChild(head);

    const steps = ce("div", "sched-step-indicator");
    for (let i = 1; i <= 3; i++) {
      const dot = ce("div", "sched-step-dot " + (i === schedStep ? "is-active" : (i < schedStep ? "is-done" : "")));
      dot.textContent = String(i);
      steps.appendChild(dot);
      if (i < 3) steps.appendChild(ce("div", "sched-step-line"));
    }
    wrap.appendChild(steps);
    wrap.appendChild(renderSchedNameField());

    if (schedStep === 1) wrap.appendChild(renderSchedStep1());
    else if (schedStep === 2) wrap.appendChild(renderSchedStep2());
    else wrap.appendChild(renderSchedStep3());
    return wrap;
  }

  function schedNavRow(backLabel, backCb, fwdLabel, fwdCb, extraClass) {
    const nav = ce("div", "sched-nav" + (extraClass ? " " + extraClass : ""));
    if (backLabel) {
      const b = ce("button", "ghost-btn");
      b.type = "button";
      b.textContent = backLabel;
      b.addEventListener("click", backCb);
      nav.appendChild(b);
    }
    if (fwdLabel) {
      const f = ce("button", "ghost-btn sched-primary-btn");
      f.type = "button";
      f.textContent = fwdLabel;
      if (schedSaveInFlight && (fwdLabel === "Create" || fwdLabel === "Save")) f.disabled = true;
      f.addEventListener("click", fwdCb);
      nav.appendChild(f);
    }
    return nav;
  }

  function schedBindPickRow(row, toggle) {
    row.classList.add("sched-pick-row");
    row.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      toggle();
    });
  }

  function schedBindPickRoom(hdr, checkBtn) {
    hdr.classList.add("sched-pick-room");
    hdr.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      checkBtn.click();
    });
  }

  // Step 1: When
  function renderSchedStep1() {
    const wrap = ce("div", "sched-step");
    const q = ce("p", "sched-question");
    q.textContent = "When would you like this automation to occur?";
    wrap.appendChild(q);

    const tr = schedDraft.trigger;
    const kinds = [
      { k: "daily", label: "Daily" },
      { k: "weekly", label: "Weekly" },
      { k: "once", label: "One-time" },
      { k: "mode", label: "When mode changes" }
    ];
    const seg = ce("div", "sched-segment");
    for (const { k, label } of kinds) {
      const b = ce("button", "sched-seg " + (tr.kind === k ? "is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        tr.kind = k;
        if (k === "weekly" && (!tr.days || !tr.days.length)) tr.days = ["MON"];
        if (k === "once" && !tr.at) tr.at = defaultOnceAt();
        if (k === "mode") {
          schedDraft.onlyInModes = [];
          if (!tr.mode && hubModes.length) tr.mode = hubModes[0];
        }
        renderSchedulerActive();
      });
      seg.appendChild(b);
    }
    wrap.appendChild(seg);

    if (tr.kind === "daily" || tr.kind === "weekly") {
      wrap.appendChild(renderSchedWhenPicker(tr));
      if ((tr.when || "clock") === "clock") {
        wrap.appendChild(renderSchedTimePicker(tr));
      } else {
        wrap.appendChild(renderSchedOffsetPicker(tr));
        wrap.appendChild(renderSchedSunPreview(tr));
      }
    }
    if (tr.kind === "weekly") {
      wrap.appendChild(renderSchedDayPicker(tr));
    }
    if (tr.kind === "once") {
      wrap.appendChild(renderSchedOncePicker(tr));
    }
    if (tr.kind === "mode") {
      const modePick = renderSchedModeTriggerPicker(tr);
      if (modePick) wrap.appendChild(modePick);
    }
    if (tr.kind !== "mode" && (tr.kind === "daily" || tr.kind === "weekly" || tr.kind === "once")) {
      const modeCond = renderSchedModeCondition();
      if (modeCond) wrap.appendChild(modeCond);
    }

    wrap.appendChild(schedNavRow(null, null, "Next", () => {
      if (!validateStep1()) return;
      schedStep = 2;
      renderSchedulerActive();
    }, "sched-nav-hero"));
    return wrap;
  }

  function validateStep1() {
    const tr = schedDraft.trigger;
    const when = tr.when || "clock";
    if (tr.kind === "daily" || tr.kind === "weekly") {
      if (when === "clock") {
        if (!schedParseTime24(tr.time || "")) { flash("Enter a valid time", true); return false; }
      } else {
        const off = Number(tr.offsetMin);
        if (!Number.isFinite(off) || off < -720 || off > 720) { flash("Offset must be between -720 and 720 minutes", true); return false; }
      }
    }
    if (tr.kind === "weekly" && (!tr.days || !tr.days.length)) { flash("Pick at least one day", true); return false; }
    if (tr.kind === "once") {
      if (!tr.at) { flash("Pick a date and time", true); return false; }
      const core = tr.at.length >= 16 ? tr.at.substring(0, 16) : tr.at;
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(core)) { flash("Invalid one-time date", true); return false; }
      if (!schedParseTime24(core.substring(11, 16))) { flash("Invalid one-time date", true); return false; }
    }
    if (tr.kind === "mode" && !tr.mode) { flash("Pick a hub mode", true); return false; }
    return true;
  }

  function renderSchedModeTriggerPicker(tr) {
    if (!hubModes.length) return null;
    const wrap = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "When hub mode becomes";
    wrap.appendChild(lbl);
    const grid = ce("div", "sched-mode-grid");
    for (const m of hubModes) {
      const b = ce("button", "sched-type-card " + (tr.mode === m ? "is-active" : ""));
      b.type = "button";
      b.textContent = m;
      b.addEventListener("click", () => { tr.mode = m; renderSchedulerActive(); });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function renderSchedModeCondition() {
    if (!hubModes.length) return null;
    const wrap = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Restrict to modes (optional)";
    wrap.appendChild(lbl);
    const hint = ce("p", "sched-hint");
    hint.textContent = "Only run when the hub is in one of these modes. Leave all unselected to always run.";
    wrap.appendChild(hint);
    const selected = new Set(schedDraft.onlyInModes || []);
    const grid = ce("div", "sched-mode-grid");
    for (const m of hubModes) {
      const b = ce("button", "sched-type-card " + (selected.has(m) ? "is-active" : ""));
      b.type = "button";
      b.textContent = m;
      b.addEventListener("click", () => {
        hapticTap();
        if (selected.has(m)) {
          selected.delete(m);
        } else {
          selected.add(m);
        }
        schedDraft.onlyInModes = [...selected];
        renderSchedulerActive();
      });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function schedOffsetLabel(min) {
    const n = Number(min) || 0;
    if (n === 0) return "At time";
    if (n > 0) return "+" + n + " min";
    return String(n) + " min";
  }

  function renderSchedWhenPicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Time of day";
    field.appendChild(lbl);
    const when = tr.when || "clock";
    const seg = ce("div", "sched-segment");
    for (const { k, label } of [{ k: "clock", label: "Clock" }, { k: "sunrise", label: "Sunrise" }, { k: "sunset", label: "Sunset" }]) {
      const b = ce("button", "sched-seg " + (when === k ? "is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        tr.when = k;
        if (k === "clock" && !tr.time) tr.time = "19:30";
        if (k !== "clock" && tr.offsetMin == null) tr.offsetMin = 0;
        renderSchedulerActive();
      });
      seg.appendChild(b);
    }
    field.appendChild(seg);
    return field;
  }

  function renderSchedOffsetPicker(tr) {
    const field = ce("div", "sched-field");
    const when = tr.when || "sunrise";
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = when === "sunset" ? "Offset from sunset" : "Offset from sunrise";
    field.appendChild(lbl);
    const presets = ce("div", "sched-offset-row");
    const cur = Number(tr.offsetMin) || 0;
    for (const off of SCHED_OFFSET_PRESETS) {
      const b = ce("button", "sched-offset " + (cur === off ? "is-on" : ""));
      b.type = "button";
      b.textContent = schedOffsetLabel(off);
      b.addEventListener("click", () => {
        tr.offsetMin = off;
        renderSchedulerActive();
      });
      presets.appendChild(b);
    }
    field.appendChild(presets);
    const custom = ce("div", "sched-offset-custom");
    const clbl = ce("label", "sched-field-label");
    clbl.textContent = "Custom offset (minutes, negative = before)";
    custom.appendChild(clbl);
    const inp = ce("input", "sched-input");
    inp.type = "number";
    inp.min = "-720";
    inp.max = "720";
    inp.step = "5";
    inp.value = String(cur);
    inp.addEventListener("input", () => { tr.offsetMin = Number(inp.value) || 0; schedSyncNameField(); });
    custom.appendChild(inp);
    field.appendChild(custom);
    return field;
  }

  function renderSchedSunPreview(tr) {
    const when = tr.when || "sunrise";
    const base = when === "sunset" ? sunTimes.sunset : sunTimes.sunrise;
    if (base == null) return ce("div");
    const off = (Number(tr.offsetMin) || 0) * 60 * 1000;
    const at = Number(base) + off;
    const field = ce("div", "sched-field sched-sun-preview");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Today's time";
    field.appendChild(lbl);
    const val = ce("div", "sched-sun-preview-val");
    val.textContent = fmtSchedTime(at);
    field.appendChild(val);
    return field;
  }

  function renderSchedTimePicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Time";
    field.appendChild(lbl);
    const hubHint = schedHubTimeHint();
    if (hubHint) field.appendChild(hubHint);
    schedAppendClockPicker(field, tr.time || "19:30", (t) => { tr.time = t; schedSyncNameField(); });
    return field;
  }

  function renderSchedDayPicker(tr) {
    const field = ce("div", "sched-field");
    const lbl = ce("label", "sched-field-label");
    lbl.textContent = "Days";
    field.appendChild(lbl);
    const row = ce("div", "sched-day-row");
    const selected = new Set(tr.days || []);
    for (let i = 0; i < 7; i++) {
      const d = SCHED_DAYS[i];
      const b = ce("button", "sched-day " + (selected.has(d) ? "is-on" : ""));
      b.type = "button";
      b.textContent = SCHED_DAY_LABELS[i];
      b.addEventListener("click", () => {
        if (selected.has(d)) selected.delete(d); else selected.add(d);
        tr.days = [...selected];
        renderSchedulerActive();
      });
      row.appendChild(b);
    }
    field.appendChild(row);
    return field;
  }

  function defaultOnceAt() {
    const ms = (hubNowMs || Date.now()) + 36e5;
    const o = { hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" };
    if (hubTimeZone) o.timeZone = hubTimeZone;
    try {
      const p = {};
      for (const x of new Intl.DateTimeFormat("en-US", o).formatToParts(new Date(ms))) p[x.type] = x.value;
      return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
    } catch {
      const d = new Date(ms);
      const z = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate()) + "T" + z(d.getHours()) + ":" + z(d.getMinutes());
    }
  }

  function renderSchedOncePicker(tr) {
    const wrap = ce("div", "sched-once-fields");
    if (!tr.at || tr.at.length < 16) tr.at = defaultOnceAt();

    const dateField = ce("div", "sched-field");
    const dlbl = ce("label", "sched-field-label");
    dlbl.textContent = "Date";
    dateField.appendChild(dlbl);
    const dateIn = ce("input", "sched-input");
    dateIn.type = "date";
    dateIn.value = tr.at.substring(0, 10);
    dateIn.addEventListener("input", () => {
      const timePart = tr.at.length >= 16 ? tr.at.substring(11, 16) : "19:30";
      tr.at = dateIn.value + "T" + timePart;
      schedSyncNameField();
    });
    dateField.appendChild(dateIn);
    wrap.appendChild(dateField);

    const hubHint = schedHubTimeHint();
    if (hubHint) wrap.appendChild(hubHint);

    const timeField = ce("div", "sched-field");
    const tlbl = ce("label", "sched-field-label");
    tlbl.textContent = "Time";
    timeField.appendChild(tlbl);
    const timePart = tr.at.length >= 16 ? tr.at.substring(11, 16) : "19:30";
    schedAppendClockPicker(timeField, timePart, (t) => {
      const datePart = tr.at.length >= 10 ? tr.at.substring(0, 10) : defaultOnceAt().substring(0, 10);
      tr.at = datePart + "T" + t;
      schedSyncNameField();
    });
    wrap.appendChild(timeField);
    return wrap;
  }

  // Step 2: device type
  function renderSchedStep2() {
    const wrap = ce("div", "sched-step");
    const q = ce("p", "sched-question");
    q.textContent = "What type of device would you like to control?";
    wrap.appendChild(q);
    const opts = [
      { k: "lights", label: "Lights" },
      ...(outlets.length ? [{ k: "outlets", label: "Outlets" }] : []),
      { k: "thermostats", label: "Thermostats" },
      { k: "hubMode", label: "Hub mode" }
    ];
    if (!opts.some((o) => o.k === schedDraft.action.target)) {
      schedDraft.action.target = "lights";
    }
    const grid = ce("div", "sched-type-grid");
    for (const { k, label } of opts) {
      const b = ce("button", "sched-type-card " + (schedDraft.action.target === k ? "is-active" : ""));
      b.type = "button";
      b.textContent = label;
      b.addEventListener("click", () => {
        schedDraft.action.target = k;
        if ((k === "lights" || k === "outlets") && !schedDraft.action.states) schedDraft.action.states = [];
        if (k === "thermostats" && !schedDraft.action.devices) schedDraft.action.devices = [];
        renderSchedulerActive();
      });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    wrap.appendChild(schedNavRow("Back", () => { schedStep = 1; renderSchedulerActive(); }, "Next", () => {
      if (!schedDraft.action.target) { flash("Pick a type", true); return; }
      schedStep = 3;
      renderSchedulerActive();
    }));
    return wrap;
  }

  // Step 3: action
  function schedMountDeviceActionsSection(wrap, oldActionsEl, selList, hintText) {
    if (!selList.childNodes.length) {
      if (oldActionsEl) oldActionsEl.remove();
      return;
    }
    const section = ce("div", "sched-device-actions");
    const head = ce("div", "sched-device-actions-head");
    const title = ce("h4", "sched-device-actions-title");
    title.textContent = "Set action for each device";
    const hint = ce("p", "sched-device-actions-hint");
    hint.textContent = hintText;
    head.appendChild(title);
    head.appendChild(hint);
    section.appendChild(head);
    section.appendChild(selList);
    if (oldActionsEl) oldActionsEl.replaceWith(section);
    else wrap.appendChild(section);
  }

  function renderSchedStep3() {
    const wrap = ce("div", "sched-step");
    const t = schedDraft.action.target;
    if (t === "lights") wrap.appendChild(renderSchedLightAction());
    else if (t === "outlets") wrap.appendChild(renderSchedOnOffDeviceAction(outlets, "Select outlets", "No outlets configured. Add outlets in the companion app device settings."));
    else if (t === "thermostats") wrap.appendChild(renderSchedThermostatAction());
    else if (t === "hubMode") {
      const hubModeAction = renderSchedHubModeAction();
      if (hubModeAction) wrap.appendChild(hubModeAction);
    }
    wrap.appendChild(schedNavRow("Back", () => { schedStep = 2; renderSchedulerActive(); }, schedEditingId ? "Save" : "Create", saveSchedule));
    return wrap;
  }

  function renderSchedOnOffDeviceAction(devList, question, emptyMsg) {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = question;
    wrap.appendChild(q);
    if (!devList.length) {
      const empty = ce("p", "sched-empty");
      empty.textContent = emptyMsg;
      wrap.appendChild(empty);
      return wrap;
    }

    const selectedIds = new Set((schedDraft.action.states || []).map((s) => String(s.id)));
    const byRoom = new Map();
    for (const d of devList) {
      const rid = d.r == null ? "none" : String(d.r);
      if (!byRoom.has(rid)) byRoom.set(rid, []);
      byRoom.get(rid).push(d);
    }
    const findState = (id) => (schedDraft.action.states || []).find((s) => String(s.id) === String(id));

    function renderRow(d) {
      const st = findState(d.i);
      const row = ce("div", "sched-light-row");
      const head = ce("div", "sched-light-row-head");
      const nm = ce("div", "sched-light-name");
      nm.textContent = d.n || ("Device " + d.i);
      head.appendChild(nm);
      const removeBtn = ce("button", "ghost-btn sched-mini-btn");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        selectedIds.delete(String(d.i));
        schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
        refreshOnOffAction();
      });
      head.appendChild(removeBtn);
      row.appendChild(head);
      const onOff = ce("div", "sched-onoff");
      const onBtn = ce("button", "sched-seg " + (st.on ? "is-active" : ""));
      onBtn.type = "button"; onBtn.textContent = "On";
      onBtn.addEventListener("click", () => { st.on = true; refreshOnOffAction(); });
      const offBtn = ce("button", "sched-seg " + (!st.on ? "is-active" : ""));
      offBtn.type = "button"; offBtn.textContent = "Off";
      offBtn.addEventListener("click", () => { st.on = false; refreshOnOffAction(); });
      onOff.appendChild(onBtn); onOff.appendChild(offBtn);
      row.appendChild(onOff);
      return row;
    }

    function refreshOnOffAction() {
      const oldPicker = wrap.querySelector(".sched-light-picker");
      const oldActions = wrap.querySelector(".sched-device-actions");
      const next = ce("div", "sched-light-picker");
      const roomOrder = [...(rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      for (const r of roomOrder) {
        const rid = String(r.id);
        const roomDevs = byRoom.get(rid) || [];
        if (!roomDevs.length) continue;
        const hdr = ce("div", "sched-room-header");
        const allOn = roomDevs.every((d) => selectedIds.has(String(d.i)));
        const check = ce("button", "sched-check " + (allOn ? "is-on" : ""));
        check.type = "button";
        check.textContent = allOn ? "\u2713" : "";
        check.addEventListener("click", () => {
          hapticTap();
          if (allOn) {
            for (const d of roomDevs) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            }
          } else {
            for (const d of roomDevs) {
              selectedIds.add(String(d.i));
              if (!findState(d.i)) schedDraft.action.states.push({ id: d.i, on: true });
            }
          }
          refreshOnOffAction();
        });
        hdr.appendChild(check);
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        schedBindPickRoom(hdr, check);
        next.appendChild(hdr);
        for (const d of roomDevs) {
          const row = ce("div", "sched-light-toggle-row");
          const sel = selectedIds.has(String(d.i));
          const cbtn = ce("button", "sched-check " + (sel ? "is-on" : ""));
          cbtn.type = "button";
          cbtn.textContent = sel ? "\u2713" : "";
          const toggle = () => {
            hapticTap();
            if (sel) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            } else {
              selectedIds.add(String(d.i));
              schedDraft.action.states.push({ id: d.i, on: true });
            }
            refreshOnOffAction();
          };
          cbtn.addEventListener("click", toggle);
          schedBindPickRow(row, toggle);
          row.appendChild(cbtn);
          const dnm = ce("div", "sched-light-name");
          dnm.textContent = d.n || ("Device " + d.i);
          row.appendChild(dnm);
          next.appendChild(row);
        }
      }
      const unroomed = byRoom.get("none") || [];
      if (unroomed.length) {
        const hdr = ce("div", "sched-room-header");
        const h = ce("div", "sched-room-name");
        h.textContent = "No room";
        hdr.appendChild(h);
        next.appendChild(hdr);
        for (const d of unroomed) {
          const row = ce("div", "sched-light-toggle-row");
          const sel = selectedIds.has(String(d.i));
          const cbtn = ce("button", "sched-check " + (sel ? "is-on" : ""));
          cbtn.type = "button";
          cbtn.textContent = sel ? "\u2713" : "";
          const toggle = () => {
            hapticTap();
            if (sel) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            } else {
              selectedIds.add(String(d.i));
              schedDraft.action.states.push({ id: d.i, on: true });
            }
            refreshOnOffAction();
          };
          cbtn.addEventListener("click", toggle);
          schedBindPickRow(row, toggle);
          row.appendChild(cbtn);
          const dnm = ce("div", "sched-light-name");
          dnm.textContent = d.n || ("Device " + d.i);
          row.appendChild(dnm);
          next.appendChild(row);
        }
      }
      if (oldPicker) oldPicker.replaceWith(next); else wrap.appendChild(next);

      const selList = ce("div", "sched-lights");
      for (const r of roomOrder) {
        const rid = String(r.id);
        const selDevs = (byRoom.get(rid) || []).filter((d) => selectedIds.has(String(d.i)));
        if (!selDevs.length) continue;
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of selDevs) selList.appendChild(renderRow(d));
      }
      const unroomedSel = unroomed.filter((d) => selectedIds.has(String(d.i)));
      if (unroomedSel.length) {
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = "No room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of unroomedSel) selList.appendChild(renderRow(d));
      }
      schedMountDeviceActionsSection(wrap, oldActions, selList, "Choose on or off for every selected device below.");
      schedSyncNameField();
    }

    refreshOnOffAction();
    return wrap;
  }

  function renderSchedLightAction() {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Select lights";
    wrap.appendChild(q);

    const selectedIds = new Set((schedDraft.action.states || []).map((s) => String(s.id)));
    const byRoom = new Map();
    for (const d of devices) {
      const rid = d.r == null ? "none" : String(d.r);
      if (!byRoom.has(rid)) byRoom.set(rid, []);
      byRoom.get(rid).push(d);
    }

    const findState = (id) => (schedDraft.action.states || []).find((s) => String(s.id) === String(id));

    function renderSchedRoomToggle(r, roomDevs) {
      const hdr = ce("div", "sched-room-header");
      const allOn = roomDevs.every((d) => selectedIds.has(String(d.i)));
      const check = ce("button", "sched-check " + (allOn ? "is-on" : ""));
      check.type = "button";
      check.setAttribute("aria-pressed", allOn ? "true" : "false");
      check.textContent = allOn ? "\u2713" : "";
      check.addEventListener("click", () => {
        hapticTap();
        if (allOn) {
          for (const d of roomDevs) {
            selectedIds.delete(String(d.i));
            schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
          }
        } else {
          for (const d of roomDevs) {
            selectedIds.add(String(d.i));
            if (!findState(d.i)) schedDraft.action.states.push({ id: d.i, on: true, level: d.d ? 100 : null, ct: d.ct ? 3000 : null });
          }
        }
        refreshLightAction();
      });
      hdr.appendChild(check);
      const nm = ce("div", "sched-room-name");
      nm.textContent = r.name || "Room";
      hdr.appendChild(nm);
      schedBindPickRoom(hdr, check);
      return hdr;
    }

    function renderSchedLightToggle(d) {
      const row = ce("div", "sched-light-toggle-row");
      const sel = selectedIds.has(String(d.i));
      const check = ce("button", "sched-check " + (sel ? "is-on" : ""));
      check.type = "button";
      check.textContent = sel ? "\u2713" : "";
      const toggle = () => {
        hapticTap();
        if (sel) {
          selectedIds.delete(String(d.i));
          schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
        } else {
          selectedIds.add(String(d.i));
          schedDraft.action.states.push({ id: d.i, on: true, level: d.d ? 100 : null, ct: d.ct ? 3000 : null });
        }
        refreshLightAction();
      };
      check.addEventListener("click", toggle);
      schedBindPickRow(row, toggle);
      row.appendChild(check);
      const nm = ce("div", "sched-light-name");
      nm.textContent = d.n || ("Device " + d.i);
      row.appendChild(nm);
      return row;
    }

    function renderSchedLightRow(d) {
      const st = findState(d.i);
      const row = ce("div", "sched-light-row");
      const head = ce("div", "sched-light-row-head");
      const nm = ce("div", "sched-light-name");
      nm.textContent = d.n || ("Device " + d.i);
      head.appendChild(nm);
      const removeBtn = ce("button", "ghost-btn sched-mini-btn");
      removeBtn.type = "button";
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        selectedIds.delete(String(d.i));
        schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
        refreshLightAction();
      });
      head.appendChild(removeBtn);
      row.appendChild(head);

      const onOff = ce("div", "sched-onoff");
      const onBtn = ce("button", "sched-seg " + (st.on ? "is-active" : ""));
      onBtn.type = "button"; onBtn.textContent = "On";
      onBtn.addEventListener("click", () => { st.on = true; refreshLightAction(); });
      const offBtn = ce("button", "sched-seg " + (!st.on ? "is-active" : ""));
      offBtn.type = "button"; offBtn.textContent = "Off";
      offBtn.addEventListener("click", () => { st.on = false; refreshLightAction(); });
      onOff.appendChild(onBtn); onOff.appendChild(offBtn);
      row.appendChild(onOff);

      if (d.d && st.on) {
        const field = ce("div", "sched-field");
        const fieldHead = ce("div", "sched-field-head");
        const lbl = ce("label", "sched-field-label");
        lbl.textContent = "Brightness";
        const val = ce("span", "sched-slider-val");
        val.textContent = (st.level ?? 100) + "%";
        fieldHead.appendChild(lbl);
        fieldHead.appendChild(val);
        field.appendChild(fieldHead);
        const { el: levelTrack } = makeLevelTrackSlider({
          value: st.level ?? 100,
          min: 1,
          max: 100,
          onChange: (l) => { st.level = l; val.textContent = l + "%"; },
        });
        field.appendChild(levelTrack);
        row.appendChild(field);
      }
      if (d.ct && st.on) {
        const field = ce("div", "sched-field");
        const fieldHead = ce("div", "sched-field-head");
        const lbl = ce("label", "sched-field-label");
        lbl.textContent = "White balance (K)";
        const val = ce("span", "sched-slider-val");
        val.textContent = (st.ct ?? 3000) + "K";
        fieldHead.appendChild(lbl);
        fieldHead.appendChild(val);
        field.appendChild(fieldHead);
        const { el: ctTrack } = makeCtTrackSlider({
          value: st.ct ?? 3000,
          onChange: (k) => { st.ct = k; val.textContent = k + "K"; },
        });
        field.appendChild(ctTrack);
        row.appendChild(field);
      }
      return row;
    }

    function refreshLightAction() {
      const oldPicker = wrap.querySelector(".sched-light-picker");
      const oldActions = wrap.querySelector(".sched-device-actions");
      const next = ce("div", "sched-light-picker");
      const roomOrder = [...(rooms || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      for (const r of roomOrder) {
        const rid = String(r.id);
        const roomDevs = byRoom.get(rid) || [];
        if (!roomDevs.length) continue;
        next.appendChild(renderSchedRoomToggle(r, roomDevs));
        for (const d of roomDevs) next.appendChild(renderSchedLightToggle(d));
      }
      const unroomed = byRoom.get("none") || [];
      if (unroomed.length) {
        const hdr = ce("div", "sched-room-header");
        const h = ce("div", "sched-room-name");
        h.textContent = "No room";
        hdr.appendChild(h);
        next.appendChild(hdr);
        for (const d of unroomed) next.appendChild(renderSchedLightToggle(d));
      }
      if (oldPicker) oldPicker.replaceWith(next); else wrap.appendChild(next);

      const selList = ce("div", "sched-lights");
      for (const r of roomOrder) {
        const rid = String(r.id);
        const roomDevs = byRoom.get(rid) || [];
        const selDevs = roomDevs.filter((d) => selectedIds.has(String(d.i)));
        if (!selDevs.length) continue;
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = r.name || "Room";
        hdr.appendChild(nm);
        const allOn = roomDevs.every((d) => selectedIds.has(String(d.i)));
        const allBtn = ce("button", "ghost-btn sched-mini-btn");
        allBtn.type = "button";
        allBtn.textContent = allOn ? "Deselect all" : "Select all";
        allBtn.addEventListener("click", () => {
          hapticTap();
          if (allOn) {
            for (const d of roomDevs) {
              selectedIds.delete(String(d.i));
              schedDraft.action.states = (schedDraft.action.states || []).filter((s) => String(s.id) !== String(d.i));
            }
          } else {
            for (const d of roomDevs) {
              selectedIds.add(String(d.i));
              if (!findState(d.i)) schedDraft.action.states.push({ id: d.i, on: true, level: d.d ? 100 : null, ct: d.ct ? 3000 : null });
            }
          }
          refreshLightAction();
        });
        hdr.appendChild(allBtn);
        selList.appendChild(hdr);
        for (const d of selDevs) selList.appendChild(renderSchedLightRow(d));
      }
      const unroomedSel = unroomed.filter((d) => selectedIds.has(String(d.i)));
      if (unroomedSel.length) {
        const hdr = ce("div", "sched-actions-room-head");
        const nm = ce("div", "sched-room-name");
        nm.textContent = "No room";
        hdr.appendChild(nm);
        selList.appendChild(hdr);
        for (const d of unroomedSel) selList.appendChild(renderSchedLightRow(d));
      }
      schedMountDeviceActionsSection(wrap, oldActions, selList, "Choose on/off and brightness for every selected device below.");
      schedSyncNameField();
    }

    refreshLightAction();
    return wrap;
  }

  function renderSchedThermostatAction() {
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Select thermostats and settings";
    wrap.appendChild(q);

    const selectedIds = new Set(schedIdList(schedDraft.action.devices));
    const list = ce("div", "sched-lights");
    for (const t of thermostats) {
      const sel = selectedIds.has(String(t.i));
      const row = ce("div", "sched-light-toggle-row");
      const check = ce("button", "sched-check " + (sel ? "is-on" : ""));
      check.type = "button";
      check.textContent = sel ? "\u2713" : "";
      const toggle = () => {
        hapticTap();
        if (sel) selectedIds.delete(String(t.i));
        else selectedIds.add(String(t.i));
        schedDraft.action.devices = [...selectedIds];
        renderSchedulerActive();
      };
      check.addEventListener("click", toggle);
      schedBindPickRow(row, toggle);
      row.appendChild(check);
      const nm = ce("div", "sched-light-name");
      nm.textContent = t.n || ("Thermostat " + t.i);
      row.appendChild(nm);
      list.appendChild(row);
    }
    wrap.appendChild(list);

    if (!schedIdList(schedDraft.action.devices).length) {
      const note = ce("p", "sched-empty");
      note.textContent = "No thermostats selected.";
      wrap.appendChild(note);
    } else {
      const modeField = ce("div", "sched-field");
      const mlbl = ce("label", "sched-field-label");
      mlbl.textContent = "System mode";
      modeField.appendChild(mlbl);
      const modes = ["auto", "heat", "cool", "off"];
      const seg = ce("div", "sched-segment");
      const sysMode = schedDraft.action.mode || "auto";
      for (const m of modes) {
        const b = ce("button", "sched-seg " + (sysMode === m ? "is-active" : ""));
        b.type = "button"; b.textContent = m;
        b.addEventListener("click", () => {
          schedDraft.action.mode = m;
          if (m === "heat") schedDraft.action.cool = null;
          else if (m === "cool") schedDraft.action.heat = null;
          renderSchedulerActive();
        });
        seg.appendChild(b);
      }
      modeField.appendChild(seg);
      wrap.appendChild(modeField);

      if (sysMode !== "cool") {
        const heatField = ce("div", "sched-field");
        const hlbl = ce("label", "sched-field-label");
        hlbl.textContent = "Heat setpoint (\u00b0F)";
        heatField.appendChild(hlbl);
        const hin = ce("input", "sched-input");
        hin.type = "number"; hin.min = "40"; hin.max = "90"; hin.value = String(schedDraft.action.heat ?? 68);
        hin.addEventListener("input", () => { schedDraft.action.heat = Number(hin.value); schedSyncNameField(); });
        heatField.appendChild(hin);
        wrap.appendChild(heatField);
      }

      if (sysMode !== "heat") {
        const coolField = ce("div", "sched-field");
        const clbl = ce("label", "sched-field-label");
        clbl.textContent = "Cool setpoint (\u00b0F)";
        coolField.appendChild(clbl);
        const cin = ce("input", "sched-input");
        cin.type = "number"; cin.min = "50"; cin.max = "100"; cin.value = String(schedDraft.action.cool ?? 72);
        cin.addEventListener("input", () => { schedDraft.action.cool = Number(cin.value); schedSyncNameField(); });
        coolField.appendChild(cin);
        wrap.appendChild(coolField);
      }

      const fanField = ce("div", "sched-field");
      const flbl = ce("label", "sched-field-label");
      flbl.textContent = "Fan mode";
      fanField.appendChild(flbl);
      const fanModes = ["auto", "on", "circulate"];
      const fseg = ce("div", "sched-segment");
      for (const m of fanModes) {
        const b = ce("button", "sched-seg " + (schedDraft.action.fanMode === m ? "is-active" : ""));
        b.type = "button"; b.textContent = m;
        b.addEventListener("click", () => { schedDraft.action.fanMode = m; renderSchedulerActive(); });
        fseg.appendChild(b);
      }
      fanField.appendChild(fseg);
      wrap.appendChild(fanField);
    }
    return wrap;
  }

  function renderSchedHubModeAction() {
    if (!hubModes.length) return null;
    const wrap = ce("div", "sched-action");
    const q = ce("p", "sched-question");
    q.textContent = "Which hub mode should be set?";
    wrap.appendChild(q);
    const grid = ce("div", "sched-mode-grid");
    for (const m of hubModes) {
      const b = ce("button", "sched-type-card " + (schedDraft.action.mode === m ? "is-active" : ""));
      b.type = "button"; b.textContent = m;
      b.addEventListener("click", () => { schedDraft.action.mode = m; renderSchedulerActive(); });
      grid.appendChild(b);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function autoSchedName() {
    const fn = globalThis.autoScheduleName;
    if (typeof fn !== "function") return "";
    return fn(schedDraft, { rooms, devices, outlets, thermostats }, {
      clockTime: schedFmtClockTime,
      dateTimeLocal: schedFmtDateTimeLocal,
    });
  }

  function schedLiveName() {
    if (schedNameCustom && (schedDraft?.name || "").trim()) return schedDraft.name;
    return autoSchedName();
  }

  function schedSyncNameField() {
    const nin = document.querySelector(".sched-name-input");
    if (!nin || !schedDraft) return;
    const auto = autoSchedName();
    nin.placeholder = auto;
    if (schedNameCustom) return;
    if (document.activeElement === nin) return;
    nin.value = auto;
  }

  function renderSchedNameField() {
    const nameField = ce("div", "sched-field sched-name-field");
    const nlbl = ce("label", "sched-field-label");
    nlbl.textContent = "Schedule name";
    nameField.appendChild(nlbl);
    const nin = ce("input", "sched-input sched-name-input");
    nin.type = "text";
    nin.value = schedLiveName();
    nin.placeholder = autoSchedName();
    nin.addEventListener("input", () => {
      const auto = autoSchedName();
      const v = nin.value;
      if (!v.trim() || v === auto) {
        schedNameCustom = false;
        schedDraft.name = "";
        nin.placeholder = auto;
      } else {
        schedNameCustom = true;
        schedDraft.name = v;
      }
    });
    nin.addEventListener("blur", () => {
      if (!schedNameCustom) nin.value = autoSchedName();
    });
    nameField.appendChild(nin);
    return nameField;
  }

  async function saveSchedule(e) {
    if (schedSaveInFlight) return;
    if (!validateStep1()) { schedStep = 1; renderSchedulerActive(); return; }
    const ac = schedDraft.action;
    if (ac.target === "lights" && (!ac.states || !ac.states.length)) { flash("Select at least one light", true); return; }
    if (ac.target === "outlets" && (!ac.states || !ac.states.length)) { flash("Select at least one outlet", true); return; }
    if (ac.target === "thermostats") {
      ac.devices = schedIdList(ac.devices);
      if (!ac.devices.length) { flash("Select at least one thermostat", true); return; }
    }
    if (ac.target === "hubMode" && !ac.mode) { flash("Pick a hub mode", true); return; }
    const payload = {
      id: schedEditingId || undefined,
      name: (schedNameCustom ? (schedDraft.name || "").trim() : "") || autoSchedName(),
      enabled: schedDraft.enabled,
      trigger: schedDraft.trigger,
      onlyInModes: schedDraft.onlyInModes || [],
      action: schedDraft.action
    };
    schedSaveInFlight = true;
    if (e?.currentTarget) e.currentTarget.disabled = true;
    try {
      const res = await schedMutationApi("save", payload);
      applySchedulesResponse(res);
      if (res?.ok) {
        schedDraft = null;
        schedEditingId = null;
        flash("Schedule saved");
      } else flash(res?.error || "Save failed", true);
    } finally {
      schedSaveInFlight = false;
      renderSchedulerActive();
    }
  }

  Object.assign(globalThis.__MLD, { applySchedulesFromData, schedulerHasContent, schedulerResponseEpoch, renderSchedulerView });
  globalThis.__MLD.updateQuickNavVisibility?.();

})();
