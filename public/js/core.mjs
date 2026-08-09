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

const pad = n => String(n).padStart(2, '0');
const partsOf = utc => utc
  ? d => [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCDay(), d.getUTCHours()]
  : d => [d.getFullYear(), d.getMonth(), d.getDate(), d.getDay(), d.getHours()];
const rank = map => [...map.values()].sort((a, b) => b.ms - a.ms || b.plays - a.plays || a.name.localeCompare(b.name));
function monthRange(firstKey, lastKey) {
  const out = [];
  let y = +firstKey.slice(0, 4), m = +firstKey.slice(5, 7) - 1;
  const last = +lastKey.slice(0, 4) * 12 + +lastKey.slice(5, 7) - 1;
  for (; y * 12 + m <= last; m++, y += Math.floor(m / 12), m %= 12) out.push(`${y}-${pad(m + 1)}`);
  return out;
}

// One pass over the history feeds every chart. Rankings use listening time, not play counts.
export function aggregate(rows, { year = 'all', minimum = 30000, utc = false } = {}) {
  const parts = partsOf(utc), years = new Set();
  const artists = new Map(), tracks = new Map(), albums = new Map(), months = new Map(), days = new Set();
  const firstArtist = new Map(), firstTrack = new Map();
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  let ms = 0, plays = 0, start = Infinity, end = -Infinity, excluded = 0;

  for (const row of rows) {
    const [y, mo, dd, wd, h] = parts(new Date(row.ts));
    years.add(y);
    const counted = row.ms >= minimum, trackKey = `${row.artist}\u0000${row.track}`;
    if (counted) {
      // Library-wide, so "first heard" doesn't move around with the year filter.
      const fa = firstArtist.get(row.artist); if (fa === undefined || row.ts < fa) firstArtist.set(row.artist, row.ts);
      const ft = firstTrack.get(trackKey); if (ft === undefined || row.ts < ft) firstTrack.set(trackKey, row.ts);
    }
    if (year !== 'all' && y !== Number(year)) continue;
    if (!counted) { excluded++; continue; }
    const monthKey = `${y}-${pad(mo + 1)}`;
    start = Math.min(start, row.ts); end = Math.max(end, row.ts);
    days.add(`${monthKey}-${pad(dd)}`);
    ms += row.ms; plays++;

    const artist = artists.get(row.artist) ?? artists.set(row.artist, { name: row.artist, ms: 0, plays: 0, last: 0, trackCount: 0 }).get(row.artist);
    artist.ms += row.ms; artist.plays++; artist.last = Math.max(artist.last, row.ts);
    const track = tracks.get(trackKey) ?? tracks.set(trackKey, { name: row.track, artist: row.artist, album: row.album, uri: row.uri, ms: 0, plays: 0, last: 0 }).get(trackKey);
    track.ms += row.ms; track.plays++; track.last = Math.max(track.last, row.ts);
    if (!track.uri && row.uri) track.uri = row.uri;
    if (row.album) {
      const albumKey = `${row.artist}\u0000${row.album}`;
      const album = albums.get(albumKey) ?? albums.set(albumKey, { name: row.album, artist: row.artist, ms: 0, plays: 0 }).get(albumKey);
      album.ms += row.ms; album.plays++;
    }
    const month = months.get(monthKey) ?? months.set(monthKey, { ms: 0, plays: 0, artists: new Set() }).get(monthKey);
    month.ms += row.ms; month.plays++; month.artists.add(row.artist);
    heat[wd][h] += row.ms;
  }

  const has = Number.isFinite(start), monthKeys = [...months.keys()].sort();
  const timeline = (has ? monthRange(monthKeys[0], monthKeys.at(-1)) : []).map(key => {
    const m = months.get(key);
    return { key, ms: m?.ms ?? 0, plays: m?.plays ?? 0, artists: m?.artists.size ?? 0 };
  });
  for (const track of tracks.values()) {
    track.first = firstTrack.get(`${track.artist}\u0000${track.name}`);
    const artist = artists.get(track.artist);
    if (artist) artist.trackCount++;
  }
  const rankedArtists = rank(artists);
  for (const artist of rankedArtists) artist.first = firstArtist.get(artist.name);

  return { ms, plays, artistCount: artists.size, trackCount: tracks.size, albumCount: albums.size, activeDays: days.size,
    start: has ? start : null, end: has ? end : null, years: [...years].sort((a, b) => b - a),
    artists: rankedArtists, tracks: rank(tracks), albums: rank(albums), timeline, heat, excluded,
    topShare: ms ? (rankedArtists[0]?.ms ?? 0) / ms : 0 };
}
