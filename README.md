# Spotify Now Playing

A lightweight static web app that shows your current Spotify playback status. It runs entirely in the browser, uses Spotify's Authorization Code flow with PKCE, and is ready to host on GitHub Pages.

## Features

- Secure Spotify login with **Authorization Code + PKCE** (no client secret)
- Displays current track, artist, album, artwork, playback progress, device, and playlist name
- Polls Spotify for now-playing updates while the tab is open
- Stores Client ID and tokens only in your browser's local storage
- Works as a static site on **GitHub Pages** over HTTPS
- Has a feature that keeps the device awake, when it is toggled (moon icon)
- Show/hide date and time at the top of the screen
- Hides UI after 5 seconds of inactivity
- Allows to show/hide UI elements that YOU want to see and display
- Has a legacy look for devices that aren't powerful enough to display the modern look
- Fullscreen mode to focus on your music listening
- Tab name displays the name and artist of the song, and a badge that music is currently active
- Support for legacy devices that can't open the Spotify login page, use the client secret from a moder logged in device and put it in the legacy device for a working now playing (works for about 1 hour then Spotify rotates it)
- Now playing integration with you web browser now playing media, for example, phone lock screen shows the media information with ability to play/pause skip forward and backward track and scrub the track to a place in the song you like

## HTTPS callback / redirect URI

Spotify requires an exact redirect URI match. When hosted on GitHub Pages, your app gets a secure HTTPS URL, which you should register as the callback:

```text
https://<your-github-username>.github.io/<your-repo-name>/
```

The app also displays the detected redirect URI in the Setup panel so you can copy it exactly.

If you want to use this webapp for yourself, click the link of the repo: https://ankipans.github.io/opencodespotifynowplaying

## Setup

### 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create an app.
3. Open the app settings and add your redirect URI:
   - For GitHub Pages: `https://<your-github-username>.github.io/<your-repo-name>/`
   - For local testing, you can also add `http://localhost:8080/` or another local URL you use.
4. Save the settings and copy the **Client ID**.

> The redirect URI must match exactly, including protocol (`https`) and trailing slash where applicable.

### 2. Deploy to GitHub Pages

1. Create a GitHub repository and add these files:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `README.md`
2. Push to GitHub.
3. In the repository, open **Settings > Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select your branch (usually `main`) and `/ (root)`, then save.
6. Wait for GitHub Pages to publish your site.

Your secure callback URL will be:

```text
https://<your-github-username>.github.io/<your-repo-name>/
```

### 3. Connect the app

1. Open your GitHub Pages URL.
2. In Setup, paste your Spotify **Client ID** and save it.
3. Click **Connect with Spotify**.
4. After authorizing, the app will display your current now playing status.

## Local development

You can test locally with any static file server. For example:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/` and add that exact URL as a redirect URI in your Spotify app settings.

## Spotify permissions

The app requests these read-only scopes:

- `user-read-currently-playing` - read the currently playing track/item
- `user-read-playback-state` - read playback state, progress, and device info

## Notes

- This is a client-side app. There is no backend and no client secret.
- Tokens and Client ID are stored in browser local storage on the device you use.
- If nothing is playing, Spotify may return an empty response; the app will show an idle state.
- GitHub Pages provides HTTPS, which satisfies Spotify's secure redirect URI requirement for deployed apps.

## Files

- `index.html` - app markup
- `styles.css` - styling
- `app.js` - OAuth PKCE, Spotify API polling, and UI rendering
