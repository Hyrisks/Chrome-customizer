// google.com: quick links box, custom background, hiding the bottom bar, and the logo/time above the search bar.
(async function () {
  'use strict';

  if (location.pathname !== '/' && !location.pathname.startsWith('/webhp')) return;

  const KEEP = ':not(#qlbox):not(#qlmenu):not(#qlmodal):not(#gq-btn):not(#gq-cap):not(#gq-bar):not(#gq-clock)';
  const RULES = `
    html, body { background: transparent !important; background-image: none !important; }
    body > div${KEEP}, body > div${KEEP} > div${KEEP},
    footer, #fbar, .fbar, .Fx4vi, .KxwPGc { background: transparent !important; }
  `;
  const pageStyle = document.createElement('style');
  const logoStyle = document.createElement('style');
  logoStyle.textContent = `
    .gq-hidden { display: none !important; }
    [data-gq-logo="hidden"], [data-gq-logo="time"] { visibility: hidden !important; }
    [data-gq-logo="glass"] { opacity: .3 !important; }
    #gq-clock { position: fixed; z-index: 5; display: none; align-items: center; justify-content: center;
      transform: translateX(-50%); white-space: nowrap; pointer-events: none; user-select: none;
      font-family: "Google Sans", Arial, sans-serif; font-weight: 500; letter-spacing: -0.04em;
      font-variant-numeric: tabular-nums; color: #d3bcfd; text-shadow: 0 2px 12px rgba(0,0,0,.35);
      transition: opacity .25s; }
  `;
  document.head.append(pageStyle, logoStyle);

  let S = await GQ.getSettings();

  // ---------- hide Google's bottom bar ----------
  const FOOTER_LINKS = ['Advertising', 'Business', 'How Search works', 'Privacy', 'Terms', 'Settings'];
  const COUNTRY_LINE = /^(Canada|United States|United Kingdom|Australia|New Zealand|Ireland)$/;

  // From a footer link/text, climb to the biggest container that doesn't hold the search box.
  function topFooterNode(seed) {
    let n = seed;
    while (
      n.parentElement &&
      n.parentElement !== document.body &&
      n.parentElement !== document.documentElement &&
      !n.parentElement.querySelector('input, textarea, form')
    ) n = n.parentElement;
    return n;
  }

  function hideFooter() {
    const seeds = [];
    document.querySelectorAll('a').forEach((a) => {
      if (FOOTER_LINKS.includes(a.textContent.trim())) seeds.push(a);
    });
    document.querySelectorAll('div, span').forEach((el) => {
      if (!el.children.length && COUNTRY_LINE.test(el.textContent.trim())) seeds.push(el);
    });
    seeds.forEach((seed) => {
      if (seed.closest('#qlbox, #qlmenu, #qlmodal')) return;
      topFooterNode(seed).classList.add('gq-hidden');
    });
  }

  function showFooter() {
    document.querySelectorAll('.gq-hidden').forEach((e) => e.classList.remove('gq-hidden'));
  }

  // ---------- logo / time above the search bar ----------
  let logoEl = null, clockEl = null, clockText = null, clockTimer = null;

  function findLogo() {
    const sels = [
      'img[alt="Google"]', 'svg[aria-label="Google"]', '[aria-label="Google"][role="img"]',
      'img.lnXdpd', '.lnXdpd', '#hplogo', 'img[src*="googlelogo"]',
    ];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('#qlbox, #qlmenu, #qlmodal, #gq-clock')) continue;
        if (el.getBoundingClientRect().width > 40) return el;
      }
    }
    return null;
  }

  function positionClock() {
    if (!clockEl || clockEl.style.display === 'none') return;
    let r = logoEl && logoEl.isConnected ? logoEl.getBoundingClientRect() : null;
    if (!r || r.width < 20) { // logo not found: sit just above the search box
      const q = document.querySelector('textarea[name="q"], input[name="q"]');
      if (q) {
        const qr = q.getBoundingClientRect();
        r = { left: qr.left, width: qr.width, top: qr.top - 150, height: 100 };
      } else {
        r = { left: 0, width: window.innerWidth, top: window.innerHeight * 0.25, height: 100 };
      }
    }
    clockEl.style.left = r.left + r.width / 2 + 'px';
    clockEl.style.top = r.top + 'px';
    clockEl.style.height = r.height + 'px';
    clockEl.style.fontSize = Math.max(56, Math.min(120, r.height * 0.9)) + 'px';
  }

  function tick() {
    if (clockText) clockText.nodeValue = GQ.timeString();
    positionClock();
  }

  function applyLogo() {
    const mode = S.logoMode;
    const isTime = mode === 'time' || mode === 'timeglass';
    logoEl = findLogo();
    document.querySelectorAll('[data-gq-logo]').forEach((e) => { if (e !== logoEl) e.removeAttribute('data-gq-logo'); });
    if (logoEl) {
      const v = mode === 'logo' ? null : isTime ? 'time' : mode === 'hidden' ? 'hidden' : 'glass';
      if (v) logoEl.setAttribute('data-gq-logo', v); else logoEl.removeAttribute('data-gq-logo');
    }
    if (isTime) {
      if (!clockEl) {
        clockEl = document.createElement('div');
        clockEl.id = 'gq-clock';
        clockText = document.createTextNode('');
        clockEl.appendChild(clockText);
        document.body.appendChild(clockEl);
      }
      clockEl.style.display = 'flex';
      clockEl.style.opacity = mode === 'timeglass' ? '.3' : '1';
      tick();
      if (!clockTimer) clockTimer = setInterval(tick, 1000);
    } else {
      if (clockEl) clockEl.style.display = 'none';
      if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    }
  }

  // ---------- apply settings ----------
  function refresh() {
    if (S.type !== 'none' && S.hideFooter) hideFooter(); else showFooter();
    applyLogo();
  }

  function applyPage(s) {
    S = s;
    const active = s.type !== 'none';
    pageStyle.textContent = active ? RULES : '';
    GQHost.setBgVisible(active);
    GQHost.setBottom(active && s.hideFooter ? 20 : 90);
    refresh();
  }

  GQHost.init({ mode: 'google' });
  await GQQuickLinks.init();
  applyPage(S);

  // Google draws parts of the page late, so re-check when the page changes.
  let t;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(refresh, 200); })
    .observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', positionClock);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) applyPage(GQ.merge(changes.settings.newValue));
  });
})();
