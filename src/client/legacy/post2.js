

  function favoritesPopupSignature() {
    const entries = getFavoriteEntries();
    const sizes = entries.map((e) => {
      const size = resolveFavoriteSize(e);
      const zoom = e?.type === "html" ? normalizeHtmlZoom(e.tile?.zoom) : null;
      const title = e?.type === "html" ? String(e.tile?.title || "") : "";
      return favoriteEntryKey(e) + ":" + size + (zoom != null ? "@" + zoom : "") + (title ? "#" + title : "");
    }).join(",");
    return entries.map((e) => favoriteEntryKey(e)).join(",") + "|" + sizes;
  }

  function favoritesGridSizesMatch(entries, grid) {
    const rendered = new Map(
      Array.from(grid.querySelectorAll("[data-fav-key]"))
        .map((el) => [el.dataset.favKey, el])
    );
    if (rendered.size !== entries.length) return false;
    for (const entry of entries) {
      const tile = rendered.get(favoriteEntryKey(entry));
      const want = "fav-size-" + resolveFavoriteSize(entry);
      if (!tile?.classList.contains(want)) return false;
      if (entry.type === "html") {
        const htmlCard = tile.matches(".fav-html-card") ? tile : tile.querySelector(".fav-html-card");
        const wantZoom = String(normalizeHtmlZoom(entry.tile?.zoom));
        if (htmlCard && htmlCard.dataset.htmlZoom !== wantZoom) return false;
      }
    }
    return true;
  }

  let favoritesReorderActive = false;
  let favoritesReorderSnapshot = null;
  let favoritesReorderDraftOrder = null;
  let favoritesReorderSaving = false;
  const favoritesReorderEls = new Map();
  let favDragCleanup = null;
  let favAutoScrollRaf = null;
  let favSizeChooserEl = null;
  let favSizeChooserReturnFocus = null;

  function isFavoritesReorderActive() {
    return favoritesReorderActive;
  }

  const FAVORITE_SIZE_PRESETS = ["full", "square", "wide", "tall", "large", "portrait", "standard", "compact", "viewport"];

  function resolveFavoriteSize(entry) {
    const profile = favoriteSizeProfile(entry);
    if (entry?.type === "html") {
      return coerceFavoriteSize(entry, entry.tile?.size);
    }
    if (entry?.type === "embed" || entry?.type === "time" || entry?.type === "notifications") {
      return coerceFavoriteSize(entry, entry.card?.size);
    }
    const saved = favoriteSizes[entry.dev.i];
    if (saved) return coerceFavoriteSize(entry, saved);
    return profile.default;
  }

  function favoriteEntrySpan(type) {
    // Kept for compatibility with existing call sites; returns the default
    // size for a type (used as the fallback span when no size is stored).
    return favoriteSizeProfile({ type, dev: {} }).default === "full" ? "full" : "cell";
  }

  function clearFavoriteSizeClasses(el) {
    for (const p of FAVORITE_SIZE_PRESETS) el.classList.remove("fav-size-" + p);
  }

  function applyFavoriteSizeClass(el, entry) {
    const size = resolveFavoriteSize(entry);
    clearFavoriteSizeClasses(el);
    el.classList.add("fav-size-" + size);
    el.dataset.favSize = size;
    return size;
  }

  function setFavoriteSizeClasses(el, size) {
    clearFavoriteSizeClasses(el);
    el.classList.add("fav-size-" + size);
    el.dataset.favSize = size;
  }

  function isFullFavoriteSize(size) {
    return size === "full" || size === "tall" || size === "large" || size === "viewport";
  }

  function makeFavoriteEntryElement(entry) {
    let tile = null;
    if (entry.type === "embed") tile = makeEmbedFavoriteCard(entry.card);
    else if (entry.type === "html") tile = postCall("makeHtmlFavoriteCard", entry.tile);
    else if (entry.type === "time") tile = makeTimeFavoriteCard(entry.card);
    else if (entry.type === "notifications") tile = makeNotificationsFavoriteCard(entry.card);
    else if (entry.type === "light") tile = makeTile(entry.dev, "favorites");
    else if (entry.type === "outlet") tile = makeOutletTile(entry.dev, "favorites");
    else if (entry.type === "thermostat") tile = makeQuickTstatCard(entry.dev, favTstatMap);
    else if (entry.type === "sensor") tile = makeFavoriteSensorCard(entry.dev);
    else if (entry.type === "music") tile = makeMusicRow(entry.dev, "favorites");
    else if (entry.type === "lock") tile = makeLockRow(entry.dev, "favorites");
    else if (entry.type === "garage") tile = makeGarageRow(entry.dev, "favorites");
    else if (entry.type === "shade") tile = makeShadeTile(entry.dev, "favorites");
    else if (entry.type === "fan") tile = makeFanTile(entry.dev, "favorites");
    if (!tile) return null;
    applyFavoriteSizeClass(tile, entry);
    return tile;
  }

  function appendFavoriteEntryTiles(grid, entries) {
    let compactStack = null;
    for (const entry of entries) {
      const tile = makeFavoriteEntryElement(entry);
      if (!tile) continue;
      tile.dataset.favKey = favoriteEntryKey(entry);
      if (!tile.dataset.name) {
        tile.dataset.name = String(
          entry.type === "time" ? (TIME_STYLE_LABELS[entry.card.style] || "Time")
            : entry.type === "notifications" ? "Notifications"
            : entry.type === "embed" ? (entry.card.title || "")
            : entry.type === "html" ? (entry.tile.title || entry.tile.attribute || "HTML")
            : (entry.dev?.n || "")
        ).toLowerCase();
      }
      const stackable = resolveFavoriteSize(entry) === "compact" && entry.type !== "embed" && entry.type !== "html" && entry.type !== "notifications";
      if (!stackable) {
        compactStack = null;
        grid.appendChild(tile);
        continue;
      }
      if (!compactStack) {
        compactStack = ce("div", "fav-compact-stack");
        grid.appendChild(compactStack);
      }
      compactStack.appendChild(tile);
      syncFavoriteCompactStack(compactStack);
      if (compactStack.children.length >= 2) compactStack = null;
    }
  }

  function syncFavoriteCompactStack(stack) {
    const children = Array.from(stack.children);
    stack.classList.toggle("fav-compact-stack-single", children.length === 1);
    stack.classList.toggle("fav-compact-stack-pair", children.length >= 2);
    stack.dataset.name = children
      .map((child) => child.dataset.name || "")
      .join(" ");
  }

  function flattenFavoriteReorderStacks(grid) {
    for (const stack of Array.from(grid.querySelectorAll(":scope > .fav-reorder-compact-stack"))) {
      while (stack.firstChild) grid.insertBefore(stack.firstChild, stack);
      stack.remove();
    }
  }

  function packFavoriteReorderStacks(grid) {
    flattenFavoriteReorderStacks(grid);
    let compactStack = null;
    for (const item of Array.from(grid.querySelectorAll(":scope > .fav-reorder-item"))) {
      if (item.dataset.favSize !== "compact") {
        compactStack = null;
        continue;
      }
      if (!compactStack) {
        compactStack = ce("div", "fav-compact-stack fav-reorder-compact-stack");
        grid.insertBefore(compactStack, item);
      }
      compactStack.appendChild(item);
      syncFavoriteCompactStack(compactStack);
      if (compactStack.children.length >= 2) compactStack = null;
    }
  }

  function currentFavoritesOrderFromDom() {
    const grid = currentBody()?.querySelector(".quick-fav-grid");
    if (!grid) return favoritesLayout.slice();
    return Array.from(grid.querySelectorAll(".fav-reorder-item"))
      .map((el) => el.dataset.favKey)
      .filter(Boolean);
  }

  function currentFavoritesDeviceOrderFromDom() {
    return currentFavoritesOrderFromDom()
      .filter((k) => k.startsWith("d:"))
      .map((k) => Number(k.slice(2)))
      .filter((id) => Number.isFinite(id));
  }

  function updateFavoritesDraftOrderFromDom() {
    favoritesReorderDraftOrder = currentFavoritesOrderFromDom();
  }

  function updateFavoritesMoveButtons() {
    if (!favoritesReorderActive) return;
    const grid = currentBody()?.querySelector(".quick-fav-grid");
    if (!grid) return;
    const items = Array.from(grid.querySelectorAll(".fav-reorder-item"));
    items.forEach((item, i) => {
      const rec = favoritesReorderEls.get(item.dataset.favKey);
      if (!rec?.moveEarlier || !rec?.moveLater) return;
      rec.moveEarlier.disabled = i === 0;
      rec.moveLater.disabled = i === items.length - 1;
    });
  }

  function moveFavorite(favKey, delta) {
    const grid = currentBody()?.querySelector(".quick-fav-grid");
    if (!grid) return;
    flattenFavoriteReorderStacks(grid);
    const items = Array.from(grid.querySelectorAll(":scope > .fav-reorder-item"));
    const idx = items.findIndex((el) => el.dataset.favKey === String(favKey));
    if (idx < 0) {
      packFavoriteReorderStacks(grid);
      return;
    }
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= items.length) {
      packFavoriteReorderStacks(grid);
      return;
    }
    const item = items[idx];
    const sibling = items[newIdx];
    if (delta < 0) grid.insertBefore(item, sibling);
    else grid.insertBefore(sibling, item);
    packFavoriteReorderStacks(grid);
    updateFavoritesDraftOrderFromDom();
    updateFavoritesMoveButtons();
    hapticTap();
  }

  function stopFavAutoScroll() {
    if (favAutoScrollRaf) {
      cancelAnimationFrame(favAutoScrollRaf);
      favAutoScrollRaf = null;
    }
  }

  function startFavAutoScroll(getClientY) {
    stopFavAutoScroll();
    const edge = 48;
    const step = 12;
    const tick = () => {
      const y = getClientY();
      if (typeof y === "number") {
        if (y < edge) window.scrollBy(0, -step);
        else if (y > window.innerHeight - edge) window.scrollBy(0, step);
      }
      favAutoScrollRaf = requestAnimationFrame(tick);
    };
    favAutoScrollRaf = requestAnimationFrame(tick);
  }

  function cleanupFavDragState() {
    stopFavAutoScroll();
    if (typeof favDragCleanup === "function") {
      favDragCleanup();
      favDragCleanup = null;
    }
    const grid = currentBody()?.querySelector(".quick-fav-grid");
    if (!grid) return;
    for (const item of grid.querySelectorAll(".fav-reorder-item.fav-dragging")) {
      item.classList.remove("fav-dragging");
      item.style.width = "";
      item.style.left = "";
      item.style.top = "";
    }
    grid.querySelectorAll(".fav-drag-placeholder").forEach((el) => el.remove());
  }

  function attachFavoriteReorder(wrapper, handle) {
    let active = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let floatOffsetX = 0;
    let floatOffsetY = 0;
    let placeholder = null;
    let lastClientY = 0;
    let lastOccupied = null;
    const grid = () => currentBody()?.querySelector(".quick-fav-grid");

    // tiles = other items in DOM order; phIdx = placeholder index among tiles+placeholder.
    // Pointer over a tile occupies that cell; pointer past the last tile appends.
    function favoriteReorderPlaceholderIndex(tiles, phIdx, x, y) {
      const n = tiles.length;
      if (!n) return 0;
      if (phIdx < 0) phIdx = n;
      for (let i = 0; i < n; i++) {
        const r = tiles[i];
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return i < phIdx ? i : i + 1;
        }
      }
      const last = tiles[n - 1];
      if (y > last.bottom || (y >= last.top && x > last.right)) return n;
      return phIdx;
    }

    function visibleItems() {
      const el = grid();
      if (!el) return [];
      return Array.from(el.querySelectorAll(":scope > .fav-reorder-item:not(.fav-dragging):not(.search-hidden)"));
    }

    function reorderInsertRef(el, node) {
      if (!node) return null;
      if (node.parentNode === el) return node;
      const stack = node.closest(".fav-reorder-compact-stack");
      return stack?.parentNode === el ? stack : null;
    }

    function movePlaceholderForPoint(x, y) {
      if (!placeholder) return;
      const el = grid();
      if (!el) return;
      const items = visibleItems();
      let hit = null;
      const rects = items.map((item) => {
        const r = item.getBoundingClientRect();
        if (!hit && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = item;
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      });
      if (hit && hit === lastOccupied) return;
      const ordered = Array.from(el.children).filter((c) => c === placeholder || items.includes(c));
      const phIdx = ordered.indexOf(placeholder);
      const nextIdx = favoriteReorderPlaceholderIndex(rects, phIdx, x, y);
      if (phIdx >= 0 && nextIdx === phIdx) return;
      const target = reorderInsertRef(el, items[nextIdx] || null);
      if (target) el.insertBefore(placeholder, target);
      else el.appendChild(placeholder);
      lastOccupied = hit || null;
    }

    function positionFloat(clientX, clientY) {
      wrapper.style.left = (clientX - floatOffsetX) + "px";
      wrapper.style.top = (clientY - floatOffsetY) + "px";
    }

    function beginDrag(e) {
      const el = grid();
      if (!el) return;
      dragging = true;
      reorderBusy = true;
      lastOccupied = null;
      const rect = wrapper.getBoundingClientRect();
      floatOffsetX = e.clientX - rect.left;
      floatOffsetY = e.clientY - rect.top;
      const size = wrapper.dataset.favSize || "standard";
      const full = isFullFavoriteSize(size);
      wrapper.classList.add("fav-dragging");
      wrapper.style.width = rect.width + "px";
      wrapper.style.left = rect.left + "px";
      wrapper.style.top = rect.top + "px";
      positionFloat(e.clientX, e.clientY);
      flattenFavoriteReorderStacks(el);
      placeholder = ce("div", "fav-drag-placeholder fav-size-" + size);
      if (full) placeholder.classList.add("fav-drag-placeholder-full", "fav-reorder-full");
      placeholder.dataset.favSpan = full ? "full" : "cell";
      placeholder.dataset.favSize = size;
      placeholder.style.height = rect.height + "px";
      wrapper.parentNode.insertBefore(placeholder, wrapper);
      movePlaceholderForPoint(e.clientX, e.clientY);
      wrapper.setAttribute("aria-grabbed", "true");
      startFavAutoScroll(() => lastClientY);
    }

    function commitDrag() {
      const el = grid();
      if (placeholder?.parentNode && el) {
        placeholder.parentNode.insertBefore(wrapper, placeholder);
        placeholder.remove();
      }
      wrapper.classList.remove("fav-dragging");
      wrapper.style.width = "";
      wrapper.style.left = "";
      wrapper.style.top = "";
      wrapper.removeAttribute("aria-grabbed");
      placeholder = null;
      lastOccupied = null;
      stopFavAutoScroll();
      if (el) packFavoriteReorderStacks(el);
      updateFavoritesDraftOrderFromDom();
      updateFavoritesMoveButtons();
    }

    function onResize() {
      if (!grid() && typeof favDragCleanup === "function") favDragCleanup();
    }

    function onMove(e) {
      if (!active) return;
      lastClientY = e.clientY;
      if (!dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!dragThresholdExceeded(dx, dy, REORDER_DRAG_THRESHOLD)) return;
        beginDrag(e);
        if (!dragging) return;
      }
      positionFloat(e.clientX, e.clientY);
      movePlaceholderForPoint(e.clientX, e.clientY);
    }

    function onUp() {
      if (!active) return;
      if (dragging) commitDrag();
      active = false;
      dragging = false;
      reorderBusy = false;
      window.removeEventListener("resize", onResize);
      stopFavAutoScroll();
      favDragCleanup = null;
    }

    bindReorderPointer(handle, () => favoritesReorderActive, (e, stop) => {
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      lastClientY = e.clientY;
      window.addEventListener("resize", onResize);
      favDragCleanup = stop;
    }, onMove, onUp);
  }

  function wrapFavoriteForReorder(grid, entry) {
    const tile = makeFavoriteEntryElement(entry);
    if (!tile) return;
    const favKey = favoriteEntryKey(entry);
    const profile = favoriteSizeProfile(entry);
    const size = resolveFavoriteSize(entry);
    const wrap = ce("div", "fav-reorder-item fav-size-" + size);
    wrap.dataset.favKey = favKey;
    wrap.dataset.favSpan = isFullFavoriteSize(size) ? "full" : "cell";
    wrap.dataset.favSize = size;
    wrap.dataset.name = String(
      entry.type === "embed" ? (entry.card.title || "")
        : entry.type === "html" ? (entry.tile.title || entry.tile.attribute || "HTML")
        : entry.type === "time" ? (TIME_STYLE_LABELS[entry.card.style] || "Time")
        : entry.type === "notifications" ? "Notifications"
        : (entry.dev?.n || "")
    ).toLowerCase();
    wrap.classList.toggle("fav-reorder-full", isFullFavoriteSize(size));
    tile.classList.add("fav-reorder-content");
    wrap.appendChild(tile);

    const overlay = ce("div", "fav-reorder-overlay");
    const dragHandle = ce("button", "fav-drag-handle");
    dragHandle.type = "button";
    dragHandle.setAttribute("aria-label", "Drag to reorder");
    dragHandle.innerHTML = DRAG_HANDLE_SVG;

    const sizeBtn = ce("button", "fav-size-btn");
    sizeBtn.type = "button";
    sizeBtn.setAttribute("aria-haspopup", "dialog");
    const sizeLabel = ce("span", "fav-size-btn-current");
    const sizeHint = ce("span", "fav-size-btn-label");
    sizeHint.textContent = "Size";
    sizeBtn.appendChild(sizeLabel);
    sizeBtn.appendChild(sizeHint);
    function syncSizeBtn() {
      const cur = wrap.dataset.favSize;
      sizeLabel.textContent = favoriteSizeShortLabel(cur);
      sizeBtn.setAttribute("aria-label", "Tile size " + favoriteSizeLongLabel(cur) + ". Choose size.");
      sizeBtn.disabled = profile.allowed.length <= 1;
    }
    sizeBtn.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
    });
    sizeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (reorderBusy || sizeBtn.disabled) return;
      hapticTap();
      openFavoriteSizeChooser({ favKey, wrap, tile, entry, profile, sizeBtn });
    });
    syncSizeBtn();

    const moveBtns = ce("div", "fav-move-btns");
    const moveEarlier = ce("button", "fav-move-btn");
    moveEarlier.type = "button";
    moveEarlier.setAttribute("aria-label", "Move favorite earlier");
    moveEarlier.innerHTML = MOVE_UP_SVG;
    moveEarlier.addEventListener("click", (e) => {
      e.stopPropagation();
      moveFavorite(favKey, -1);
      moveEarlier.focus();
    });
    const moveLater = ce("button", "fav-move-btn");
    moveLater.type = "button";
    moveLater.setAttribute("aria-label", "Move favorite later");
    moveLater.innerHTML = MOVE_DOWN_SVG;
    moveLater.addEventListener("click", (e) => {
      e.stopPropagation();
      moveFavorite(favKey, 1);
      moveLater.focus();
    });
    moveBtns.appendChild(moveEarlier);
    moveBtns.appendChild(moveLater);
    overlay.appendChild(dragHandle);
    overlay.appendChild(sizeBtn);
    overlay.appendChild(moveBtns);
    wrap.appendChild(overlay);
    attachFavoriteReorder(wrap, dragHandle);
    favoritesReorderEls.set(favKey, { moveEarlier, moveLater, sizeBtn, syncSizeBtn });
    grid.appendChild(wrap);
  }

  function appendFavoriteReorderItems(grid, entries) {
    for (const entry of entries) wrapFavoriteForReorder(grid, entry);
    packFavoriteReorderStacks(grid);
  }

  function applyFavoriteSizeChoice(wrap, tile, entry, next) {
    const profile = favoriteSizeProfile(entry);
    const size = coerceFavoriteSize(entry, next);
    if (!profile.allowed.includes(size)) return null;
    setFavoriteSizeClasses(wrap, size);
    wrap.dataset.favSpan = isFullFavoriteSize(size) ? "full" : "cell";
    wrap.classList.toggle("fav-reorder-full", isFullFavoriteSize(size));
    setFavoriteSizeClasses(tile, size);
    if (entry.type === "lock") {
      const rec = favLockMap.get(entry.dev.i);
      if (rec?.meta) rec.meta.textContent = lockFavoriteMetaText(entry.dev, tile);
    }
    if (entry.type === "embed") {
      entry.card.size = size;
      const idx = embedCards.findIndex((c) => c.id === entry.card.id);
      if (idx >= 0) embedCards[idx] = { ...embedCards[idx], size };
    } else if (entry.type === "html") {
      entry.tile.size = size;
      const idx = htmlTiles.findIndex((tile) => tile.id === entry.tile.id);
      if (idx >= 0) htmlTiles[idx] = { ...htmlTiles[idx], size };
    } else if (entry.type === "time") {
      entry.card.size = size;
      const idx = timeCards.findIndex((c) => c.id === entry.card.id);
      if (idx >= 0) timeCards[idx] = { ...timeCards[idx], size };
    } else if (entry.type === "notifications") {
      entry.card.size = size;
      const idx = notificationCards.findIndex((c) => c.id === entry.card.id);
      if (idx >= 0) notificationCards[idx] = { ...notificationCards[idx], size };
    } else {
      const favId = Number(entry.dev.i);
      if (size === profile.default) delete favoriteSizes[favId];
      else favoriteSizes[favId] = size;
    }
    const grid = currentBody()?.querySelector(".quick-fav-grid");
    if (grid) packFavoriteReorderStacks(grid);
    updateFavoritesDraftOrderFromDom();
    return size;
  }

  function applyFavoriteHtmlZoom(wrap, tile, entry, nextZoom) {
    if (entry?.type !== "html") return null;
    const zoom = normalizeHtmlZoom(nextZoom);
    entry.tile.zoom = zoom;
    const idx = htmlTiles.findIndex((candidate) => candidate.id === entry.tile.id);
    if (idx >= 0) htmlTiles[idx] = { ...htmlTiles[idx], zoom };
    const htmlCard = tile?.classList?.contains("fav-html-card")
      ? tile
      : (wrap?.querySelector?.(".fav-html-card") || tile);
    postCall("applyHtmlTileZoomToCard", htmlCard, zoom);
    if (htmlCard?.dataset.htmlLoaded === "1") {
      const iframe = htmlCard.querySelector(".fav-html-iframe");
      const tileObj = htmlTiles.find((candidate) => candidate.id === entry.tile.id);
      if (iframe && tileObj) {
        postCall("configureHtmlTileIframe", iframe, tileObj, htmlCard.querySelector(".fav-html-unavailable"));
      }
    } else {
      postCall("ensureHtmlTileLoaded", htmlCard);
    }
    return zoom;
  }

  function closeFavoriteSizeChooser() {
    if (!favSizeChooserEl) return;
    const returnFocus = favSizeChooserReturnFocus;
    favSizeChooserEl.remove();
    favSizeChooserEl = null;
    favSizeChooserReturnFocus = null;
    if (returnFocus && typeof returnFocus.focus === "function") {
      try { returnFocus.focus(); } catch {}
    }
  }

  function openFavoriteSizeChooser({ favKey, wrap, tile, entry, profile, sizeBtn }) {
    closeFavoriteSizeChooser();
    if (!profile?.allowed?.length) return;
    favSizeChooserReturnFocus = sizeBtn || null;
    const name = entry.type === "embed"
      ? (entry.card?.title || "Embed")
      : entry.type === "html"
        ? (entry.tile?.title || entry.tile?.attribute || "HTML")
      : entry.type === "time"
        ? (TIME_STYLE_LABELS[entry.card?.style] || "Time")
      : entry.type === "notifications"
        ? "Notifications"
      : (entry.dev?.n || "Favorite");
    const overlay = ce("div", "fav-size-sheet open");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Choose size for " + name);
    const panel = ce("div", "fav-size-sheet-panel");
    const head = ce("div", "fav-size-sheet-head");
    const title = ce("div", "fav-size-sheet-title");
    title.textContent = "Size · " + name;
    const closeBtn = ce("button", "fav-size-sheet-close");
    closeBtn.type = "button";
    closeBtn.textContent = "Done";
    head.appendChild(title);
    head.appendChild(closeBtn);
    panel.appendChild(head);

    const list = ce("div", "fav-size-sheet-options");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Available sizes");
    const optionBtns = [];
    for (const size of profile.allowed) {
      const btn = ce("button", "fav-size-option");
      btn.type = "button";
      btn.setAttribute("role", "option");
      btn.dataset.size = size;
      const preview = ce("span", "fav-size-option-preview fav-size-option-preview--" + size);
      preview.setAttribute("aria-hidden", "true");
      const label = ce("span", "fav-size-option-label");
      label.textContent = favoriteSizeLongLabel(size);
      btn.appendChild(preview);
      btn.appendChild(label);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (reorderBusy) return;
        const applied = applyFavoriteSizeChoice(wrap, tile, entry, size);
        if (!applied) return;
        const rec = favoritesReorderEls.get(favKey);
        rec?.syncSizeBtn?.();
        hapticTap();
        flash("Size: " + favoriteSizeLongLabel(applied));
        closeFavoriteSizeChooser();
      });
      list.appendChild(btn);
      optionBtns.push(btn);
    }

    function syncSelected() {
      const cur = wrap.dataset.favSize;
      for (const btn of optionBtns) {
        const selected = btn.dataset.size === cur;
        btn.classList.toggle("is-selected", selected);
        btn.setAttribute("aria-selected", selected ? "true" : "false");
      }
    }
    syncSelected();
    panel.appendChild(list);

    let zoomOptionBtns = [];
    if (entry.type === "html") {
      const zoomSection = ce("div", "fav-size-sheet-zoom");
      const zoomLabel = ce("div", "fav-size-sheet-zoom-label");
      zoomLabel.textContent = "Zoom";
      zoomSection.appendChild(zoomLabel);
      const zoomRow = ce("div", "fav-size-sheet-zoom-options");
      zoomRow.setAttribute("role", "listbox");
      zoomRow.setAttribute("aria-label", "Content zoom");
      for (const zoom of HTML_ZOOM_PRESETS) {
        const btn = ce("button", "fav-size-zoom-option");
        btn.type = "button";
        btn.setAttribute("role", "option");
        btn.dataset.zoom = String(zoom);
        btn.textContent = zoom + "%";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (reorderBusy) return;
          const applied = applyFavoriteHtmlZoom(wrap, tile, entry, zoom);
          if (applied == null) return;
          syncZoomSelected();
          hapticTap();
        });
        zoomRow.appendChild(btn);
        zoomOptionBtns.push(btn);
      }
      function syncZoomSelected() {
        const cur = String(normalizeHtmlZoom(entry.tile?.zoom));
        for (const btn of zoomOptionBtns) {
          const selected = btn.dataset.zoom === cur;
          btn.classList.toggle("is-selected", selected);
          btn.setAttribute("aria-selected", selected ? "true" : "false");
        }
      }
      syncZoomSelected();
      zoomSection.appendChild(zoomRow);
      panel.appendChild(zoomSection);
    }

    overlay.appendChild(panel);

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeFavoriteSizeChooser();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      e.preventDefault();
      const idx = optionBtns.indexOf(document.activeElement);
      let next = idx;
      if (e.key === "ArrowDown") next = idx < 0 ? 0 : Math.min(optionBtns.length - 1, idx + 1);
      else if (e.key === "ArrowUp") next = idx < 0 ? optionBtns.length - 1 : Math.max(0, idx - 1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = optionBtns.length - 1;
      optionBtns[next]?.focus();
    };
    overlay.addEventListener("keydown", onKey);
    closeBtn.addEventListener("click", () => {
      hapticTap();
      closeFavoriteSizeChooser();
    });
    bindPopupDismiss(overlay, panel, null, () => closeFavoriteSizeChooser());
    favSizeChooserEl = overlay;
    appendPopup(overlay);
    const selected = optionBtns.find((b) => b.classList.contains("is-selected")) || optionBtns[0];
    requestAnimationFrame(() => selected?.focus());
  }

  function enterFavoritesReorderMode() {
    if (!tabMode || activeTab !== "favorites") return;
    const entries = getFavoriteEntries();
    if (entries.length < 1) {
      flash("Add a favorite or tile first");
      return;
    }
    favoritesReorderSnapshot = favorites.slice();
    favoritesReorderSnapshotSizes = { ...favoriteSizes };
    favoritesReorderSnapshotLayout = favoritesLayout.slice();
    favoritesReorderSnapshotEmbeds = embedCards.map((c) => ({ ...c }));
    favoritesReorderSnapshotTimes = timeCards.map((c) => ({ ...c }));
    favoritesReorderSnapshotNotifs = notificationCards.map((c) => ({ ...c }));
    favoritesReorderSnapshotHtml = htmlTiles.map((tile) => ({ ...tile }));
    favoritesReorderSnapshotHtmlTitles = { ...htmlTileTitleOverrides };
    favoritesReorderDraftOrder = null;
    favoritesReorderEls.clear();
    stopPolling();
    reorderMode = true;
    favoritesReorderActive = true;
    APP_EL?.classList.add("reorder-mode", "favorites-reorder-mode");
    postCall("closeTopbarOverflowMenu");
    closeFavoriteTstatModeMenu();
    closeEmbedExpand();
    closeFavoriteSizeChooser();
    if (SEARCH_EL) {
      SEARCH_EL.value = "";
      applySearch();
    }
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.hidden = false;
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = false;
    renderFavoritesPopup();
    updateFavoritesMoveButtons();
    flash("Drag to reorder · tap Size to choose size");
  }

  function exitFavoritesReorderMode(resumePoll) {
    cleanupFavDragState();
    closeFavoriteSizeChooser();
    favoritesReorderActive = false;
    favoritesReorderDraftOrder = null;
    favoritesReorderSnapshot = null;
    favoritesReorderSnapshotSizes = null;
    favoritesReorderSnapshotLayout = null;
    favoritesReorderSnapshotEmbeds = null;
    favoritesReorderSnapshotTimes = null;
    favoritesReorderSnapshotNotifs = null;
    favoritesReorderSnapshotHtml = null;
    favoritesReorderSnapshotHtmlTitles = null;
    favoritesReorderEls.clear();
    favoritesReorderSaving = false;
    reorderMode = false;
    reorderBusy = false;
    APP_EL?.classList.remove("reorder-mode", "favorites-reorder-mode");
    if (REORDER_DONE_BTN) {
      REORDER_DONE_BTN.hidden = true;
      REORDER_DONE_BTN.disabled = false;
    }
    if (REORDER_CANCEL_BTN) REORDER_CANCEL_BTN.hidden = true;
    renderFavoritesPopup();
    if (resumePoll) {
      startPolling();
      refresh();
    }
  }

  async function saveFavoritesLayoutApi(layout, deviceSizes, embedSizes, htmlSizes, htmlZooms, htmlTitles, timeSizes, notificationSizes) {
    try {
      const r = await fetch(withToken("settings/favorites-layout"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          layout,
          favoriteSizes: deviceSizes,
          embedSizes,
          htmlSizes,
          htmlZooms,
          htmlTitles,
          timeSizes,
          notificationSizes,
        }),
      });
      if (!r.ok) {
        let msg = "Could not save favorites layout";
        try {
          const body = await r.json();
          if (body?.error) msg = String(body.error);
        } catch {}
        flash(msg, true);
        return false;
      }
      const body = await r.json();
      if (Array.isArray(body?.favorites)) replaceList(favorites, body.favorites.map(Number));
      if (body?.sizes && typeof body.sizes === "object") {
        favoriteSizes = {};
        for (const k of Object.keys(body.sizes)) favoriteSizes[Number(k)] = String(body.sizes[k]);
        saveFavoriteSizesCache(favoriteSizes);
      }
      applyHtmlCatalogFromData({ htmlTiles: htmlTiles.map((tile) => ({ ...tile })), config: body });
      if (Object.prototype.hasOwnProperty.call(body || {}, "htmlTitles") && body.htmlTitles && typeof body.htmlTitles === "object") {
        const liveTitlesById = Object.fromEntries(
          htmlTiles.map((tile) => [tile.id, tile.liveTitle || tile.attribute || tile.title])
        );
        applyHtmlTitleOverridesFromConfig(body.htmlTitles, liveTitlesById);
        for (const tile of htmlTiles) {
          const override = htmlTileTitleOverrides[tile.id];
          if (override) tile.title = override;
        }
      }
      applyEmbedConfigFromData({ config: body }, { allowDuringReorder: true });
      syncEmbedStateToMld();
      return true;
    } catch {
      flash("Could not save favorites layout", true);
      return false;
    }
  }

  function favoriteLayoutSizePayloads(layout = favoritesLayout) {
    const deviceOrder = layout.filter((key) => key.startsWith("d:")).map((key) => Number(key.slice(2)));
    const embedSizes = {};
    const htmlSizes = {};
    const htmlZooms = {};
    const timeSizes = {};
    const notificationSizes = {};
    for (const card of embedCards) embedSizes[card.id] = card.size || "tall";
    for (const tile of htmlTiles) {
      htmlSizes[tile.id] = tile.size || "tall";
      htmlZooms[tile.id] = normalizeHtmlZoom(tile.zoom);
    }
    for (const card of timeCards) timeSizes[card.id] = card.size || "square";
    for (const card of notificationCards) notificationSizes[card.id] = card.size || "tall";
    const htmlTitles = htmlTitleOverridesForLayout(layout);
    return {
      deviceSizes: normalizedFavoriteSizes(deviceOrder),
      embedSizes,
      htmlSizes,
      htmlZooms,
      htmlTitles,
      timeSizes,
      notificationSizes,
    };
  }

  async function persistFavoriteLayout(layout) {
    const sizes = favoriteLayoutSizePayloads(layout);
    return saveFavoritesLayoutApi(
      layout,
      sizes.deviceSizes,
      sizes.embedSizes,
      sizes.htmlSizes,
      sizes.htmlZooms,
      sizes.htmlTitles,
      sizes.timeSizes,
      sizes.notificationSizes
    );
  }

  async function finishFavoritesReorderMode() {
    if (favoritesReorderSaving) return false;
    cleanupFavDragState();
    const layout = currentFavoritesOrderFromDom();
    favoritesReorderSaving = true;
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.disabled = true;
    const saved = await persistFavoriteLayout(layout);
    favoritesReorderSaving = false;
    if (REORDER_DONE_BTN) REORDER_DONE_BTN.disabled = false;
    if (!saved) return false;
    lastDataSig = "";
    exitFavoritesReorderMode(true);
    flash("Order & sizes saved");
    return true;
  }

  function cancelFavoritesReorderMode() {
    if (favoritesReorderSnapshot) replaceList(favorites, favoritesReorderSnapshot);
    if (favoritesReorderSnapshotSizes) favoriteSizes = { ...favoritesReorderSnapshotSizes };
    else favoriteSizes = {};
    if (favoritesReorderSnapshotLayout) replaceList(favoritesLayout, favoritesReorderSnapshotLayout.slice());
    if (favoritesReorderSnapshotEmbeds) replaceList(embedCards, favoritesReorderSnapshotEmbeds.map((c) => ({ ...c })));
    if (favoritesReorderSnapshotTimes) replaceList(timeCards, favoritesReorderSnapshotTimes.map((c) => ({ ...c })));
    if (favoritesReorderSnapshotNotifs) replaceList(notificationCards, favoritesReorderSnapshotNotifs.map((c) => ({ ...c })));
    if (favoritesReorderSnapshotHtml) replaceList(htmlTiles, favoritesReorderSnapshotHtml.map((tile) => ({ ...tile })));
    if (favoritesReorderSnapshotHtmlTitles) replaceMap(htmlTileTitleOverrides, favoritesReorderSnapshotHtmlTitles);
    syncEmbedStateToMld();
    lastDataSig = "";
    exitFavoritesReorderMode(false);
  }

  function makeQuickTstatCard(t, map) {
    const tm = String(t.tm || "").toLowerCase();
    const card = ce("div", "quick-fav-card quick-fav-tstat mode-" + (tm || "off"));
    card.dataset.name = String(t.n || "").toLowerCase();
    card.dataset.tstatId = String(t.i);
    syncFavoriteTstatCompactState(card, t);

    const temps = favoriteTstatTemps(t);
    const stateInfo = favoriteTstatState(t);
    const { dial, temp: dialTemp } = makeFavoriteTstatCompactDial(temps.current);
    card.appendChild(dial);

    const nameBtn = ce("button", "quick-fav-tstat-name");
    nameBtn.type = "button";
    nameBtn.textContent = t.n || ("Thermostat " + t.i);
    nameBtn.setAttribute("aria-label", "Open full controls for " + (t.n || "thermostat"));
    nameBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFavoriteTstatPopup(t, null);
    });

    const info = ce("div", "quick-fav-tstat-info");
    info.appendChild(nameBtn);
    const stateEl = ce("div", "quick-fav-tstat-state" + (stateInfo.active ? " is-active" : ""));
    const dot = ce("span", "quick-fav-tstat-dot");
    const stateTxt = ce("span", "quick-fav-tstat-state-txt");
    paintTstatStateTxt(stateTxt, stateInfo);
    stateEl.appendChild(dot);
    stateEl.appendChild(stateTxt);
    info.appendChild(stateEl);

    const spEl = ce("div", "quick-fav-tstat-sp " + temps.tone);
    paintTstatSetpoint(spEl, temps);

    const compactMode = ce("div", "quick-fav-tstat-mode" + (tm === "off" ? " is-off" : ""));
    compactMode.textContent = tstatModeDisplayLabel(t.tm);

    const controls = ce("div", "quick-fav-tstat-controls");
    const minus = ce("button", "quick-fav-ctl quick-fav-step");
    minus.type = "button";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease setpoint");
    const modeBtn = ce("button", "quick-fav-ctl quick-fav-ctl-mode");
    modeBtn.type = "button";
    const modeLabel = ce("span", "quick-fav-ctl-mode-label");
    modeLabel.textContent = tstatModeDisplayLabel(t.tm);
    const modeCaret = ce("span", "quick-fav-ctl-mode-caret");
    modeCaret.setAttribute("aria-hidden", "true");
    modeCaret.textContent = "▾";
    modeBtn.appendChild(modeLabel);
    modeBtn.appendChild(modeCaret);
    scheduleFitTstatModeLabel(modeBtn);
    modeBtn.setAttribute("aria-label", "Change thermostat mode");
    modeBtn.setAttribute("aria-haspopup", "listbox");
    modeBtn.setAttribute("aria-expanded", "false");
    const plus = ce("button", "quick-fav-ctl quick-fav-step");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase setpoint");
    const canAdjust = !!favoriteTstatTarget(t);
    minus.disabled = !canAdjust;
    plus.disabled = !canAdjust;
    minus.addEventListener("click", (e) => {
      e.stopPropagation();
      adjustFavoriteTstat(t.i, -1);
    });
    plus.addEventListener("click", (e) => {
      e.stopPropagation();
      adjustFavoriteTstat(t.i, 1);
    });
    modeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      openFavoriteTstatModeMenu(modeBtn, t.i);
    });
    controls.appendChild(minus);
    controls.appendChild(modeBtn);
    controls.appendChild(plus);
    card.appendChild(info);
    card.appendChild(spEl);
    card.appendChild(compactMode);
    card.appendChild(controls);
    if (map === tstatsPopupMap) {
      const dragHandle = ce("button", "tstat-drag-handle");
      dragHandle.type = "button";
      dragHandle.setAttribute("aria-label", "Drag to reorder");
      dragHandle.innerHTML = DRAG_HANDLE_SVG;
      const moveBtns = ce("div", "tstat-move-btns");
      const moveUp = ce("button", "tstat-move-btn");
      moveUp.type = "button";
      moveUp.setAttribute("aria-label", "Move thermostat up");
      moveUp.innerHTML = MOVE_UP_SVG;
      moveUp.addEventListener("click", (e) => { e.stopPropagation(); moveTstat(t.i, -1); });
      const moveDown = ce("button", "tstat-move-btn");
      moveDown.type = "button";
      moveDown.setAttribute("aria-label", "Move thermostat down");
      moveDown.innerHTML = MOVE_DOWN_SVG;
      moveDown.addEventListener("click", (e) => { e.stopPropagation(); moveTstat(t.i, 1); });
      moveBtns.appendChild(moveUp);
      moveBtns.appendChild(moveDown);
      card.insertBefore(dragHandle, card.firstChild);
      card.insertBefore(moveBtns, dragHandle.nextSibling);
      attachTstatReorder(card, dragHandle);
      registerTstatReorderControls(t.i, moveUp, moveDown);
    }
    attachTstatTap(card, t);

    map.set(t.i, {
      el: card, card, spEl, stateEl, stateTxt, modeLabel, modeBtn, minus, plus,
      dialTemp, compactMode,
    });
    return card;
  }

  function updateQuickTstatCard(t, map) {
    const rec = map.get(t.i);
    if (!rec) return;
    const tm = String(t.tm || "").toLowerCase();
    const nextMode = "mode-" + (tm || "off");
    for (const cls of rec.card.classList) {
      if (cls.startsWith("mode-")) rec.card.classList.remove(cls);
    }
    rec.card.classList.add(nextMode);
    syncFavoriteTstatCompactState(rec.card, t);
    const temps = favoriteTstatTemps(t);
    const stateInfo = favoriteTstatState(t);
    paintTstatSetpoint(rec.spEl, temps);
    rec.stateEl.className = "quick-fav-tstat-state" + (stateInfo.active ? " is-active" : "");
    paintTstatStateTxt(rec.stateTxt, stateInfo);
    rec.modeLabel.textContent = tstatModeDisplayLabel(t.tm);
    fitTstatModeLabel(rec.modeBtn);
    if (rec.dialTemp) rec.dialTemp.textContent = temps.current;
    if (rec.compactMode) {
      rec.compactMode.textContent = tstatModeDisplayLabel(t.tm);
      rec.compactMode.classList.toggle("is-off", tm === "off");
    }
    const canAdjust = !!favoriteTstatTarget(t);
    rec.minus.disabled = !canAdjust;
    rec.plus.disabled = !canAdjust;
    if (favTstatModeMenu && favTstatModeMenuId === t.i) syncFavoriteTstatModeMenu(t);
  }

  function disconnectFavEmbedObserver() {
    if (favEmbedObserver) {
      favEmbedObserver.disconnect();
      favEmbedObserver = null;
    }
  }

  function ensureFavoritesPersistPanel() {
    if (favoritesPersistEl) return favoritesPersistEl;
    favoritesPersistEl = ce("div", "favorites-persist tab-view quick-body quick-body-favorites tab-body");
    favoritesPersistEl.id = "favorites-persist";
    favoritesPersistEl.hidden = true;
    favoritesPersistEl.setAttribute("aria-label", "Favorites");
    const anchor = tabViewEl || ROOMS_EL;
    if (anchor?.parentNode) {
      anchor.parentNode.insertBefore(favoritesPersistEl, anchor.nextSibling);
    } else {
      (APP_EL || document.body).appendChild(favoritesPersistEl);
    }
    return favoritesPersistEl;
  }

  function setFavoritesPersistVisible(on) {
    const el = ensureFavoritesPersistPanel();
    el.hidden = !on;
    if (on) startFavoriteTimeTicker();
    else stopFavoriteTimeTicker();
  }

  function isFavoritesPersistActive() {
    return (tabMode && activeTab === "favorites") || quickPopupOpenType === "favorites";
  }

  function discardEmbedIframe(id) {
    if (!id) return;
    const roots = [favoritesPersistEl, document.getElementById("favorites-persist")].filter(Boolean);
    for (const root of roots) {
      for (const card of root.querySelectorAll(".fav-embed-card")) {
        if (card.dataset.embedId !== String(id)) continue;
        const iframe = card.querySelector(".fav-embed-iframe");
        if (iframe) {
          try { iframe.src = "about:blank"; } catch {}
        }
      }
    }
  }

  function stopFavEmbedStreams() {
    disconnectFavEmbedObserver();
    const roots = [favoritesPersistEl, currentBody()].filter(Boolean);
    for (const root of roots) {
      for (const iframe of root.querySelectorAll(".fav-embed-iframe")) {
        try { iframe.src = "about:blank"; } catch {}
      }
    }
  }

  function closeEmbedExpand() {
    if (!embedExpandState) return;
    const { cardEl, placeholder, restoreFocus } = embedExpandState;
    embedExpandState = null;
    document.body.classList.remove("fav-embed-expanded-open");
    cardEl.classList.remove("fav-embed-expanded");
    const closeBtn = cardEl.querySelector(".fav-embed-close-expand");
    if (closeBtn) closeBtn.hidden = true;
    if (placeholder?.parentNode) {
      placeholder.parentNode.insertBefore(cardEl, placeholder);
      placeholder.remove();
    }
    try { restoreFocus?.focus?.(); } catch {}
  }

  function expandEmbedCard(cardEl, triggerBtn) {
    if (!cardEl || embedExpandState) return;
    const placeholder = ce("div", "fav-embed-expand-placeholder");
    placeholder.style.height = cardEl.offsetHeight + "px";
    placeholder.className = "fav-embed-expand-placeholder " + Array.from(cardEl.classList).filter((c) => c.startsWith("fav-size-")).join(" ");
    cardEl.parentNode.insertBefore(placeholder, cardEl);
    document.body.appendChild(cardEl);
    cardEl.classList.add("fav-embed-expanded");
    document.body.classList.add("fav-embed-expanded-open");
    let closeBtn = cardEl.querySelector(".fav-embed-close-expand");
    if (!closeBtn) {
      closeBtn = ce("button", "fav-embed-close-expand");
      closeBtn.type = "button";
      closeBtn.textContent = "Close";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeEmbedExpand();
      });
      cardEl.appendChild(closeBtn);
    }
    closeBtn.hidden = false;
    embedExpandState = { cardEl, placeholder, restoreFocus: triggerBtn || document.activeElement };
    closeBtn.focus();
  }

  function observeFavEmbedCard(card) {
    if (!("IntersectionObserver" in window)) {
      const iframe = card.querySelector(".fav-embed-iframe");
      const url = card.dataset.embedUrl;
      if (iframe && url && card.dataset.blocked !== "1") iframe.src = url;
      return;
    }
    if (!favEmbedObserver) {
      favEmbedObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const tile = entry.target;
          const iframe = tile.querySelector(".fav-embed-iframe");
          const url = tile.dataset.embedUrl;
          if (!iframe || !url || tile.dataset.blocked === "1") continue;
          if (entry.isIntersecting) {
            if (!iframe.src || iframe.src === "about:blank" || iframe.src.endsWith("about:blank")) iframe.src = url;
          }
        }
      }, { root: null, rootMargin: "80px", threshold: 0.05 });
    }
    favEmbedObserver.observe(card);
  }

  function formatTimeCardParts(style, now = new Date()) {
    const withSeconds = style === "time_seconds";
    const parts = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      ...(withSeconds ? { second: "2-digit" } : {}),
    }).formatToParts(now);
    const nums = [];
    let dayPeriod = "";
    for (const p of parts) {
      if (p.type === "hour" || p.type === "minute" || p.type === "second") nums.push(p.value);
      else if (p.type === "dayPeriod") dayPeriod = p.value;
    }
    const time = nums.join(":");
    const date = style === "time_date"
      ? now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
      : "";
    return { time, ampm: dayPeriod, date, showDate: style === "time_date" };
  }

  function paintTimeCardElements(root, style, now = new Date()) {
    if (!root) return;
    const parts = formatTimeCardParts(style, now);
    root.dataset.style = style;
    const clock = root.querySelector(".fav-time-clock");
    const dateEl = root.querySelector(".fav-time-date");
    if (clock) {
      clock.textContent = "";
      clock.appendChild(document.createTextNode(parts.time));
      if (parts.ampm) {
        const ampm = ce("span", "fav-time-ampm");
        ampm.textContent = parts.ampm;
        clock.appendChild(ampm);
      }
    }
    if (dateEl) {
      dateEl.hidden = !parts.showDate;
      dateEl.textContent = parts.date;
    }
  }

  function tickFavoriteTimeCards() {
    if (!isFavoritesPersistActive() || favoritesReorderActive) return;
    const now = new Date();
    const root = tabMode ? favoritesPersistEl : currentBody();
    if (!root) return;
    for (const card of root.querySelectorAll(".fav-time-card")) {
      paintTimeCardElements(card, card.dataset.style || "time", now);
    }
  }

  function stopFavoriteTimeTicker() {
    if (timeTickTimer) {
      clearInterval(timeTickTimer);
      timeTickTimer = null;
    }
  }

  function startFavoriteTimeTicker() {
    stopFavoriteTimeTicker();
    if (!timeCards.length) return;
    tickFavoriteTimeCards();
    timeTickTimer = setInterval(tickFavoriteTimeCards, 1000);
  }

  const FAV_TILE_MENU_SELECTOR = ".fav-time-menu, .fav-embed-menu, .fav-notif-menu, .fav-html-menu";

  function favTileMenuButtonFor(menu) {
    const actions = menu?.parentElement;
    if (!actions) return null;
    return actions.querySelector(".fav-time-menu-btn, .fav-embed-menu-btn, .fav-notif-menu-btn, .fav-html-menu-btn");
  }

  function closeFavTileOverflowMenu(menu, menuBtn) {
    if (!menu) return;
    menu.hidden = true;
    if (menuBtn) menuBtn.setAttribute("aria-expanded", "false");
    if (menu._outsideCleanup) {
      menu._outsideCleanup();
      menu._outsideCleanup = null;
    }
  }

  function closeAllOpenFavTileOverflowMenus() {
    for (const menu of document.querySelectorAll(FAV_TILE_MENU_SELECTOR)) {
      if (menu.hidden) continue;
      closeFavTileOverflowMenu(menu, favTileMenuButtonFor(menu));
    }
  }

  function toggleFavTileOverflowMenu(menuBtn, menu) {
    if (!menu.hidden) {
      closeFavTileOverflowMenu(menu, menuBtn);
      return;
    }
    closeAllOpenFavTileOverflowMenus();
    menu.hidden = false;
    menuBtn.setAttribute("aria-expanded", "true");
    const onOutside = (e) => {
      if (menu.contains(e.target) || menuBtn.contains(e.target)) return;
      closeFavTileOverflowMenu(menu, menuBtn);
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeFavTileOverflowMenu(menu, menuBtn);
    };
    setTimeout(() => {
      document.addEventListener("click", onOutside);
      document.addEventListener("keydown", onKey);
    }, 0);
    menu._outsideCleanup = () => {
      document.removeEventListener("click", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }

  function makeTimeFavoriteCard(card) {
    const style = normalizeTimeStyle(card.style);
    const el = ce("article", "fav-time-card");
    el.dataset.timeId = card.id;
    el.dataset.style = style;
    el.setAttribute("aria-label", TIME_STYLE_LABELS[style] || "Time");

    const actions = ce("div", "fav-time-actions");
    const menuBtn = ce("button", "fav-time-menu-btn");
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", "Time tile options");
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.textContent = "\u22ef";
    const menu = ce("div", "fav-time-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    const editBtn = ce("button", "fav-time-menu-item");
    editBtn.type = "button";
    editBtn.setAttribute("role", "menuitem");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      openTimeTileEditor(card);
    });
    const delBtn = ce("button", "fav-time-menu-item danger");
    delBtn.type = "button";
    delBtn.setAttribute("role", "menuitem");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      const ok = await confirmAction({ message: "Delete this time tile?", confirmLabel: "Delete", danger: true });
      if (ok) await deleteTimeCard(card.id);
    });
    menu.appendChild(editBtn);
    menu.appendChild(delBtn);
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavTileOverflowMenu(menuBtn, menu);
    });
    actions.appendChild(menuBtn);
    actions.appendChild(menu);
    el.appendChild(actions);

    const body = ce("div", "fav-time-body");
    const clock = ce("div", "fav-time-clock");
    const dateEl = ce("div", "fav-time-date");
    body.appendChild(clock);
    body.appendChild(dateEl);
    el.appendChild(body);
    paintTimeCardElements(el, style);
    return el;
  }

  async function timeCardsApi(payload) {
    try {
      const r = await fetch(withToken("time-cards"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(String(body?.error || "Could not save time tile"), true);
        return null;
      }
      applyEmbedConfigFromData({ config: body }, { allowDuringReorder: true });
      return body;
    } catch {
      flash("Could not save time tile", true);
      return null;
    }
  }

  async function deleteTimeCard(id) {
    const body = await timeCardsApi({ action: "delete", id });
    if (!body) return false;
    if (currentCategory() === "favorites") renderFavoritesPopup();
    updateQuickNavVisibility();
    flash("Time tile deleted");
    return true;
  }

  function closeTimeTileEditor() {
    const popup = document.getElementById("fav-time-editor");
    if (!popup) return;
    timeEditorOpen = false;
    syncEmbedStateToMld();
    if (popup._previewTimer) {
      clearInterval(popup._previewTimer);
      popup._previewTimer = null;
    }
    popup.classList.remove("open");
    popup.hidden = true;
  }

  function openTimeTileEditor(existing) {
    let popup = document.getElementById("fav-time-editor");
    if (!popup) {
      popup = ce("div", "confirm-popup fav-time-editor");
      popup.id = "fav-time-editor";
      popup.hidden = true;
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-modal", "true");
      popup.setAttribute("aria-labelledby", "fav-time-editor-title");
      const panel = ce("div", "confirm-panel fav-embed-editor-panel");
      const heading = ce("h2", "fav-embed-editor-heading");
      heading.id = "fav-time-editor-title";
      heading.textContent = "Time tile";
      const help = ce("p", "fav-embed-editor-help");
      help.textContent = "Uses this device\u2019s clock. Choose how the time should look.";
      const preview = ce("div", "fav-time-preview");
      const previewClock = ce("div", "fav-time-clock");
      const previewDate = ce("div", "fav-time-date");
      preview.appendChild(previewClock);
      preview.appendChild(previewDate);
      const list = ce("div", "fav-time-style-list");
      list.setAttribute("role", "radiogroup");
      list.setAttribute("aria-label", "Time style");
      const styleInputs = [];
      for (const key of ["time", "time_seconds", "time_date"]) {
        const opt = ce("label", "fav-time-style-option");
        opt.setAttribute("role", "radio");
        const input = ce("input");
        input.type = "radio";
        input.name = "fav-time-style";
        input.value = key;
        const label = ce("span", "fav-time-style-label");
        label.textContent = TIME_STYLE_LABELS[key];
        opt.appendChild(input);
        opt.appendChild(label);
        list.appendChild(opt);
        styleInputs.push({ opt, input });
      }
      const err = ce("div", "fav-embed-editor-error");
      err.hidden = true;
      const actions = ce("div", "confirm-actions");
      const cancel = ce("button", "ghost-btn confirm-cancel");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const save = ce("button", "confirm-btn");
      save.type = "button";
      save.textContent = "Save";
      actions.appendChild(cancel);
      actions.appendChild(save);
      panel.appendChild(heading);
      panel.appendChild(help);
      panel.appendChild(preview);
      panel.appendChild(list);
      panel.appendChild(err);
      panel.appendChild(actions);
      popup.appendChild(panel);
      appendPopup(popup);
      popup._preview = preview;
      popup._err = err;
      popup._save = save;
      popup._styleInputs = styleInputs;
      const selectedStyle = () => {
        const hit = styleInputs.find((x) => x.input.checked);
        return hit ? hit.input.value : "time";
      };
      const syncPreview = () => {
        const style = selectedStyle();
        for (const { opt, input } of styleInputs) {
          opt.setAttribute("aria-checked", input.checked ? "true" : "false");
        }
        paintTimeCardElements(preview, style);
      };
      popup._syncPreview = syncPreview;
      for (const { input } of styleInputs) {
        input.addEventListener("change", syncPreview);
      }
      cancel.addEventListener("click", () => closeTimeTileEditor());
      bindPopupDismiss(popup, null, null, () => closeTimeTileEditor());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popup.classList.contains("open")) closeTimeTileEditor();
      });
      save.addEventListener("click", async () => {
        const style = normalizeTimeStyle(selectedStyle());
        if (!popup._existing && timeCards.length >= MAX_TIME_CARDS) {
          err.hidden = false;
          err.textContent = "Time tile limit reached (" + MAX_TIME_CARDS + ")";
          return;
        }
        err.hidden = true;
        save.disabled = true;
        const payload = popup._existing
          ? { action: "update", id: popup._existing.id, style, size: popup._existing.size || "square" }
          : { action: "create", style, size: "square" };
        const body = await timeCardsApi(payload);
        save.disabled = false;
        if (!body) return;
        closeTimeTileEditor();
        if (currentCategory() === "favorites") renderFavoritesPopup();
        updateQuickNavVisibility();
        flash(popup._existing ? "Time tile updated" : "Time tile added");
      });
    }
    timeEditorOpen = true;
    syncEmbedStateToMld();
    popup._existing = existing || null;
    popup._err.hidden = true;
    const style = normalizeTimeStyle(existing?.style || "time");
    for (const { input } of popup._styleInputs) {
      input.checked = input.value === style;
    }
    popup._syncPreview();
    if (popup._previewTimer) clearInterval(popup._previewTimer);
    popup._previewTimer = setInterval(() => popup._syncPreview(), 1000);
    popup.hidden = false;
    popup.classList.add("open");
    const focusInput = popup._styleInputs.find((x) => x.input.checked)?.input || popup._styleInputs[0]?.input;
    focusInput?.focus();
  }

  function makeEmbedFavoriteCard(card) {
    const el = ce("article", "fav-embed-card");
    el.dataset.embedId = card.id;
    el.dataset.embedUrl = card.url;
    const title = normalizeEmbedTitle(card.title, card.url);
    const head = ce("div", "fav-embed-head");
    const titleEl = ce("div", "fav-embed-title");
    titleEl.textContent = title;
    head.appendChild(titleEl);
    const actions = ce("div", "fav-embed-actions");
    const openBtn = ce("a", "fav-embed-open");
    openBtn.href = card.url;
    openBtn.target = "_blank";
    openBtn.rel = "noopener noreferrer";
    openBtn.textContent = "Open";
    openBtn.setAttribute("aria-label", "Open " + title + " externally");
    const expandBtn = ce("button", "fav-embed-expand");
    expandBtn.type = "button";
    expandBtn.textContent = "Expand";
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      hapticTap();
      expandEmbedCard(el, expandBtn);
    });
    const menuBtn = ce("button", "fav-embed-menu-btn");
    menuBtn.type = "button";
    menuBtn.setAttribute("aria-label", "Embed options");
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.textContent = "\u22ef";
    const menu = ce("div", "fav-embed-menu");
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    const editBtn = ce("button", "fav-embed-menu-item");
    editBtn.type = "button";
    editBtn.setAttribute("role", "menuitem");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      openEmbedEditor(card);
    });
    const delBtn = ce("button", "fav-embed-menu-item danger");
    delBtn.type = "button";
    delBtn.setAttribute("role", "menuitem");
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeFavTileOverflowMenu(menu, menuBtn);
      const ok = await confirmAction({ message: "Delete this embed card?", confirmLabel: "Delete", danger: true });
      if (ok) await deleteEmbedCard(card.id);
    });
    menu.appendChild(editBtn);
    menu.appendChild(delBtn);
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavTileOverflowMenu(menuBtn, menu);
    });
    actions.appendChild(openBtn);
    actions.appendChild(expandBtn);
    actions.appendChild(menuBtn);
    actions.appendChild(menu);
    head.appendChild(actions);
    el.appendChild(head);

    const media = ce("div", "fav-embed-media");
    const hint = ce("div", "fav-embed-hint");
    hint.textContent = "Blank or refused? Use the provider\u2019s iframe embed link, then Open.";
    const sameOrigin = isSameOriginEmbedUrl(card.url);
    if (sameOrigin) {
      el.dataset.blocked = "1";
      const blocked = ce("div", "fav-embed-blocked");
      blocked.textContent = "Same-origin URLs cannot be embedded here for security. Use Open instead.";
      media.appendChild(blocked);
      media.appendChild(hint);
    } else {
      const iframe = ce("iframe", "fav-embed-iframe");
      iframe.setAttribute("title", title);
      iframe.loading = "lazy";
      iframe.referrerPolicy = "no-referrer";
      iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
      iframe.src = "about:blank";
      iframe.dataset.embedUrl = card.url;
      media.appendChild(iframe);
      media.appendChild(hint);
    }
    el.appendChild(media);
    if (!sameOrigin) observeFavEmbedCard(el);
    return el;
  }

  async function embedCardsApi(payload) {
    try {
      const r = await fetch(withToken("embed-cards"), {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(String(body?.error || "Could not save embed"), true);
        return null;
      }
      applyEmbedConfigFromData({ config: body }, { allowDuringReorder: true });
      return body;
    } catch {
      flash("Could not save embed", true);
      return null;
    }
  }

  async function deleteEmbedCard(id) {
    discardEmbedIframe(id);
    const body = await embedCardsApi({ action: "delete", id });
    if (!body) return false;
    closeEmbedExpand();
    if (currentCategory() === "favorites") renderFavoritesPopup();
    updateQuickNavVisibility();
    flash("Embed deleted");
    return true;
  }

  function closeEmbedEditor() {
    const popup = document.getElementById("fav-embed-editor");
    if (!popup) return;
    embedEditorOpen = false;
    syncEmbedStateToMld();
    popup.classList.remove("open");
    popup.hidden = true;
    if (popup._previewFrame) popup._previewFrame.src = "about:blank";
  }

  function openEmbedEditor(existing) {
    let popup = document.getElementById("fav-embed-editor");
    if (!popup) {
      popup = ce("div", "confirm-popup fav-embed-editor");
      popup.id = "fav-embed-editor";
      popup.hidden = true;
      popup.setAttribute("role", "dialog");
      popup.setAttribute("aria-modal", "true");
      popup.setAttribute("aria-labelledby", "fav-embed-editor-title");
      const panel = ce("div", "confirm-panel fav-embed-editor-panel");
      const heading = ce("h2", "fav-embed-editor-heading");
      heading.id = "fav-embed-editor-title";
      heading.textContent = "Embed card";
      const help = ce("p", "fav-embed-editor-help");
      help.textContent = "Paste an HTTPS iframe embed URL (or iframe code). Normal website pages often refuse embedding.";
      const titleLabel = ce("label", "fav-embed-field");
      const titleSpan = ce("span");
      titleSpan.textContent = "Title (optional)";
      const titleInput = ce("input", "topbar-overflow-input fav-embed-title-input");
      titleInput.type = "text";
      titleInput.maxLength = MAX_EMBED_TITLE;
      titleLabel.appendChild(titleSpan);
      titleLabel.appendChild(titleInput);
      const urlLabel = ce("label", "fav-embed-field");
      const urlSpan = ce("span");
      urlSpan.textContent = "HTTPS embed URL or iframe code";
      const urlInput = ce("textarea", "fav-embed-url-input");
      urlInput.rows = 4;
      urlLabel.appendChild(urlSpan);
      urlLabel.appendChild(urlInput);
      const err = ce("div", "fav-embed-editor-error");
      err.hidden = true;
      const previewWrap = ce("div", "fav-embed-editor-preview");
      previewWrap.hidden = true;
      const previewFrame = ce("iframe", "fav-embed-editor-preview-frame");
      previewFrame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
      previewFrame.referrerPolicy = "no-referrer";
      previewFrame.title = "Embed preview";
      previewWrap.appendChild(previewFrame);
      const actions = ce("div", "confirm-actions");
      const cancel = ce("button", "ghost-btn confirm-cancel");
      cancel.type = "button";
      cancel.textContent = "Cancel";
      const save = ce("button", "confirm-btn");
      save.type = "button";
      save.textContent = "Save";
      actions.appendChild(cancel);
      actions.appendChild(save);
      panel.appendChild(heading);
      panel.appendChild(help);
      panel.appendChild(titleLabel);
      panel.appendChild(urlLabel);
      panel.appendChild(err);
      panel.appendChild(previewWrap);
      panel.appendChild(actions);
      popup.appendChild(panel);
      appendPopup(popup);
      popup._titleInput = titleInput;
      popup._urlInput = urlInput;
      popup._err = err;
      popup._previewWrap = previewWrap;
      popup._previewFrame = previewFrame;
      popup._save = save;
      cancel.addEventListener("click", () => closeEmbedEditor());
      bindPopupDismiss(popup, null, null, () => closeEmbedEditor());
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popup.classList.contains("open")) closeEmbedEditor();
      });
      const refreshPreview = () => {
        const parsed = parseEmbedInput(urlInput.value);
        if (!parsed.ok) {
          err.hidden = false;
          err.textContent = parsed.error;
          previewWrap.hidden = true;
          previewFrame.src = "about:blank";
          return null;
        }
        if (isSameOriginEmbedUrl(parsed.url)) {
          err.hidden = false;
          err.textContent = "Same-origin URLs cannot be embedded for security.";
          previewWrap.hidden = true;
          previewFrame.src = "about:blank";
          return null;
        }
        err.hidden = true;
        previewWrap.hidden = false;
        previewFrame.src = parsed.url;
        return parsed.url;
      };
      urlInput.addEventListener("input", () => { refreshPreview(); });
      save.addEventListener("click", async () => {
        const parsed = parseEmbedInput(urlInput.value);
        if (!parsed.ok) {
          err.hidden = false;
          err.textContent = parsed.error;
          return;
        }
        if (isSameOriginEmbedUrl(parsed.url)) {
          err.hidden = false;
          err.textContent = "Same-origin URLs cannot be embedded for security.";
          return;
        }
        if (!popup._existing && embedCards.length >= MAX_EMBED_CARDS) {
          err.hidden = false;
          err.textContent = "Embed card limit reached (" + MAX_EMBED_CARDS + ")";
          return;
        }
        save.disabled = true;
        if (popup._existing && popup._existing.url !== parsed.url) {
          discardEmbedIframe(popup._existing.id);
        }
        const payload = popup._existing
          ? { action: "update", id: popup._existing.id, title: titleInput.value, url: parsed.url, size: popup._existing.size || "tall" }
          : { action: "create", title: titleInput.value, url: parsed.url, size: "tall" };
        const body = await embedCardsApi(payload);
        save.disabled = false;
        if (!body) return;
        closeEmbedEditor();
        if (currentCategory() === "favorites") renderFavoritesPopup();
        updateQuickNavVisibility();
        flash(popup._existing ? "Embed updated" : "Embed added");
      });
    }
    embedEditorOpen = true;
    syncEmbedStateToMld();
    popup._existing = existing || null;
    popup._titleInput.value = existing?.title || "";
    popup._urlInput.value = existing?.url || "";
    popup._err.hidden = true;
    popup._previewWrap.hidden = true;
    popup._previewFrame.src = "about:blank";
    popup.hidden = false;
    popup.classList.add("open");
    popup._urlInput.focus();
    if (existing?.url) popup._urlInput.dispatchEvent(new Event("input"));
  }

  function renderFavoritesEmptyState(body) {
    const wrap = ce("div", "fav-empty");
    const p = ce("p");
    p.textContent = "Tap the star on any device to add it here, or add an embedded, time, notifications, or HTML tile.";
    const actions = ce("div", "fav-empty-actions");
    const addEmbedBtn = ce("button", "confirm-btn fav-add-embed-btn");
    addEmbedBtn.type = "button";
    addEmbedBtn.textContent = "Add embedded";
    addEmbedBtn.addEventListener("click", () => {
      hapticTap();
      openEmbedEditor(null);
    });
    const addTimeBtn = ce("button", "ghost-btn fav-add-time-btn");
    addTimeBtn.type = "button";
    addTimeBtn.textContent = "Add time";
    addTimeBtn.addEventListener("click", () => {
      hapticTap();
      openTimeTileEditor(null);
    });
    const addNotifBtn = ce("button", "ghost-btn fav-add-notif-btn");
    addNotifBtn.type = "button";
    addNotifBtn.textContent = "Add notifications";
    addNotifBtn.addEventListener("click", () => {
      hapticTap();
      void addNotificationTile();
    });
    const addHtmlBtn = ce("button", "ghost-btn fav-add-html-btn");
    addHtmlBtn.type = "button";
    addHtmlBtn.textContent = "Add HTML";
    addHtmlBtn.addEventListener("click", () => {
      hapticTap();
      postCall("openHtmlTilePicker");
    });
    actions.appendChild(addEmbedBtn);
    actions.appendChild(addTimeBtn);
    actions.appendChild(addNotifBtn);
    actions.appendChild(addHtmlBtn);
    wrap.appendChild(p);
    wrap.appendChild(actions);
    body.appendChild(wrap);
  }

  function refreshFavoritesPopup() {
    if (!isFavoritesPersistActive()) return;
    if (favoritesReorderActive) return;
    if (embedEditorOpen || timeEditorOpen || embedExpandState) return;
    const entries = getFavoriteEntries();
    const sig = favoritesPopupSignature();
    const body = tabMode ? ensureFavoritesPersistPanel() : (currentBody());
    const grid = body.querySelector(".quick-fav-grid");
    if (!grid || sig !== favPopupSig || !favoritesGridSizesMatch(entries, grid)) {
      renderFavoritesPopup();
      return;
    }
    for (const entry of getFavoriteEntries()) {
      if (entry.type === "embed" || entry.type === "html" || entry.type === "time") continue;
      if (entry.type === "thermostat") {
        const t = thermostats.find((x) => x.i === entry.dev.i) || entry.dev;
        updateQuickTstatCard(t, favTstatMap);
      } else if (entry.type === "sensor") {
        const listFn = globalThis.__MLD?.mergedSensorList;
        const merged = typeof listFn === "function" ? listFn() : [];
        const dev = merged.find((x) => x.i === entry.dev.i) || entry.dev;
        if (typeof updateSensorCard === "function") updateSensorCard(dev);
        else globalThis.__MLD?.updateSensorCard?.(dev);
      } else if (entry.type === "music") {
        const mp = music.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteMusicRow(mp);
      } else if (entry.type === "lock") {
        const lk = locks.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteLockRow(lk);
      } else if (entry.type === "garage") {
        const door = garageDoors.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteGarageRow(door);
      } else if (entry.type === "shade") {
        const sh = windowShades.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFavoriteShadeTile(sh);
      } else if (entry.type === "fan") {
        const f = ceilingFans.find((x) => x.i === entry.dev.i) || entry.dev;
        updateFanTile(f);
      }
    }
    updateStates();
    if (favTstatModeMenu) repositionFavoriteTstatModeMenu();
  }

  /** Soft open: keep existing embed iframes when layout unchanged (tab mode). */
  function showFavoritesPanel() {
    if (!tabMode) {
      // Popup mode still uses the shared popup body (iframes reload on reopen).
      renderFavoritesPopup();
      return;
    }
    setFavoritesPersistVisible(true);
    const body = ensureFavoritesPersistPanel();
    const entries = getFavoriteEntries();
    const sig = favoritesPopupSignature();
    const grid = body.querySelector(".quick-fav-grid");
    if (
      !favoritesReorderActive &&
      !embedEditorOpen &&
      !timeEditorOpen &&
      !embedExpandState &&
      grid &&
      sig === favPopupSig &&
      favoritesGridSizesMatch(entries, grid)
    ) {
      refreshFavoritesPopup();
      startFavoriteTimeTicker();
      return;
    }
    renderFavoritesPopup();
  }

  function favoritesRenderTarget() {
    if (tabMode) return ensureFavoritesPersistPanel();
    const popup = ensureQuickPopup();
    syncQuickPopupWidthForOpen(popup);
    return popup._body;
  }

  function renderFavoritesPopup() {
    closeFavoriteTstatModeMenu();
    closeAllOpenFavTileOverflowMenus();
    if (!favoritesReorderActive) closeEmbedExpand();
    const body = favoritesRenderTarget();
    if (tabMode) setFavoritesPersistVisible(true);
    if (!tabMode || activeTab !== "favorites") {
      const popup = ensureQuickPopup();
      syncQuickPopupWidthForOpen(popup);
    }
    if (tabMode) {
      setQuickBodyClass(body, "quick-body quick-body-favorites");
      body.classList.add("favorites-persist", "tab-view", "tab-body");
    } else {
      setQuickBodyClass(body, "quick-body quick-body-favorites");
    }
    body.innerHTML = "";
    if (favHtmlObserver) {
      favHtmlObserver.disconnect();
      favHtmlObserver = null;
    }
    htmlTileIframes.clear();
    favDevMap.clear();
    favTstatMap.clear();
    favSensorMap.clear();
    sensorCardMap.clear();
    favMusicMap.clear();
    favLockMap.clear();
    favGarageMap.clear();
    favShadeMap.clear();
    favFanMap.clear();
    favoritesReorderEls.clear();
    const entries = getFavoriteEntries();
    if (!entries.length) {
      favPopupSig = favoritesPopupSignature();
      stopFavoriteTimeTicker();
      renderFavoritesEmptyState(body);
      return;
    }
    const grid = ce("div", "quick-fav-grid");
    if (favoritesReorderActive) {
      appendFavoriteReorderItems(grid, entries);
    } else {
      appendFavoriteEntryTiles(grid, entries);
    }
    body.appendChild(grid);
    if (favoritesReorderActive) {
      stopFavoriteTimeTicker();
      updateFavoritesMoveButtons();
    } else {
      startFavoriteTimeTicker();
    }
    updateStates();
    favPopupSig = favoritesPopupSignature();
  }

  function thermostatsListSignature() {
    return thermostats.map((t) => t.i).join(",");
  }

  function refreshThermostatsPopup() {
    if (currentCategory() !== "thermostats") return;
    if (isTstatReorderActive()) return;
    const listSig = thermostatsListSignature();
    const body = currentBody();
    if (!body.querySelector(".quick-fav-grid") || listSig !== tstatsPopupSig) {
      renderThermostatsPopup();
      return;
    }
    for (const t of thermostats) updateQuickTstatCard(t, tstatsPopupMap);
    if (favTstatModeMenu) repositionFavoriteTstatModeMenu();
  }

  function renderThermostatsPopup() {
    closeFavoriteTstatModeMenu();
    if (!inTabView()) {
      const popup = ensureQuickPopup();
      syncQuickPopupWidthForOpen(popup);
    }
    const body = currentBody();
    setQuickBodyClass(body, "quick-body quick-body-thermostats");
    body.innerHTML = "";
    tstatsPopupMap.clear();
    clearTstatReorderEls();
    tstatsPopupSig = thermostatsListSignature();
    if (!thermostats.length) {
      body.textContent = "No thermostats selected — add thermostats in the Hubitat app settings";
      return;
    }
    const sorted = sortThermostatsByOrder(thermostats, cfg.thermostatOrder);
    const grid = ce("div", "quick-fav-grid");
    for (const t of sorted) grid.appendChild(makeQuickTstatCard(t, tstatsPopupMap));
    body.appendChild(grid);
  }

  function quickNavPopupHasContent(popup) {
    switch (popup) {
      case "locks": return locks.length > 0 || garageDoors.length > 0;
      case "scenes": return scenesPopupEnabled && scenes.length > 0;
      case "hub-mode": return hubModePopupEnabled && hubModes.length > 0;
      case "security": return hsmEnabled;
      case "blinds": return windowShades.length > 0;
      case "fans": return ceilingFans.length > 0;
      case "outlets": return outletsSeparateTab && outlets.length > 0;
      case "scheduling": return schedulerEnabled;
      case "sensors": {
        const listFn = globalThis.__MLD?.mergedSensorList;
        return typeof listFn === "function" && listFn().length > 0;
      }
      case "thermostats": return thermostatsPopupEnabled && thermostats.length > 0;
      case "music": return music.length > 0;
      case "cameras": return tabMode && isLocalOrigin() && cameras.length > 0;
      case "favorites": return true;
      default: return false;
    }
  }

  function updateQuickNavVisibility() {
    if (reorderMode) return;
    let anyVisible = false;
    for (const { id, popup } of QUICK_NAV) {
      const btn = document.getElementById(id);
      if (!btn) continue;
      const show = quickNavPopupHasContent(popup);
      btn.hidden = !show;
      const rec = navEls.get(popup);
      if (rec?.wrap) rec.wrap.hidden = !show;
      if (show) anyVisible = true;
    }
    // Lights tab is shown whenever tab mode is on (independent of content)
    if (tabMode && QUICK_LIGHTS_BTN) {
      QUICK_LIGHTS_BTN.hidden = false;
      const lightsRec = navEls.get("lights");
      if (lightsRec?.wrap) lightsRec.wrap.hidden = false;
      anyVisible = true;
    } else {
      const lightsRec = navEls.get("lights");
      if (lightsRec?.wrap) lightsRec.wrap.hidden = true;
    }
    const nav = document.querySelector(".quick-nav");
    if (nav) nav.hidden = !anyVisible;
    if (quickPopupOpenType && !quickNavPopupHasContent(quickPopupOpenType)) closeQuickPopup();
    if (tabMode && inTabView() && !quickNavPopupHasContent(activeTab)) showTab("lights");
    postCall("updateQuickNavScrollFade");
  }


  function refreshQuickPopupIfOpen() {
    if (inTabView()) {
      switch (activeTab) {
        case "music": renderMusicPopup(); break;
        case "cameras":
          if (isPost3Ready()) postCall("refreshCamerasPopup");
          else void activateDeferredModule("cameras");
          break;
        case "favorites": refreshFavoritesPopup(); break;
        case "thermostats": refreshThermostatsPopup(); break;
        case "sensors": refreshSensorsPopup(); break;
        case "blinds": refreshBlindsPopup(); break;
        case "fans": refreshFansPopup(); break;
        case "outlets": renderOutletsPopup(); break;
        case "scheduling":
          if (isPost3Ready()) postCall("renderSchedulerView");
          else void activateDeferredModule("scheduling");
          break;
      }
      return;
    }
    if (!quickPopup?.classList.contains("open") || !quickPopupOpenType) return;
    switch (quickPopupOpenType) {
      case "hub-mode": renderHubModePopup(); break;
      case "locks": renderLocksPopup(); break;
      case "blinds": refreshBlindsPopup(); break;
      case "fans": refreshFansPopup(); break;
      case "music": renderMusicPopup(); break;
      case "favorites": refreshFavoritesPopup(); break;
      case "thermostats": refreshThermostatsPopup(); break;
      case "security": renderSecurityPopup(); break;
      case "sensors": refreshSensorsPopup(); break;
      case "scheduling":
        if (isPost3Ready()) postCall("renderSchedulerView");
        else void activateDeferredModule("scheduling");
        break;
    }
  }

  function openQuickPopup(id, title) {
    cancelAllSlideGestures();
    if (colorSession) closeColorPopup(true);
    if (tstatSession) closeTstatPopup();
    closeMusicMasterPopup();
    closeFanMasterPopup();
    closeShadeMasterPopup();
    if (quickPopupOpenType === "favorites" && id !== "favorites") {
      closeEmbedExpand();
      closeEmbedEditor();
      setFavoritesPersistVisible(false);
    }
    const popup = ensureQuickPopup();
    syncQuickPopupRef(popup);
    syncQuickPopupWidth(popup, id);
    popup._title.textContent = title;
    popup.setAttribute("aria-label", title);
    quickPopupOpenType = id;
    switch (id) {
      case "hub-mode": renderHubModePopup(); break;
      case "scenes": renderScenesPopup(); break;
      case "favorites": showFavoritesPanel(); break;
      case "locks": renderLocksPopup(); break;
      case "blinds": refreshBlindsPopup(); break;
      case "fans": refreshFansPopup(); break;
      case "outlets": renderOutletsPopup(); break;
      case "music": renderMusicPopup(); break;
      case "security": renderSecurityPopup(); break;
      case "sensors": renderSensorsPopup(); break;
      case "thermostats": renderThermostatsPopup(); break;
      case "scheduling":
        void activateDeferredModule("scheduling");
        break;
      default:
        popup._body.className = "quick-body";
        popup._body.textContent = "Coming soon";
    }
    popup.hidden = false;
    popup.classList.add("open");
    popup.querySelector(".quick-close").focus();
    updateCurrentCategoryTitle();
    updateExpandAllBtn();
    updateReorderMenuLabel();
  }

  function closeQuickPopup() {
    closeFavoriteTstatModeMenu();
    const wasFavorites = quickPopupOpenType === "favorites";
    const popup = quickPopup || (globalThis.__MLD && globalThis.__MLD.quickPopup) || document.querySelector(".quick-popup");
    if (!popup) return;
    syncQuickPopupRef(popup);
    popup.hidden = true;
    popup.classList.remove("open");
    popup.classList.remove("quick-popup-wide");
    popup.classList.remove("quick-popup-hub-mode");
    quickPopupOpenType = null;
    updateReorderMenuLabel();
    if (wasFavorites) {
      closeEmbedExpand();
      closeEmbedEditor();
      setFavoritesPersistVisible(false);
      // Keep favPopupSig + panel DOM so embeds survive reopen / tab return.
    } else {
      favDevMap.clear();
      favTstatMap.clear();
      favSensorMap.clear();
      favMusicMap.clear();
      favLockMap.clear();
      favGarageMap.clear();
      favShadeMap.clear();
      favFanMap.clear();
      favPopupSig = "";
    }
    fansPopupMap.clear();
    fansPopupSig = "";
    shadePopupMap.clear();
    blindsPopupSig = "";
    tstatsPopupMap.clear();
    tstatsPopupSig = "";
    sensorCardMap.clear();
    sensorsPopupSig = "";
    sensorTypeFilter.clear();
    sensorFilterOpen = false;
    sensorFilterChipsEl = null;
    sensorFilterBtnEl = null;
    sensorFilterEmptyEl = null;
    updateCurrentCategoryTitle();
    updateExpandAllBtn();
  }

  // ---------- tab mode helpers ----------
  function ensureTabView() {
    if (tabViewEl) return tabViewEl;
    tabViewEl = ce("div", "tab-view");
    tabViewEl.hidden = true;
    // place it right after the rooms main element
    if (ROOMS_EL && ROOMS_EL.parentNode) ROOMS_EL.parentNode.insertBefore(tabViewEl, ROOMS_EL.nextSibling);
    return tabViewEl;
  }

  function setQuickBodyClass(body, classes) {
    if (body === tabViewEl || body === favoritesPersistEl) {
      body.className = (body === favoritesPersistEl ? "favorites-persist " : "") + "tab-view " + classes + " tab-body";
    } else {
      body.className = classes;
    }
  }

  function currentBody() {
    if (isFavoritesPersistActive()) return ensureFavoritesPersistPanel();
    if (tabMode && activeTab !== "lights") return ensureTabView();
    return ensureQuickPopup()._body;
  }

  function currentCategory() {
    // Locks / security / hub-mode / scenes are overlay popups, not tabs. When one is
    // open, prefer it over the underlying tab (e.g. Favorites) so optimistic UI
    // refreshes the visible popup instead of only the hidden tab.
    if (quickPopupOpenType && !TAB_CATEGORIES.has(quickPopupOpenType)) return quickPopupOpenType;
    if (tabMode && activeTab !== "lights") return activeTab;
    return quickPopupOpenType;
  }

  const POPUP_LABELS = {};
  for (const { popup, title } of QUICK_NAV) POPUP_LABELS[popup] = title;

  function currentCategoryLabel() {
    const cat = quickPopupOpenType || (tabMode && activeTab !== "lights" ? activeTab : null);
    if (!cat) return "Lights";
    return POPUP_LABELS[cat] || TAB_LABELS[cat] || cat;
  }

  function updateCurrentCategoryTitle() {
    if (CURRENT_CATEGORY_TITLE_EL) CURRENT_CATEGORY_TITLE_EL.textContent = currentCategoryLabel();
  }

  function inTabView() {
    return tabMode && activeTab !== "lights";
  }

  function updateTabActiveStates() {
    if (QUICK_LIGHTS_BTN) QUICK_LIGHTS_BTN.classList.toggle("is-tab-active", tabMode && activeTab === "lights");
    for (const { popup } of QUICK_NAV) {
      if (!TAB_CATEGORIES.has(popup)) continue;
      const btn = document.getElementById("quick-" + popup);
      if (btn) btn.classList.toggle("is-tab-active", tabMode && activeTab === popup);
    }
  }

  function normalizeDefaultTabId(id) {
    const s = String(id || "").trim();
    if (s === "lights" || TAB_CATEGORIES.has(s)) return s;
    return "lights";
  }

  function applyDefaultTabIfNeeded() {
    if (defaultTabApplied || !tabMode) return;
    defaultTabApplied = true;
    const id = normalizeDefaultTabId(cfg.defaultTab);
    if (id === "lights") return;
    if (quickNavPopupHasContent(id)) showTab(id);
  }

  function syncCamerasViewClass(on) {
    APP_EL?.classList.toggle("cameras-view", !!on);
  }

  function showTab(id) {
    if (id === "cameras" && !isLocalOrigin()) id = "lights";
    if (colorSession) closeColorPopup(true);
    if (tstatSession) closeTstatPopup();
    if (musicMasterPopup && musicMasterPopup.classList.contains("open")) closeMusicMasterPopup();
    if (fanMasterPopup && fanMasterPopup.classList.contains("open")) closeFanMasterPopup();
    if (shadeMasterPopup && shadeMasterPopup.classList.contains("open")) closeShadeMasterPopup();
    if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
    if (activeTab === "cameras" && id !== "cameras") postCall("stopCamerasStreams");
    if (activeTab === "favorites" && id !== "favorites") {
      closeEmbedExpand();
      closeEmbedEditor();
      setFavoritesPersistVisible(false);
    }
    const tabChanged = id !== activeTab;
    if (tabChanged && SEARCH_EL) {
      SEARCH_EL.value = "";
      collapsedBeforeSearch = null;
      sensorCollapsedBeforeSearch = null;
    }
    activeTab = id;
    ensureTabView();
    ensureFavoritesPersistPanel();
    const nonLights = id !== "lights";
    const showFav = nonLights && id === "favorites";
    if (ROOMS_EL) ROOMS_EL.hidden = nonLights;
    if (tabViewEl) tabViewEl.hidden = !nonLights || showFav;
    setFavoritesPersistVisible(showFav);
    if (ALL_ON_TRACK) ALL_ON_TRACK.hidden = nonLights;
    else if (ALL_ON_BTN) ALL_ON_BTN.hidden = nonLights;
    if (ALL_OFF_TRACK) ALL_OFF_TRACK.hidden = nonLights;
    else if (ALL_OFF_BTN) ALL_OFF_BTN.hidden = nonLights;
    if (CENTRAL_TSTAT_BTN) CENTRAL_TSTAT_BTN.hidden = !(tabMode && id === "thermostats");
    if (CENTRAL_MUSIC_BTN) CENTRAL_MUSIC_BTN.hidden = !(tabMode && id === "music");
    if (CENTRAL_BLINDS_BTN) CENTRAL_BLINDS_BTN.hidden = !(tabMode && id === "blinds");
    if (CENTRAL_FAN_BTN) CENTRAL_FAN_BTN.hidden = !(tabMode && id === "fans");
    if (SEARCH_EL) SEARCH_EL.placeholder = nonLights ? "Search " + (TAB_LABELS[id] || "items") : "Search lights or rooms";
    syncCamerasViewClass(tabMode && id === "cameras");
    updateCamerasLayoutMenuVisibility();
    updateSensorsOrgMenuVisibility();
    updateAddEmbedMenuVisibility();
    updateReorderMenuLabel();
    updateTabActiveStates();
    if (nonLights) {
      switch (id) {
        case "favorites": showFavoritesPanel(); break;
        case "sensors": renderSensorsPopup(); break;
        case "thermostats": renderThermostatsPopup(); break;
        case "music": renderMusicPopup(); break;
        case "cameras": void activateDeferredModule("cameras"); break;
        case "blinds": refreshBlindsPopup(); break;
        case "fans": refreshFansPopup(); break;
        case "outlets": renderOutletsPopup(); break;
        case "scheduling": void activateDeferredModule("scheduling"); break;
      }
    }
    applySearch();
    updateExpandAllBtn();
    updateCurrentCategoryTitle();
  }

  function closeCurrentView() {
    if (tabMode && activeTab !== "lights") showTab("lights");
    else closeQuickPopup();
  }

  function setTabMode(on) {
    if (cfg.enableDrawer && !on) return; // drawer mode forces tab mode on
    cfg.enableTabs = on;
    tabMode = on;
    saveTabsPref(on);
    if (QUICK_LIGHTS_BTN) QUICK_LIGHTS_BTN.hidden = !on;
    if (!on) {
      if (activeTab === "cameras") postCall("stopCamerasStreams");
      syncCamerasViewClass(false);
      if (quickPopup && quickPopup.classList.contains("open")) closeQuickPopup();
      activeTab = "lights";
      if (ROOMS_EL) ROOMS_EL.hidden = false;
      if (tabViewEl) tabViewEl.hidden = true;
      setFavoritesPersistVisible(false);
      if (ALL_ON_TRACK) ALL_ON_TRACK.hidden = false;
      else if (ALL_ON_BTN) ALL_ON_BTN.hidden = false;
      if (ALL_OFF_TRACK) ALL_OFF_TRACK.hidden = false;
      else if (ALL_OFF_BTN) ALL_OFF_BTN.hidden = false;
      if (CENTRAL_TSTAT_BTN) CENTRAL_TSTAT_BTN.hidden = true;
      if (CENTRAL_MUSIC_BTN) CENTRAL_MUSIC_BTN.hidden = true;
      if (CENTRAL_BLINDS_BTN) CENTRAL_BLINDS_BTN.hidden = true;
      if (CENTRAL_FAN_BTN) CENTRAL_FAN_BTN.hidden = true;
      if (SEARCH_EL) SEARCH_EL.placeholder = "Search lights or rooms";
    } else {
      showTab("lights");
    }
    updateTabActiveStates();
    updateQuickNavVisibility();
    updateCurrentCategoryTitle();
    updateCamerasLayoutMenuVisibility();
    updateSensorsOrgMenuVisibility();
    updateReorderMenuLabel();
  }

  // ---------- navigation drawer ----------
  let drawerOpen = false;
  let drawerClosing = false;
  let priorTabsPref = cfg.enableTabs;
  let drawerDom = null;

  function resolveDrawerDom() {
    if (drawerDom) return drawerDom;
    const toggle = document.getElementById("drawer-toggle");
    const aside = document.getElementById("app-drawer");
    const backdrop = document.getElementById("drawer-backdrop");
    const searchSlot = aside?.querySelector(".drawer-search-slot");
    const navSlot = aside?.querySelector(".drawer-nav-slot");
    const topbar = document.querySelector(".topbar");
    if (!toggle || !aside || !backdrop || !searchSlot || !navSlot || !topbar) return null;
    drawerDom = { toggle, aside, backdrop, searchSlot, navSlot, topbar };
    return drawerDom;
  }

  function setDrawerLabels() {
    const nav = document.querySelector(".quick-nav");
    if (!nav) return;
    for (const btn of nav.querySelectorAll(".ghost-btn.icon-btn")) {
      const label = btn.getAttribute("title") || btn.getAttribute("aria-label") || "";
      if (label) btn.setAttribute("data-drawer-label", label);
    }
  }

  function openDrawer() {
    const d = resolveDrawerDom();
    if (!d || drawerOpen || drawerClosing) return;
    drawerOpen = true;
    d.aside.hidden = false;
    d.backdrop.hidden = false;
    d.toggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.aside.classList.add("open");
      d.backdrop.classList.add("open");
    }));
  }

  function closeDrawer() {
    const d = resolveDrawerDom();
    if (!d || !drawerOpen) return;
    drawerOpen = false;
    drawerClosing = true;
    d.toggle.setAttribute("aria-expanded", "false");
    d.aside.classList.remove("open");
    d.backdrop.classList.remove("open");
    const finish = () => {
      if (drawerOpen) { drawerClosing = false; return; }
      d.aside.hidden = true;
      d.backdrop.hidden = true;
      drawerClosing = false;
    };
    d.aside.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 280);
  }

  function toggleDrawer() {
    if (drawerOpen) closeDrawer();
    else { closeTopbarOverflowMenu(); openDrawer(); }
  }

  function setDrawerMode(on) {
    const d = resolveDrawerDom();
    if (!d) return;
    cfg.enableDrawer = on;
    saveDrawerPref(on);
    if (on) {
      priorTabsPref = cfg.enableTabs;
      // Relocate search + quick-nav into the drawer (listeners preserved).
      d.searchSlot.appendChild(document.querySelector(".search-wrap"));
      d.navSlot.appendChild(document.querySelector(".quick-nav"));
      setDrawerLabels();
      APP_EL?.classList.add("drawer-mode");
      d.toggle.hidden = false;
      // Force tab mode on; disable the tabs checkbox while drawer is active.
      setTabMode(true);
      if (MENU_TABS_EL) {
        MENU_TABS_EL.disabled = true;
        const label = MENU_TABS_EL.closest(".topbar-overflow-check");
        if (label) { label.setAttribute("aria-disabled", "true"); label.style.opacity = "0.5"; label.style.pointerEvents = "none"; }
      }
    } else {
      APP_EL?.classList.remove("drawer-mode");
      if (drawerOpen || drawerClosing) closeDrawer();
      d.toggle.hidden = true;
      // Move search + quick-nav back to the topbar (original order: topbar-row, quick-nav, search-wrap).
      const nav = document.querySelector(".quick-nav");
      const search = document.querySelector(".search-wrap");
      if (nav) d.topbar.appendChild(nav);
      if (search) d.topbar.appendChild(search);
      if (nav) for (const btn of nav.querySelectorAll(".ghost-btn.icon-btn")) btn.removeAttribute("data-drawer-label");
      // Restore prior tab preference.
      if (MENU_TABS_EL) {
        MENU_TABS_EL.disabled = false;
        const label = MENU_TABS_EL.closest(".topbar-overflow-check");
        if (label) { label.removeAttribute("aria-disabled"); label.style.opacity = ""; label.style.pointerEvents = ""; }
      }
      setTabMode(priorTabsPref);
    }
    if (MENU_DRAWER_EL) {
      MENU_DRAWER_EL.checked = on;
      const label = MENU_DRAWER_EL.closest(".topbar-overflow-check");
      if (label) label.setAttribute("aria-checked", on ? "true" : "false");
    }
    updateQuickNavVisibility();
  }

  function closeConfirm(result) {
    const popup = confirmPopup || document.querySelector(".confirm-popup");
    if (!popup) return;
    popup.hidden = true;
    popup.classList.remove("open");
    const resolve = confirmPending;
    confirmPending = null;
    if (resolve) resolve(result);
  }

  function ensureConfirmPopup() {
    if (confirmPopup) return confirmPopup;
    const el = ce("div", "confirm-popup");
    confirmPopup = el;
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    const panel = ce("div", "confirm-panel");
    const msg = ce("div", "confirm-msg");
    const actions = ce("div", "confirm-actions");
    const cancel = ce("button", "ghost-btn confirm-cancel");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const ok = ce("button", "confirm-btn");
    ok.type = "button";
    panel.appendChild(msg);
    actions.appendChild(cancel);
    actions.appendChild(ok);
    panel.appendChild(actions);
    el.appendChild(panel);
    appendPopup(el);

    bindPopupDismiss(el, null, null, () => closeConfirm(false));
    cancel.addEventListener("click", (e) => { e.stopPropagation(); closeConfirm(false); });
    ok.addEventListener("click", (e) => { e.stopPropagation(); hapticTap(); closeConfirm(true); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && el.classList.contains("open")) closeConfirm(false);
    });

    el._msg = msg;
    el._ok = ok;
    return el;
  }

  function confirmAction({ message, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      cancelAllSlideGestures();
      const popup = ensureConfirmPopup();
      popup._msg.textContent = message;
      popup._ok.textContent = confirmLabel;
      popup._ok.classList.toggle("danger", danger);
      confirmPending = resolve;
      popup.hidden = false;
      popup.classList.add("open");
      popup._ok.focus();
    });
  }

  async function tapAllOn() {
    if (!devices.length) { flash("No lights configured", true); return; }
    if (await confirmAction({ message: "Turn on all lights?", confirmLabel: "All on" })) allLights("on");
  }

  async function tapAllOff() {
    if (!devices.length) { flash("No lights configured", true); return; }
    if (await confirmAction({ message: "Turn off all lights?", confirmLabel: "All off", danger: true })) allLights("off");
  }

  if (ALL_ON_BTN && ALL_ON_TRACK && ALL_ON_RESTORE_BTN) {
    attachRoomSlideAction(ALL_ON_TRACK, ALL_ON_BTN, ALL_ON_RESTORE_BTN, {
      direction: "right",
      clickFallback: true,
      onTap: () => { void tapAllOn(); },
      onCommit: () => {
        snapshotRestoreApi("house").then((ok) => {
          if (ok) flash("Restoring home…");
        });
      },
      canCommit: () => !!snapshots[snapshotHouseKey()],
    });
  } else if (ALL_ON_BTN) {
    ALL_ON_BTN.addEventListener("click", () => { void tapAllOn(); });
  }
  if (ALL_OFF_BTN && ALL_OFF_TRACK && ALL_OFF_SAVE_BTN) {
    attachRoomSlideAction(ALL_OFF_TRACK, ALL_OFF_BTN, ALL_OFF_SAVE_BTN, {
      direction: "left",
      clickFallback: true,
      onTap: () => { void tapAllOff(); },
      onCommit: () => {
        snapshotSaveApi("house").then((ok) => {
          if (!ok) return;
          snapshots[snapshotHouseKey()] = { ts: Date.now(), count: devices.length };
          updateRoomSnapshotUi();
          flash("Home saved");
        });
      },
      canCommit: () => true,
    });
  } else if (ALL_OFF_BTN) {
    ALL_OFF_BTN.addEventListener("click", () => { void tapAllOff(); });
  }

  // ---------- filter ----------
  let collapsedBeforeSearch = null;
  let sensorCollapsedBeforeSearch = null;

  function collapsedIdSet() {
    const set = new Set();
    for (const [rid, rec] of roomEls) if (rec.card.classList.contains("collapsed")) set.add(rid);
    return set;
  }

  function applyFilter() {
    if (!SEARCH_EL) return;
    const q = SEARCH_EL.value.trim().toLowerCase();
    if (!q) {
      for (const [, rec] of roomEls) rec.card.classList.remove("hidden");
      for (const [, rec] of devMap) rec.el.classList.remove("hidden");
      if (outletsInLightsRooms()) {
        for (const [, rec] of outletMap) rec.el.classList.remove("hidden");
      }
      if (collapsedBeforeSearch) {
        for (const [rid, rec] of roomEls) {
          rec.card.classList.toggle("collapsed", collapsedBeforeSearch.has(rid));
        }
        collapsedBeforeSearch = null;
        updateExpandAllBtn();
      }
      return;
    }

    if (!collapsedBeforeSearch) collapsedBeforeSearch = collapsedIdSet();

    for (const [, rec] of devMap) {
      rec.el.classList.toggle("hidden", !rec.el.dataset.name.includes(q));
    }
    if (outletsInLightsRooms()) {
      for (const [, rec] of outletMap) {
        rec.el.classList.toggle("hidden", !rec.el.dataset.name.includes(q));
      }
    }
    for (const [, rec] of roomEls) {
      const visible = rec.body.querySelectorAll(".tile:not(.hidden)");
      let show = visible.length > 0;
      if (rec.card.dataset.roomName.includes(q)) show = true;
      rec.card.classList.toggle("hidden", !show);
      if (show) rec.card.classList.remove("collapsed");
    }
  }

  function applyTabSearch(q) {
    const searchRoot = (activeTab === "favorites" && favoritesPersistEl) ? favoritesPersistEl : tabViewEl;
    if (!searchRoot && activeTab !== "sensors") return;
    if (activeTab === "sensors" && sensorRoomEls.size) {
      if (!q) {
        for (const [, rec] of sensorRoomEls) {
          for (const card of rec.body.querySelectorAll(".sensor-card")) card.classList.remove("search-hidden");
        }
        if (sensorCollapsedBeforeSearch) {
          for (const [rid, rec] of sensorRoomEls) {
            rec.card.classList.toggle("collapsed", sensorCollapsedBeforeSearch.has(rid));
          }
          sensorCollapsedBeforeSearch = null;
        }
        applySensorTypeFilter();
        return;
      }
      if (!sensorCollapsedBeforeSearch) sensorCollapsedBeforeSearch = sensorsCollapsedIdSet();
      for (const [, rec] of sensorRoomEls) {
        const roomMatch = rec.card.dataset.roomName.includes(q);
        let anyVisible = roomMatch;
        for (const card of rec.body.querySelectorAll(".sensor-card")) {
          const nameMatch = card.dataset.name.includes(q);
          const show = roomMatch || nameMatch;
          card.classList.toggle("search-hidden", !show);
          if (show) anyVisible = true;
        }
        if (anyVisible) rec.card.classList.remove("collapsed");
        rec.card.classList.toggle("hidden", !anyVisible);
      }
      return;
    }
    if (!searchRoot) return;
    const items = searchRoot.querySelectorAll("[data-name]");
    for (const el of items) {
      el.classList.toggle("search-hidden", !!q && !el.dataset.name.includes(q));
    }
  }

  function applySearch() {
    if (!SEARCH_EL) return;
    if (inTabView()) {
      applyTabSearch(SEARCH_EL.value.trim().toLowerCase());
    } else {
      applyFilter();
    }
  }
  if (SEARCH_EL) SEARCH_EL.addEventListener("input", applySearch);

  // ---------- collapse persistence ----------
  function sensorsCollapsedIdSet() {
    const set = new Set();
    for (const [rid, rec] of sensorRoomEls) if (rec.card.classList.contains("collapsed")) set.add(rid);
    return set;
  }

  function sensorsCollapsedSet() {
    const set = [];
    for (const [rid, rec] of sensorRoomEls) if (rec.card.classList.contains("collapsed")) set.push(rid);
    return set;
  }

  function persistSensorsCollapsed() {
    try { localStorage.setItem("mld_sensors_collapsed", sensorsCollapsedSet().join(",")); } catch {}
  }

  function allSensorRoomsCollapsed() {
    if (sensorRoomEls.size === 0) return true;
    for (const [, rec] of sensorRoomEls) if (!rec.card.classList.contains("collapsed")) return false;
    return true;
  }

  function expandAllSensorRooms() {
    for (const [, rec] of sensorRoomEls) rec.card.classList.remove("collapsed");
  }

  function collapseAllSensorRooms() {
    for (const [, rec] of sensorRoomEls) rec.card.classList.add("collapsed");
  }

  function restoreSensorsCollapsed() {
    for (const [, rec] of sensorRoomEls) rec.card.classList.remove("collapsed");
    let raw = null;
    try { raw = localStorage.getItem("mld_sensors_collapsed"); } catch {}
    if (!raw) return;
    const set = new Set(raw.split(",").filter(Boolean).map(Number));
    for (const [rid, rec] of sensorRoomEls) {
      if (set.has(rid)) rec.card.classList.add("collapsed");
    }
  }

  function collapsedSet() {
    const set = [];
    for (const [rid, rec] of roomEls) if (rec.card.classList.contains("collapsed")) set.push(rid);
    return set;
  }

  function persistCollapsed() {
    try { localStorage.setItem("mld_collapsed", collapsedSet().join(",")); } catch {}
  }

  function allRoomsCollapsed() {
    if (roomEls.size === 0) return true;
    for (const [, rec] of roomEls) if (!rec.card.classList.contains("collapsed")) return false;
    return true;
  }

  function hasCollapsibleRooms() {
    const cat = inTabView() ? activeTab : quickPopupOpenType;
    if (!cat || cat === "lights") return roomEls.size > 0;
    if (cat === "sensors") return sensorRoomEls.size > 0;
    return false;
  }

  function updateExpandAllBtn() {
    if (!EXPAND_ALL_BTN) return;
    const show = hasCollapsibleRooms();
    EXPAND_ALL_BTN.hidden = !show;
    if (!show) return;
    const useSensors = activeTab === "sensors" && sensorRoomEls.size > 0;
    const collapsed = useSensors ? allSensorRoomsCollapsed() : allRoomsCollapsed();
    const label = collapsed ? "Expand all rooms" : "Collapse all rooms";
    EXPAND_ALL_BTN.innerHTML = collapsed ? EXPAND_ALL_SVG : COLLAPSE_ALL_SVG;
    EXPAND_ALL_BTN.setAttribute("aria-label", label);
    EXPAND_ALL_BTN.setAttribute("title", label);
  }

  function collapseAllRooms() {
    for (const [, rec] of roomEls) rec.card.classList.add("collapsed");
    persistCollapsed();
    updateExpandAllBtn();
  }

  function expandAllRooms() {
    for (const [, rec] of roomEls) rec.card.classList.remove("collapsed");
    persistCollapsed();
    updateExpandAllBtn();
  }

  function restoreCollapsed() {
    let raw = null;
    try { raw = localStorage.getItem("mld_collapsed"); } catch {}
    if (raw === null) {
      collapseAllRooms();
      return;
    }
    const set = new Set(raw.split(",").filter(Boolean).map(Number));
    for (const [rid, rec] of roomEls) {
      rec.card.classList.toggle("collapsed", set.has(rid));
    }
    updateExpandAllBtn();
  }

  if (EXPAND_ALL_BTN) {
    EXPAND_ALL_BTN.addEventListener("click", () => {
      if (activeTab === "sensors" && sensorRoomEls.size) {
        if (allSensorRoomsCollapsed()) expandAllSensorRooms();
        else collapseAllSensorRooms();
        persistSensorsCollapsed();
        updateExpandAllBtn();
        return;
      }
      if (allRoomsCollapsed()) expandAllRooms();
      else collapseAllRooms();
    });
  }

  if (REORDER_DONE_BTN) {
    REORDER_DONE_BTN.addEventListener("click", finishReorderMode);
  }

  if (REORDER_CANCEL_BTN) {
    REORDER_CANCEL_BTN.addEventListener("click", cancelReorderMode);
  }

  if (OVERFLOW_BTN) {
    OVERFLOW_BTN.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cfg.enableDrawer) closeDrawer();
      toggleTopbarOverflowMenu();
    });
  }

  if (MENU_REORDER_BTN) {
    MENU_REORDER_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      enterReorderMode();
    });
  }

  if (MENU_ADD_EMBED_BTN) {
    MENU_ADD_EMBED_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      openEmbedEditor(null);
    });
  }

  if (MENU_ADD_TIME_BTN) {
    MENU_ADD_TIME_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      openTimeTileEditor(null);
    });
  }

  if (MENU_ADD_NOTIF_BTN) {
    MENU_ADD_NOTIF_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      void addNotificationTile();
    });
  }

  if (MENU_ADD_HTML_BTN) {
    MENU_ADD_HTML_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      postCall("openHtmlTilePicker");
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && embedExpandState) {
      e.preventDefault();
      closeEmbedExpand();
    }
  });

  if (MENU_HAPTICS_EL) {
    const hapticsLabel = MENU_HAPTICS_EL.closest(".topbar-overflow-check");
    MENU_HAPTICS_EL.checked = cfg.enableHaptics;
    if (hapticsLabel) hapticsLabel.setAttribute("aria-checked", cfg.enableHaptics ? "true" : "false");
    MENU_HAPTICS_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_HAPTICS_EL.addEventListener("change", () => {
      cfg.enableHaptics = MENU_HAPTICS_EL.checked;
      saveHapticsPref(cfg.enableHaptics);
      if (hapticsLabel) hapticsLabel.setAttribute("aria-checked", cfg.enableHaptics ? "true" : "false");
      if (cfg.enableHaptics) testHaptics();
    });
  }

  if (MENU_NOTIF_SOUND_EL) {
    const soundLabel = MENU_NOTIF_SOUND_EL.closest(".topbar-overflow-check");
    MENU_NOTIF_SOUND_EL.checked = cfg.enableNotifSound;
    if (soundLabel) soundLabel.setAttribute("aria-checked", cfg.enableNotifSound ? "true" : "false");
    MENU_NOTIF_SOUND_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_NOTIF_SOUND_EL.addEventListener("change", () => {
      void (async () => {
        const on = MENU_NOTIF_SOUND_EL.checked;
        if (on) {
          unlockNotifAudio();
          await requestNotifSoundPermission();
          cfg.enableNotifSound = true;
          saveNotifSoundPref(true);
          if (soundLabel) soundLabel.setAttribute("aria-checked", "true");
          playNotifWebChime();
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            flash("Notification & trigger sounds on");
          } else {
            flash("Notification & trigger sounds on in app");
          }
          return;
        }
        cfg.enableNotifSound = false;
        saveNotifSoundPref(false);
        if (soundLabel) soundLabel.setAttribute("aria-checked", "false");
        flash("Notification & trigger sounds off");
      })();
    });
  }

  function syncAlertsArmUi() {
    if (!MENU_ALERTS_ARM_WRAP || !MENU_ALERTS_ARM_EL) return;
    const show = !!triggersEnabled && alertsArmSwitchId != null;
    MENU_ALERTS_ARM_WRAP.hidden = !show;
    MENU_ALERTS_ARM_EL.checked = !!alertsArmed;
    MENU_ALERTS_ARM_WRAP.setAttribute("aria-checked", alertsArmed ? "true" : "false");
  }

  if (MENU_ALERTS_ARM_EL) {
    MENU_ALERTS_ARM_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_ALERTS_ARM_EL.addEventListener("change", () => {
      const want = MENU_ALERTS_ARM_EL.checked;
      void postCall("setAlertsArmed", want);
      // Re-sync from hub state after command; optimistic UI for responsiveness.
      MENU_ALERTS_ARM_WRAP?.setAttribute("aria-checked", want ? "true" : "false");
    });
    syncAlertsArmUi();
  }

  if (MENU_TABS_EL) {
    const tabsLabel = MENU_TABS_EL.closest(".topbar-overflow-check");
    MENU_TABS_EL.checked = cfg.enableTabs;
    if (tabsLabel) tabsLabel.setAttribute("aria-checked", cfg.enableTabs ? "true" : "false");
    MENU_TABS_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_TABS_EL.addEventListener("change", () => {
      setTabMode(MENU_TABS_EL.checked);
      if (tabsLabel) tabsLabel.setAttribute("aria-checked", cfg.enableTabs ? "true" : "false");
    });
  }

  if (MENU_DRAWER_EL) {
    const drawerLabel = MENU_DRAWER_EL.closest(".topbar-overflow-check");
    MENU_DRAWER_EL.checked = cfg.enableDrawer;
    if (drawerLabel) drawerLabel.setAttribute("aria-checked", cfg.enableDrawer ? "true" : "false");
    MENU_DRAWER_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_DRAWER_EL.addEventListener("change", () => {
      setDrawerMode(MENU_DRAWER_EL.checked);
    });
  }

  if (MENU_SENSORS_FLAT_EL) {
    const sensorsFlatLabel = MENU_SENSORS_FLAT_EL.closest(".topbar-overflow-check");
    MENU_SENSORS_FLAT_EL.checked = cfg.sensorsFlat;
    if (sensorsFlatLabel) sensorsFlatLabel.setAttribute("aria-checked", cfg.sensorsFlat ? "true" : "false");
    MENU_SENSORS_FLAT_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_SENSORS_FLAT_EL.addEventListener("change", () => {
      cfg.sensorsFlat = MENU_SENSORS_FLAT_EL.checked;
      saveSensorsFlatPref(cfg.sensorsFlat);
      if (sensorsFlatLabel) sensorsFlatLabel.setAttribute("aria-checked", cfg.sensorsFlat ? "true" : "false");
      if (currentCategory() === "sensors") renderSensorsPopup();
      hapticTap();
    });
  }

  const DRAWER_TOGGLE_BTN_REF = document.getElementById("drawer-toggle");
  const DRAWER_BACKDROP_REF = document.getElementById("drawer-backdrop");
  if (DRAWER_TOGGLE_BTN_REF) {
    DRAWER_TOGGLE_BTN_REF.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDrawer();
    });
  }
  if (DRAWER_BACKDROP_REF) {
    DRAWER_BACKDROP_REF.addEventListener("click", closeDrawer);
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawerOpen) closeDrawer();
  });

  if (MENU_THEME_SEGMENT) {
    for (const btn of MENU_THEME_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const theme = btn.dataset.theme;
        if (!THEME_OPTIONS.includes(theme)) return;
        saveThemePref(theme);
        applyTheme(theme);
      });
    }
  }

  if (MENU_CAMERAS_COLS_SEGMENT) {
    for (const btn of MENU_CAMERAS_COLS_SEGMENT.querySelectorAll(".topbar-overflow-seg")) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const cols = Number(btn.dataset.cols);
        if (cols !== 1 && cols !== 2 && cols !== 3) return;
        applyCamerasCols(cols);
        hapticTap();
      });
    }
  }

  if (MENU_OPEN_LOCAL_BTN) {
    MENU_OPEN_LOCAL_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      navigateToLocal();
    });
  }

  if (MENU_OPEN_CLOUD_BTN) {
    MENU_OPEN_CLOUD_BTN.addEventListener("click", () => {
      closeTopbarOverflowMenu();
      navigateToCloud();
    });
  }

  if (MENU_LOCAL_URL_EL) {
    MENU_LOCAL_URL_EL.addEventListener("click", (e) => e.stopPropagation());
    MENU_LOCAL_URL_EL.addEventListener("change", () => {
      const v = MENU_LOCAL_URL_EL.value.trim();
      saveStoredLocalUrl(v);
      cfg.localUrl = v;
      updateLocalModeMenuUI();
    });
    MENU_LOCAL_URL_EL.addEventListener("blur", () => {
      const v = MENU_LOCAL_URL_EL.value.trim();
      saveStoredLocalUrl(v);
      cfg.localUrl = v;
      updateLocalModeMenuUI();
    });
  }

  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (cfg.theme === "auto") applyTheme("auto");
    });
  } catch {}

  applyTheme(cfg.theme);
  applyCamerasCols(cfg.camerasCols);
  updateCamerasLayoutMenuVisibility();
  updateSensorsOrgMenuVisibility();
  updateReorderMenuLabel();

  // ---------- polling ----------
  async function refresh() {
    if (isDashboardGateOpen()) return;
    const schedulerEpoch = postCall("schedulerResponseEpoch");
    try {
      const d = await fetchData();
      refreshLocalUrlFromConfig();
      updateLocalModeMenuUI();
      render(d);
      retainPost3PendingData(d, schedulerEpoch);
      setStatus("");
    } catch (e) {
      setStatus("Cannot reach hub", true);
    }
  }
  function resetUiOnResume() {
    cancelAllSlideGestures();
    closeConfirm(false);
    if (drawerOpen) closeDrawer();
    if (colorSession) closeColorPopup(false);
  }

  let simpleDeviceFeature = null;
  function ensureSimpleDeviceFeature() {
    if (simpleDeviceFeature || !globalThis.MLDFeatures) return simpleDeviceFeature;
    simpleDeviceFeature = registerFeature("simple-devices", MLDFeatures.createSimpleDeviceFeature({
      state: runtime.state,
      services: runtime.services,
      ui: {
        clearOptimistic(type, id) {
          if (type === "lock") clearLockOptimistic(id);
          else if (type === "garage") clearGarageOptimistic(id);
          else if (type === "valve") clearValveOptimistic(id);
        },
        renderSimpleDevices() {
          updateStates();
          const category = currentCategory();
          if (category === "locks") renderLocksPopup();
          else if (category === "sensors") refreshSensorsPopup();
          else if (category === "favorites") postCall("refreshFavoritesPopup");
        },
      },
    }));
    return simpleDeviceFeature;
  }

  // Hubitat event application remains feature-specific; socket ownership and
  // lifecycle are delegated to the injected transport controller below.
  function handleWsMessage(ev) {
      try {
        const m = JSON.parse(ev.data);
        if (!m) return;
        if (m.source === "LOCATION") {
          if (m.name === "hsmStatus") {
            hsmStatus = String(m.value || "");
            clearHsmLock();
            if (currentCategory() === "security") renderSecurityPopup();
          } else if (m.name === "hsmAlert") {
            hsmAlert = String(m.value || "");
            if (m.descriptionText) hsmAlertDesc = String(m.descriptionText);
            clearHsmLock();
            if (currentCategory() === "security") renderSecurityPopup();
          } else if (m.name === "mode") {
            currentHubMode = String(m.value || "");
            clearHubModeLock();
            if (currentCategory() === "hub-mode") renderHubModePopup();
          }
          return;
        }
        if (m.source !== "DEVICE" || m.deviceId == null) return;
        const deviceId = Number(m.deviceId);
        const notifAttr = String(m.name || "");
        postCall("applyHtmlTileLiveAttr", deviceId, notifAttr, m.value);
        if (
          notificationDeviceIds.has(deviceId) &&
          (notifAttr === "notificationText" || notifAttr === "deviceNotification" || notifAttr === "lastMessage")
        ) {
          scheduleNotificationFetchFromWs();
          return;
        }
        if (
          tileNotificationDeviceIds.has(deviceId) &&
          (notifAttr === "notificationText" || notifAttr === "deviceNotification" || notifAttr === "lastMessage")
        ) {
          scheduleTileNotificationFetchFromWs();
          return;
        }
        if (alertsArmSwitchId != null && deviceId === alertsArmSwitchId && notifAttr === "switch") {
          postCall("applyAlertsArmed", String(m.value) === "on");
          postCall("scheduleTriggerFetchFromWs");
          return;
        }
        if (triggerSourceIds.has(deviceId)) {
          postCall("scheduleTriggerFetchFromWs");
        }
        const shade = windowShades.find(x => x.i === deviceId);
        const shadeName = String(m.name || "");
        const shadeEvt = shade && (shadeName === "windowShade" || shadeName === "windowBlind" || shadeName === "position" || shadeName === "level" || shadeName === "switch");
        if (shadeEvt && applyShadeWsEvent(shade, shadeName, m.value)) {
          refreshShadeViews();
          if (shadeName !== "switch" && shadeName !== "level") return;
        }
        const rec = devMap.get(deviceId) || favDevMap.get(deviceId);
        if (rec && !rec.isOutlet) {
          const dev = devices.find((x) => x.i === Number(m.deviceId));
          if (m.name === "switch") {
            const s = (m.value === "on") ? 1 : 0;
            if (dev) dev.s = s;
            clearSwitchOptimistic(Number(m.deviceId));
            updateStates();
          }
          else if (m.name === "level" && rec.isDim) {
            const lvl = Math.round(Number(m.value));
            if (!isNaN(lvl)) {
              if (dev) dev.l = lvl;
              clearSwitchOptimistic(Number(m.deviceId));
              if (!rec.el.classList.contains("dragging")) updateStates();
            }
          }
          else if (m.name === "colorTemperature" && rec.data.ct) {
            const k = Math.round(Number(m.value));
            if (!isNaN(k) && (!colorSession || colorSession.id !== rec.data.i)) {
              rec.data.k = k;
              updateStates();
            }
          }
          else if (m.name === "hue" && rec.data.rgb) {
            const h = Math.round(Number(m.value));
            if (!isNaN(h) && (!colorSession || colorSession.id !== rec.data.i)) {
              rec.data.h = h;
              updateStates();
            }
          }
          else if (m.name === "saturation" && rec.data.rgb) {
            const sat = Math.round(Number(m.value));
            if (!isNaN(sat) && (!colorSession || colorSession.id !== rec.data.i)) {
              rec.data.sat = sat;
              updateStates();
            }
          }
          return;
        }
        if (ensureSimpleDeviceFeature()?.handleHubEvent(m)) return;
        const fan = ceilingFans.find(x => x.i === Number(m.deviceId));
        if (fan) {
          const name = String(m.name || "");
          const opt = fanOptimistic.get(fan.i);
          if (opt && opt.until > Date.now()) return;
          if (name === "switch") {
            fan.s = (m.value === "on") ? 1 : 0;
            if (fan.s === 0) fan.sp = "off";
          } else if (name === "speed") {
            fan.sp = String(m.value || "");
            const sp = fan.sp.toLowerCase();
            if (sp === "off") fan.s = 0;
            else if (sp) fan.s = 1;
          } else return;
          updateFanTile(fan);
          if (currentCategory() === "favorites") postCall("refreshFavoritesPopup");
          return;
        }
        // thermostat / sensor events
        const t = thermostats.find(x => x.i === Number(m.deviceId));
        if (t) {
          const name = String(m.name || "");
          const val = m.value;
          if (name === "thermostatMode" && !tstatModeLocked(t.i)) t.tm = val;
          else if (name === "comfortMode" && !tstatModeLocked(t.i)) t.tm = val;
          else if (name === "thermostatOperatingState" && !tstatModeLocked(t.i)) t.os = val;
          else if (name === "heatingSetpoint") applyTstatSetpoints(t, { hsp: val });
          else if (name === "coolingSetpoint") applyTstatSetpoints(t, { csp: val });
          else if (name === "temperature") { const n = Number(val); if (!isNaN(n)) t.temp = Math.round(n); }
          else if (name === "thermostatFanMode" && !tstatFanModeLocked(t.i)) {
            t.fm = val;
            if (t.hasCfs) t.cfs = val;
          }
          else if (name === "comfortFanSpeed" && !tstatFanModeLocked(t.i)) {
            t.cfs = val;
            t.fm = val;
          }
          else if (name === "fanSpeed") t.fs = val;
          else if (name === "vanePosition" && !tstatVaneLocked(t.i)) t.vp = val;
          else return;
          updateClimateWidgets();
          updateRoomMeta();
          refreshOpenTstatQuickPopups();
          return;
        }
        const s = tempSensors.find(x => x.i === Number(m.deviceId));
        const sen = sensors.find(x => x.i === Number(m.deviceId));
        if (s || sen) {
          if (applySensorLiveAttr(m.deviceId, m.name, m.value, m.unit)) refreshSensorViews();
          return;
        }
      } catch {}
  }

  const lifecycle = MLDLifecycle.createLifecycleController({
    getConfig: () => cfg,
    isHidden: () => document.hidden,
    isGateOpen: isDashboardGateOpen,
    isReorderActive: () => reorderMode,
    location,
    WebSocket,
    refresh,
    onSocketMessage: handleWsMessage,
    onConnectionChange(connection) {
      ws = connection.socket;
      wsConnected = connection.connected;
      wsRetry = connection.retry;
      wsReconnectTimer = connection.reconnectTimer;
    },
    pauseEffects() {
      postCall("stopAlertTone");
      postCall("pauseTriggerCameraOverlay");
    },
    resumeUi: resetUiOnResume,
    defaultPollMs: POLL_DEFAULT,
    socketPollMs: POLL_WS_FALLBACK,
  });

  function effectivePollInterval() { return lifecycle.effectivePollInterval(); }
  function startPolling() { return lifecycle.startPolling(); }
  function restartPolling() { return lifecycle.restartPolling(); }
  function stopPolling() { return lifecycle.stopPolling(); }
  function stopWS() { return lifecycle.stopSocket(); }
  function pauseApp() { return lifecycle.pause(); }
  function syncApp() { return lifecycle.sync(); }
  function resumeApp() { return lifecycle.resume(); }
  function startWS() { return lifecycle.startSocket(); }
  function scheduleReconnect() { return lifecycle.scheduleReconnect(); }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pageWasHidden = true;
      pauseApp();
    } else if (pageWasHidden) {
      pageWasHidden = false;
      resumeApp();
    } else {
      syncApp();
    }
  });
  window.addEventListener("pageshow", (e) => {
    if (document.hidden) return;
    if (e.persisted) resumeApp();
  });

  // ---------- init ----------
  updateExpandAllBtn();
  QUICK_NAV.forEach(({ id, popup, title, svg }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.innerHTML = svg;
    btn.addEventListener("click", () => {
      if (reorderMode) return;
      hapticTap();
      if (tabMode && TAB_CATEGORIES.has(popup)) showTab(popup);
      else openQuickPopup(popup, title);
      if (cfg.enableDrawer) closeDrawer();
    });
  });
  if (QUICK_LIGHTS_BTN) {
    QUICK_LIGHTS_BTN.innerHTML = LIGHTS_SVG;
    QUICK_LIGHTS_BTN.addEventListener("click", () => {
      if (reorderMode) return;
      hapticTap();
      if (tabMode) showTab("lights");
      if (cfg.enableDrawer) closeDrawer();
    });
    QUICK_LIGHTS_BTN.hidden = !tabMode;
  }
  postCall("setupIconTipAffordances");
  postCall("setupQuickNavScrollFade");
  setupNavReorderItems();
  postCall("applyNavOrder", postCall("getDisplayNavOrder"));
  if (CENTRAL_TSTAT_BTN) {
    CENTRAL_TSTAT_BTN.innerHTML = CENTRAL_TSTAT_SVG + '<span>All thermostats</span>';
    CENTRAL_TSTAT_BTN.addEventListener("click", () => {
      hapticTap();
      openCentralTstatPopup();
    });
  }
  if (CENTRAL_MUSIC_BTN) {
    CENTRAL_MUSIC_BTN.innerHTML = CENTRAL_MUSIC_SVG + '<span>All music</span>';
    CENTRAL_MUSIC_BTN.addEventListener("click", () => {
      hapticTap();
      openMusicMasterPopup();
    });
  }
  if (CENTRAL_BLINDS_BTN) {
    CENTRAL_BLINDS_BTN.innerHTML = CENTRAL_BLINDS_SVG + '<span>All blinds</span>';
    CENTRAL_BLINDS_BTN.addEventListener("click", () => {
      hapticTap();
      openShadeMasterPopup();
    });
  }
  if (CENTRAL_FAN_BTN) {
    CENTRAL_FAN_BTN.innerHTML = CENTRAL_FANS_SVG + '<span>All fans</span>';
    CENTRAL_FAN_BTN.addEventListener("click", () => {
      hapticTap();
      openFanMasterPopup();
    });
  }
  if (tabMode) { ensureTabView(); updateTabActiveStates(); }
  if (cfg.enableDrawer) setDrawerMode(true);
  updateCurrentCategoryTitle();

  // Password gate UI lives here (post2) so mld-app.js stays under Hubitat's 128 KB
  // File Manager limit — putting it in part1 previously left only ~3 KB headroom.
  let dashGateRecheckTimer = null;
  const DASH_GATE_RECHECK_MS = 8000;

  function stopDashGateRecheck() {
    if (dashGateRecheckTimer) {
      clearInterval(dashGateRecheckTimer);
      dashGateRecheckTimer = null;
    }
  }

  function syncDashboardAuthState(required) {
    if (required) {
      dashboardPasswordRequired = true;
      return;
    }
    dashboardPasswordRequired = false;
    clearDashSession();
    if (isDashboardGateOpen()) {
      const resolve = gateState?.resolve;
      stopDashGateRecheck();
      closeDashboardGate();
      resolve?.();
    }
  }

  async function fetchAuthStatus() {
    const r = await fetchWithTimeout(withToken("auth/status"), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function recheckDashboardAuthWhileGateOpen() {
    if (!isDashboardGateOpen()) {
      stopDashGateRecheck();
      return;
    }
    try {
      const status = await fetchAuthStatus();
      if (!status?.required) syncDashboardAuthState(false);
    } catch {}
  }

  function startDashGateRecheck() {
    stopDashGateRecheck();
    dashGateRecheckTimer = setInterval(recheckDashboardAuthWhileGateOpen, DASH_GATE_RECHECK_MS);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isDashboardGateOpen()) {
      recheckDashboardAuthWhileGateOpen();
    }
  });

  async function unlockDashboard(password) {
    async function parseUnlockResponse(r) {
      let data = {};
      try { data = await r.json(); } catch {}
      if (r.status === 403 || data.error === "wrong password") {
        return { ok: false, error: "wrong password" };
      }
      if (!r.ok) {
        const hubMsg = data?.detail || data?.message || data?.errorMessage || data?.msg;
        const err = data?.error;
        let msg = "Unlock failed";
        if (typeof hubMsg === "string" && hubMsg.trim()) msg = hubMsg.trim();
        else if (typeof err === "string" && err.trim()) msg = err.trim();
        else if (err != null && err !== true) msg = String(err);
        return { ok: false, error: msg };
      }
      if (data?.required === false) {
        syncDashboardAuthState(false);
        return { ok: true };
      }
      if (!data?.session && !data?.dashSession) {
        return { ok: false, error: "Unlock failed" };
      }
      applyDashSessionFromResponse(data);
      return { ok: true };
    }
    try {
      const postUrl = withToken("auth/unlock");
      let r = await fetchWithTimeout(postUrl, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password }),
      });
      let result = await parseUnlockResponse(r);
      if (result.ok || result.error === "wrong password") return result;
      const sep = postUrl.includes("?") ? "&" : "?";
      r = await fetchWithTimeout(postUrl + sep + "password=" + encodeURIComponent(password), {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      return parseUnlockResponse(r);
    } catch {
      return { ok: false, error: "Unlock failed" };
    }
  }

  function ensureDashboardGatePopup() {
    if (gatePopup) return gatePopup;
    gatePopup = ce("div", "dash-gate-popup");
    gatePopup.hidden = true;
    gatePopup.setAttribute("role", "dialog");
    gatePopup.setAttribute("aria-modal", "true");
    gatePopup.setAttribute("aria-label", "Dashboard password");
    const panel = ce("div", "dash-gate-panel");
    const title = ce("h2", "dash-gate-title");
    title.textContent = "Enter dashboard password";
    const error = ce("p", "dash-gate-error");
    error.hidden = true;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-live", "polite");
    const input = ce("input", "dash-gate-input");
    input.type = "password";
    input.autocomplete = "current-password";
    input.placeholder = "Password";
    input.spellcheck = false;
    const submit = ce("button", "confirm-btn dash-gate-submit");
    submit.type = "button";
    submit.textContent = "Unlock";
    panel.appendChild(title);
    panel.appendChild(error);
    panel.appendChild(input);
    panel.appendChild(submit);
    gatePopup.appendChild(panel);
    appendPopup(gatePopup);

    async function submitGate() {
      hapticTap();
      const password = input.value;
      if (!password) return;
      submit.disabled = true;
      const result = await unlockDashboard(password);
      submit.disabled = false;
      if (result.ok) {
        error.hidden = true;
        error.textContent = "";
        const resolve = gateState?.resolve;
        closeDashboardGate();
        resolve?.();
        return;
      }
      error.textContent = result.error === "wrong password" ? "Wrong password" : (result.error || "Unlock failed");
      error.hidden = false;
      gatePopup.classList.remove("shake");
      void gatePopup.offsetWidth;
      gatePopup.classList.add("shake");
      input.select();
    }

    submit.addEventListener("click", (e) => {
      e.stopPropagation();
      submitGate();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitGate();
      }
    });

    gatePopup._title = title;
    gatePopup._error = error;
    gatePopup._input = input;
    gatePopup._submit = submit;
    return gatePopup;
  }

  function openDashboardGate() {
    const popup = ensureDashboardGatePopup();
    const alreadyOpen = popup.classList.contains("open") && gateState?.resolve;
    if (!alreadyOpen) {
      popup._error.hidden = true;
      popup._error.textContent = "";
      popup._input.value = "";
    }
    popup.hidden = false;
    popup.classList.remove("shake");
    popup.classList.add("open");
    startDashGateRecheck();
    if (!alreadyOpen) requestAnimationFrame(() => popup._input.focus());
  }

  function closeDashboardGate() {
    if (!gatePopup) return;
    stopDashGateRecheck();
    gatePopup.classList.remove("open", "shake");
    gatePopup.hidden = true;
    gateState = null;
    syncNotificationPopup();
    void postCall("fetchTriggerActions");
  }

  function promptDashboardPassword() {
    return new Promise((resolve) => {
      gateState = { resolve };
      openDashboardGate();
    });
  }

  async function ensureDashboardAccess() {
    if (ensureDashboardAccessTask) return ensureDashboardAccessTask;
    ensureDashboardAccessTask = (async () => {
      loadDashSession();
      let status;
      try {
        status = await fetchAuthStatus();
      } catch {
        try {
          status = await fetchAuthStatus();
        } catch {
          return;
        }
      }
      if (!status?.required) {
        syncDashboardAuthState(false);
        return;
      }
      syncDashboardAuthState(true);
      if (isDashSessionFresh()) {
        setupDashSessionActivityRenewal();
        return;
      }
      await promptDashboardPassword();
      // Unlock writes localStorage via applyDashSessionFromResponse; re-sync before /data.
      loadDashSession();
      setupDashSessionActivityRenewal();
    })();
    try {
      await ensureDashboardAccessTask;
    } finally {
      ensureDashboardAccessTask = null;
    }
  }

  let post3LoadPromise = null;
  let post3LoadFailed = false;
  let post3PendingData = null;

  function isPost3Ready() {
    return typeof globalThis.__MLD?.renderSchedulerView === "function"
      && typeof globalThis.__MLD?.refreshCamerasPopup === "function";
  }

  function resolvePost3Src() {
    const meta = document.querySelector('meta[name="mld-post3"]');
    const raw = (meta?.getAttribute("content") || "").trim();
    if (raw) {
      if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("/local/")) return raw;
      return withToken(raw);
    }
    const sibling = document.querySelector('script[src*="app-post2.js"], script[src*="mld-app-post2.js"]');
    if (sibling?.src) {
      return sibling.src
        .replace("mld-app-post2.js", "mld-app-post3.js")
        .replace("app-post2.js", "app-post3.js");
    }
    return withToken("app-post3.js");
  }

  function ensurePost3Loaded() {
    if (isPost3Ready()) {
      post3LoadFailed = false;
      return Promise.resolve(true);
    }
    if (post3LoadPromise) return post3LoadPromise;
    post3LoadFailed = false;
    post3LoadPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = resolvePost3Src();
      script.async = true;
      script.onload = () => {
        post3LoadPromise = null;
        post3LoadFailed = !isPost3Ready();
        resolve(isPost3Ready());
      };
      script.onerror = () => {
        post3LoadPromise = null;
        post3LoadFailed = true;
        resolve(false);
      };
      document.head.appendChild(script);
    });
    return post3LoadPromise;
  }

  function applySchedulesFromDataSafe(d, requestEpoch) {
    const apply = globalThis.__MLD?.applySchedulesFromData;
    if (typeof apply !== "function") return;
    try {
      apply(d, requestEpoch);
    } catch (e) {
      console.warn("Modern Dashboard: applySchedulesFromData failed", e);
    }
  }

  function retainPost3PendingData(d, requestEpoch) {
    if (!isPost3Ready()) {
      post3PendingData = d;
      return;
    }
    applySchedulesFromDataSafe(d, requestEpoch);
  }

  function applyPendingPost3Data() {
    const d = post3PendingData;
    post3PendingData = null;
    if (!d) return;
    applySchedulesFromDataSafe(d);
    updateQuickNavVisibility();
  }

  async function loadPost3AfterFirstRender() {
    const ok = await ensurePost3Loaded();
    if (!ok) {
      setStatus("Cameras/scheduler module failed to load — open those tabs to retry", true);
      return;
    }
    applyPendingPost3Data();
  }

  function showDeferredModuleLoading(label) {
    const body = currentBody();
    if (!body) return;
    if (body === tabViewEl) body.className = "tab-view tab-body";
    else body.className = "quick-body";
    body.innerHTML = '<div class="loading"><div class="spinner"></div>Loading ' + label + "…</div>";
  }

  function showDeferredModuleError(id, label) {
    const body = currentBody();
    if (!body) return;
    if (body === tabViewEl) body.className = "tab-view tab-body";
    else body.className = "quick-body";
    body.innerHTML =
      '<div class="empty"><h2>Could not load ' + label + "</h2>" +
      "<p>Check your connection and try again.</p>" +
      '<p><button type="button" class="ghost-btn" id="mld-retry-post3">Retry</button></p></div>';
    body.querySelector("#mld-retry-post3")?.addEventListener("click", () => {
      post3LoadFailed = false;
      void activateDeferredModule(id);
    });
  }

  function deferredModuleStillActive(id) {
    if (tabMode && activeTab === id) return true;
    if (quickPopupOpenType === id) return true;
    return false;
  }

  async function activateDeferredModule(id) {
    const label = id === "cameras" ? "cameras" : "scheduler";
    if (isPost3Ready()) {
      if (id === "cameras") postCall("refreshCamerasPopup");
      else postCall("renderSchedulerView");
      return;
    }
    showDeferredModuleLoading(label);
    const ok = await ensurePost3Loaded();
    if (!deferredModuleStillActive(id)) return;
    if (!ok) {
      showDeferredModuleError(id, label);
      setStatus("Failed to load " + label + " module", true);
      return;
    }
    applyPendingPost3Data();
    if (!deferredModuleStillActive(id)) return;
    if (id === "cameras") postCall("refreshCamerasPopup");
    else postCall("renderSchedulerView");
  }

  function finishDashboardBoot(d) {
    if (applyLocalModeStrategy()) return false;
    // /data reports password state; arm renewal when a saved session is active.
    if (dashboardPasswordRequired && isDashSessionFresh()) {
      setupDashSessionActivityRenewal();
    }
    render(d);
    applyDefaultTabIfNeeded();
    retainPost3PendingData(d);
    void loadPost3AfterFirstRender();
    initAndroidLocalImmersive();
    startPolling();
    startWS();
    return true;
  }

  // Data-first startup: skip /auth/status on the common path. Password-disabled
  // dashboards and valid sessions load /data immediately. On 401, getJson()
  // opens the gate via ensureDashboardAccess() and retries.
  (async function init() {
    syncEmbedStateToMld();
    consumePreferCloudParam();
    loadingState();
    try {
      const d = await fetchData();
      finishDashboardBoot(d);
    } catch (e) {
      console.error("Dashboard init failed:", e);
      // getJson already prompts on 401; only recover here if that path threw auth_required.
      if (e?.code === "auth_required" || /auth required/i.test(String(e?.message || ""))) {
        try {
          loadDashSession();
          if (!isDashSessionFresh()) await ensureDashboardAccess();
          const d = await fetchData();
          finishDashboardBoot(d);
          return;
        } catch (retryErr) {
          console.error("Dashboard auth retry failed:", retryErr);
        }
      }
      const cloud = String(cfg.cloudUrl || loadStoredCloudUrl() || "").trim();
      if (isLocalOrigin() && cloud) {
        cfg.cloudUrl = cloud;
        navigateToCloud();
        return;
      }
      const detail = e?.message ? String(e.message) : "";
      setStatus("Cannot reach hub. Make sure you opened the dashboard via the app URL.", true);
      emptyState(
        '<div class="empty"><h2>Connection error</h2>' +
        'Could not load /data. Open this page through the Modern Dashboard app URL on your hub.' +
        (detail ? '<p class="empty-detail">' + detail.replace(/</g, "&lt;") + '</p>' : '') +
        (cloud ? '<p class="empty-detail"><button type="button" class="ghost-btn" id="fallback-cloud-btn">Open cloud mode</button></p>' : '') +
        '</div>'
      );
      const fallbackBtn = document.getElementById("fallback-cloud-btn");
      if (fallbackBtn) {
        fallbackBtn.addEventListener("click", () => {
          cfg.cloudUrl = cloud;
          navigateToCloud();
        });
      }
    }
  })();

  if (globalThis.__MLD) globalThis.__MLD.updateQuickNavVisibility = updateQuickNavVisibility;

  // HTML title editor + picker live in post2; card helpers live in post.js so
  // post3 can keep scheduler/cameras under Hubitat Cloud's ~122 KB JS limit.
  function closeHtmlTileTitleEditor() {
    const popup = document.getElementById("fav-html-title-editor");
    if (popup) popup.remove();
    htmlTitleEditorOpen = false;
    syncEmbedStateToMld();
  }

  function openHtmlTileTitleEditor(tile) {
    if (postCall("isFavoritesReorderActive")) {
      flash("Finish reordering favorites first", true);
      return;
    }
    closeHtmlTileTitleEditor();
    const popup = ce("div", "confirm-popup open fav-html-title-editor");
    popup.id = "fav-html-title-editor";
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-labelledby", "fav-html-title-editor-heading");
    const panel = ce("div", "confirm-panel fav-embed-editor-panel");
    const heading = ce("h2", "fav-embed-editor-heading");
    heading.id = "fav-html-title-editor-heading";
    heading.textContent = "Rename HTML tile";
    const help = ce("p", "fav-embed-editor-help");
    help.textContent = "Tile Builder names live in driver state and are not readable by mDash. Set a display name here (syncs across devices).";
    const titleLabel = ce("label", "fav-embed-field");
    const titleSpan = ce("span");
    titleSpan.textContent = "Display name";
    const titleInput = ce("input", "topbar-overflow-input fav-embed-title-input");
    titleInput.type = "text";
    titleInput.maxLength = MAX_EMBED_TITLE;
    titleInput.value = tile.title || tile.attribute || "HTML";
    titleLabel.appendChild(titleSpan);
    titleLabel.appendChild(titleInput);
    const err = ce("div", "fav-embed-editor-error");
    err.hidden = true;
    const actions = ce("div", "confirm-actions");
    const cancel = ce("button", "ghost-btn confirm-cancel");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    const save = ce("button", "confirm-btn");
    save.type = "button";
    save.textContent = "Save";
    actions.appendChild(cancel);
    actions.appendChild(save);
    panel.appendChild(heading);
    panel.appendChild(help);
    panel.appendChild(titleLabel);
    panel.appendChild(err);
    panel.appendChild(actions);
    popup.appendChild(panel);
    appendPopup(popup);
    const close = () => closeHtmlTileTitleEditor();
    cancel.addEventListener("click", close);
    bindPopupDismiss(popup, panel, null, close);
    save.addEventListener("click", async () => {
      const nextTitle = normalizeHtmlTileTitle(titleInput.value, tile.attribute);
      if (!nextTitle) {
        err.hidden = false;
        err.textContent = "Enter a display name";
        return;
      }
      err.hidden = true;
      const idx = htmlTiles.findIndex((candidate) => candidate.id === tile.id);
      const prevTitle = idx >= 0 ? htmlTiles[idx].title : tile.title;
      const prevOverride = htmlTileTitleOverrides[tile.id];
      const liveTitle = tile.liveTitle || (idx >= 0 ? htmlTiles[idx].liveTitle : null) || tile.attribute;
      if (idx >= 0) htmlTiles[idx] = { ...htmlTiles[idx], title: nextTitle, liveTitle: liveTitle || htmlTiles[idx].liveTitle };
      tile.title = nextTitle;
      if (!tile.liveTitle && liveTitle) tile.liveTitle = liveTitle;
      if (nextTitle === liveTitle) delete htmlTileTitleOverrides[tile.id];
      else htmlTileTitleOverrides[tile.id] = nextTitle;
      syncEmbedStateToMld();
      save.disabled = true;
      const saved = await persistFavoriteLayout(favoritesLayout);
      save.disabled = false;
      if (!saved) {
        if (idx >= 0) htmlTiles[idx] = { ...htmlTiles[idx], title: prevTitle };
        tile.title = prevTitle;
        if (prevOverride == null) delete htmlTileTitleOverrides[tile.id];
        else htmlTileTitleOverrides[tile.id] = prevOverride;
        syncEmbedStateToMld();
        return;
      }
      close();
      lastDataSig = "";
      favPopupSig = "";
      if (currentCategory() === "favorites") renderFavoritesPopup();
      flash("HTML tile renamed");
    });
    htmlTitleEditorOpen = true;
    syncEmbedStateToMld();
    requestAnimationFrame(() => {
      titleInput.focus();
      titleInput.select();
    });
  }

  function openHtmlTilePicker() {
    if (postCall("isFavoritesReorderActive")) {
      flash("Finish reordering favorites first", true);
      return;
    }
    const popup = ce("div", "confirm-popup open");
    popup.setAttribute("role", "dialog");
    popup.setAttribute("aria-modal", "true");
    popup.setAttribute("aria-labelledby", "fav-html-picker-title");
    const panel = ce("div", "confirm-panel fav-html-picker-panel");
    const heading = ce("h2", "fav-embed-editor-heading");
    heading.id = "fav-html-picker-title";
    heading.textContent = "Add HTML tiles";
    panel.appendChild(heading);
    const selected = new Set();
    const existing = new Set(favoritesLayout.filter((key) => key.startsWith("h:")));
    const available = htmlTiles.filter((tile) => !existing.has(htmlFavoriteKey(tile.id)));
    const list = ce("div", "fav-html-picker-list");
    if (!htmlTiles.length) {
      const empty = ce("p", "fav-embed-editor-help");
      empty.textContent = "Select HTML source devices in the Modern Dashboard Hubitat app settings, then return here.";
      panel.appendChild(empty);
    } else if (!available.length) {
      const empty = ce("p", "fav-embed-editor-help");
      empty.textContent = "All configured HTML sources are already in Favorites.";
      panel.appendChild(empty);
    } else {
      const help = ce("p", "fav-embed-editor-help");
      help.textContent = "Choose one or more configured device attributes.";
      panel.appendChild(help);
      for (const tile of available) {
        const option = ce("label", "fav-html-picker-option");
        const input = ce("input");
        input.type = "checkbox";
        input.value = tile.id;
        const copy = ce("span", "fav-html-picker-copy");
        const name = ce("span", "fav-html-picker-name");
        name.textContent = tile.title || tile.attribute || "HTML";
        const meta = ce("span", "fav-html-picker-meta");
        meta.textContent = "Device " + tile.deviceId + " · " + tile.attribute;
        copy.appendChild(name);
        copy.appendChild(meta);
        option.appendChild(input);
        option.appendChild(copy);
        list.appendChild(option);
        input.addEventListener("change", () => {
          if (input.checked) selected.add(tile.id);
          else selected.delete(tile.id);
          addBtn.disabled = selected.size === 0;
        });
      }
      panel.appendChild(list);
    }
    const actions = ce("div", "confirm-actions");
    const cancel = ce("button", "ghost-btn confirm-cancel");
    cancel.type = "button";
    cancel.textContent = available.length ? "Cancel" : "Close";
    const addBtn = ce("button", "confirm-btn");
    addBtn.type = "button";
    addBtn.textContent = "Add selected";
    addBtn.disabled = true;
    if (available.length) actions.appendChild(addBtn);
    actions.appendChild(cancel);
    panel.appendChild(actions);
    popup.appendChild(panel);
    const close = () => popup.remove();
    cancel.addEventListener("click", close);
    bindPopupDismiss(popup, panel, null, close);
    addBtn.addEventListener("click", async () => {
      if (!selected.size) return;
      const previousLayout = favoritesLayout.slice();
      const nextLayout = favoritesLayout.slice();
      for (const id of selected) {
        const key = htmlFavoriteKey(id);
        if (!nextLayout.includes(key)) nextLayout.push(key);
      }
      replaceList(favoritesLayout, nextLayout);
      addBtn.disabled = true;
      const saved = await persistFavoriteLayout(nextLayout);
      if (!saved) {
        replaceList(favoritesLayout, previousLayout);
        addBtn.disabled = false;
        return;
      }
      close();
      try {
        const data = await fetchData();
        render(data);
      } catch {
        if (currentCategory() === "favorites") renderFavoritesPopup();
      }
      updateQuickNavVisibility();
      flash(selected.size === 1 ? "HTML tile added" : selected.size + " HTML tiles added");
    });
    appendPopup(popup);
    requestAnimationFrame(() => {
      const first = list.querySelector("input") || cancel;
      first.focus();
    });
  }
