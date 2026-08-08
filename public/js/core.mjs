// Afterglow keeps only music metadata and listening time.
// IP addresses, location, platform/device and account fields are dropped during normalization.

// Handles both Spotify exports: extended history (Streaming_History_Audio_*.json) and account data (StreamingHistory*.json).
export function normalize(records) {
  if (!Array.isArray(records)) throw new Error('Expected a Spotify history array. Choose Streaming_History_Audio*.json or StreamingHistory*.json.');
  const rows = [];
  let ignored = 0;
  for (const item of records) {
    if (!item || typeof item !== 'object') { ignored++; continue; }
    const track = item.master_metadata_track_name ?? item.trackName;
    const artist = item.master_metadata_album_artist_name ?? item.artistName;
    let stamp = item.ts ?? item.endTime;
    // Account data exports use "2024-01-31 18:04", which is UTC without a zone.
    if (typeof stamp === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(stamp)) stamp = `${stamp.replace(' ', 'T')}:00Z`;
    const ts = Date.parse(stamp), ms = Number(item.ms_played ?? item.msPlayed);
    if (typeof track !== 'string' || !track.trim() || typeof artist !== 'string' || !artist.trim() || !Number.isFinite(ts) || !Number.isFinite(ms) || ms < 0) { ignored++; continue; }
    const uri = typeof item.spotify_track_uri === 'string' && /^spotify:track:[A-Za-z0-9]+$/.test(item.spotify_track_uri) ? item.spotify_track_uri : '';
    rows.push({ ts, ms, track: track.trim(), artist: artist.trim(), album: String(item.master_metadata_album_album_name ?? '').trim(), uri });
  }
  return { rows, ignored };
}

export const eventKey = row => JSON.stringify([row.ts, row.ms, row.track, row.artist, row.album, row.uri]);

// Importing the same files twice must never inflate totals.
export function mergeRows(existing, incoming) {
  const seen = new Set(existing.map(eventKey));
  const rows = [...existing];
  let duplicates = 0;
  for (const row of incoming) {
    const key = eventKey(row);
    if (seen.has(key)) duplicates++;
    else { seen.add(key); rows.push(row); }
  }
  rows.sort((a, b) => a.ts - b.ts);
  return { rows, duplicates };
}
