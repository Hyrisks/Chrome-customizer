// Shared helpers: settings (chrome.storage), uploaded-file storage (IndexedDB), media loader.
(function (g) {
  'use strict';

  const DEFAULTS = {
    type: 'none',      // none | color | url | file
    color: '#3f3750',
    src: '',           // for type "url"
    kind: 'image',     // image | video
    fileId: 0,         // changes whenever a new file is uploaded
    fit: 'cover',      // cover | contain | stretch
    dim: 0,            // 0-80 (% darkening)
    zoom: 100,         // 100-400 (%)
    px: 50,            // horizontal focus 0-100 (%)
    py: 50,            // vertical focus 0-100 (%)
    hideFooter: true,  // google.com only: hide Canada / Advertising / Privacy bar
    slides: [],        // slideshow items: {id, kind, source: 'file'|'url', src, name}
    slideSecs: 10,     // seconds each image/GIF stays on screen (videos play to the end)
    logoMode: 'logo',  // above the search bar: logo | hidden | glass | time | timeglass
    lastSingle: 'none', // what to go back to when the slideshow is turned off
  };

  const EXT_ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const merge = (v) => Object.assign({}, DEFAULTS, v || {});

  async function getSettings() {
    const r = await chrome.storage.local.get('settings');
    return merge(r.settings);
  }
  async function update(patch) {
    const s = await getSettings();
    const n = Object.assign(s, patch);
    await chrome.storage.local.set({ settings: n });
    return n;
  }
  async function reset() {
    await chrome.storage.local.set({ settings: Object.assign({}, DEFAULTS) });
  }

  // ---- uploaded file (kept in the extension's own IndexedDB) ----
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('gqFiles', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function putFile(blob, key = 'bg') {
    const db = await openDB();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(blob, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }
  async function getFile(key = 'bg') {
    const db = await openDB();
    return new Promise((res, rej) => {
      const q = db.transaction('files').objectStore('files').get(key);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => rej(q.error);
    });
  }
  async function delFile(key = 'bg') {
    try {
      const db = await openDB();
      db.transaction('files', 'readwrite').objectStore('files').delete(key);
    } catch (e) { /* ignore */ }
  }

  // Loads an image/GIF/video without showing it. Resolves null if it fails.
  function buildMedia(src, kind) {
    return new Promise((resolve) => {
      let el;
      if (kind === 'video') {
        el = document.createElement('video');
        el.muted = true;
        el.defaultMuted = true;
        el.loop = true;
        el.autoplay = true;
        el.playsInline = true;
        el.preload = 'auto';
        el.onloadedmetadata = () => resolve({ el, nat: { w: el.videoWidth, h: el.videoHeight } });
      } else {
        el = document.createElement('img');
        el.draggable = false;
        el.onload = () => resolve({ el, nat: { w: el.naturalWidth, h: el.naturalHeight } });
      }
      el.className = 'gq-media';
      el.onerror = () => resolve(null);
      el.src = src;
    });
  }

  // 12-hour time without AM/PM, e.g. "3:07"
  function timeString() {
    const d = new Date();
    return (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  g.GQ = { timeString, DEFAULTS, EXT_ORIGIN, merge, getSettings, update, reset, putFile, getFile, delFile, buildMedia };
})(globalThis);
