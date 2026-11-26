(() => {
  'use strict';

  const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
  const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
  const API_BASE = 'https://api.spotify.com/v1';
  const SCOPES = ['user-read-currently-playing', 'user-read-playback-state', 'user-modify-playback-state'];
  const POLL_INTERVAL = 5000;
  const PROGRESS_TICK = 1000;

  const STORAGE = {
    clientId: 'sp_client_id',
    token: 'sp_token',
    verifier: 'sp_code_verifier',
    state: 'sp_auth_state',
    showControls: 'sp_show_controls',
    showDevice: 'sp_show_device',
    showPlaylist: 'sp_show_playlist',
    showArt: 'sp_show_art',
    showStatus: 'sp_show_status',
    showAlbum: 'sp_show_album',
    showProgress: 'sp_show_progress',
    showVolume: 'sp_show_volume',
    showClock: 'sp_show_clock',
    clock24h: 'sp_clock_24h',
    refreshInterval: 'sp_refresh_interval',
    mediaSession: 'sp_media_session',
    tabBadge: 'sp_tab_badge',
    trackNotifications: 'sp_track_notifications',
    fullscreen: 'sp_want_fullscreen',
    theme: 'sp_theme',
    contentSize: 'sp_content_size',
  };

  const REDIRECT_URI = window.location.origin + window.location.pathname.replace(/index\.html$/, '');

  const el = {
    setupPanel: document.getElementById('setup-panel'),
    loginPanel: document.getElementById('login-panel'),
    playerPanel: document.getElementById('player-panel'),
    appearanceGroup: document.getElementById('appearance-group'),
    settingsToggle: document.getElementById('settings-toggle'),
    redirectUri: document.getElementById('redirect-uri'),
    copyRedirect: document.getElementById('copy-redirect'),
    clientIdInput: document.getElementById('client-id-input'),
    saveClientId: document.getElementById('save-client-id'),
    clearData: document.getElementById('clear-data'),
    themeSelect: document.getElementById('theme-select'),
    contentSizeSelect: document.getElementById('content-size-select'),
    showControlsSelect: document.getElementById('show-controls-select'),
    showDeviceToggle: document.getElementById('show-device-toggle'),
    showPlaylistToggle: document.getElementById('show-playlist-toggle'),
    showArtToggle: document.getElementById('show-art-toggle'),
    showStatusToggle: document.getElementById('show-status-toggle'),
    showAlbumToggle: document.getElementById('show-album-toggle'),
    showProgressToggle: document.getElementById('show-progress-toggle'),
    showVolumeToggle: document.getElementById('show-volume-toggle'),
    showClockSelect: document.getElementById('show-clock-select'),
    clock24hToggle: document.getElementById('clock-24h-toggle'),
    refreshFrequencySelect: document.getElementById('refresh-frequency-select'),
    mediaSessionToggle: document.getElementById('media-session-toggle'),
    tabBadgeToggle: document.getElementById('tab-badge-toggle'),
    trackNotifyToggle: document.getElementById('track-notify-toggle'),
    topClock: document.getElementById('top-clock'),
    topClockTime: document.getElementById('top-clock-time'),
    topClockDate: document.getElementById('top-clock-date'),
    accessTokenInput: document.getElementById('access-token-input'),
    saveAccessToken: document.getElementById('save-access-token'),
    currentTokenDisplay: document.getElementById('current-token-display'),
    toggleTokenVisibility: document.getElementById('toggle-token-visibility'),
    copyCurrentToken: document.getElementById('copy-current-token'),
    setupMessage: document.getElementById('setup-message'),
    loginBtn: document.getElementById('login-btn'),
    connectSpotifyBtn: document.getElementById('connect-spotify-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    albumArt: document.getElementById('album-art'),
    artWrap: document.querySelector('.art-wrap'),
    artPlaceholder: document.getElementById('art-placeholder'),
    statusBadge: document.getElementById('status-badge'),
    prevBtn: document.getElementById('prev-btn'),
    playpauseBtn: document.getElementById('playpause-btn'),
    nextBtn: document.getElementById('next-btn'),
    volumeWrap: document.getElementById('volume-wrap'),
    volumeSlider: document.getElementById('volume-slider'),
    trackName: document.getElementById('track-name'),
    trackArtist: document.getElementById('track-artist'),
    trackAlbum: document.getElementById('track-album'),
    progressFill: document.getElementById('progress-fill'),
    progressCurrent: document.getElementById('progress-current'),
    progressDuration: document.getElementById('progress-duration'),
    progressBar: document.querySelector('.progress-bar'),
    deviceName: document.getElementById('device-name'),
    contextName: document.getElementById('context-name'),
    contextSep: document.getElementById('context-sep'),
    footerStatus: document.getElementById('footer-status'),
    bgArt: document.getElementById('bg-art'),
    popoutBtn: document.getElementById('popout-btn'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    wakelockBtn: document.getElementById('wakelock-btn'),
  };

  let pollTimer = null;
  let pollWorker = null;
  let progressTimer = null;
  let rateLimitTimer = null;
  let currentPlayback = null;
  let lastProgressAt = 0;
  let isFetching = false;
  let volumeDragging = false;
  let seekDragging = false;
  let wakeLock = null;
  let wakeLockWanted = false;
  let fullscreenWanted = localStorage.getItem(STORAGE.fullscreen) === '1';
  let unloadingForRefresh = false;
  let statusTimer = null;
  let idleTimer = null;
  let clockTimer = null;
  let lastMediaData = null;
  let lastMediaItem = null;
  let lastMediaImage = '';
  let lastNotifiedTrackId = null;
  const IDLE_MS = (window.matchMedia && (window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(max-width: 768px)').matches)) ? 10000 : 5000;
  const DEFAULT_TITLE = 'Spotify Now Playing';

  function setMessage(text, type = '') {
    el.setupMessage.textContent = text;
    el.setupMessage.className = 'message' + (type ? ' ' + type : '');
  }

  function getClientId() {
    return localStorage.getItem(STORAGE.clientId) || '';
  }

  function setClientId(id) {
    localStorage.setItem(STORAGE.clientId, id.trim());
  }

  function getShowControls() {
    const v = localStorage.getItem(STORAGE.showControls);
    if (v === 'hidden' || v === 'active' || v === 'always') return v;
    if (v === '0') return 'hidden';
    return 'active';
  }

  function getShowDevice() {
    const v = localStorage.getItem(STORAGE.showDevice);
    return v === null ? true : v === '1';
  }

  function getShowPlaylist() {
    const v = localStorage.getItem(STORAGE.showPlaylist);
    return v === null ? true : v === '1';
  }

  function getShowArt() {
    const v = localStorage.getItem(STORAGE.showArt);
    return v === null ? true : v === '1';
  }

  function getShowStatus() {
    const v = localStorage.getItem(STORAGE.showStatus);
    return v === null ? true : v === '1';
  }

  function getShowAlbum() {
    const v = localStorage.getItem(STORAGE.showAlbum);
    return v === null ? true : v === '1';
  }

  function getShowProgress() {
    const v = localStorage.getItem(STORAGE.showProgress);
    return v === null ? true : v === '1';
  }

  function getShowVolume() {
    const v = localStorage.getItem(STORAGE.showVolume);
    return v === null ? true : v === '1';
  }

  function getUiTheme() {
    return localStorage.getItem(STORAGE.theme) === 'legacy' ? 'legacy' : 'modern';
  }

  function applyUiTheme(theme) {
    const t = theme === 'legacy' ? 'legacy' : 'modern';
    document.body.classList.toggle('theme-legacy', t === 'legacy');
    if (el.themeSelect) el.themeSelect.value = t;
  }

  function getContentSize() {
    const v = localStorage.getItem(STORAGE.contentSize);
    return (v === 'small' || v === 'large') ? v : 'default';
  }

  function applyContentSize(size) {
    const s = (size === 'small' || size === 'large') ? size : 'default';
    document.body.classList.remove('size-small', 'size-large');
    if (s !== 'default') document.body.classList.add('size-' + s);
    if (el.contentSizeSelect) el.contentSizeSelect.value = s;
  }

  function applyShowControls(mode) {
    const m = (mode === 'hidden' || mode === 'always') ? mode : 'active';
    document.body.classList.toggle('hide-controls', m === 'hidden');
    document.body.classList.toggle('controls-always', m === 'always');
    if (el.showControlsSelect) el.showControlsSelect.value = m;
  }

  function applyShowArt(show) {
    document.body.classList.toggle('hide-art', !show);
    if (el.showArtToggle) el.showArtToggle.checked = !!show;
  }

  function applyShowStatus(show) {
    document.body.classList.toggle('hide-status', !show);
    if (el.showStatusToggle) el.showStatusToggle.checked = !!show;
  }

  function applyShowAlbum(show) {
    document.body.classList.toggle('hide-album', !show);
    if (el.showAlbumToggle) el.showAlbumToggle.checked = !!show;
  }

  function applyShowProgress(show) {
    document.body.classList.toggle('hide-progress', !show);
    if (el.showProgressToggle) el.showProgressToggle.checked = !!show;
  }

  function applyShowVolume(show) {
    document.body.classList.toggle('hide-volume', !show);
    if (el.showVolumeToggle) el.showVolumeToggle.checked = !!show;
  }

  function getShowClock() {
    const v = localStorage.getItem(STORAGE.showClock);
    if (v === 'hidden' || v === 'active' || v === 'always') return v;
    if (v === '1') return 'always';
    return 'hidden';
  }

  function getClock24h() {
    return localStorage.getItem(STORAGE.clock24h) === '1';
  }

  function getRefreshInterval() {
    const v = parseInt(localStorage.getItem(STORAGE.refreshInterval), 10);
    return [3000, 5000, 10000, 30000].indexOf(v) !== -1 ? v : POLL_INTERVAL;
  }

  function updateClock() {
    if (!el.topClock || el.topClock.classList.contains('clock-hidden')) return;
    const now = new Date();
    const hour12 = !getClock24h();
    if (el.topClockTime) el.topClockTime.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: hour12 });
    if (el.topClockDate) el.topClockDate.textContent = now.toLocaleDateString([], { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  }

  function applyShowClock(mode) {
    const m = (mode === 'active' || mode === 'always') ? mode : 'hidden';
    const visible = m !== 'hidden';
    if (el.topClock) {
      el.topClock.classList.toggle('clock-hidden', !visible);
      el.topClock.setAttribute('aria-hidden', visible ? 'false' : 'true');
    }
    document.body.classList.toggle('clock-active', m === 'active');
    document.body.classList.toggle('clock-always', m === 'always');
    if (el.showClockSelect) el.showClockSelect.value = m;
    if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
    if (visible) {
      updateClock();
      clockTimer = setInterval(updateClock, 1000);
    }
  }

  function getMediaSessionEnabled() {
    const v = localStorage.getItem(STORAGE.mediaSession);
    return v === null ? true : v === '1';
  }

  function getTabBadgeEnabled() {
    const v = localStorage.getItem(STORAGE.tabBadge);
    return v === null ? true : v === '1';
  }

  function updateMediaSessionFromCurrent() {
    if (lastMediaData && lastMediaItem) updateMediaSession(lastMediaData, lastMediaItem, lastMediaImage);
    else updateMediaSession(null, null, '');
  }

  function applyMediaSessionEnabled(enabled) {
    if (el.mediaSessionToggle) el.mediaSessionToggle.checked = !!enabled;
    if (!enabled) {
      try { if ('mediaSession' in navigator) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } } catch (e) {}
      silentAudio(false);
    } else {
      updateMediaSessionFromCurrent();
    }
  }

  function applyTabBadgeEnabled(enabled) {
    if (el.tabBadgeToggle) el.tabBadgeToggle.checked = !!enabled;
    if (!enabled) {
      playbackIndicator(false);
      try { if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) {}
    } else if (currentPlayback) {
      playbackIndicator(!!currentPlayback.isPlaying);
    }
  }

  function getTrackNotificationsEnabled() {
    return localStorage.getItem(STORAGE.trackNotifications) === '1';
  }

  async function ensureTrackNotificationPermission() {
    if (!('Notification' in window)) {
      showTransientStatus('Notifications are not supported in this browser.', 3000);
      return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      showTransientStatus('Notification permission is blocked in browser settings.', 3500);
      return false;
    }
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showTransientStatus('Notification permission was not granted.', 3000);
        return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyTrackNotificationsEnabled(enabled) {
    if (el.trackNotifyToggle) el.trackNotifyToggle.checked = !!enabled;
    if (enabled) ensureTrackNotificationPermission().catch(console.error);
  }

  function notifyTrackChange(trackId, title, artist, album, image) {
    if (!trackId || trackId === lastNotifiedTrackId) return;
    const isFirstSeen = lastNotifiedTrackId === null;
    lastNotifiedTrackId = trackId;
    if (isFirstSeen) return;
    if (!getTrackNotificationsEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const body = [artist, album].filter(Boolean).join(' • ') || 'Now playing';
    try {
      const n = new Notification(title || 'Now playing', {
        body,
        icon: image || './favicon.svg',
        tag: 'spotify-now-playing-track',
        silent: false,
      });
      setTimeout(() => { try { n.close(); } catch (e) {} }, 6000);
    } catch (e) {}
  }

  function getStoredAccessToken() {
    const token = getToken();
    if (token && token.access_token) return String(token.access_token);
    const keys = [STORAGE.token, 'access_token', 'spotify_access_token', 'token'];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.access_token) return String(parsed.access_token);
        if (typeof parsed === 'string' && parsed.trim()) return parsed.trim();
      } catch {}
      const trimmed = raw.trim().replace(/^Bearer\s+/i, '');
      if (trimmed) return trimmed;
    }
    return '';
  }

  function syncCurrentTokenDisplay() {
    const display = el.currentTokenDisplay || document.getElementById('current-token-display');
    if (!display) return;
    const accessToken = getStoredAccessToken();
    display.value = accessToken;
    display.placeholder = accessToken ? '' : 'No active token';
    if (el.toggleTokenVisibility) {
      display.type = 'password';
      el.toggleTokenVisibility.textContent = 'Show';
    }
  }

  function applySourceVisibility() {
    if (el.showDeviceToggle) el.showDeviceToggle.checked = getShowDevice();
    if (el.showPlaylistToggle) el.showPlaylistToggle.checked = getShowPlaylist();
    renderPlaybackSource(currentDeviceText, lastContextName);
  }

  function getToken() {
    try {
      const keys = [STORAGE.token, 'access_token', 'spotify_access_token', 'token'];
      let raw = null;
      for (const k of keys) {
        const v = localStorage.getItem(k);
        if (v) { raw = v; break; }
      }
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          if (parsed.access_token) return parsed;
          // maybe object with different shape
          if (parsed.accessToken) return { ...parsed, access_token: parsed.accessToken };
        }
      } catch {}
      const trimmed = raw.trim().replace(/^Bearer\s+/i, '');
      if (trimmed) return { access_token: trimmed, refresh_token: '', expires_at: Date.now() + 3600 * 1000, token_type: 'Bearer' };
      return null;
    } catch {
      return null;
    }
  }

  function setToken(token) {
    localStorage.setItem(STORAGE.token, JSON.stringify(token));
    syncCurrentTokenDisplay();
    syncAppearanceVisibility();
  }

  function clearToken() {
    localStorage.removeItem(STORAGE.token);
    syncCurrentTokenDisplay();
    syncAppearanceVisibility();
  }

  function clearAllData() {
    Object.values(STORAGE).forEach((k) => {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    });
  }

  function hasValidToken(token) {
    return !!(token && token.access_token && token.expires_at && Date.now() < token.expires_at - 30000);
  }

  function randomString(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, length);
  }

  function base64UrlEncode(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  async function sha256(text) {
    const data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data);
  }

  async function createPkce() {
    const verifier = randomString(64);
    const challenge = base64UrlEncode(await sha256(verifier));
    return { verifier, challenge };
  }

  function syncAppearanceVisibility() {
    if (el.appearanceGroup) el.appearanceGroup.hidden = !getToken();
  }

  function showPanel(name) {
    el.setupPanel.hidden = name !== 'setup';
    el.loginPanel.hidden = name !== 'login';
    el.playerPanel.hidden = name !== 'player';
    if (el.logoutBtn) el.logoutBtn.hidden = name !== 'player';
    syncAppearanceVisibility();
    if (name === 'player') resetIdleTimer();
    else document.body.classList.remove('ui-idle');
  }

  function updateFooter(text) {
    if (!el.footerStatus) return;
    el.footerStatus.textContent = text || '';
  }

  function showTransientStatus(text, ms = 2800) {
    if (!el.footerStatus) return;
    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
    el.footerStatus.textContent = text || '';
    if (text && ms > 0) {
      statusTimer = setTimeout(() => {
        if (el.footerStatus.textContent === text) el.footerStatus.textContent = '';
      }, ms);
    }
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function setProgress(progressMs, durationMs) {
    const duration = Math.max(0, durationMs || 0);
    const progress = Math.min(Math.max(0, progressMs || 0), duration || progressMs || 0);
    const pct = duration > 0 ? (progress / duration) * 100 : 0;
    el.progressFill.style.width = pct.toFixed(2) + '%';
    el.progressBar.setAttribute('aria-valuenow', String(Math.round(pct)));
    el.progressCurrent.textContent = formatTime(progress);
    el.progressDuration.textContent = formatTime(duration);
  }

  function setDocumentTitle(title, artist) {
    if (title && artist) {
      document.title = `${title} — ${artist}`;
    } else if (title) {
      document.title = title;
    } else {
      document.title = DEFAULT_TITLE;
    }
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        default: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return [h, s, l];
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  }

  function luminance(r, g, b) {
    const toLin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  }

  function applyTheme(rgb) {
    const [r, g, b] = rgb || [0, 0, 0];
    const lum = luminance(r, g, b);
    const darkText = lum > 0.52;
    const fg = darkText ? [17, 17, 17] : [255, 255, 255];
    const fgRgb = fg.join(', ');
    const bgHex = rgbToHex(r, g, b);

    document.documentElement.style.setProperty('--bg-color', bgHex);
    document.documentElement.style.setProperty('--fg', darkText ? '#111111' : '#ffffff');
    document.documentElement.style.setProperty('--fg-rgb', fgRgb);
    document.documentElement.style.setProperty('--muted', `rgba(${fgRgb}, 0.74)`);
    document.documentElement.style.setProperty('--muted-2', `rgba(${fgRgb}, 0.56)`);
    document.documentElement.style.setProperty('--faint', `rgba(${fgRgb}, 0.14)`);
    document.documentElement.style.setProperty('--faint-2', `rgba(${fgRgb}, 0.08)`);
    document.documentElement.style.setProperty('--panel', darkText ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)');
    document.documentElement.style.setProperty('--panel-border', `rgba(${fgRgb}, 0.14)`);
    document.documentElement.style.setProperty('--btn-primary-bg', darkText ? '#111111' : '#ffffff');
    document.documentElement.style.setProperty('--btn-primary-fg', darkText ? '#ffffff' : '#000000');

    el.bgArt.style.backgroundImage = '';
    el.bgArt.style.backgroundColor = bgHex;
    el.bgArt.classList.toggle('empty', !rgb);
  }

  function extractDominantColor(imageUrl) {
    return new Promise((resolve) => {
      if (!imageUrl) { resolve([0, 0, 0]); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.decoding = 'async';
      img.onload = () => {
        try {
          const size = 32;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) { resolve([0, 0, 0]); return; }
          ctx.drawImage(img, 0, 0, size, size);
          const { data } = ctx.getImageData(0, 0, size, size);

          let r = 0, g = 0, b = 0, count = 0;
          let sr = 0, sg = 0, sb = 0, sc = 0;
          for (let i = 0; i < data.length; i += 4) {
            const a = data[i + 3];
            if (a < 128) continue;
            const pr = data[i], pg = data[i + 1], pb = data[i + 2];
            r += pr; g += pg; b += pb; count++;
            const [, s, l] = rgbToHsl(pr, pg, pb);
            if (s > 0.12 && l > 0.08 && l < 0.92) {
              const w = 0.5 + s;
              sr += pr * w; sg += pg * w; sb += pb * w; sc += w;
            }
          }
          if (!count) { resolve([0, 0, 0]); return; }
          if (sc > 0) resolve([Math.round(sr / sc), Math.round(sg / sc), Math.round(sb / sc)]);
          else resolve([Math.round(r / count), Math.round(g / count), Math.round(b / count)]);
        } catch {
          resolve([0, 0, 0]);
        }
      };
      img.onerror = () => resolve([0, 0, 0]);
      img.src = imageUrl;
    });
  }

  let bgRequestId = 0;
  let lastBgImage = null;
  let lastBgColor = null;
  let lastContextUri = null;
  let lastContextName = '';
  let currentDeviceText = '';
  async function setBackground(imageUrl) {
    const next = imageUrl || '';
    if (next === lastBgImage && lastBgColor) {
      return;
    }
    const req = ++bgRequestId;
    if (!next) {
      lastBgImage = '';
      lastBgColor = [0, 0, 0];
      applyTheme(lastBgColor);
      return;
    }
    const color = await extractDominantColor(next);
    if (req !== bgRequestId) return;
    lastBgImage = next;
    lastBgColor = color;
    applyTheme(color);
  }

  function renderPlaybackSource(deviceName, contextName) {
    currentDeviceText = deviceName || '';
    const device = getShowDevice() ? (deviceName || '') : '';
    const context = getShowPlaylist() ? (contextName || '') : '';
    if (el.deviceName) el.deviceName.textContent = device;
    if (el.contextName) el.contextName.textContent = context;
    if (el.contextSep) el.contextSep.hidden = !(device && context);
  }

  async function updateContextName(data) {
    const ctx = data && data.context;
    const uri = ctx && ctx.uri ? ctx.uri : '';
    const type = ctx && ctx.type ? ctx.type : '';
    const device = data && data.device && data.device.name ? data.device.name : '';
    if (!uri || type !== 'playlist') {
      lastContextUri = uri || null;
      lastContextName = '';
      renderPlaybackSource(device, '');
      return;
    }
    if (uri === lastContextUri) {
      renderPlaybackSource(device, lastContextName);
      return;
    }
    lastContextUri = uri;
    lastContextName = '';
    renderPlaybackSource(device, '');
    try {
      const id = uri.split(':').pop();
      const playlist = await apiFetch(`/playlists/${encodeURIComponent(id)}?fields=name`);
      if (lastContextUri !== uri) return;
      lastContextName = (playlist && playlist.name) || '';
      renderPlaybackSource(device, lastContextName);
    } catch (err) {
      console.error('Failed to fetch playlist name', err);
    }
  }

  function updateArtAspectRatio() {
    if (!el.artWrap || !el.albumArt) return;
    const w = el.albumArt.naturalWidth;
    const h = el.albumArt.naturalHeight;
    if (w > 0 && h > 0) {
      const ratio = Math.max(0.75, Math.min(1.6, w / h));
      el.artWrap.style.aspectRatio = `${ratio}`;
    } else {
      el.artWrap.style.aspectRatio = '';
    }
  }

  function resetArtAspectRatio() {
    if (el.artWrap) el.artWrap.style.aspectRatio = '';
  }

  const playbackIndicator = (() => {
    let link = null;
    let baseImg = null;
    let baseReady = false;
    let baseFailed = false;
    let lastPlaying = null;
    let lastBadge = null;

    function ensureLink() {
      if (link && link.parentNode) return link;
      link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      return link;
    }

    function ensureBase(cb) {
      if (baseReady && baseImg) { cb(); return; }
      if (baseFailed) { cb(); return; }
      const img = new Image();
      img.onload = function () { baseImg = img; baseReady = true; cb(); };
      img.onerror = function () { baseFailed = true; cb(); };
      img.src = './favicon.svg';
    }

    function draw(isPlaying) {
      const lnk = ensureLink();
      if (!baseReady || !baseImg) {
        if (lnk) { lnk.href = './favicon.svg'; lnk.type = 'image/svg+xml'; }
        return;
      }
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
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
      try { lnk.href = canvas.toDataURL('image/png'); lnk.type = 'image/png'; } catch (e) { lnk.href = './favicon.svg'; lnk.type = 'image/svg+xml'; }
    }

    function setBadge(isPlaying) {
      if (lastBadge === isPlaying) return;
      lastBadge = isPlaying;
      try {
        if (navigator.setAppBadge && navigator.clearAppBadge) {
          if (isPlaying) navigator.setAppBadge(1);
          else navigator.clearAppBadge();
        }
      } catch (e) {}
    }

    return function update(isPlaying) {
      const enabled = (typeof getTabBadgeEnabled === 'function') ? getTabBadgeEnabled() : true;
      const playing = !!isPlaying && enabled;
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

  let popoutChannel = null;
  function getPopoutChannel() {
    if (popoutChannel) return popoutChannel;
    if (typeof BroadcastChannel === 'undefined') return null;
    try { popoutChannel = new BroadcastChannel('sp_now_playing_popout'); } catch (e) { popoutChannel = null; }
    return popoutChannel;
  }

  function publishPopoutState() {
    const payload = !currentPlayback ? { empty: true, timestamp: Date.now() } : {
      title: currentPlayback.title || '',
      artist: currentPlayback.artists || '',
      album: currentPlayback.album || '',
      image: currentPlayback.image || '',
      isPlaying: !!currentPlayback.isPlaying,
      statusText: currentPlayback.isPlaying ? 'Playing' : 'Paused',
      progressMs: Math.max(0, Number(currentPlayback.progressMs || 0)),
      durationMs: Math.max(0, Number(currentPlayback.durationMs || 0)),
      timestamp: Date.now()
    };
    try { localStorage.setItem('sp_popout_state', JSON.stringify(payload)); } catch (e) {}
    const bc = getPopoutChannel();
    if (bc) { try { bc.postMessage(payload); } catch (e) {} }
  }

  function renderNothingPlaying(message) {
    currentPlayback = null;
    lastMediaData = null;
    lastMediaItem = null;
    lastMediaImage = '';
    lastNotifiedTrackId = 'none';
    el.albumArt.removeAttribute('src');
    el.albumArt.alt = '';
    resetArtAspectRatio();
    el.statusBadge.textContent = 'Idle';
    el.statusBadge.className = 'status-badge';
    if (el.playpauseBtn) {
      el.playpauseBtn.classList.remove('is-playing');
      el.playpauseBtn.setAttribute('aria-label', 'Play');
      el.playpauseBtn.title = 'Play';
    }
    el.trackName.textContent = 'Nothing playing';
    el.trackArtist.textContent = message || 'Start playing something on Spotify.';
    el.trackAlbum.textContent = '';
    renderPlaybackSource('', '');
    lastContextUri = null;
    lastContextName = '';
    setProgress(0, 0);
    setDocumentTitle('', '');
    setBackground('');
    updateMediaSession(null, null, '');
    playbackIndicator(false);
    publishPopoutState();
  }

  function renderPlayback(data) {
    if (!data || !data.item) {
      renderNothingPlaying(data && data.device ? `No active track on ${data.device.name}.` : 'Start playing something on Spotify.');
      return;
    }

    const item = data.item;
    const isTrack = item.type === 'track';
    const title = item.name || 'Unknown title';
    const artists = Array.isArray(item.artists)
      ? item.artists.map((a) => a.name).filter(Boolean).join(', ')
      : (item.show && item.show.publisher) || '';
    const album = isTrack ? (item.album && item.album.name) || '' : (item.show && item.show.name) || '';
    const images = isTrack ? (item.album && item.album.images) || [] : (item.images || (item.show && item.show.images) || []);
    const image = images[0] && images[0].url ? images[0].url : '';
    const duration = item.duration_ms || 0;
    const progress = typeof data.progress_ms === 'number' ? data.progress_ms : 0;

    currentPlayback = {
      isPlaying: !!data.is_playing,
      progressMs: progress,
      durationMs: duration,
      title,
      artists,
      album,
      image,
    };
    lastProgressAt = Date.now();

    if (image) {
      if (el.albumArt.src !== image) {
        resetArtAspectRatio();
        el.albumArt.src = image;
      } else if (el.albumArt.complete) {
        updateArtAspectRatio();
      }
      el.albumArt.alt = album ? `Album art for ${album}` : `Cover art for ${title}`;
    } else {
      el.albumArt.removeAttribute('src');
      el.albumArt.alt = '';
      resetArtAspectRatio();
    }

    el.statusBadge.textContent = data.is_playing ? 'Playing' : 'Paused';
    el.statusBadge.className = 'status-badge' + (data.is_playing ? ' playing' : '');
    if (el.playpauseBtn) {
      el.playpauseBtn.classList.toggle('is-playing', !!data.is_playing);
      el.playpauseBtn.setAttribute('aria-label', data.is_playing ? 'Pause' : 'Play');
      el.playpauseBtn.title = data.is_playing ? 'Pause' : 'Play';
    }
    el.trackName.textContent = title;
    el.trackArtist.textContent = artists || 'Unknown artist';
    el.trackAlbum.textContent = album;
    const deviceText = data.device && data.device.name ? `Listening on ${data.device.name}` : '';
    renderPlaybackSource(deviceText, lastContextUri === (data.context && data.context.uri) ? lastContextName : '');
    if (el.volumeSlider && !volumeDragging && data.device && typeof data.device.volume_percent === 'number') {
      el.volumeSlider.value = String(data.device.volume_percent);
      el.volumeSlider.title = data.device.volume_percent + '%';
    }
    updateContextName(data).catch(console.error);
    setProgress(progress, duration);
    setDocumentTitle(title, artists);
    setBackground(image);
    lastMediaData = data;
    lastMediaItem = item;
    lastMediaImage = image;
    updateMediaSession(data, item, image);
    notifyTrackChange(item.uri || item.id || '', title, artists, album, image);
    playbackIndicator(!!data.is_playing);
    publishPopoutState();
  }

  async function exchangeToken(params) {
    const body = new URLSearchParams(params);
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data.error_description || data.error || 'Token request failed.';
      throw new Error(msg);
    }
    return data;
  }

  async function getAccessToken() {
    const token = getToken();
    if (!token) return null;
    if (hasValidToken(token)) return token.access_token;
    if (token.refresh_token) {
      const refreshed = await refreshAccessToken(token);
      return refreshed ? refreshed.access_token : null;
    }
    return null;
  }

  async function refreshAccessToken(token) {
    const clientId = getClientId();
    if (!clientId || !token || !token.refresh_token) return null;
    try {
      const data = await exchangeToken({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
      });
      const next = {
        access_token: data.access_token,
        refresh_token: data.refresh_token || token.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        scope: data.scope || token.scope || '',
        token_type: data.token_type || token.token_type || 'Bearer',
      };
      setToken(next);
      return next;
    } catch (err) {
      console.error('Token refresh failed', err);
      clearToken();
      return null;
    }
  }

  async function apiFetch(path, opts = {}) {
    const retry = typeof opts === 'boolean' ? opts : (opts.retry !== false);
    const method = (opts && opts.method) || 'GET';
    const body = opts && opts.body;
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const res = await fetch(path.startsWith('http') ? path : API_BASE + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 401 && retry) {
      const token = getToken();
      if (token && token.refresh_token) {
        const refreshed = await refreshAccessToken(token);
        if (refreshed) return apiFetch(path, { ...((typeof opts === 'object' && opts) || {}), retry: false });
      }
      clearToken();
      throw new Error('Session expired. Please connect again.');
    }

    if (res.status === 204) return null;
    if (res.status === 429) {
      const retryAfter = Math.max(1, Number(res.headers.get('Retry-After') || '5'));
      const err = new Error(`Rate limited by Spotify. Retrying in ${retryAfter}s.`);
      err.retryAfter = retryAfter;
      err.status = 429;
      throw err;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch {}
      const msg = (data.error && data.error.message) || `Spotify API error (${res.status})`;
      throw new Error(msg);
    }
    const text = await res.text().catch(() => '');
    if (!text) return null;
    try { return JSON.parse(text); } catch { return null; }
  }

  async function fetchNowPlaying() {
    if (isFetching) return;
    isFetching = true;
    try {
      let data = await apiFetch('/me/player/currently-playing');
      if (data && !data.device) {
        try {
          const player = await apiFetch('/me/player?fields=device');
          if (player && player.device) data = { ...data, device: player.device };
        } catch (e) {
          console.error('Failed to fetch player device', e);
        }
      }
      renderPlayback(data);
      if (el.loginPanel.hidden && el.playerPanel.hidden) showPanel('player');
    } catch (err) {
      console.error(err);
      if (err && (err.status === 429 || String(err.message || '').includes('Rate limited'))) {
        const retryAfter = Math.max(1, Number(err.retryAfter || 5));
        showTransientStatus(`Rate limited by Spotify. Retrying in ${retryAfter}s.`, retryAfter * 1000 + 1000);
        if (pollTimer === 'worker') { if (pollWorker) { try { pollWorker.postMessage({ ms: 0 }); } catch (e) {} } pollTimer = null; }
        else if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
        if (rateLimitTimer) clearTimeout(rateLimitTimer);
        rateLimitTimer = setTimeout(() => {
          rateLimitTimer = null;
          if (getToken()) startPolling();
        }, retryAfter * 1000);
      } else {
        showTransientStatus(err.message || 'Failed to fetch playback.', 4000);
        if (String(err.message || '').includes('Not authenticated') || String(err.message || '').includes('Session expired')) {
          stopPolling();
          showPanel(getClientId() ? 'login' : 'setup');
        }
      }
    } finally {
      isFetching = false;
    }
  }

  function getPollWorker() {
    if (pollWorker) return pollWorker;
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
    try {
      const src = 'var t=null;onmessage=function(e){var ms=e.data&&e.data.ms;if(t){clearInterval(t);t=null;}if(ms&&ms>0){t=setInterval(function(){postMessage(1);},ms);}};';
      const url = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
      const w = new Worker(url);
      w.onmessage = function () { fetchNowPlaying().catch(console.error); };
      w.onerror = function () { try { w.terminate(); } catch (e) {} try { URL.revokeObjectURL(url); } catch (e) {} if (pollWorker === w) pollWorker = null; if (pollTimer === 'worker') { pollTimer = null; startPolling(); } };
      pollWorker = w;
      pollWorker._blobUrl = url;
      return w;
    } catch (e) {
      return null;
    }
  }

  function stopPolling() {
    if (pollTimer === 'worker') {
      if (pollWorker) { try { pollWorker.postMessage({ ms: 0 }); } catch (e) {} }
      pollTimer = null;
    } else if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
    if (rateLimitTimer) { clearTimeout(rateLimitTimer); rateLimitTimer = null; }
  }

  function startPolling() {
    stopPolling();
    fetchNowPlaying();
    const ms = getRefreshInterval();
    const w = getPollWorker();
    if (w) {
      try {
        w.postMessage({ ms: ms });
        pollTimer = 'worker';
      } catch (e) {
        pollTimer = setInterval(fetchNowPlaying, ms);
      }
    } else {
      pollTimer = setInterval(fetchNowPlaying, ms);
    }
    progressTimer = setInterval(() => {
      if (!currentPlayback || !currentPlayback.isPlaying || seekDragging) return;
      const elapsed = Date.now() - lastProgressAt;
      const next = Math.min(currentPlayback.progressMs + elapsed, currentPlayback.durationMs);
      setProgress(next, currentPlayback.durationMs);
    }, PROGRESS_TICK);
  }

  async function login() {
    let clientId = getClientId();
    if (!clientId) {
      const entered = window.prompt('Enter your Spotify Client ID to connect (found in your Spotify Developer Dashboard):', '');
      if (!entered || !entered.trim()) {
        showPanel('setup');
        const adv = document.querySelector('.advanced-connection');
        if (adv) adv.open = true;
        setMessage('Spotify Client ID required to connect. You can set it in Advanced, or paste an access token below.', 'error');
        return;
      }
      clientId = entered.trim();
      setClientId(clientId);
      if (el.clientIdInput) el.clientIdInput.value = clientId;
    }

    const { verifier, challenge } = await createPkce();
    const state = randomString(16);
    sessionStorage.setItem(STORAGE.verifier, verifier);
    sessionStorage.setItem(STORAGE.state, state);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: SCOPES.join(' '),
    });

    window.location.assign(AUTH_ENDPOINT + '?' + params.toString());
  }

  async function handleCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    const state = url.searchParams.get('state');

    if (!code && !error) return false;

    const expectedState = sessionStorage.getItem(STORAGE.state);
    let verifier = sessionStorage.getItem(STORAGE.verifier);
    sessionStorage.removeItem(STORAGE.state);
    sessionStorage.removeItem(STORAGE.verifier);

    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('state');
    const clean = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
    history.replaceState({}, document.title, clean);

    if (error) {
      showPanel(getClientId() ? 'login' : 'setup');
      setMessage('Spotify authorization failed: ' + error, 'error');
      showTransientStatus('Authorization failed.', 4000);
      return true;
    }

    if (!state || !expectedState || state !== expectedState) {
      showPanel(getClientId() ? 'login' : 'setup');
      setMessage('Security check failed (state mismatch). Please try connecting again.', 'error');
      return true;
    }

    if (!verifier) {
      showPanel(getClientId() ? 'login' : 'setup');
      setMessage('Missing PKCE verifier. Please try connecting again.', 'error');
      return true;
    }

    const clientId = getClientId();
    if (!clientId) {
      showPanel('setup');
      setMessage('Client ID missing. Save it and connect again.', 'error');
      return true;
    }

    showTransientStatus('Completing Spotify connection...', 0);
    try {
      const data = await exchangeToken({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
      });
      setToken({
        access_token: data.access_token,
        refresh_token: data.refresh_token || '',
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        scope: data.scope || '',
        token_type: data.token_type || 'Bearer',
      });
      syncCurrentTokenDisplay();
      setMessage('');
      showPanel('player');
      startPolling();
    } catch (err) {
      console.error(err);
      showPanel(getClientId() ? 'login' : 'setup');
      setMessage(err.message || 'Failed to complete Spotify connection.', 'error');
      showTransientStatus('Connection failed.', 4000);
    }
    return true;
  }

  function disconnect() {
    stopPolling();
    clearToken();
    renderNothingPlaying('Connect Spotify to see your playback.');
    showPanel(getClientId() ? 'login' : 'setup');
    if (el.logoutBtn) el.logoutBtn.hidden = true;
    showTransientStatus('Disconnected.');
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  async function toggleFullscreen() {
    try {
      if (isFullscreen()) {
        fullscreenWanted = false;
        localStorage.setItem(STORAGE.fullscreen, '0');
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        return;
      }
      const root = document.documentElement;
      if (root.requestFullscreen) {
        await root.requestFullscreen();
      } else if (root.webkitRequestFullscreen) {
        root.webkitRequestFullscreen();
      } else if (root.msRequestFullscreen) {
        root.msRequestFullscreen();
      } else {
        showTransientStatus('Fullscreen is not supported in this browser.');
        return;
      }
      fullscreenWanted = true;
      localStorage.setItem(STORAGE.fullscreen, '1');
    } catch (err) {
      console.error('Fullscreen failed', err);
      if (!isFullscreen()) {
        fullscreenWanted = false;
        localStorage.setItem(STORAGE.fullscreen, '0');
      }
      showTransientStatus('Fullscreen could not be started.');
    } finally {
      syncFullscreenButton();
    }
  }

  function syncFullscreenButton() {
    const active = isFullscreen();
    el.fullscreenBtn.classList.toggle('is-fullscreen', active);
    el.fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    el.fullscreenBtn.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
  }

  function handleFullscreenChange() {
    syncFullscreenButton();
    if (!isFullscreen() && !unloadingForRefresh) {
      fullscreenWanted = false;
      localStorage.setItem(STORAGE.fullscreen, '0');
    }
  }

  function installFullscreenRestore() {
    if (!fullscreenWanted || isFullscreen()) return;
    const events = ['pointerdown', 'keydown', 'touchstart'];
    const handler = function () {
      if (!fullscreenWanted || isFullscreen()) { remove(); return; }
      toggleFullscreen().catch(() => {}).finally(remove);
    };
    function remove() { events.forEach((e) => document.removeEventListener(e, handler, true)); }
    events.forEach((e) => document.addEventListener(e, handler, true));
  }

  function syncWakeLockButton() {
    const supported = 'wakeLock' in navigator;
    el.wakelockBtn.setAttribute('aria-pressed', wakeLockWanted ? 'true' : 'false');
    if (!supported) {
      el.wakelockBtn.title = 'Keep screen awake (not supported in this browser)';
      el.wakelockBtn.setAttribute('aria-label', 'Keep screen awake not supported in this browser');
      return;
    }
    const label = wakeLockWanted ? 'Screen wake lock on' : 'Keep screen awake';
    el.wakelockBtn.title = label;
    el.wakelockBtn.setAttribute('aria-label', label);
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator) || !wakeLockWanted || document.hidden) return;
    try {
      if (wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        syncWakeLockButton();
      });
      syncWakeLockButton();
    } catch (err) {
      console.error('Wake lock failed', err);
      wakeLock = null;
      wakeLockWanted = false;
      syncWakeLockButton();
      showTransientStatus('Could not keep screen awake.', 4000);
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try {
      await wakeLock.release();
    } catch (err) {
      console.error('Wake lock release failed', err);
    } finally {
      wakeLock = null;
    }
  }

  async function toggleWakeLock() {
    if (!('wakeLock' in navigator)) {
      showTransientStatus('Wake Lock is not supported in this browser.');
      syncWakeLockButton();
      return;
    }
    wakeLockWanted = !wakeLockWanted;
    if (wakeLockWanted) {
      await requestWakeLock();
      if (wakeLockWanted) showTransientStatus('Screen will stay awake while this tab is active.');
    } else {
      await releaseWakeLock();
      showTransientStatus('Screen wake lock off.');
    }
    syncWakeLockButton();
  }

  async function seekToPosition(positionMs) {
    const ms = Math.max(0, Math.floor(positionMs || 0));
    try {
      await apiFetch('/me/player/seek?position_ms=' + ms, { method: 'PUT' });
      if (currentPlayback) {
        currentPlayback.progressMs = Math.min(ms, currentPlayback.durationMs || ms);
        lastProgressAt = Date.now();
        setProgress(currentPlayback.progressMs, currentPlayback.durationMs || 0);
      }
      setTimeout(() => { fetchNowPlaying().catch(console.error); }, 500);
    } catch (err) {
      console.error('Seek failed', err);
      showTransientStatus(err.message || 'Seek failed.', 2500);
    }
  }

  async function controlPlayback(action) {
    try {
      if (action === 'toggle') {
        if (currentPlayback && currentPlayback.isPlaying) {
          await apiFetch('/me/player/pause', { method: 'PUT' });
        } else {
          await apiFetch('/me/player/play', { method: 'PUT' });
        }
      } else if (action === 'play') {
        await apiFetch('/me/player/play', { method: 'PUT' });
      } else if (action === 'pause') {
        await apiFetch('/me/player/pause', { method: 'PUT' });
      } else if (action === 'next') {
        await apiFetch('/me/player/next', { method: 'POST' });
      } else if (action === 'previous') {
        await apiFetch('/me/player/previous', { method: 'POST' });
      }
      setTimeout(() => { fetchNowPlaying().catch(console.error); }, 350);
    } catch (err) {
      console.error('Playback control failed', err);
      showTransientStatus(err.message || 'Playback control failed.', 3500);
    }
  }

  function initMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const bind = (action, handler) => {
      try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) {}
    };
    bind('play', () => { controlPlayback('play').catch(console.error); });
    bind('pause', () => { controlPlayback('pause').catch(console.error); });
    bind('previoustrack', () => { controlPlayback('previous').catch(console.error); });
    bind('nexttrack', () => { controlPlayback('next').catch(console.error); });
    bind('seekto', (details) => {
      if (!details || typeof details.seekTime !== 'number') return;
      seekToPosition(Math.floor(details.seekTime * 1000)).catch(console.error);
    });
  }

  const silentAudio = (() => {
    let audio = null;
    let ctx = null;
    let wantPlaying = false;
    let unlocked = false;
    function ensure() {
      if (audio) return audio;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        try {
          ctx = new AC();
          const dest = ctx.createMediaStreamDestination();
          const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate)), ctx.sampleRate);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(dest);
          source.start();
          audio = new Audio();
          audio.id = 'silent-media-audio';
          audio.srcObject = dest.stream;
          audio.preload = 'auto';
          audio.volume = 1;
          audio.muted = false;
          audio.setAttribute('playsinline', '');
          audio.setAttribute('webkit-playsinline', '');
          audio.style.display = 'none';
          document.body.appendChild(audio);
          return audio;
        } catch (e) {
          ctx = null;
          audio = null;
        }
      }
      try {
        const sampleRate = 8000;
        const numSamples = sampleRate;
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);
        const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
        writeStr(0, 'RIFF'); view.setUint32(4, 36 + numSamples * 2, true); writeStr(8, 'WAVE');
        writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
        writeStr(36, 'data'); view.setUint32(40, numSamples * 2, true);
        audio = new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })));
      } catch (e) {
        audio = new Audio();
      }
      audio.id = 'silent-media-audio';
      audio.loop = true;
      audio.volume = 0.01;
      audio.setAttribute('playsinline', '');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      return audio;
    }
    function unlock() {
      if (unlocked) return;
      const a = ensure();
      if (ctx && ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
      try {
        const p = a.play();
        if (p && p.then) {
          p.then(() => { unlocked = true; if (!wantPlaying) { try { a.pause(); } catch (e) {} } }).catch(() => {});
        } else {
          unlocked = true;
          if (!wantPlaying) { try { a.pause(); } catch (e) {} }
        }
      } catch (e) {}
    }
    function sync() {
      const a = ensure();
      if (!a) return;
      if (ctx && ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
      if (wantPlaying) {
        const p = a.play();
        if (p && p.then) p.then(() => {
          try { if ('mediaSession' in navigator && navigator.mediaSession.playbackState !== 'playing') navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
        }).catch(() => {});
        if (p && p.catch) p.catch(() => {});
      } else {
        try { a.pause(); } catch (e) {}
      }
    }
    document.addEventListener('pointerdown', unlock, { passive: true });
    document.addEventListener('keydown', unlock, { passive: true });
    document.addEventListener('touchstart', unlock, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
    return function setPlaying(isPlaying) {
      wantPlaying = !!isPlaying;
      sync();
    };
  })();

  function updateMediaSession(data, item, image) {
    const enabled = (typeof getMediaSessionEnabled === 'function') ? getMediaSessionEnabled() : true;
    const playing = !!(data && data.is_playing);
    silentAudio(enabled ? playing : false);
    if (!('mediaSession' in navigator)) return;
    if (!enabled) {
      try { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; } catch (e) {}
      return;
    }
    const silentEl = document.getElementById('silent-media-audio');
    if (!data || !item) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = 'none';
      if (silentEl) silentEl.title = 'Spotify Now Playing';
      return;
    }
    const title = item.name || 'Unknown title';
    const artist = Array.isArray(item.artists)
      ? item.artists.map((a) => a.name).filter(Boolean).join(', ')
      : (item.show && item.show.publisher) || '';
    const album = item.type === 'track' ? ((item.album && item.album.name) || '') : ((item.show && item.show.name) || '');
    const artwork = image ? [{ src: image, sizes: '512x512', type: 'image/jpeg' }] : [];
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title, artist, album, artwork });
    } catch (e) {}
    navigator.mediaSession.playbackState = data.is_playing ? 'playing' : 'paused';
    const silentEl2 = document.getElementById('silent-media-audio');
    if (silentEl2) silentEl2.title = artist ? (title + ' - ' + artist) : title;
    try {
      if (typeof item.duration_ms === 'number' && typeof data.progress_ms === 'number' && navigator.mediaSession.setPositionState) {
        navigator.mediaSession.setPositionState({
          duration: Math.max(0, item.duration_ms / 1000),
          playbackRate: 1,
          position: Math.max(0, Math.min(item.duration_ms / 1000, data.progress_ms / 1000)),
        });
      }
    } catch (e) {}
  }

  function isPlayerVisible() {
    return el.playerPanel && !el.playerPanel.hidden;
  }

  function resetIdleTimer() {
    document.body.classList.remove('ui-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (isPlayerVisible()) document.body.classList.add('ui-idle');
    }, IDLE_MS);
  }

  function initEvents() {
    if (el.albumArt) {
      el.albumArt.addEventListener('load', updateArtAspectRatio);
      el.albumArt.addEventListener('error', resetArtAspectRatio);
    }
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach((evt) => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    el.settingsToggle.addEventListener('click', () => {
      const opening = el.setupPanel.hidden;
      if (opening) {
        el.setupPanel.hidden = false;
        el.clientIdInput.value = getClientId();
        syncCurrentTokenDisplay();
        setMessage('');
      } else {
        el.setupPanel.hidden = true;
      }
    });

    el.copyRedirect.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(REDIRECT_URI);
        el.copyRedirect.textContent = 'Copied!';
        setTimeout(() => { el.copyRedirect.textContent = 'Copy'; }, 1500);
      } catch {
        setMessage('Could not copy automatically. Copy the URI manually.', 'error');
      }
    });

    el.saveClientId.addEventListener('click', () => {
      const value = el.clientIdInput.value.trim();
      if (!value) {
        setMessage('Please enter a Client ID.', 'error');
        return;
      }
      setClientId(value);
      setMessage('Client ID saved. You can now connect Spotify.', 'success');
      if (!getToken()) {
        showPanel('login');
        el.setupPanel.hidden = false;
      }
    });

    if (el.saveAccessToken) {
      el.saveAccessToken.addEventListener('click', () => {
        const token = ((el.accessTokenInput && el.accessTokenInput.value) || (el.currentTokenDisplay && el.currentTokenDisplay.value) || '').trim();
        if (!token) {
          setMessage('Please paste an access token.', 'error');
          return;
        }
        setToken({
          access_token: token,
          refresh_token: '',
          expires_at: Date.now() + 55 * 60 * 1000,
          scope: '',
          token_type: 'Bearer',
          manual: true,
        });
        if (el.accessTokenInput) el.accessTokenInput.value = '';
        syncCurrentTokenDisplay();
        setMessage('Access token saved. It may expire in about an hour.', 'success');
        showPanel('player');
        startPolling();
      });
    }

    el.clearData.addEventListener('click', () => {
      const ok = window.confirm('Clear stored Client ID and Spotify tokens from this browser?');
      if (!ok) return;
      stopPolling();
      clearAllData();
      el.clientIdInput.value = '';
      if (el.accessTokenInput) el.accessTokenInput.value = '';
      applyShowControls('active');
      applyShowDevice(true);
      applyShowPlaylist(true);
      applyShowArt(true);
      applyShowStatus(true);
      applyShowAlbum(true);
      applyShowProgress(true);
      applyShowVolume(true);
      applyShowClock('hidden');
      if (el.clock24hToggle) el.clock24hToggle.checked = false;
      if (el.refreshFrequencySelect) el.refreshFrequencySelect.value = String(POLL_INTERVAL);
      applyMediaSessionEnabled(true);
      applyTabBadgeEnabled(true);
      applyTrackNotificationsEnabled(false);
      lastNotifiedTrackId = null;
      fullscreenWanted = false;
      applyUiTheme(DEFAULT_UI_THEME);
      applyContentSize('default');
      renderNothingPlaying('Connect Spotify to see your playback.');
      showPanel('setup');
      if (el.logoutBtn) el.logoutBtn.hidden = true;
      setMessage('Stored data cleared.', 'success');
      showTransientStatus('Stored data cleared.');
    });

    if (el.showControlsSelect) {
      el.showControlsSelect.addEventListener('change', () => {
        const mode = el.showControlsSelect.value;
        localStorage.setItem(STORAGE.showControls, mode);
        applyShowControls(mode);
      });
    }
    if (el.showDeviceToggle) {
      el.showDeviceToggle.addEventListener('change', () => {
        localStorage.setItem(STORAGE.showDevice, el.showDeviceToggle.checked ? '1' : '0');
        applySourceVisibility();
      });
    }
    if (el.showPlaylistToggle) {
      el.showPlaylistToggle.addEventListener('change', () => {
        localStorage.setItem(STORAGE.showPlaylist, el.showPlaylistToggle.checked ? '1' : '0');
        applySourceVisibility();
      });
    }
    if (el.showArtToggle) {
      el.showArtToggle.addEventListener('change', () => {
        const show = el.showArtToggle.checked;
        localStorage.setItem(STORAGE.showArt, show ? '1' : '0');
        applyShowArt(show);
      });
    }
    if (el.showStatusToggle) {
      el.showStatusToggle.addEventListener('change', () => {
        const show = el.showStatusToggle.checked;
        localStorage.setItem(STORAGE.showStatus, show ? '1' : '0');
        applyShowStatus(show);
      });
    }
    if (el.showAlbumToggle) {
      el.showAlbumToggle.addEventListener('change', () => {
        const show = el.showAlbumToggle.checked;
        localStorage.setItem(STORAGE.showAlbum, show ? '1' : '0');
        applyShowAlbum(show);
      });
    }
    if (el.showProgressToggle) {
      el.showProgressToggle.addEventListener('change', () => {
        const show = el.showProgressToggle.checked;
        localStorage.setItem(STORAGE.showProgress, show ? '1' : '0');
        applyShowProgress(show);
      });
    }
    if (el.showVolumeToggle) {
      el.showVolumeToggle.addEventListener('change', () => {
        const show = el.showVolumeToggle.checked;
        localStorage.setItem(STORAGE.showVolume, show ? '1' : '0');
        applyShowVolume(show);
      });
    }
    if (el.showClockSelect) {
      el.showClockSelect.addEventListener('change', () => {
        const mode = el.showClockSelect.value;
        localStorage.setItem(STORAGE.showClock, mode);
        applyShowClock(mode);
      });
    }
    if (el.clock24hToggle) {
      el.clock24hToggle.addEventListener('change', () => {
        const on = el.clock24hToggle.checked;
        localStorage.setItem(STORAGE.clock24h, on ? '1' : '0');
        updateClock();
      });
    }
    if (el.refreshFrequencySelect) {
      el.refreshFrequencySelect.addEventListener('change', () => {
        const v = parseInt(el.refreshFrequencySelect.value, 10);
        localStorage.setItem(STORAGE.refreshInterval, String([3000, 5000, 10000, 30000].indexOf(v) !== -1 ? v : POLL_INTERVAL));
        if (pollTimer) startPolling();
      });
    }
    if (el.mediaSessionToggle) {
      el.mediaSessionToggle.addEventListener('change', () => {
        const on = el.mediaSessionToggle.checked;
        localStorage.setItem(STORAGE.mediaSession, on ? '1' : '0');
        applyMediaSessionEnabled(on);
      });
    }
    if (el.tabBadgeToggle) {
      el.tabBadgeToggle.addEventListener('change', () => {
        const on = el.tabBadgeToggle.checked;
        localStorage.setItem(STORAGE.tabBadge, on ? '1' : '0');
        applyTabBadgeEnabled(on);
      });
    }
    if (el.trackNotifyToggle) {
      el.trackNotifyToggle.addEventListener('change', async () => {
        const on = el.trackNotifyToggle.checked;
        if (on) {
          const ok = await ensureTrackNotificationPermission();
          if (!ok) {
            el.trackNotifyToggle.checked = false;
            localStorage.setItem(STORAGE.trackNotifications, '0');
            return;
          }
        }
        localStorage.setItem(STORAGE.trackNotifications, on ? '1' : '0');
      });
    }
    if (el.themeSelect) {
      el.themeSelect.addEventListener('change', () => {
        const theme = el.themeSelect.value === 'legacy' ? 'legacy' : 'modern';
        localStorage.setItem(STORAGE.theme, theme);
        applyUiTheme(theme);
      });
    }
    if (el.contentSizeSelect) {
      el.contentSizeSelect.addEventListener('change', () => {
        const v = el.contentSizeSelect.value;
        const size = (v === 'small' || v === 'large') ? v : 'default';
        localStorage.setItem(STORAGE.contentSize, size);
        applyContentSize(size);
      });
    }
    if (el.toggleTokenVisibility) {
      el.toggleTokenVisibility.addEventListener('click', () => {
        if (!el.currentTokenDisplay) return;
        const hidden = el.currentTokenDisplay.type === 'password';
        el.currentTokenDisplay.type = hidden ? 'text' : 'password';
        el.toggleTokenVisibility.textContent = hidden ? 'Hide' : 'Show';
      });
    }
    if (el.copyCurrentToken) {
      el.copyCurrentToken.addEventListener('click', async () => {
        const token = getToken();
        const value = token && token.access_token ? token.access_token : '';
        if (!value) { setMessage('No active session token.', 'error'); return; }
        try {
          await navigator.clipboard.writeText(value);
          el.copyCurrentToken.textContent = 'Copied!';
          setTimeout(() => { el.copyCurrentToken.textContent = 'Copy'; }, 1500);
        } catch {
          setMessage('Could not copy token automatically.', 'error');
        }
      });
    }

    el.loginBtn.addEventListener('click', () => { login().catch(console.error); });
    if (el.connectSpotifyBtn) el.connectSpotifyBtn.addEventListener('click', () => { login().catch(console.error); });
    const loginAdvancedBtn = document.getElementById('login-advanced-btn');
    if (loginAdvancedBtn) loginAdvancedBtn.addEventListener('click', () => {
      showPanel('setup');
      const adv = document.querySelector('.advanced-connection');
      if (adv) adv.open = true;
      if (el.clientIdInput) el.clientIdInput.focus();
    });
    if (el.logoutBtn) el.logoutBtn.addEventListener('click', disconnect);
    if (el.popoutBtn) el.popoutBtn.addEventListener('click', () => {
      publishPopoutState();
      const w = window.open('./popout.html', 'sp-now-playing-popout', 'width=460,height=230,resizable=yes,scrollbars=no');
      if (w && w.focus) w.focus();
    });
    el.fullscreenBtn.addEventListener('click', () => { toggleFullscreen().catch(console.error); });
    el.wakelockBtn.addEventListener('click', () => { toggleWakeLock().catch(console.error); });
    if (el.prevBtn) el.prevBtn.addEventListener('click', () => { controlPlayback('previous').catch(console.error); });
    if (el.playpauseBtn) el.playpauseBtn.addEventListener('click', () => { controlPlayback('toggle').catch(console.error); });
    if (el.nextBtn) el.nextBtn.addEventListener('click', () => { controlPlayback('next').catch(console.error); });
    if (el.volumeSlider) {
      const setVolume = async (val) => {
        const v = Math.max(0, Math.min(100, parseInt(val, 10) || 0));
        try { await apiFetch('/me/player/volume?volume_percent=' + v, { method: 'PUT' }); }
        catch (e) { console.error('Volume failed', e); showTransientStatus(e.message || 'Volume change failed.', 2500); }
      };
      el.volumeSlider.addEventListener('pointerdown', () => { volumeDragging = true; });
      el.volumeSlider.addEventListener('pointerup', () => { volumeDragging = false; });
      el.volumeSlider.addEventListener('touchstart', () => { volumeDragging = true; }, { passive: true });
      el.volumeSlider.addEventListener('touchend', () => { volumeDragging = false; });
      el.volumeSlider.addEventListener('change', (e) => { volumeDragging = false; setVolume(e.target.value); });
      el.volumeSlider.addEventListener('input', (e) => {
        if (el.volumeSlider) el.volumeSlider.title = e.target.value + '%';
      });
    }
    if (el.progressBar) {
      const seekFromEvent = (e) => {
        if (!currentPlayback || !currentPlayback.durationMs) return null;
        const rect = el.progressBar.getBoundingClientRect();
        const x = Math.min(Math.max((e.clientX || 0) - rect.left, 0), rect.width);
        const pct = rect.width > 0 ? x / rect.width : 0;
        return Math.floor(pct * currentPlayback.durationMs);
      };
      const onMove = (e) => {
        if (!seekDragging) return;
        const ms = seekFromEvent(e);
        if (ms == null) return;
        setProgress(ms, currentPlayback.durationMs);
      };
      const onUp = (e) => {
        if (!seekDragging) return;
        seekDragging = false;
        el.progressBar.classList.remove('seeking');
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        const ms = seekFromEvent(e);
        if (ms != null) seekToPosition(ms).catch(console.error);
      };
      el.progressBar.addEventListener('pointerdown', (e) => {
        if (!currentPlayback || !currentPlayback.durationMs) return;
        seekDragging = true;
        el.progressBar.classList.add('seeking');
        const ms = seekFromEvent(e);
        if (ms != null) setProgress(ms, currentPlayback.durationMs);
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
      });
      el.progressBar.style.cursor = 'pointer';
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', () => { unloadingForRefresh = true; });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (getToken() && !rateLimitTimer) {
        fetchNowPlaying().catch(console.error);
        if (!pollTimer) startPolling();
      }
      if (wakeLockWanted) requestWakeLock().catch(console.error);
    });
  }

  async function init() {
    el.redirectUri.textContent = REDIRECT_URI;
    el.clientIdInput.value = getClientId();
    applyUiTheme(getUiTheme());
    applyContentSize(getContentSize());
    applyShowControls(getShowControls());
    applyShowArt(getShowArt());
    applyShowStatus(getShowStatus());
    applyShowAlbum(getShowAlbum());
    applyShowProgress(getShowProgress());
    applyShowVolume(getShowVolume());
    applyShowClock(getShowClock());
    if (el.clock24hToggle) el.clock24hToggle.checked = getClock24h();
    if (el.refreshFrequencySelect) el.refreshFrequencySelect.value = String(getRefreshInterval());
    if (el.mediaSessionToggle) el.mediaSessionToggle.checked = getMediaSessionEnabled();
    if (el.tabBadgeToggle) el.tabBadgeToggle.checked = getTabBadgeEnabled();
    if (el.trackNotifyToggle) el.trackNotifyToggle.checked = getTrackNotificationsEnabled();
    renderNothingPlaying();
    applySourceVisibility();
    syncCurrentTokenDisplay();
    initMediaSession();
    initEvents();
    syncFullscreenButton();
    syncWakeLockButton();
    resetIdleTimer();
    installFullscreenRestore();

    const handledCallback = await handleCallback();
    if (handledCallback) return;

    const clientId = getClientId();
    const token = getToken();

    if (token) {
      showPanel('player');
      startPolling();
      return;
    }

    if (!clientId) {
      showPanel('setup');
      el.setupPanel.hidden = false;
      showTransientStatus('Setup required.', 3000);
      return;
    }

    showPanel('login');
    showTransientStatus('Ready to connect.', 2500);
  }

  const UPDATE_CHECK_MS = 5 * 60 * 1000;
  let appFingerprint = null;
  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return String(h);
  }
  async function checkForUpdates() {
    try {
      const res = await fetch('./app.js?update=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      const text = await res.text();
      const hash = simpleHash(text);
      if (appFingerprint === null) {
        appFingerprint = hash;
        return;
      }
      if (hash !== appFingerprint) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Update check failed', err);
    }
  }

  init().catch((err) => {
    console.error(err);
    showPanel('setup');
    el.setupPanel.hidden = false;
    setMessage('Unexpected error: ' + (err.message || String(err)), 'error');
  });

  setInterval(checkForUpdates, UPDATE_CHECK_MS);
  setTimeout(checkForUpdates, 15000);
})();
