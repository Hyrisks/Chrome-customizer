// New tab page: quick links box + custom background + settings button + logo/time.
GQHost.init({ mode: 'newtab' });
GQQuickLinks.init();

(async function () {
  const logo = document.querySelector('.logo');
  let cfg = await GQ.getSettings();
  let timer = null;

  function render() {
    const isTime = cfg.logoMode === 'time' || cfg.logoMode === 'timeglass';
    logo.dataset.mode = cfg.logoMode;
    logo.textContent = isTime ? GQ.timeString() : 'Google';
  }

  function apply(s) {
    cfg = s;
    render();
    clearInterval(timer);
    timer = (s.logoMode === 'time' || s.logoMode === 'timeglass') ? setInterval(render, 1000) : null;
  }

  apply(cfg);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) apply(GQ.merge(changes.settings.newValue));
  });
})();
