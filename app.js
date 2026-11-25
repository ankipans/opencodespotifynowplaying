(() => {
  'use strict';

  const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
  const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
  const API_BASE = 'https://api.spotify.com/v1';
  const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'];
  const POLL_INTERVAL = 5000;
  const PROGRESS_TICK = 1000;

  const STORAGE = {
    clientId: 'sp_client_id',
    token: 'sp_token',
    verifier: 'sp_code_verifier',
    state: 'sp_auth_state',
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
    setupMessage: document.getElementById('setup-message'),
    loginBtn: document.getElementById('login-btn'),
    logoutBtn: document.getElementById('logout-btn'),
    albumArt: document.getElementById('album-art'),
    artPlaceholder: document.getElementById('art-placeholder'),
    statusBadge: document.getElementById('status-badge'),
    trackName: document.getElementById('track-name'),
    trackArtist: document.getElementById('track-artist'),
    trackAlbum: document.getElementById('track-album'),
    progressFill: document.getElementById('progress-fill'),
    progressCurrent: document.getElementById('progress-current'),
    progressDuration: document.getElementById('progress-duration'),
    progressBar: document.querySelector('.progress-bar'),
    deviceName: document.getElementById('device-name'),
    footerStatus: document.getElementById('footer-status'),
  };

  let pollTimer = null;
  let progressTimer = null;
  let currentPlayback = null;
  let lastProgressAt = 0;
  let isFetching = false;

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
    el.logoutBtn.hidden = name !== 'player';
  }

  function updateFooter(text) {
    el.footerStatus.textContent = text;
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

  function renderNothingPlaying(message) {
    currentPlayback = null;
    el.albumArt.removeAttribute('src');
    el.albumArt.alt = '';
    el.statusBadge.textContent = 'Idle';
    el.statusBadge.className = 'status-badge';
    el.trackName.textContent = 'Nothing playing';
    el.trackArtist.textContent = message || 'Start playing something on Spotify.';
    el.trackAlbum.textContent = '';
    el.deviceName.textContent = '';
    setProgress(0, 0);
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
    el.trackName.textContent = title;
    el.trackArtist.textContent = artists || 'Unknown artist';
    el.trackAlbum.textContent = album;
    el.deviceName.textContent = data.device && data.device.name ? `Listening on ${data.device.name}` : '';
    setProgress(progress, duration);
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

  async function apiFetch(path, retry = true) {
    const accessToken = await getAccessToken();
    if (!accessToken) throw new Error('Not authenticated');

    const res = await fetch(API_BASE + path, {
      headers: { Authorization: 'Bearer ' + accessToken },
    });

    if (res.status === 401 && retry) {
      const token = getToken();
      if (token && token.refresh_token) {
        const refreshed = await refreshAccessToken(token);
        if (refreshed) return apiFetch(path, false);
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
      const data = await res.json().catch(() => ({}));
      const msg = (data.error && data.error.message) || `Spotify API error (${res.status})`;
      throw new Error(msg);
    }
    return res.json();
  }

  async function fetchNowPlaying() {
    if (isFetching || document.hidden) return;
    isFetching = true;
    try {
      const data = await apiFetch('/me/player/currently-playing');
      renderPlayback(data);
      updateFooter('Connected to Spotify' + (data && data.is_playing ? ' • Updating live' : ''));
      if (el.loginPanel.hidden && el.playerPanel.hidden) showPanel('player');
      if (!el.playerPanel.hidden) el.logoutBtn.hidden = false;
    } catch (err) {
      console.error(err);
      updateFooter(err.message || 'Failed to fetch playback.');
      if (String(err.message).includes('Not authenticated') || String(err.message).includes('Session expired')) {
        stopPolling();
        showPanel(getClientId() ? 'login' : 'setup');
        el.logoutBtn.hidden = true;
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
      updateFooter('Authorization failed.');
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

    updateFooter('Completing Spotify connection...');
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
      updateFooter('Connection failed.');
    }
    return true;
  }

  function disconnect() {
    stopPolling();
    clearToken();
    renderNothingPlaying('Connect Spotify to see your playback.');
    showPanel(getClientId() ? 'login' : 'setup');
    el.logoutBtn.hidden = true;
    updateFooter('Disconnected.');
  }

  function initEvents() {
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

    el.clearData.addEventListener('click', () => {
      const ok = window.confirm('Clear stored Client ID and Spotify tokens from this browser?');
      if (!ok) return;
      stopPolling();
      clearAllData();
      el.clientIdInput.value = '';
      renderNothingPlaying('Connect Spotify to see your playback.');
      showPanel('setup');
      el.logoutBtn.hidden = true;
      setMessage('Stored data cleared.', 'success');
      updateFooter('Not connected');
    });

    el.loginBtn.addEventListener('click', () => { login().catch(console.error); });
    el.logoutBtn.addEventListener('click', disconnect);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      } else if (getToken()) {
        startPolling();
      }
    });
  }

  async function init() {
    el.redirectUri.textContent = REDIRECT_URI;
    el.clientIdInput.value = getClientId();
    renderNothingPlaying();
    initEvents();

    const handledCallback = await handleCallback();
    if (handledCallback) return;

    const clientId = getClientId();
    const token = getToken();

    if (!clientId) {
      showPanel('setup');
      el.setupPanel.hidden = false;
      updateFooter('Setup required.');
      return;
    }

    if (token) {
      showPanel('player');
      startPolling();
      return;
    }

    showPanel('login');
    updateFooter('Ready to connect.');
  }

  init().catch((err) => {
    console.error(err);
    showPanel('setup');
    el.setupPanel.hidden = false;
    setMessage('Unexpected error: ' + (err.message || String(err)), 'error');
  });
})();
