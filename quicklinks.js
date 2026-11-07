// Quick links box: right-click to add/delete unlimited links, or move/resize the box.
(function (g) {
  'use strict';

  const GAP = 14, PAD = 14, MIN_W = 90, MIN_H = 120, MAX_SLOT = 80, MIN_SLOT = 32;

  let links = [];
  let layout = null;
  let mode = null; // null | 'add' | 'delete' | 'layout'
  let box = null;

  const defaultLayout = () => ({
    x: 60,
    y: 100,
    w: 140,
    h: Math.min(665, Math.max(MIN_H, window.innerHeight - 240)),
  });
  const saveLinks = () => chrome.storage.local.set({ links });
  const saveLayout = () => chrome.storage.local.set({ qlLayout: layout });

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #qlbox{position:fixed;border:2px solid rgba(255,255,255,.25);border-radius:40px;
        background:rgba(0,0,0,.2);display:flex;flex-direction:column;z-index:999999;
        box-sizing:border-box;font-family:Arial,sans-serif;touch-action:none;overflow:hidden}
      #qlbox.layout{border:2px dashed #8e6bd8;cursor:move;user-select:none}
      #qlbox .scroll{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;
        padding:${PAD}px;box-sizing:border-box;scrollbar-width:none}
      #qlbox .scroll::-webkit-scrollbar{display:none}
      #qlbox .grid{margin:auto 0;display:flex;flex-wrap:wrap;justify-content:center;gap:${GAP}px}
      #qlbox .slot{width:var(--s);height:var(--s);border-radius:50%;background:#2a2433;display:flex;
        align-items:center;justify-content:center;position:relative;text-decoration:none;
        box-shadow:0 2px 6px rgba(0,0,0,.4);transition:transform .15s;flex:none}
      #qlbox a.slot:hover{transform:scale(1.08)}
      #qlbox.layout a.slot:hover{transform:none}
      #qlbox .slot img{width:55%;height:55%;border-radius:8px;pointer-events:none}
      #qlbox .x{position:absolute;top:-4px;right:-4px;width:26px;height:26px;border-radius:50%;
        background:#e53935;color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;
        cursor:pointer;border:2px solid #fff}
      #qlbox .hint{color:rgba(255,255,255,.6);font-size:12px;text-align:center}
      #qlbox .donewrap{flex:none;text-align:center;padding:0 0 12px}
      #qlbox .done{padding:8px 18px;border:none;border-radius:18px;background:#8e6bd8;
        color:#fff;font-size:14px;cursor:pointer}
      #qlbox .handle{position:absolute;right:0;bottom:0;width:26px;height:26px;cursor:nwse-resize;
        background:linear-gradient(135deg,transparent 50%,#8e6bd8 50%);border-bottom-right-radius:38px}
      #qlmenu{position:fixed;z-index:1000000;background:#2a2433;border-radius:10px;padding:6px 0;
        box-shadow:0 4px 16px rgba(0,0,0,.5);font-family:Arial,sans-serif;min-width:150px}
      #qlmenu div{padding:10px 18px;color:#fff;font-size:14px;cursor:pointer}
      #qlmenu div:hover{background:#443b57}
      #qlmenu div.off{opacity:.4;cursor:not-allowed}
      #qlmodal{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000005;display:flex;
        align-items:center;justify-content:center;font-family:Arial,sans-serif}
      #qlmodal .card{background:#2a2433;padding:22px;border-radius:14px;width:320px;color:#fff}
      #qlmodal input{width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:none;
        margin:12px 0;font-size:14px}
      #qlmodal button{padding:8px 16px;border:none;border-radius:8px;cursor:pointer;margin-right:8px;font-size:14px}
      #qlmodal .ok{background:#8e6bd8;color:#fff}
    `;
    document.head.appendChild(style);
  }

  function clamp() {
    layout.w = Math.min(Math.max(layout.w, MIN_W), window.innerWidth - 4);
    layout.h = Math.min(Math.max(layout.h, MIN_H), window.innerHeight - 4);
    layout.x = Math.min(Math.max(0, layout.x), window.innerWidth - layout.w);
    layout.y = Math.min(Math.max(0, layout.y), window.innerHeight - layout.h);
  }

  // biggest icon size that lets every link fit; shrinks as links are added,
  // and once icons reach the minimum size the box scrolls instead
  function slotSize() {
    const n = Math.max(links.length, 1);
    const doneH = mode ? 50 : 0;
    const availW = layout.w - PAD * 2 - 4;
    const availH = layout.h - PAD * 2 - 4 - doneH;
    for (let s = MAX_SLOT; s >= MIN_SLOT; s -= 2) {
      const cols = Math.max(1, Math.floor((availW + GAP) / (s + GAP)));
      const rows = Math.ceil(n / cols);
      if (rows * s + (rows - 1) * GAP <= availH) return s;
    }
    return MIN_SLOT;
  }

  function applyLayout() {
    clamp();
    box.style.left = layout.x + 'px';
    box.style.top = layout.y + 'px';
    box.style.width = layout.w + 'px';
    box.style.height = layout.h + 'px';
    box.style.setProperty('--s', slotSize() + 'px');
  }

  function normalize(input) {
    let s = input.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    try { return new URL(s); } catch (e) { return null; }
  }

  function render() {
    const prevScroll = box.querySelector('.scroll')?.scrollTop || 0;
    box.innerHTML = '';
    box.classList.toggle('layout', mode === 'layout');

    const scroll = document.createElement('div');
    scroll.className = 'scroll';
    const grid = document.createElement('div');
    grid.className = 'grid';
    scroll.appendChild(grid);
    box.appendChild(scroll);

    if (!links.length) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = 'Right-click to add a link';
      grid.appendChild(hint);
    }

    links.forEach((l, i) => {
      const a = document.createElement('a');
      a.className = 'slot';
      a.href = l.url;
      a.draggable = false;
      const img = document.createElement('img');
      img.src = `https://www.google.com/s2/favicons?domain=${l.host}&sz=64`;
      a.appendChild(img);
      if (mode === 'delete') {
        const x = document.createElement('div');
        x.className = 'x';
        x.textContent = '✕';
        a.appendChild(x);
      }
      a.addEventListener('click', (e) => {
        if (mode === 'delete') {
          e.preventDefault();
          links.splice(i, 1);
          saveLinks();
          render();
        } else if (mode) {
          e.preventDefault();
        }
      });
      grid.appendChild(a);
    });

    if (mode) {
      const wrap = document.createElement('div');
      wrap.className = 'donewrap';
      const done = document.createElement('button');
      done.className = 'done';
      done.textContent = 'Done';
      done.onclick = () => { mode = null; saveLayout(); render(); };
      wrap.appendChild(done);
      box.appendChild(wrap);
    }

    if (mode === 'layout') {
      const handle = document.createElement('div');
      handle.className = 'handle';
      handle.addEventListener('pointerdown', startResize);
      box.appendChild(handle);
    }

    applyLayout();
    scroll.scrollTop = prevScroll;
  }

  function startMove(e) {
    if (mode !== 'layout') return;
    if (e.target.closest('.done') || e.target.classList.contains('handle')) return;
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = layout.x, oy = layout.y;
    const move = (ev) => {
      layout.x = ox + ev.clientX - sx;
      layout.y = oy + ev.clientY - sy;
      applyLayout();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveLayout();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ow = layout.w, oh = layout.h;
    const move = (ev) => {
      layout.w = Math.min(ow + ev.clientX - sx, window.innerWidth - layout.x);
      layout.h = Math.min(oh + ev.clientY - sy, window.innerHeight - layout.y);
      applyLayout();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveLayout();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function closeMenu() {
    const m = document.getElementById('qlmenu');
    if (m) m.remove();
  }

  function openMenu(e) {
    e.preventDefault();
    closeMenu();
    const menu = document.createElement('div');
    menu.id = 'qlmenu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';

    const item = (text, off, fn) => {
      const d = document.createElement('div');
      d.textContent = text;
      if (off) d.className = 'off';
      d.onclick = () => { closeMenu(); if (!off) fn(); };
      return d;
    };

    menu.append(
      item('Add link', false, () => { mode = 'add'; render(); openModal(); }),
      item('Delete', !links.length, () => { mode = 'delete'; render(); }),
      item('Move / Resize', false, () => { mode = 'layout'; render(); }),
      item('Reset position', false, () => { layout = defaultLayout(); saveLayout(); applyLayout(); })
    );
    document.body.appendChild(menu);
  }

  function openModal() {
    const modal = document.createElement('div');
    modal.id = 'qlmodal';
    modal.innerHTML = `
      <div class="card">
        <div>Add a website link</div>
        <input type="text" placeholder="e.g. youtube.com" />
        <button class="ok">Add</button>
        <button class="cancel">Cancel</button>
      </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('input');
    input.focus();

    const submit = () => {
      const u = normalize(input.value);
      if (!u) { input.style.outline = '2px solid #e53935'; return; }
      links.push({ url: u.href, host: u.hostname });
      saveLinks();
      modal.remove();
      render();
    };
    modal.querySelector('.ok').onclick = submit;
    modal.querySelector('.cancel').onclick = () => modal.remove();
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  async function init() {
    const r = await chrome.storage.local.get(['links', 'qlLayout']);
    links = Array.isArray(r.links) ? r.links : [];
    layout = Object.assign(defaultLayout(), r.qlLayout || {});

    addStyles();
    box = document.createElement('div');
    box.id = 'qlbox';
    document.body.appendChild(box);

    box.addEventListener('pointerdown', startMove);
    box.addEventListener('contextmenu', openMenu);
    document.addEventListener('click', closeMenu);
    window.addEventListener('resize', applyLayout);

    // keep several open tabs in sync
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.links && !mode) {
        links = Array.isArray(changes.links.newValue) ? changes.links.newValue : [];
        render();
      }
      if (changes.qlLayout && mode !== 'layout') {
        layout = Object.assign(defaultLayout(), changes.qlLayout.newValue || {});
        applyLayout();
      }
    });

    render();
  }

  g.GQQuickLinks = { init };
})(globalThis);
