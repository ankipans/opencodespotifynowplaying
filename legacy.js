(function () {
  'use strict';

  var API_BASE = 'https://api.spotify.com/v1';
  var POLL_INTERVAL = 5000;
  var PROGRESS_TICK = 1000;
  var STORAGE = {
    token: 'sp_token',
    showArt: 'sp_show_art',
    showDevice: 'sp_show_device',
    showPlaylist: 'sp_show_playlist'
  };

  function $(id) { return document.getElementById(id); }
  var el = {
    setupPanel: $('setup-panel'),
    playerPanel: $('player-panel'),
    settingsToggle: $('settings-toggle'),
    wakeBtn: $('wake-btn'),
    fullscreenBtn: $('fullscreen-btn'),
    accessTokenInput: $('access-token-input'),
    saveAccessToken: $('save-access-token'),
    clearData: $('clear-data'),
    currentTokenDisplay: $('current-token-display'),
    toggleTokenVisibility: $('toggle-token-visibility'),
    showArtToggle: $('show-art-toggle'),
    showDeviceToggle: $('show-device-toggle'),
    showPlaylistToggle: $('show-playlist-toggle'),
    setupMessage: $('setup-message'),
    statusBadge: $('status-badge'),
    trackName: $('track-name'),
    trackArtist: $('track-artist'),
    trackAlbum: $('track-album'),
    albumArt: $('album-art'),
    artWrap: $('art-wrap'),
    progressFill: $('progress-fill'),
    progressCurrent: $('progress-current'),
    progressDuration: $('progress-duration'),
    prevBtn: $('prev-btn'),
    playpauseBtn: $('playpause-btn'),
    nextBtn: $('next-btn'),
    deviceName: $('device-name'),
    contextName: $('context-name'),
    contextSep: $('context-sep'),
    footerStatus: $('footer-status'),
    bgArt: $('bg-art')
  };

  var pollTimer = null;
  var progressTimer = null;
  var isFetching = false;
  var currentPlayback = null;
  var lastProgressAt = 0;
  var lastContextUri = null;
  var lastContextName = '';
  var currentDeviceText = '';
  var lastImage = '';
  var wakeLock = null;
  var wakeLockWanted = false;
  var idleTimer = null;
  var IDLE_MS = 10000;

  function getStored(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function setStored(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }
  function removeStored(key) {
    try { localStorage.removeItem(key); } catch (e) {}
  }

  function getBool(key, defaultVal) {
    var v = getStored(key, null);
    if (v === null) return defaultVal;
    return v === '1';
  }

  function getToken() {
    var raw = getStored(STORAGE.token, null);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.access_token) return parsed;
        if (parsed.accessToken) { parsed.access_token = parsed.accessToken; return parsed; }
      }
      if (typeof parsed === 'string' && parsed) return { access_token: parsed };
    } catch (e) {}
    raw = String(raw).replace(/^\s+|\s+$/g, '').replace(/^Bearer\s+/i, '');
    if (raw) return { access_token: raw };
    return null;
  }

  function setToken(tokenObj) {
    try { localStorage.setItem(STORAGE.token, JSON.stringify(tokenObj)); } catch (e) {}
    syncCurrentTokenDisplay();
  }

  function clearToken() {
    removeStored(STORAGE.token);
    syncCurrentTokenDisplay();
  }

  function getStoredAccessToken() {
    var t = getToken();
    if (t && t.access_token) return String(t.access_token);
    return '';
  }

  function syncCurrentTokenDisplay() {
    if (!el.currentTokenDisplay) return;
    var token = getStoredAccessToken();
    el.currentTokenDisplay.value = token;
    el.currentTokenDisplay.placeholder = token ? '' : 'No active token';
    if (el.toggleTokenVisibility) {
      el.currentTokenDisplay.type = 'password';
      el.toggleTokenVisibility.textContent = 'Show';
    }
  }

  function setMessage(msg, type) {
    if (!el.setupMessage) return;
    el.setupMessage.textContent = msg || '';
    el.setupMessage.className = 'message' + (type ? ' ' + type : '');
  }

  function showTransientStatus(msg) {
    if (el.footerStatus) el.footerStatus.textContent = msg || '';
  }

  function showPanel(name) {
    el.setupPanel.style.display = name === 'setup' ? 'block' : 'none';
    el.playerPanel.style.display = name === 'player' ? 'block' : 'none';
    if (name === 'player') {
      document.body.className = document.body.className.replace(/\bsetup-mode\b/g, '');
    } else if (document.body.className.indexOf('setup-mode') === -1) {
      document.body.className += ' setup-mode';
    }
  }

  function apiFetch(path, method, cb) {
    var token = getToken();
    if (!token || !token.access_token) { cb(new Error('No access token')); return; }
    var xhr = new XMLHttpRequest();
    var url = path.indexOf('http') === 0 ? path : API_BASE + path;
    xhr.open(method || 'GET', url, true);
    xhr.setRequestHeader('Authorization', 'Bearer ' + token.access_token);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      var status = xhr.status;
      if (status === 204) { cb(null, null); return; }
      var text = xhr.responseText || '';
      var data = null;
      if (text) {
        try { data = JSON.parse(text); } catch (e) { data = text; }
      }
      if (status >= 200 && status < 300) { cb(null, data); return; }
      var errMsg = (data && data.error && data.error.message) ? data.error.message : ('Request failed (' + status + ')');
      if (status === 401) errMsg = 'Not authenticated or token expired.';
      var err = new Error(errMsg);
      err.status = status;
      cb(err);
    };
    xhr.onerror = function () { cb(new Error('Network error')); };
    xhr.send();
  }

  function formatTime(ms) {
    if (!ms || ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var s = total % 60;
    var m = Math.floor(total / 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function setProgress(progressMs, durationMs) {
    var p = Math.max(0, progressMs || 0);
    var d = Math.max(0, durationMs || 0);
    if (d > 0 && p > d) p = d;
    var pct = d > 0 ? (p / d) * 100 : 0;
    if (el.progressFill) el.progressFill.style.width = pct + '%';
    if (el.progressCurrent) el.progressCurrent.textContent = formatTime(p);
    if (el.progressDuration) el.progressDuration.textContent = formatTime(d);
  }

  function setDocumentTitle(title, artist) {
    if (title && artist) document.title = title + ' \u2022 ' + artist;
    else if (title) document.title = title;
    else document.title = 'Spotify Now Playing';
  }

  function applyShowArt(show) {
    if (show) document.body.className = document.body.className.replace(/\bhide-art\b/g, '');
    else if (document.body.className.indexOf('hide-art') === -1) document.body.className += ' hide-art';
    if (el.showArtToggle) el.showArtToggle.checked = !!show;
  }

  function renderPlaybackSource(deviceName, contextName) {
    currentDeviceText = deviceName || '';
    var showDevice = getBool(STORAGE.showDevice, true);
    var showPlaylist = getBool(STORAGE.showPlaylist, true);
    var device = showDevice ? (deviceName || '') : '';
    var context = showPlaylist ? (contextName || '') : '';
    if (el.deviceName) el.deviceName.textContent = device;
    if (el.contextName) el.contextName.textContent = context;
    if (el.contextSep) el.contextSep.style.display = (device && context) ? 'inline' : 'none';
  }

  function applySourceVisibility() {
    if (el.showDeviceToggle) el.showDeviceToggle.checked = getBool(STORAGE.showDevice, true);
    if (el.showPlaylistToggle) el.showPlaylistToggle.checked = getBool(STORAGE.showPlaylist, true);
    renderPlaybackSource(currentDeviceText, lastContextName);
  }

  function setBackground(image) {
    if (!el.bgArt) return;
    if (image) {
      el.bgArt.style.backgroundImage = 'url("' + image.replace(/"/g, '\\"') + '")';
      el.bgArt.style.backgroundSize = 'cover';
      el.bgArt.style.backgroundPosition = 'center';
      el.bgArt.style.opacity = '0.25';
    } else {
      el.bgArt.style.backgroundImage = '';
      el.bgArt.style.opacity = '1';
    }
  }

  function renderNothingPlaying(message) {
    currentPlayback = null;
    if (el.albumArt) { el.albumArt.removeAttribute('src'); el.albumArt.alt = ''; }
    if (el.statusBadge) { el.statusBadge.textContent = 'Idle'; el.statusBadge.className = 'status-badge'; }
    if (el.playpauseBtn) { el.playpauseBtn.textContent = 'Play'; el.playpauseBtn.setAttribute('aria-label', 'Play'); }
    if (el.trackName) el.trackName.textContent = 'Nothing playing';
    if (el.trackArtist) el.trackArtist.textContent = message || 'Start playing something on Spotify.';
    if (el.trackAlbum) el.trackAlbum.textContent = '';
    renderPlaybackSource('', '');
    lastContextUri = null;
    lastContextName = '';
    lastImage = '';
    setProgress(0, 0);
    setDocumentTitle('', '');
    setBackground('');
  }

  function fetchPlaylistName(uri) {
    if (!uri || uri.indexOf('spotify:playlist:') !== 0) { lastContextUri = null; lastContextName = ''; renderPlaybackSource(currentDeviceText, ''); return; }
    if (uri === lastContextUri) return;
    lastContextUri = uri;
    lastContextName = '';
    renderPlaybackSource(currentDeviceText, '');
    var id = uri.split(':').pop();
    apiFetch('/playlists/' + encodeURIComponent(id) + '?fields=name', 'GET', function (err, playlist) {
      if (err) return;
      if (lastContextUri !== uri) return;
      lastContextName = (playlist && playlist.name) ? playlist.name : '';
      renderPlaybackSource(currentDeviceText, lastContextName);
    });
  }

  function renderPlayback(data) {
    if (!data || !data.item) {
      renderNothingPlaying(data && data.device ? ('No active track on ' + data.device.name + '.') : 'Start playing something on Spotify.');
      return;
    }
    var item = data.item;
    var isTrack = item.type === 'track';
    var title = item.name || 'Unknown title';
    var artists = '';
    if (item.artists && item.artists.length) {
      var names = [];
      for (var i = 0; i < item.artists.length; i++) { if (item.artists[i].name) names.push(item.artists[i].name); }
      artists = names.join(', ');
    } else if (item.show && item.show.publisher) {
      artists = item.show.publisher;
    }
    var album = isTrack ? ((item.album && item.album.name) || '') : ((item.show && item.show.name) || '');
    var images = isTrack ? ((item.album && item.album.images) || []) : (item.images || (item.show && item.show.images) || []);
    var image = (images[0] && images[0].url) ? images[0].url : '';
    var duration = item.duration_ms || 0;
    var progress = typeof data.progress_ms === 'number' ? data.progress_ms : 0;

    currentPlayback = { isPlaying: !!data.is_playing, progressMs: progress, durationMs: duration };
    lastProgressAt = (new Date()).getTime();

    if (el.albumArt) {
      if (image) {
        if (lastImage !== image) { el.albumArt.src = image; lastImage = image; }
        el.albumArt.alt = album ? ('Album art for ' + album) : ('Cover art for ' + title);
      } else {
        el.albumArt.removeAttribute('src');
        el.albumArt.alt = '';
        lastImage = '';
      }
    }

    if (el.statusBadge) {
      el.statusBadge.textContent = data.is_playing ? 'Playing' : 'Paused';
      el.statusBadge.className = 'status-badge' + (data.is_playing ? ' playing' : '');
    }
    if (el.playpauseBtn) {
      el.playpauseBtn.textContent = data.is_playing ? 'Pause' : 'Play';
      el.playpauseBtn.setAttribute('aria-label', data.is_playing ? 'Pause' : 'Play');
    }
    if (el.trackName) el.trackName.textContent = title;
    if (el.trackArtist) el.trackArtist.textContent = artists || '\u00A0';
    if (el.trackAlbum) el.trackAlbum.textContent = album;
    setDocumentTitle(title, artists);
    setBackground(image);
    setProgress(progress, duration);
    renderPlaybackSource(data.device && data.device.name ? data.device.name : '', lastContextName);
    fetchPlaylistName(data.context && data.context.uri ? data.context.uri : null);
  }

  function fetchNowPlaying() {
    if (isFetching) return;
    isFetching = true;
    apiFetch('/me/player/currently-playing', 'GET', function (err, data) {
      if (err) {
        isFetching = false;
        showTransientStatus(err.message || 'Failed to fetch playback.');
        if (err.status === 401) { stopPolling(); showPanel('setup'); }
        return;
      }
      if (data && !data.device) {
        apiFetch('/me/player?fields=device', 'GET', function (err2, player) {
          isFetching = false;
          if (!err2 && player && player.device) data.device = player.device;
          renderPlayback(data);
          if (el.setupPanel.style.display === 'none' && el.playerPanel.style.display === 'none') showPanel('player');
        });
        return;
      }
      isFetching = false;
      renderPlayback(data);
      if (el.setupPanel.style.display === 'none' && el.playerPanel.style.display === 'none') showPanel('player');
    });
  }

  function startPolling() {
    stopPolling();
    fetchNowPlaying();
    pollTimer = setInterval(fetchNowPlaying, POLL_INTERVAL);
    progressTimer = setInterval(function () {
      if (!currentPlayback) return;
      var p = currentPlayback.progressMs || 0;
      if (currentPlayback.isPlaying) p += Math.max(0, (new Date()).getTime() - lastProgressAt);
      setProgress(p, currentPlayback.durationMs || 0);
    }, PROGRESS_TICK);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  }
  function syncFullscreenBtn() {
    if (!el.fullscreenBtn) return;
    var active = isFullscreen();
    el.fullscreenBtn.textContent = active ? 'Exit Fullscreen' : 'Fullscreen';
  }
  function toggleFullscreen() {
    if (isFullscreen()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      else if (document.msExitFullscreen) document.msExitFullscreen();
      return;
    }
    var root = document.documentElement;
    if (root.requestFullscreen) root.requestFullscreen();
    else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    else if (root.msRequestFullscreen) root.msRequestFullscreen();
    else showTransientStatus('Fullscreen not supported on this browser.');
  }
  function syncWakeBtn() {
    if (!el.wakeBtn) return;
    var supported = !!(navigator.wakeLock && navigator.wakeLock.request);
    if (!supported) { el.wakeBtn.textContent = 'Stay Awake N/A'; return; }
    el.wakeBtn.textContent = wakeLockWanted ? 'Awake On' : 'Stay Awake';
  }
  function requestWakeLock() {
    if (!(navigator.wakeLock && navigator.wakeLock.request)) { syncWakeBtn(); return; }
    try {
      navigator.wakeLock.request('screen').then(function (lock) {
        wakeLock = lock;
        wakeLockWanted = true;
        syncWakeBtn();
        lock.addEventListener('release', function () { wakeLock = null; syncWakeBtn(); });
      }).catch(function () { wakeLockWanted = false; syncWakeBtn(); });
    } catch (e) { wakeLockWanted = false; syncWakeBtn(); }
  }
  function releaseWakeLock() {
    wakeLockWanted = false;
    if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
    syncWakeBtn();
  }
  function toggleWakeLock() {
    if (!(navigator.wakeLock && navigator.wakeLock.request)) { showTransientStatus('Wake lock not supported on this browser.'); syncWakeBtn(); return; }
    if (wakeLockWanted) releaseWakeLock();
    else requestWakeLock();
  }

  function resetIdleTimer() {
    if (document.body.className.indexOf('ui-idle') !== -1) {
      document.body.className = document.body.className.replace(/\bui-idle\b/g, '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function () {
      if (el.setupPanel && el.setupPanel.style.display === 'none') {
        if (document.body.className.indexOf('ui-idle') === -1) document.body.className += ' ui-idle';
      }
    }, IDLE_MS);
  }

  function bindEvents() {
    if (el.settingsToggle) el.settingsToggle.onclick = function () {
      var opening = el.setupPanel.style.display === 'none';
      el.setupPanel.style.display = opening ? 'block' : 'none';
      if (opening) { syncCurrentTokenDisplay(); setMessage(''); }
    };
    if (el.fullscreenBtn) el.fullscreenBtn.onclick = function () { toggleFullscreen(); };
    if (el.wakeBtn) el.wakeBtn.onclick = function () { toggleWakeLock(); };
    if (el.prevBtn) el.prevBtn.onclick = function () {
      apiFetch('/me/player/previous', 'POST', function (err) { if (err) showTransientStatus(err.message); else setTimeout(fetchNowPlaying, 400); });
    };
    if (el.nextBtn) el.nextBtn.onclick = function () {
      apiFetch('/me/player/next', 'POST', function (err) { if (err) showTransientStatus(err.message); else setTimeout(fetchNowPlaying, 400); });
    };
    if (el.playpauseBtn) el.playpauseBtn.onclick = function () {
      var playing = currentPlayback && currentPlayback.isPlaying;
      apiFetch(playing ? '/me/player/pause' : '/me/player/play', 'PUT', function (err) {
        if (err) showTransientStatus(err.message);
        else setTimeout(fetchNowPlaying, 300);
      });
    };
    document.addEventListener('fullscreenchange', syncFullscreenBtn);
    document.addEventListener('webkitfullscreenchange', syncFullscreenBtn);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && wakeLockWanted && !wakeLock) requestWakeLock();
    });
    var activityEvents = ['mousemove', 'mousedown', 'touchstart', 'keydown'];
    for (var i = 0; i < activityEvents.length; i++) {
      document.addEventListener(activityEvents[i], resetIdleTimer, false);
    }

    if (el.saveAccessToken) el.saveAccessToken.onclick = function () {
      var token = ((el.accessTokenInput && el.accessTokenInput.value) || (el.currentTokenDisplay && el.currentTokenDisplay.value) || '').replace(/^\s+|\s+$/g, '');
      if (!token) { setMessage('Please paste an access token.', 'error'); return; }
      setToken({ access_token: token, refresh_token: '', expires_at: (new Date()).getTime() + 55 * 60 * 1000, token_type: 'Bearer', manual: true });
      if (el.accessTokenInput) el.accessTokenInput.value = '';
      setMessage('Access token saved. It may expire in about an hour.', 'success');
      showPanel('player');
      startPolling();
    };

    if (el.clearData) el.clearData.onclick = function () {
      if (!window.confirm('Clear stored Spotify data from this browser?')) return;
      stopPolling();
      removeStored(STORAGE.token);
      removeStored(STORAGE.showArt);
      removeStored(STORAGE.showDevice);
      removeStored(STORAGE.showPlaylist);
      if (el.accessTokenInput) el.accessTokenInput.value = '';
      renderNothingPlaying('Paste an access token in Settings to see your playback.');
      showPanel('setup');
      syncCurrentTokenDisplay();
      setMessage('Stored data cleared.', 'success');
    };

    if (el.toggleTokenVisibility) el.toggleTokenVisibility.onclick = function () {
      if (!el.currentTokenDisplay) return;
      var hidden = el.currentTokenDisplay.type === 'password';
      el.currentTokenDisplay.type = hidden ? 'text' : 'password';
      el.toggleTokenVisibility.textContent = hidden ? 'Hide' : 'Show';
    };

    if (el.showArtToggle) el.showArtToggle.onchange = function () {
      var show = !!el.showArtToggle.checked;
      setStored(STORAGE.showArt, show ? '1' : '0');
      applyShowArt(show);
    };
    if (el.showDeviceToggle) el.showDeviceToggle.onchange = function () {
      setStored(STORAGE.showDevice, el.showDeviceToggle.checked ? '1' : '0');
      applySourceVisibility();
    };
    if (el.showPlaylistToggle) el.showPlaylistToggle.onchange = function () {
      setStored(STORAGE.showPlaylist, el.showPlaylistToggle.checked ? '1' : '0');
      applySourceVisibility();
    };
  }

  function init() {
    applyShowArt(getBool(STORAGE.showArt, true));
    renderNothingPlaying();
    applySourceVisibility();
    syncCurrentTokenDisplay();
    bindEvents();
    syncFullscreenBtn();
    syncWakeBtn();
    resetIdleTimer();

    var token = getToken();
    if (token && token.access_token) {
      showPanel('player');
      startPolling();
    } else {
      showPanel('setup');
      showTransientStatus('Paste an access token to start.');
    }
  }

  init();
})();
