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

[Back to afterglow](../README.md)
