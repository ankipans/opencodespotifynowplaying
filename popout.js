(function () {
  'use strict';

  var KEY = 'sp_popout_state';
  var CHANNEL = 'sp_now_playing_popout';
  var state = null;
  var progressTimer = null;

  var el = {
    art: document.getElementById('art'),
    bgArt: document.getElementById('bg-art'),
    status: document.getElementById('status'),
    title: document.getElementById('title'),
    artist: document.getElementById('artist'),
    album: document.getElementById('album'),
    progressFill: document.getElementById('progress-fill'),
    elapsed: document.getElementById('elapsed'),
    duration: document.getElementById('duration')
  };

  function fmt(ms) {
    var total = Math.max(0, Math.floor((ms || 0) / 1000));
    var s = total % 60;
    var m = Math.floor(total / 60) % 60;
    var h = Math.floor(total / 3600);
    return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function getProgress() {
    if (!state) return { progress: 0, duration: 0 };
    var progress = Number(state.progressMs || 0);
    var duration = Number(state.durationMs || 0);
    if (state.isPlaying && state.timestamp) {
      progress += Math.max(0, Date.now() - Number(state.timestamp));
    }
    if (duration > 0) progress = Math.min(progress, duration);
    return { progress: progress, duration: duration };
  }

  function renderProgress() {
    var p = getProgress();
    var pct = p.duration > 0 ? (p.progress / p.duration) * 100 : 0;
    if (el.progressFill) el.progressFill.style.width = pct + '%';
    if (el.elapsed) el.elapsed.textContent = fmt(p.progress);
    if (el.duration) el.duration.textContent = fmt(p.duration);
  }

  function startProgressTimer() {
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    renderProgress();
    progressTimer = setInterval(renderProgress, 1000);
  }

  function render(next) {
    state = next || null;
    if (!state) {
      if (el.art) { el.art.removeAttribute('src'); el.art.alt = ''; }
      if (el.bgArt) el.bgArt.style.backgroundImage = '';
      if (el.status) { el.status.textContent = 'Idle'; el.status.className = 'status'; }
      if (el.title) el.title.textContent = 'Nothing playing';
      if (el.artist) el.artist.textContent = 'Open the main Spotify Now Playing page.';
      if (el.album) el.album.textContent = '';
      document.title = 'Now Playing';
      startProgressTimer();
      return;
    }

    var title = state.title || 'Unknown track';
    var artist = state.artist || '';
    var album = state.album || '';
    var image = state.image || '';
    var playing = !!state.isPlaying;

    if (el.art) {
      if (image) { el.art.src = image; el.art.alt = album ? 'Album art for ' + album : 'Album art'; }
      else { el.art.removeAttribute('src'); el.art.alt = ''; }
    }
    if (el.bgArt) el.bgArt.style.backgroundImage = image ? 'url("' + String(image).replace(/"/g, '\\"') + '")' : '';
    if (el.status) { el.status.textContent = state.statusText || (playing ? 'Playing' : 'Paused'); el.status.className = 'status' + (playing ? ' playing' : ''); }
    if (el.title) el.title.textContent = title;
    if (el.artist) el.artist.textContent = artist || '\u00A0';
    if (el.album) el.album.textContent = album;
    document.title = (playing ? '▶ ' : '') + title + (artist ? ' • ' + artist : '');
    startProgressTimer();
  }

  function readState() {
    try {
      var raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  window.addEventListener('storage', function (e) {
    if (e.key === KEY) render(readState());
  });

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      var bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = function (ev) { if (ev && ev.data) render(ev.data); };
    } catch (e) {}
  }

  render(readState());
})();
