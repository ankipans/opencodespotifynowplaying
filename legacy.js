(function () {
  'use strict';

  var API_BASE = 'https://api.spotify.com/v1';
  var POLL_INTERVAL = 5000;
  var PROGRESS_TICK = 1000;
  var STORAGE = {
    token: 'sp_token',
    showControls: 'sp_show_controls',
    showArt: 'sp_show_art',
    showStatus: 'sp_show_status',
    showAlbum: 'sp_show_album',
    showProgress: 'sp_show_progress',
    showVolume: 'sp_show_volume',
    showClock: 'sp_show_clock',
    clock24h: 'sp_clock_24h',
    refreshInterval: 'sp_refresh_interval',
    tabBadge: 'sp_tab_badge',
    trackNotifications: 'sp_track_notifications',
    contentSize: 'sp_content_size',
    showDevice: 'sp_show_device',
    showPlaylist: 'sp_show_playlist'
  };

  function $(id) { return document.getElementById(id); }
  var el = {
    setupPanel: $('setup-panel'),
    playerPanel: $('player-panel'),
    popoutBtn: $('popout-btn'),
    settingsToggle: $('settings-toggle'),
    accessTokenInput: $('access-token-input'),
    saveAccessToken: $('save-access-token'),
    clearData: $('clear-data'),
    currentTokenDisplay: $('current-token-display'),
    toggleTokenVisibility: $('toggle-token-visibility'),
    showControlsSelect: $('show-controls-select'),
    contentSizeSelect: $('content-size-select'),
    showArtToggle: $('show-art-toggle'),
    showStatusToggle: $('show-status-toggle'),
    showAlbumToggle: $('show-album-toggle'),
    showProgressToggle: $('show-progress-toggle'),
    showVolumeToggle: $('show-volume-toggle'),
    showClockSelect: $('show-clock-select'),
    clock24hToggle: $('clock-24h-toggle'),
    refreshFrequencySelect: $('refresh-frequency-select'),
    tabBadgeToggle: $('tab-badge-toggle'),
    trackNotifyToggle: $('track-notify-toggle'),
    topClock: $('top-clock'),
    topClockTime: $('top-clock-time'),
    topClockDate: $('top-clock-date'),
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
    progressBar: document.querySelector('.progress-bar'),
    prevBtn: $('prev-btn'),
    playpauseBtn: $('playpause-btn'),
    nextBtn: $('next-btn'),
    volumeWrap: $('volume-wrap'),
    volumeSlider: $('volume-slider'),
    deviceName: $('device-name'),
    contextName: $('context-name'),
    contextSep: $('context-sep'),
    footerStatus: $('footer-status'),
    bgArt: $('bg-art')
  };

  var pollTimer = null;
  var clockTimer = null;
  var progressTimer = null;
  var rateLimitTimer = null;
  var isFetching = false;
  var volumeDragging = false;
  var seekDragging = false;
  var currentPlayback = null;
  var lastProgressAt = 0;
  var lastContextUri = null;
  var lastContextName = '';
  var currentDeviceText = '';
  var lastImage = '';
  var lastNotifiedTrackId = null;
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
      if (status === 429) {
        var ra = parseInt(xhr.getResponseHeader('Retry-After'), 10);
        if (!ra || ra < 1) ra = 5;
        errMsg = 'Rate limited by Spotify. Retrying in ' + ra + 's.';
        var err429 = new Error(errMsg);
        err429.status = 429;
        err429.retryAfter = ra;
        cb(err429);
        return;
      }
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

  function getMode(key, def) {
    var v = getStored(key);
    if (v === 'hidden' || v === 'active' || v === 'always') return v;
    if (v === '1') return 'always';
    if (v === '0') return 'hidden';
    return def || 'hidden';
  }

  function setBodyClass(cls, on) {
    var has = document.body.className.indexOf(cls) !== -1;
    if (on && !has) document.body.className += (document.body.className ? ' ' : '') + cls;
    if (!on && has) document.body.className = document.body.className.replace(new RegExp('\\b' + cls + '\\b', 'g'), '').replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
  }

  function applyShowControls(mode) {
    var m = (mode === 'hidden' || mode === 'always') ? mode : 'active';
    setBodyClass('hide-controls', m === 'hidden');
    setBodyClass('controls-always', m === 'always');
    if (el.showControlsSelect) el.showControlsSelect.value = m;
  }

  function applyShowArt(show) {
    if (show) document.body.className = document.body.className.replace(/\bhide-art\b/g, '');
    else if (document.body.className.indexOf('hide-art') === -1) document.body.className += ' hide-art';
    if (el.showArtToggle) el.showArtToggle.checked = !!show;
  }

  function applyShowStatus(show) {
    if (show) document.body.className = document.body.className.replace(/\bhide-status\b/g, '');
    else if (document.body.className.indexOf('hide-status') === -1) document.body.className += ' hide-status';
    if (el.showStatusToggle) el.showStatusToggle.checked = !!show;
  }

  function applyShowAlbum(show) {
    if (show) document.body.className = document.body.className.replace(/\bhide-album\b/g, '');
    else if (document.body.className.indexOf('hide-album') === -1) document.body.className += ' hide-album';
    if (el.showAlbumToggle) el.showAlbumToggle.checked = !!show;
  }

  function applyShowProgress(show) {
    if (show) document.body.className = document.body.className.replace(/\bhide-progress\b/g, '');
    else if (document.body.className.indexOf('hide-progress') === -1) document.body.className += ' hide-progress';
    if (el.showProgressToggle) el.showProgressToggle.checked = !!show;
  }

  function applyShowVolume(show) {
    if (show) document.body.className = document.body.className.replace(/\bhide-volume\b/g, '');
    else if (document.body.className.indexOf('hide-volume') === -1) document.body.className += ' hide-volume';
    if (el.showVolumeToggle) el.showVolumeToggle.checked = !!show;
  }

  function getRefreshInterval() {
    var v = parseInt(getStored(STORAGE.refreshInterval), 10);
    return [3000, 5000, 10000, 30000].indexOf(v) !== -1 ? v : POLL_INTERVAL;
  }

  function updateClock() {
    if (!el.topClock || el.topClock.style.display === 'none') return;
    var now = new Date();
    var hour12 = !getBool(STORAGE.clock24h, false);
    var timeOpts = { hour: '2-digit', minute: '2-digit' };
    if (now.toLocaleTimeString) timeOpts.hour12 = hour12;
    var time = now.toLocaleTimeString ? now.toLocaleTimeString([], timeOpts) : now.toTimeString().slice(0, 5);
    var date = now.toLocaleDateString ? now.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }) : now.toDateString();
    if (el.topClockTime) el.topClockTime.textContent = time;
    if (el.topClockDate) el.topClockDate.textContent = date;
  }

  function applyShowClock(mode) {
    var m = (mode === 'active' || mode === 'always') ? mode : 'hidden';
    var visible = m !== 'hidden';
    if (el.topClock) el.topClock.style.display = visible ? 'table-cell' : 'none';
    setBodyClass('clock-active', m === 'active');
    setBodyClass('clock-always', m === 'always');
    if (el.showClockSelect) el.showClockSelect.value = m;
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (visible) {
      updateClock();
      clockTimer = setInterval(updateClock, 1000);
    }
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

  function getContentSize() {
    var v = getStored(STORAGE.contentSize, 'default');
    return (v === 'small' || v === 'large') ? v : 'default';
  }

  function applyContentSize(size) {
    var s = (size === 'small' || size === 'large') ? size : 'default';
    setBodyClass('size-small', s === 'small');
    setBodyClass('size-large', s === 'large');
    if (el.contentSizeSelect) el.contentSizeSelect.value = s;
  }

  function getTabBadgeEnabled() { return getBool(STORAGE.tabBadge, true); }

  function getTrackNotificationsEnabled() { return getBool(STORAGE.trackNotifications, false); }

  function ensureTrackNotificationPermission(cb) {
    var done = false;
    function finish(ok) { if (done) return; done = true; if (cb) cb(ok); }
    if (typeof Notification === 'undefined') { showTransientStatus('Notifications are not supported in this browser.'); finish(false); return; }
    if (Notification.permission === 'granted') { finish(true); return; }
    if (Notification.permission === 'denied') { showTransientStatus('Notification permission is blocked in browser settings.'); finish(false); return; }
    try {
      var res = Notification.requestPermission(function (perm) { finish(perm === 'granted'); });
      if (res && typeof res.then === 'function') {
        res.then(function (perm) { finish(perm === 'granted'); }).catch(function () { finish(false); });
      }
    } catch (e) { finish(false); }
  }

  function applyTrackNotificationsEnabled(enabled) {
    if (el.trackNotifyToggle) el.trackNotifyToggle.checked = !!enabled;
    if (enabled) ensureTrackNotificationPermission(function () {});
  }

  function notifyTrackChange(trackId, title, artist, album, image) {
    if (!trackId || trackId === lastNotifiedTrackId) return;
    var isFirstSeen = lastNotifiedTrackId === null;
    lastNotifiedTrackId = trackId;
    if (isFirstSeen) return;
    if (!getTrackNotificationsEnabled()) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    var parts = [];
    if (artist) parts.push(artist);
    if (album) parts.push(album);
    var body = parts.join(' • ') || 'Now playing';
    try {
      var n = new Notification(title || 'Now playing', {
        body: body,
        icon: image || './favicon.svg',
        tag: 'spotify-now-playing-track',
        silent: false
      });
      setTimeout(function () { try { n.close(); } catch (e) {} }, 6000);
    } catch (e) {}
  }

  var playbackIndicator = (function () {
    var link = null;
    var baseImg = null;
    var baseReady = false;
    var baseFailed = false;
    var lastPlaying = null;
    var lastBadge = null;
    function ensureLink() {
      if (link && link.parentNode) return link;
      var links = document.getElementsByTagName('link');
      for (var i = 0; i < links.length; i++) {
        if ((links[i].rel || '').toLowerCase() === 'icon') { link = links[i]; return link; }
      }
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
      return link;
    }
    function ensureBase(cb) {
      if (baseReady && baseImg) { cb(); return; }
      if (baseFailed) { cb(); return; }
      var img = new Image();
      img.onload = function () { baseImg = img; baseReady = true; cb(); };
      img.onerror = function () { baseFailed = true; cb(); };
      img.src = './favicon.svg';
    }
    function draw(isPlaying) {
      var lnk = ensureLink();
      if (!baseReady || !baseImg) { if (lnk) { lnk.href = './favicon.svg'; lnk.type = 'image/svg+xml'; } return; }
      try {
        var size = 64;
        var canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        var ctx = canvas.getContext && canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(baseImg, 0, 0, size, size);
        if (isPlaying) {
          ctx.beginPath();
          ctx.arc(size - 14, size - 14, 11, 0, Math.PI * 2);
          ctx.fillStyle = '#1db954';
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#111111';
          ctx.stroke();
        }
        lnk.href = canvas.toDataURL('image/png');
        lnk.type = 'image/png';
      } catch (e) {
        if (lnk) { lnk.href = './favicon.svg'; lnk.type = 'image/svg+xml'; }
      }
    }
    function setBadge(isPlaying) {
      if (lastBadge === isPlaying) return;
      lastBadge = isPlaying;
      try {
        if (navigator.setAppBadge && navigator.clearAppBadge) {
          if (isPlaying) navigator.setAppBadge(1); else navigator.clearAppBadge();
        }
      } catch (e) {}
    }
    return function (isPlaying) {
      var enabled = getTabBadgeEnabled();
      var playing = !!isPlaying && enabled;
      setBadge(playing);
      if (!enabled) {
        if (lastPlaying !== false) {
          lastPlaying = false;
          ensureBase(function () { draw(false); });
        }
        return;
      }
      if (lastPlaying === playing) return;
      lastPlaying = playing;
      ensureBase(function () { draw(playing); });
    };
  })();

  var popoutChannel = null;
  function getPopoutChannel() {
    if (popoutChannel) return popoutChannel;
    if (typeof BroadcastChannel === 'undefined') return null;
    try { popoutChannel = new BroadcastChannel('sp_now_playing_popout'); } catch (e) { popoutChannel = null; }
    return popoutChannel;
  }

  function publishPopoutState() {
    var payload;
    if (!currentPlayback) {
      payload = { empty: true, timestamp: (new Date()).getTime() };
    } else {
      payload = {
        title: currentPlayback.title || '',
        artist: currentPlayback.artists || '',
        album: currentPlayback.album || '',
        image: currentPlayback.image || '',
        isPlaying: !!currentPlayback.isPlaying,
        statusText: currentPlayback.isPlaying ? 'Playing' : 'Paused',
        progressMs: Math.max(0, Number(currentPlayback.progressMs || 0)),
        durationMs: Math.max(0, Number(currentPlayback.durationMs || 0)),
        timestamp: (new Date()).getTime()
      };
    }
    try { localStorage.setItem('sp_popout_state', JSON.stringify(payload)); } catch (e) {}
    var bc = getPopoutChannel();
    if (bc) { try { bc.postMessage(payload); } catch (e) {} }
  }

  function renderNothingPlaying(message) {
    currentPlayback = null;
    lastNotifiedTrackId = 'none';
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
    playbackIndicator(false);
    publishPopoutState();
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

    currentPlayback = { isPlaying: !!data.is_playing, progressMs: progress, durationMs: duration, title: title, artists: artists, album: album, image: image };
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
    if (el.volumeSlider && !volumeDragging && data.device && typeof data.device.volume_percent === 'number') {
      el.volumeSlider.value = String(data.device.volume_percent);
      el.volumeSlider.title = data.device.volume_percent + '%';
    }
    fetchPlaylistName(data.context && data.context.uri ? data.context.uri : null);
    notifyTrackChange(item.uri || item.id || '', title, artists, album, image);
    playbackIndicator(!!data.is_playing);
    publishPopoutState();
  }

  function fetchNowPlaying() {
    if (isFetching) return;
    isFetching = true;
    apiFetch('/me/player/currently-playing', 'GET', function (err, data) {
      if (err) {
        isFetching = false;
        if (err.status === 429) {
          var retryAfter = Math.max(1, parseInt(err.retryAfter, 10) || 5);
          showTransientStatus('Rate limited by Spotify. Retrying in ' + retryAfter + 's.');
          if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
          if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
          if (rateLimitTimer) clearTimeout(rateLimitTimer);
          rateLimitTimer = setTimeout(function () {
            rateLimitTimer = null;
            if (getToken() && getToken().access_token) startPolling();
          }, retryAfter * 1000);
          return;
        }
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
    pollTimer = setInterval(fetchNowPlaying, getRefreshInterval());
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
    if (rateLimitTimer) { clearTimeout(rateLimitTimer); rateLimitTimer = null; }
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
    if (el.popoutBtn) el.popoutBtn.onclick = function () {
      publishPopoutState();
      var w = window.open('./popout.html', 'sp-now-playing-popout', 'width=460,height=230,resizable=yes,scrollbars=no');
      if (w && w.focus) w.focus();
    };
    if (el.settingsToggle) el.settingsToggle.onclick = function () {
      var opening = el.setupPanel.style.display === 'none';
      el.setupPanel.style.display = opening ? 'block' : 'none';
      if (opening) { syncCurrentTokenDisplay(); setMessage(''); }
    };
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
    if (el.volumeSlider) {
      el.volumeSlider.onmousedown = function () { volumeDragging = true; };
      el.volumeSlider.ontouchstart = function () { volumeDragging = true; };
      el.volumeSlider.onmouseup = function () { volumeDragging = false; };
      el.volumeSlider.ontouchend = function () { volumeDragging = false; };
      el.volumeSlider.onchange = function () {
        volumeDragging = false;
        var v = Math.max(0, Math.min(100, parseInt(el.volumeSlider.value, 10) || 0));
        apiFetch('/me/player/volume?volume_percent=' + v, 'PUT', function (err) {
          if (err) showTransientStatus(err.message);
        });
      };
    }
    if (el.progressBar) {
      el.progressBar.style.cursor = 'pointer';
      el.progressBar.onclick = function (e) {
        if (!currentPlayback || !currentPlayback.durationMs) return;
        var rect = el.progressBar.getBoundingClientRect();
        var x = (e.clientX || 0) - rect.left;
        if (x < 0) x = 0; if (x > rect.width) x = rect.width;
        var pct = rect.width > 0 ? x / rect.width : 0;
        var ms = Math.floor(pct * currentPlayback.durationMs);
        apiFetch('/me/player/seek?position_ms=' + ms, 'PUT', function (err) {
          if (err) { showTransientStatus(err.message); return; }
          currentPlayback.progressMs = Math.min(ms, currentPlayback.durationMs || ms);
          lastProgressAt = (new Date()).getTime();
          setProgress(currentPlayback.progressMs, currentPlayback.durationMs || 0);
          setTimeout(fetchNowPlaying, 500);
        });
      };
    }

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
      removeStored(STORAGE.showControls);
      removeStored(STORAGE.showArt);
      removeStored(STORAGE.showStatus);
      removeStored(STORAGE.showAlbum);
      removeStored(STORAGE.showProgress);
      removeStored(STORAGE.showVolume);
      removeStored(STORAGE.showClock);
      removeStored(STORAGE.clock24h);
      removeStored(STORAGE.refreshInterval);
      removeStored(STORAGE.tabBadge);
      removeStored(STORAGE.trackNotifications);
      removeStored(STORAGE.contentSize);
      removeStored(STORAGE.showDevice);
      removeStored(STORAGE.showPlaylist);
      if (el.accessTokenInput) el.accessTokenInput.value = '';
      applyShowControls('active');
      applyShowArt(true);
      applyShowStatus(true);
      applyShowAlbum(true);
      applyShowProgress(true);
      applyShowVolume(true);
      applyShowClock('hidden');
      if (el.clock24hToggle) el.clock24hToggle.checked = false;
      if (el.refreshFrequencySelect) el.refreshFrequencySelect.value = String(POLL_INTERVAL);
      if (el.tabBadgeToggle) el.tabBadgeToggle.checked = true;
      if (el.trackNotifyToggle) el.trackNotifyToggle.checked = false;
      lastNotifiedTrackId = null;
      applyContentSize('default');
      playbackIndicator(false);
      applySourceVisibility();
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
    if (el.showStatusToggle) el.showStatusToggle.onchange = function () {
      var show = !!el.showStatusToggle.checked;
      setStored(STORAGE.showStatus, show ? '1' : '0');
      applyShowStatus(show);
    };
    if (el.showAlbumToggle) el.showAlbumToggle.onchange = function () {
      var show = !!el.showAlbumToggle.checked;
      setStored(STORAGE.showAlbum, show ? '1' : '0');
      applyShowAlbum(show);
    };
    if (el.showProgressToggle) el.showProgressToggle.onchange = function () {
      var show = !!el.showProgressToggle.checked;
      setStored(STORAGE.showProgress, show ? '1' : '0');
      applyShowProgress(show);
    };
    if (el.showVolumeToggle) el.showVolumeToggle.onchange = function () {
      var show = !!el.showVolumeToggle.checked;
      setStored(STORAGE.showVolume, show ? '1' : '0');
      applyShowVolume(show);
    };
    if (el.showControlsSelect) el.showControlsSelect.onchange = function () {
      var mode = el.showControlsSelect.value;
      setStored(STORAGE.showControls, mode);
      applyShowControls(mode);
    };
    if (el.contentSizeSelect) el.contentSizeSelect.onchange = function () {
      var v = el.contentSizeSelect.value;
      var size = (v === 'small' || v === 'large') ? v : 'default';
      setStored(STORAGE.contentSize, size);
      applyContentSize(size);
    };
    if (el.showClockSelect) el.showClockSelect.onchange = function () {
      var mode = el.showClockSelect.value;
      setStored(STORAGE.showClock, mode);
      applyShowClock(mode);
    };
    if (el.clock24hToggle) el.clock24hToggle.onchange = function () {
      var on = !!el.clock24hToggle.checked;
      setStored(STORAGE.clock24h, on ? '1' : '0');
      updateClock();
    };
    if (el.refreshFrequencySelect) el.refreshFrequencySelect.onchange = function () {
      var v = parseInt(el.refreshFrequencySelect.value, 10);
      var ok = [3000, 5000, 10000, 30000].indexOf(v) !== -1 ? v : POLL_INTERVAL;
      setStored(STORAGE.refreshInterval, String(ok));
      if (pollTimer) startPolling();
    };
    if (el.tabBadgeToggle) el.tabBadgeToggle.onchange = function () {
      var on = !!el.tabBadgeToggle.checked;
      setStored(STORAGE.tabBadge, on ? '1' : '0');
      if (!on) playbackIndicator(false); else playbackIndicator(!!(currentPlayback && currentPlayback.isPlaying));
    };
    if (el.trackNotifyToggle) el.trackNotifyToggle.onchange = function () {
      var on = !!el.trackNotifyToggle.checked;
      if (on) {
        ensureTrackNotificationPermission(function (ok) {
          if (!ok) {
            if (el.trackNotifyToggle) el.trackNotifyToggle.checked = false;
            setStored(STORAGE.trackNotifications, '0');
            return;
          }
          setStored(STORAGE.trackNotifications, '1');
        });
        return;
      }
      setStored(STORAGE.trackNotifications, '0');
    };
    if (el.showDeviceToggle) el.showDeviceToggle.onchange = function () {
      setStored(STORAGE.showDevice, el.showDeviceToggle.checked ? '1' : '0');
      applySourceVisibility();
    };
    if (el.showPlaylistToggle) el.showPlaylistToggle.onchange = function () {
      setStored(STORAGE.showPlaylist, el.showPlaylistToggle.checked ? '1' : '0');
      applySourceVisibility();
    };
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      var token = getToken();
      if (token && token.access_token && !rateLimitTimer) {
        fetchNowPlaying();
        if (!pollTimer) startPolling();
      }
    });
  }

  function init() {
    applyShowControls(getMode(STORAGE.showControls, 'active'));
    applyContentSize(getContentSize());
    applyShowArt(getBool(STORAGE.showArt, true));
    applyShowStatus(getBool(STORAGE.showStatus, true));
    applyShowAlbum(getBool(STORAGE.showAlbum, true));
    applyShowProgress(getBool(STORAGE.showProgress, true));
    applyShowVolume(getBool(STORAGE.showVolume, true));
    applyShowClock(getMode(STORAGE.showClock, 'hidden'));
    if (el.clock24hToggle) el.clock24hToggle.checked = getBool(STORAGE.clock24h, false);
    if (el.refreshFrequencySelect) el.refreshFrequencySelect.value = String(getRefreshInterval());
    if (el.tabBadgeToggle) el.tabBadgeToggle.checked = getTabBadgeEnabled();
    if (el.trackNotifyToggle) el.trackNotifyToggle.checked = getTrackNotificationsEnabled();
    renderNothingPlaying();
    applySourceVisibility();
    syncCurrentTokenDisplay();
    bindEvents();
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
