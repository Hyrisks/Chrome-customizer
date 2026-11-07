// Puts the background, the settings button/panel and the "drag to move" mode onto a page.
// Used by both the google.com content script and the new tab page.
(function (g) {
  'use strict';

  const EXT = GQ.EXT_ORIGIN;
  let bgFrame = null, btn = null, panelFrame = null, cap = null, bar = null;
  let bottom = 20;

  function addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      #gq-bg{position:fixed;inset:0;width:100%;height:100%;border:0;z-index:-1;pointer-events:none;display:none}
      #gq-btn{position:fixed;right:20px;width:42px;height:42px;border-radius:50%;border:none;
        background:#2a2433;color:#fff;font-size:20px;cursor:pointer;z-index:1000000;
        box-shadow:0 2px 8px rgba(0,0,0,.5);opacity:.35;transition:opacity .2s}
      #gq-btn:hover{opacity:1}
      #gq-panel{position:fixed;right:20px;width:330px;border:0;border-radius:14px;background:#2a2433;
        box-shadow:0 6px 24px rgba(0,0,0,.6);z-index:1000001;display:none}
      #gq-cap{position:fixed;inset:0;z-index:1000003;display:none;cursor:grab;touch-action:none}
      #gq-cap.drag{cursor:grabbing}
      #gq-bar{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:1000004;display:none;
        align-items:center;gap:12px;background:#2a2433;color:#fff;padding:10px 16px;border-radius:24px;
        box-shadow:0 4px 16px rgba(0,0,0,.6);font-family:Arial,sans-serif;font-size:14px}
      #gq-bar button{padding:7px 16px;border:none;border-radius:16px;background:#8e6bd8;color:#fff;
        cursor:pointer;font-size:14px}
    `;
    document.head.appendChild(style);
  }

  function layoutButtons() {
    btn.style.bottom = bottom + 'px';
    if (panelFrame) {
      panelFrame.style.bottom = bottom + 52 + 'px';
      panelFrame.style.height = `min(640px, calc(100vh - ${bottom + 52 + 16}px))`;
    }
  }

  function togglePanel() {
    if (!panelFrame) {
      panelFrame = document.createElement('iframe');
      panelFrame.id = 'gq-panel';
      panelFrame.src = chrome.runtime.getURL('panel.html?ctx=' + g.GQ_MODE);
      document.body.appendChild(panelFrame);
      layoutButtons();
    }
    panelFrame.style.display = panelFrame.style.display === 'block' ? 'none' : 'block';
  }

  const post = (m) => bgFrame.contentWindow.postMessage(m, EXT);

  function startMove() {
    if (panelFrame) panelFrame.style.display = 'none';
    cap.style.display = 'block';
    bar.style.display = 'flex';
  }
  function stopMove() {
    cap.style.display = 'none';
    bar.style.display = 'none';
    if (panelFrame) panelFrame.style.display = 'block';
  }

  function init(opts) {
    g.GQ_MODE = opts.mode; // 'google' or 'newtab'
    addStyles();

    bgFrame = document.createElement('iframe');
    bgFrame.id = 'gq-bg';
    bgFrame.setAttribute('allow', 'autoplay');
    bgFrame.src = chrome.runtime.getURL('bg.html');
    document.body.appendChild(bgFrame);
    if (opts.mode === 'newtab') bgFrame.style.display = 'block';

    btn = document.createElement('button');
    btn.id = 'gq-btn';
    btn.title = 'Change background';
    btn.textContent = '🖼';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    cap = document.createElement('div');
    cap.id = 'gq-cap';
    document.body.appendChild(cap);

    bar = document.createElement('div');
    bar.id = 'gq-bar';
    bar.innerHTML = '<span>Drag to move the picture · scroll to zoom</span><button>Done</button>';
    bar.querySelector('button').onclick = stopMove;
    document.body.appendChild(bar);

    cap.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      cap.setPointerCapture(e.pointerId);
      cap.classList.add('drag');
      const sx = e.clientX, sy = e.clientY;
      post({ gq: 'dragstart' });
      const move = (ev) => post({ gq: 'dragmove', dx: ev.clientX - sx, dy: ev.clientY - sy });
      const up = () => {
        cap.classList.remove('drag');
        cap.removeEventListener('pointermove', move);
        cap.removeEventListener('pointerup', up);
        post({ gq: 'dragend' });
      };
      cap.addEventListener('pointermove', move);
      cap.addEventListener('pointerup', up);
    });
    cap.addEventListener('wheel', (e) => {
      e.preventDefault();
      post({ gq: 'zoom', dir: e.deltaY });
    }, { passive: false });

    // messages from the settings panel iframe
    window.addEventListener('message', (e) => {
      if (e.origin !== EXT || !e.data) return;
      if (e.data.gq === 'closePanel' && panelFrame) panelFrame.style.display = 'none';
      if (e.data.gq === 'move') startMove();
    });

    layoutButtons();
    window.addEventListener('resize', layoutButtons);
  }

  g.GQHost = {
    init,
    setBgVisible(on) { if (bgFrame) bgFrame.style.display = on ? 'block' : 'none'; },
    setBottom(px) { bottom = px; if (btn) layoutButtons(); },
  };
})(globalThis);
