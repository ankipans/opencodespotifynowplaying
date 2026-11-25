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
  };

  const REDIRECT_URI = window.location.origin + window.location.pathname.replace(/index\.html$/, '');

  const el = {
    setupPanel: document.getElementById('setup-panel'),
    loginPanel: document.getElementById('login-panel'),
    playerPanel: document.getElementById('player-panel'),
    settingsToggle: document.getElementById('settings-toggle'),
    redirectUri: document.getElementById('redirect-uri'),
    copyRedirect: document.getElementById('copy-redirect'),
    clientIdInput: document.getElementById('client-id-input'),
    saveClientId: document.getElementById('save-client-id'),
    clearData: document.getElementById('clear-data'),
    showControlsToggle: document.getElementById('show-controls-toggle'),
    showDeviceToggle: document.getElementById('show-device-toggle'),
    showPlaylistToggle: document.getElementById('show-playlist-toggle'),
    accessTokenInput: document.getElementById('access-token-input'),
    saveAccessToken: document.getElementById('save-access-token'),
    setupMessage: document.getElementById('setup-message'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    albumArt: document.getElementById('album-art'),
    artPlaceholder: document.getElementById('art-placeholder'),
    statusBadge: document.getElementById('status-badge'),
    prevBtn: document.getElementById('prev-btn'),
    playpauseBtn: document.getElementById('playpause-btn'),
    nextBtn: document.getElementById('next-btn'),
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
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    wakelockBtn: document.getElementById('wakelock-btn'),
  };

  let pollTimer = null;
  let progressTimer = null;
  let currentPlayback = null;
  let lastProgressAt = 0;
  let isFetching = false;
  let wakeLock = null;
  let wakeLockWanted = false;
  let statusTimer = null;
  let idleTimer = null;
  const IDLE_MS = 5000;
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
    return v === null ? true : v === '1';
  }

  function getShowDevice() {
    const v = localStorage.getItem(STORAGE.showDevice);
    return v === null ? true : v === '1';
  }

  function getShowPlaylist() {
    const v = localStorage.getItem(STORAGE.showPlaylist);
    return v === null ? true : v === '1';
  }

  function applyShowControls(show) {
    document.body.classList.toggle('hide-controls', !show);
    if (el.showControlsToggle) el.showControlsToggle.checked = !!show;
  }

  function applySourceVisibility() {
    if (el.showDeviceToggle) el.showDeviceToggle.checked = getShowDevice();
    if (el.showPlaylistToggle) el.showPlaylistToggle.checked = getShowPlaylist();
    renderPlaybackSource(currentDeviceText, lastContextName);
  }

  function getToken() {
    try {
      const raw = localStorage.getItem(STORAGE.token);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setToken(token) {
    localStorage.setItem(STORAGE.token, JSON.stringify(token));
  }

  function clearToken() {
    localStorage.removeItem(STORAGE.token);
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

  function showPanel(name) {
    el.setupPanel.hidden = name !== 'setup';
    el.loginPanel.hidden = name !== 'login';
    el.playerPanel.hidden = name !== 'player';
    if (el.logoutBtn) el.logoutBtn.hidden = name !== 'player';
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

  function renderNothingPlaying(message) {
    currentPlayback = null;
    el.albumArt.removeAttribute('src');
    el.albumArt.alt = '';
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
    };
    lastProgressAt = Date.now();

    if (image) {
      if (el.albumArt.src !== image) el.albumArt.src = image;
      el.albumArt.alt = album ? `Album art for ${album}` : `Cover art for ${title}`;
    } else {
      el.albumArt.removeAttribute('src');
      el.albumArt.alt = '';
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
    updateContextName(data).catch(console.error);
    setProgress(progress, duration);
    setDocumentTitle(title, artists);
    setBackground(image);
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
      const retryAfter = Number(res.headers.get('Retry-After') || '5');
      throw new Error(`Rate limited. Retrying in ${retryAfter}s.`);
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
    if (isFetching || document.hidden) return;
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
      showTransientStatus(err.message || 'Failed to fetch playback.', 4000);
      if (String(err.message).includes('Not authenticated') || String(err.message).includes('Session expired')) {
        stopPolling();
        showPanel(getClientId() ? 'login' : 'setup');
      }
    } finally {
      isFetching = false;
    }
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  }

  function startPolling() {
    stopPolling();
    fetchNowPlaying();
    pollTimer = setInterval(fetchNowPlaying, POLL_INTERVAL);
    progressTimer = setInterval(() => {
      if (!currentPlayback || !currentPlayback.isPlaying) return;
      const elapsed = Date.now() - lastProgressAt;
      const next = Math.min(currentPlayback.progressMs + elapsed, currentPlayback.durationMs);
      setProgress(next, currentPlayback.durationMs);
    }, PROGRESS_TICK);
  }

  async function login() {
    const clientId = getClientId();
    if (!clientId) {
      showPanel('setup');
      setMessage('Enter your Spotify Client ID first.', 'error');
      return;
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
    const verifier = sessionStorage.getItem(STORAGE.verifier);
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
      }
    } catch (err) {
      console.error('Fullscreen failed', err);
      showTransientStatus('Fullscreen could not be started.');
    } finally {
      syncFullscreenButton();
    }
  }

  function syncFullscreenButton() {
    const active = isFullscreen();
    el.fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    el.fullscreenBtn.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
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

  async function controlPlayback(action) {
    try {
      if (action === 'toggle') {
        if (currentPlayback && currentPlayback.isPlaying) {
          await apiFetch('/me/player/pause', { method: 'PUT' });
        } else {
          await apiFetch('/me/player/play', { method: 'PUT' });
        }
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
    ['mousemove', 'mousedown', 'touchstart', 'keydown'].forEach((evt) => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    el.settingsToggle.addEventListener('click', () => {
      const opening = el.setupPanel.hidden;
      if (opening) {
        el.setupPanel.hidden = false;
        el.clientIdInput.value = getClientId();
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
        const token = (el.accessTokenInput.value || '').trim();
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
        el.accessTokenInput.value = '';
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
      renderNothingPlaying('Connect Spotify to see your playback.');
      showPanel('setup');
      if (el.logoutBtn) el.logoutBtn.hidden = true;
      setMessage('Stored data cleared.', 'success');
      showTransientStatus('Stored data cleared.');
    });

    if (el.showControlsToggle) {
      el.showControlsToggle.addEventListener('change', () => {
        const show = el.showControlsToggle.checked;
        localStorage.setItem(STORAGE.showControls, show ? '1' : '0');
        applyShowControls(show);
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

    el.loginBtn.addEventListener('click', () => { login().catch(console.error); });
    if (el.logoutBtn) el.logoutBtn.addEventListener('click', disconnect);
    el.fullscreenBtn.addEventListener('click', () => { toggleFullscreen().catch(console.error); });
    el.wakelockBtn.addEventListener('click', () => { toggleWakeLock().catch(console.error); });
    if (el.prevBtn) el.prevBtn.addEventListener('click', () => { controlPlayback('previous').catch(console.error); });
    if (el.playpauseBtn) el.playpauseBtn.addEventListener('click', () => { controlPlayback('toggle').catch(console.error); });
    if (el.nextBtn) el.nextBtn.addEventListener('click', () => { controlPlayback('next').catch(console.error); });
    document.addEventListener('fullscreenchange', syncFullscreenButton);
    document.addEventListener('webkitfullscreenchange', syncFullscreenButton);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      } else {
        if (getToken()) startPolling();
        if (wakeLockWanted) requestWakeLock().catch(console.error);
      }
    });
  }

  async function init() {
    el.redirectUri.textContent = REDIRECT_URI;
    el.clientIdInput.value = getClientId();
    applyShowControls(getShowControls());
    renderNothingPlaying();
    applySourceVisibility();
    initEvents();
    syncFullscreenButton();
    syncWakeLockButton();
    resetIdleTimer();

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
