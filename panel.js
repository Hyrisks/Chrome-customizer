// Settings panel. Runs inside an iframe on google.com and on the new tab page.
(async function () {
  'use strict';

  const MAX_FILE_MB = 200;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const isNewTab = new URLSearchParams(location.search).get('ctx') === 'newtab';
  if (isNewTab) $('footer-sec').hidden = true;

  let s = await GQ.getSettings();
  let msgTimer = null;

  const msg = (t, ok) => {
    $('msg').textContent = t;
    $('msg').className = ok ? 'ok' : '';
    clearTimeout(msgTimer);
    if (t) msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 4500);
  };
  const debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const kindOfUrl = (u) => (/\.(mp4|webm|m4v|mov)(\?|#|$)/i.test(u) ? 'video' : 'image');

  // ---------- tabs ----------
  function showTab(name) {
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
    ['bg', 'page'].forEach((n) => { $('tab-' + n).hidden = n !== name; });
  }
  $$('.tab').forEach((t) => { t.onclick = () => showTab(t.dataset.tab); });

  // ---------- Background: Single / Slideshow, and the single source ----------
  let view = s.type === 'slideshow' ? 'slideshow' : 'single';
  let pane = ['color', 'url', 'file'].includes(s.type) ? s.type : 'color';

  // Size controls only matter for pictures and videos
  function updateSizeGroup() {
    $('size-group').hidden = view === 'single' && pane === 'color';
  }
  function showView(v) {
    view = v;
    $$('.viewbtn').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('view-single').hidden = v !== 'single';
    $('view-show').hidden = v !== 'slideshow';
    updateSizeGroup();
  }
  function showPane(p) {
    pane = p;
    $$('.srcbtn').forEach((b) => b.classList.toggle('on', b.dataset.src === p));
    ['color', 'url', 'file'].forEach((n) => { $('src-' + n).hidden = n !== p; });
    updateSizeGroup();
  }
  $$('.srcbtn').forEach((b) => { b.onclick = () => showPane(b.dataset.src); });

  // what to go back to when the slideshow is turned off
  function singleFallback() {
    const t = s.lastSingle;
    if (t === 'color') return 'color';
    if (t === 'url' && s.src) return 'url';
    if (t === 'file' && s.fileId) return 'file';
    return 'none';
  }
  async function startSlideshow() {
    s = await GQ.update({ type: 'slideshow', lastSingle: s.type === 'slideshow' ? s.lastSingle : s.type });
    msg('Slideshow playing.', true);
  }
  async function stopSlideshow() {
    s = await GQ.update({ type: singleFallback() });
  }

  $$('.viewbtn').forEach((b) => {
    b.onclick = async () => {
      const v = b.dataset.view;
      if (v === view) return;
      showView(v);
      if (v === 'slideshow') {
        if ((s.slides || []).length) await startSlideshow();
        else msg('Add some images, GIFs or videos to start.', true);
      } else if (s.type === 'slideshow') {
        await stopSlideshow();
      }
    };
  });

  // ---------- slideshow list ----------
  function renderSlides() {
    const box = $('slides');
    box.innerHTML = '';
    const list = s.slides || [];
    list.forEach((sl, i) => {
      const row = document.createElement('div');
      row.className = 'slide-row';

      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = i + 1;

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = sl.name || sl.src;
      name.title = sl.name || sl.src;

      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = sl.kind === 'video' ? 'video' : 'image';

      const mk = (label, title, disabled, fn) => {
        const b = document.createElement('button');
        b.className = 'ib';
        b.textContent = label;
        b.title = title;
        b.setAttribute('aria-label', title);
        b.disabled = disabled;
        b.onclick = fn;
        return b;
      };
      const move = (from, to) => {
        const next = list.slice();
        const [it] = next.splice(from, 1);
        next.splice(to, 0, it);
        saveSlides(next);
      };

      row.append(
        num, name, tag,
        mk('▲', 'Move up', i === 0, () => move(i, i - 1)),
        mk('▼', 'Move down', i === list.length - 1, () => move(i, i + 1)),
        mk('✕', 'Remove', false, async () => {
          if (sl.source === 'file') await GQ.delFile('slide:' + sl.id);
          saveSlides(list.filter((x) => x.id !== sl.id));
        })
      );
      box.appendChild(row);
    });
  }

  async function saveSlides(slides) {
    s = await GQ.update({ slides });
    // removing the last slide ends the slideshow
    if (!slides.length && s.type === 'slideshow') await stopSlideshow();
    renderSlides();
  }

  // adding slides while the Slideshow type is chosen starts playing
  async function afterAdd() {
    if (view === 'slideshow' && s.type !== 'slideshow' && (s.slides || []).length) await startSlideshow();
  }

  // ---------- keep the controls in step with the saved settings ----------
  function syncInputs() {
    const set = (id, prop, val) => {
      const el = $(id);
      if (document.activeElement !== el) el[prop] = val;
    };
    set('color', 'value', s.color);
    set('zoom', 'value', s.zoom);
    set('dim', 'value', s.dim);
    set('slidesecs', 'value', s.slideSecs);
    set('url', 'value', s.type === 'url' ? s.src : '');
    $('zoomval').textContent = s.zoom + '%';
    $('dimval').textContent = s.dim + '%';
    $('footer').checked = !!s.hideFooter;
    $$('.fitbtn').forEach((b) => b.classList.toggle('on', b.dataset.fit === s.fit));
    $$('.opt').forEach((b) => b.classList.toggle('on', b.dataset.mode === s.logoMode));
    updateClockSamples();
    renderSlides();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const prevType = s.type;
      s = GQ.merge(changes.settings.newValue);
      if (s.type !== prevType) {
        if (s.type === 'slideshow') showView('slideshow');
        else if (prevType === 'slideshow') showView('single');
        if (['color', 'url', 'file'].includes(s.type)) showPane(s.type);
      }
      syncInputs();
    }
  });

  $('close').onclick = () => parent.postMessage({ gq: 'closePanel' }, '*');

  // ================= Background: Single =================
  const saveColor = debounce(async () => { s = await GQ.update({ color: $('color').value }); }, 60);
  $('usecolor').onclick = async () => {
    s = await GQ.update({ type: 'color', color: $('color').value });
    msg('Colour applied.', true);
  };
  $('color').oninput = () => { if (s.type === 'color') saveColor(); };

  $('useurl').onclick = async () => {
    const url = $('url').value.trim();
    if (!/^https?:\/\//i.test(url)) { msg('Paste a full link starting with https://'); return; }
    const kind = kindOfUrl(url);
    msg('Loading…', true);
    const m = await GQ.buildMedia(url, kind);
    if (!m) {
      msg("Couldn't load that link. Try a direct image/GIF/MP4 link, or upload the file.");
      return;
    }
    s = await GQ.update({ type: 'url', kind, src: url, px: 50, py: 50, zoom: 100 });
    msg('Background applied.', true);
  };

  $('file').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const isVideo = f.type.startsWith('video/');
    const isImage = f.type.startsWith('image/');
    if (!isVideo && !isImage) { msg('That is not an image, GIF or video.'); return; }
    if (f.size > MAX_FILE_MB * 1024 * 1024) { msg(`File is over ${MAX_FILE_MB} MB.`); return; }
    const kind = isVideo ? 'video' : 'image';
    msg('Loading…', true);
    const testUrl = URL.createObjectURL(f);
    const m = await GQ.buildMedia(testUrl, kind);
    URL.revokeObjectURL(testUrl);
    if (!m) { msg("Couldn't open that file. MP4 (H.264) and WebM work best."); return; }
    try {
      await GQ.putFile(f);
    } catch (err) {
      msg("Couldn't save that file. Try a smaller one.");
      return;
    }
    s = await GQ.update({ type: 'file', kind, src: '', fileId: Date.now(), px: 50, py: 50, zoom: 100 });
    e.target.value = '';
    msg('Background applied.', true);
  };

  // ================= Background: Slideshow =================
  $('slidefiles').onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    msg('Adding…', true);
    const added = [];
    let skipped = 0;
    for (const f of files) {
      const isVideo = f.type.startsWith('video/');
      const isImage = f.type.startsWith('image/');
      if ((!isVideo && !isImage) || f.size > MAX_FILE_MB * 1024 * 1024) { skipped++; continue; }
      const kind = isVideo ? 'video' : 'image';
      const testUrl = URL.createObjectURL(f);
      const m = await GQ.buildMedia(testUrl, kind);
      URL.revokeObjectURL(testUrl);
      if (!m) { skipped++; continue; }
      const id = newId();
      try { await GQ.putFile(f, 'slide:' + id); } catch (err) { skipped++; continue; }
      added.push({ id, kind, source: 'file', src: '', name: f.name });
    }
    e.target.value = '';
    if (added.length) {
      await saveSlides((s.slides || []).concat(added));
      await afterAdd();
    }
    msg(
      added.length
        ? `Added ${added.length}.` + (skipped ? ` ${skipped} skipped.` : '')
        : 'Nothing could be added. Use images, GIFs, MP4 or WebM under ' + MAX_FILE_MB + ' MB.',
      added.length > 0
    );
  };

  $('addslideurl').onclick = async () => {
    const url = $('slideurl').value.trim();
    if (!/^https?:\/\//i.test(url)) { msg('Paste a full link starting with https://'); return; }
    const kind = kindOfUrl(url);
    msg('Loading…', true);
    const m = await GQ.buildMedia(url, kind);
    if (!m) { msg("Couldn't load that link. Try a direct image/GIF/MP4 link, or upload the file."); return; }
    const name = url.split(/[?#]/)[0].split('/').pop() || url;
    await saveSlides((s.slides || []).concat([{ id: newId(), kind, source: 'url', src: url, name }]));
    await afterAdd();
    $('slideurl').value = '';
    msg('Added.', true);
  };

  const saveSecs = debounce(async () => {
    const v = Math.max(2, Math.min(600, Number($('slidesecs').value) || 10));
    s = await GQ.update({ slideSecs: v });
  }, 300);
  $('slidesecs').oninput = saveSecs;

  // ================= Background: size and darken =================
  $$('.fitbtn').forEach((b) => { b.onclick = async () => { s = await GQ.update({ fit: b.dataset.fit }); syncInputs(); }; });

  const saveZoom = debounce(async () => { s = await GQ.update({ zoom: Number($('zoom').value) }); }, 60);
  $('zoom').oninput = () => { $('zoomval').textContent = $('zoom').value + '%'; saveZoom(); };

  const saveDim = debounce(async () => { s = await GQ.update({ dim: Number($('dim').value) }); }, 60);
  $('dim').oninput = () => { $('dimval').textContent = $('dim').value + '%'; saveDim(); };

  $('move').onclick = () => {
    if (!['url', 'file', 'slideshow'].includes(s.type)) { msg('Add an image, GIF or video first.'); return; }
    parent.postMessage({ gq: 'move' }, '*');
  };

  // ================= Page tab =================
  $$('.opt').forEach((b) => {
    b.onclick = async () => { s = await GQ.update({ logoMode: b.dataset.mode }); syncInputs(); };
  });
  function updateClockSamples() {
    $$('.sample.clock').forEach((el) => { el.textContent = GQ.timeString(); });
  }
  setInterval(updateClockSamples, 1000);

  $('footer').onchange = async () => { s = await GQ.update({ hideFooter: $('footer').checked }); };

  // ================= Reset =================
  $('reset').onclick = async () => {
    if (!confirm('Reset the background, slideshow and page options to the defaults?')) return;
    await GQ.delFile();
    for (const sl of (s.slides || [])) if (sl.source === 'file') await GQ.delFile('slide:' + sl.id);
    await GQ.reset();
    $('file').value = '';
    showView('single');
    showPane('color');
    msg('Everything is back to the defaults.', true);
  };

  showPane(pane);
  showView(view);
  syncInputs();
})();
