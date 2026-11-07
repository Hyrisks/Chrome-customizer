// Draws the background. Runs inside an iframe on google.com and on the new tab page.
(async function () {
  'use strict';

  const layer = document.getElementById('layer');
  const dimEl = document.getElementById('dim');

  let s = await GQ.getSettings();
  let media = null;
  let objectUrl = null;
  let nat = { w: 0, h: 0 };
  let loadedKey = '';
  let holdUntil = 0; // ignore storage echoes while we are saving our own drag/zoom
  let slideRun = 0;  // changes whenever the slideshow is stopped/restarted
  let slideTimer = null;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const keyOf = () => s.type === 'slideshow'
    ? 'slideshow|' + (s.slides || []).map((x) => [x.id, x.kind, x.source, x.src].join(':')).join(',')
    : [s.type, s.src, s.kind, s.fileId].join('|');

  function clearMedia() {
    if (media) { media.remove(); media = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
    nat = { w: 0, h: 0 };
  }

  // Size and position the picture. px/py choose which part shows when it doesn't fit.
  function place() {
    if (!media || !nat.w || !nat.h) return;
    const W = window.innerWidth, H = window.innerHeight;
    const z = s.zoom / 100;
    let dw, dh;
    if (s.fit === 'stretch') {
      dw = W * z; dh = H * z;
    } else {
      const k = (s.fit === 'contain' ? Math.min : Math.max)(W / nat.w, H / nat.h) * z;
      dw = nat.w * k; dh = nat.h * k;
    }
    const ox = dw - W, oy = dh - H;
    media.style.width = dw + 'px';
    media.style.height = dh + 'px';
    media.style.left = (ox > 0 ? -(s.px / 100) * ox : (W - dw) / 2) + 'px';
    media.style.top = (oy > 0 ? -(s.py / 100) * oy : (H - dh) / 2) + 'px';
  }

  function paint() {
    const flat = s.type === 'color' || s.type === 'none';
    layer.style.backgroundColor = flat ? s.color : '#000';
    const d = clamp(Number(s.dim) || 0, 0, 80) / 100;
    dimEl.style.background = `rgba(0,0,0,${d})`;
    place();
  }

  // ---------- slideshow ----------
  function stopSlides() {
    slideRun++;
    clearTimeout(slideTimer);
  }

  // Fade the next slide in over the current one, then remove the old one.
  function swapTo(m, url) {
    const prev = media, prevUrl = objectUrl;
    media = m.el;
    nat = m.nat;
    objectUrl = url;
    media.style.opacity = '0';
    media.style.transition = 'opacity .7s';
    layer.insertBefore(media, dimEl);
    place();
    if (media.tagName === 'VIDEO') media.play().catch(() => {});
    requestAnimationFrame(() => requestAnimationFrame(() => { if (media === m.el) media.style.opacity = '1'; }));
    if (prev) {
      setTimeout(() => {
        prev.remove();
        if (prevUrl) URL.revokeObjectURL(prevUrl);
      }, 800);
    }
  }

  async function showSlide(run, i, failed) {
    if (run !== slideRun) return;
    const list = s.slides || [];
    if (!list.length) return;
    i = i % list.length;
    const item = list[i];

    let src = null, url = null;
    if (item.source === 'file') {
      let blob = null;
      try { blob = await GQ.getFile('slide:' + item.id); } catch (e) { /* ignore */ }
      if (run !== slideRun) return;
      if (blob) { url = URL.createObjectURL(blob); src = url; }
    } else {
      src = item.src;
    }
    const m = src ? await GQ.buildMedia(src, item.kind) : null;
    if (run !== slideRun) { if (url) URL.revokeObjectURL(url); return; }

    if (!m) { // broken item: skip it (stop if every item is broken)
      if (url) URL.revokeObjectURL(url);
      if (failed + 1 >= list.length) return;
      return showSlide(run, i + 1, failed + 1);
    }

    swapTo(m, url);
    if (list.length < 2) { m.el.loop = true; return; } // a single slide just stays (videos loop)

    if (item.kind === 'video') {
      m.el.loop = false;
      m.el.onended = () => showSlide(run, i + 1, 0); // after the last one, i+1 wraps to the first
    } else {
      const secs = clamp(Number(s.slideSecs) || 10, 2, 600);
      slideTimer = setTimeout(() => showSlide(run, i + 1, 0), secs * 1000);
    }
  }

  // ---------- single image / GIF / video ----------
  async function sync() {
    const k = keyOf();
    if (k !== loadedKey) {
      loadedKey = k;
      stopSlides();
      clearMedia();
      if (s.type === 'slideshow') {
        showSlide(slideRun, 0, 0);
      } else {
        let src = null, url = null;
        if (s.type === 'url') {
          src = s.src;
        } else if (s.type === 'file') {
          let blob = null;
          try { blob = await GQ.getFile(); } catch (e) { /* ignore */ }
          if (k !== loadedKey) return;
          if (blob) { url = URL.createObjectURL(blob); src = url; }
        }
        if (src) {
          const m = await GQ.buildMedia(src, s.kind);
          if (k !== loadedKey) { if (url) URL.revokeObjectURL(url); return; }
          if (m) {
            media = m.el;
            nat = m.nat;
            objectUrl = url;
            layer.insertBefore(media, dimEl);
            if (media.tagName === 'VIDEO') media.play().catch(() => {});
          } else if (url) {
            URL.revokeObjectURL(url);
          }
        }
      }
    }
    paint();
  }

  window.addEventListener('resize', place);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    if (Date.now() < holdUntil) return;
    s = GQ.merge(changes.settings.newValue);
    sync();
  });

  // Messages from the page hosting this iframe (drag to reposition, wheel to zoom).
  let drag = null;
  let zoomTimer = null;
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent) return;
    const d = e.data || {};
    if (d.gq === 'dragstart') {
      drag = {
        px0: s.px, py0: s.py,
        ox: media ? media.offsetWidth - window.innerWidth : 0,
        oy: media ? media.offsetHeight - window.innerHeight : 0,
      };
    } else if (d.gq === 'dragmove' && drag) {
      if (drag.ox > 0) s.px = clamp(drag.px0 - (d.dx / drag.ox) * 100, 0, 100);
      if (drag.oy > 0) s.py = clamp(drag.py0 - (d.dy / drag.oy) * 100, 0, 100);
      place();
    } else if (d.gq === 'dragend' && drag) {
      drag = null;
      holdUntil = Date.now() + 800;
      GQ.update({ px: s.px, py: s.py });
    } else if (d.gq === 'zoom') {
      s.zoom = clamp(s.zoom + (d.dir < 0 ? 5 : -5), 100, 400);
      place();
      holdUntil = Date.now() + 800;
      clearTimeout(zoomTimer);
      zoomTimer = setTimeout(() => GQ.update({ zoom: s.zoom }), 250);
    }
  });

  sync();
})();
