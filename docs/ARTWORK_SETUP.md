# Cover art: server setup

Real album covers and artist photos for imported libraries come from the Spotify catalog, looked up by the afterglow server. This is for whoever runs the server. People using it never sign in to anything.

1. Create an app in the **[Spotify developer dashboard](https://developer.spotify.com/dashboard)** with Web API access.
2. Copy `.env.example` to **`.env`** and fill in the app's **Client ID** and **Client Secret**. Keep this file on the server. Never paste the credentials into browser code or commit them.
3. Restart with **`npm start`**. There is no redirect URI, callback or user login.

```dotenv
SPOTIFY_CLIENT_ID=your_app_client_id
SPOTIFY_CLIENT_SECRET=your_app_client_secret
SPOTIFY_MARKET=DE
```

## How it works

The server uses Spotify's [Client Credentials flow](https://developer.spotify.com/documentation/web-api/tutorials/client-credentials-flow). It gets and renews its own short-lived access token, which never reaches the browser.

The browser only sends what's needed to find a picture: a kind (`track`, `album` or `artist`), names, and a track ID when the export has one. Play counts, timestamps and history files never leave the browser. The API rejects any other field.

- Extended history exports include Spotify track IDs, so tracks are looked up directly.
- Everything else uses exact name matches. Ambiguous or missing matches keep their fallback art.
- Results are cached in memory for everyone: up to 5,000 entries, six hours for hits and 30 minutes for misses. Identical lookups in flight share one request.
- Spotify's rate limits and quota cooldowns are respected, and the server caps itself at 120 catalog requests a minute.

## Limits and hosting

The API only answers this site's own pages: cross-site requests and foreign `Origin` headers get a 403. Bodies are capped at 4 KB, and each connecting address gets 120 lookups a minute. `X-Forwarded-For` is ignored on purpose, so behind a reverse proxy every visitor shares the proxy's budget. All of these limits live in memory, per server process.

To host it, run `node server.mjs` as a long-running Node service. Behind a platform or reverse proxy, set `HOST=0.0.0.0`, the assigned `PORT`, and **`PUBLIC_ORIGIN=https://your-site.example`**, and terminate HTTPS at the proxy. The pages and `/api/artwork` must share one origin, so a static host like GitHub Pages can't run the artwork part. Without credentials, everything else still works.

Spotify's [quota and access rules](https://developer.spotify.com/documentation/web-api/concepts/quota-modes) and [design guidelines](https://developer.spotify.com/documentation/design) still apply to your app.

[Back to afterglow](../README.md)
