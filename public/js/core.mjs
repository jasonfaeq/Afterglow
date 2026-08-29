// Afterglow keeps only music metadata, listening time and playback behaviour.
// IP addresses, location, platform/device and account fields are dropped during normalization.
const REASON = /^[a-z_-]{1,32}$/i;
export const BEHAVIOUR_FIELDS = ['skipped', 'shuffle', 'offline', 'reasonStart', 'reasonEnd'];

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
    const row = { ts, ms, track: track.trim(), artist: artist.trim(), album: String(item.master_metadata_album_album_name ?? '').trim(), uri };
    if (typeof item.skipped === 'boolean') row.skipped = item.skipped;
    if (typeof item.shuffle === 'boolean') row.shuffle = item.shuffle;
    if (typeof item.offline === 'boolean') row.offline = item.offline;
    if (typeof item.reason_start === 'string' && REASON.test(item.reason_start)) row.reasonStart = item.reason_start.toLowerCase();
    if (typeof item.reason_end === 'string' && REASON.test(item.reason_end)) row.reasonEnd = item.reason_end.toLowerCase();
    rows.push(row);
  }
  return { rows, ignored };
}

export const eventKey = row => JSON.stringify([row.ts, row.ms, row.track, row.artist, row.album, row.uri]);

// Importing the same files twice must never inflate totals, but a re-import can
// fill in playback behaviour that an older (account data) import didn't have.
export function mergeRows(existing, incoming) {
  const index = new Map();
  for (const row of existing) index.set(eventKey(row), row);
  const rows = [...existing];
  let duplicates = 0, enriched = 0;
  for (const row of incoming) {
    const key = eventKey(row), known = index.get(key);
    if (known) {
      duplicates++;
      let changed = false;
      for (const field of BEHAVIOUR_FIELDS) if (known[field] === undefined && row[field] !== undefined) { known[field] = row[field]; changed = true; }
      if (changed) enriched++;
    } else { index.set(key, row); rows.push(row); }
  }
  rows.sort((a, b) => a.ts - b.ts);
  return { rows, duplicates, enriched };
}

const DAY = 86400000, SESSION_GAP = 30 * 60000;
const pad = n => String(n).padStart(2, '0');
const dayNumber = key => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / DAY;
const topOf = map => { let best = null, value = -1; for (const [key, v] of map) if (v > value) { best = key; value = v; } return best === null ? null : [best, value]; };
const isSkip = row => row.skipped === true || row.reasonEnd === 'fwdbtn';
const hasBehaviour = row => typeof row.skipped === 'boolean' || !!row.reasonEnd;
const bump = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by);
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
  const artists = new Map(), tracks = new Map(), albums = new Map(), months = new Map(), daily = new Map();
  const firstArtist = new Map(), firstTrack = new Map(), trackAlbum = new Map(), yearly = new Map();
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  let ms = 0, plays = 0, start = Infinity, end = -Infinity, excluded = 0, firstPlay = null;
  let session = null, sessionCount = 0, sessionMs = 0, longestSession = null, lastTs = null;
  let runKey = null, runCount = 0, bestRun = null;
  const behaviour = { events: 0, known: 0, skips: 0, shuffleKnown: 0, shuffles: 0, offlineKnown: 0, offline: 0, short: 0, starts: new Map(), ends: new Map() };
  const trackSkips = new Map(), artistSkips = new Map();
  const closeSession = () => {
    if (!session) return;
    sessionCount++; sessionMs += session.ms;
    if (!longestSession || session.ms > longestSession.ms) longestSession = session;
  };

  for (const row of rows) {
    const [y, mo, dd, wd, h] = parts(new Date(row.ts));
    years.add(y);
    const counted = row.ms >= minimum, trackKey = `${row.artist}\u0000${row.track}`;
    const monthKey = `${y}-${pad(mo + 1)}`, dayKey = `${monthKey}-${pad(dd)}`;
    if (counted) {
      // Library-wide, so "first heard" and the year-by-year comparison don't move with the year filter.
      const fa = firstArtist.get(row.artist); if (fa === undefined || row.ts < fa) firstArtist.set(row.artist, row.ts);
      const ft = firstTrack.get(trackKey); if (ft === undefined || row.ts < ft) firstTrack.set(trackKey, row.ts);
      if (row.album && !trackAlbum.has(trackKey)) trackAlbum.set(trackKey, row.album);
      let ys = yearly.get(y);
      if (!ys) yearly.set(y, ys = { year: y, ms: 0, plays: 0, artists: new Map(), tracks: new Map(), days: new Set() });
      ys.ms += row.ms; ys.plays++; bump(ys.artists, row.artist, row.ms); bump(ys.tracks, trackKey, row.ms); ys.days.add(dayKey);
    }
    if (year !== 'all' && y !== Number(year)) continue;

    // Behaviour includes short plays, since most skips happen in the first few seconds.
    behaviour.events++;
    if (row.ms < 30000) behaviour.short++;
    if (hasBehaviour(row)) {
      const skip = isSkip(row) ? 1 : 0;
      behaviour.known++; behaviour.skips += skip;
      const t = trackSkips.get(trackKey) ?? trackSkips.set(trackKey, { name: row.track, artist: row.artist, album: row.album, plays: 0, skips: 0 }).get(trackKey);
      t.plays++; t.skips += skip;
      const a = artistSkips.get(row.artist) ?? artistSkips.set(row.artist, { name: row.artist, plays: 0, skips: 0 }).get(row.artist);
      a.plays++; a.skips += skip;
    }
    if (typeof row.shuffle === 'boolean') { behaviour.shuffleKnown++; if (row.shuffle) behaviour.shuffles++; }
    if (typeof row.offline === 'boolean') { behaviour.offlineKnown++; if (row.offline) behaviour.offline++; }
    if (row.reasonStart) bump(behaviour.starts, row.reasonStart);
    if (row.reasonEnd) bump(behaviour.ends, row.reasonEnd);

    if (!counted) { excluded++; continue; }
    if (row.ts < start) { start = row.ts; firstPlay = { name: row.track, artist: row.artist, album: row.album, ts: row.ts }; }
    end = Math.max(end, row.ts);
    const day = daily.get(dayKey) ?? daily.set(dayKey, { ms: 0, plays: 0, ts: row.ts }).get(dayKey);
    day.ms += row.ms; day.plays++;
    ms += row.ms; plays++;

    const artist = artists.get(row.artist) ?? artists.set(row.artist, { name: row.artist, ms: 0, plays: 0, last: 0, trackCount: 0, monthly: new Map() }).get(row.artist);
    artist.ms += row.ms; artist.plays++; artist.last = Math.max(artist.last, row.ts); bump(artist.monthly, monthKey, row.ms);
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
    heat[(wd + 6) % 7][h] += row.ms; // Monday first

    // Sessions: plays separated by less than SESSION_GAP of silence.
    const began = row.ts - row.ms;
    if (session && began - lastTs > SESSION_GAP) { closeSession(); session = null; }
    if (!session) session = { start: began, end: row.ts, ms: 0, plays: 0 };
    session.ms += row.ms; session.plays++; session.end = row.ts; lastTs = row.ts;

    // The same track, back to back.
    if (trackKey === runKey) runCount++; else { runKey = trackKey; runCount = 1; }
    if (runCount > 1 && (!bestRun || runCount > bestRun.count)) bestRun = { count: runCount, name: row.track, artist: row.artist, album: row.album, ts: row.ts };
  }
  closeSession();

  const has = Number.isFinite(start), monthKeys = [...months.keys()].sort();
  const keys = has ? monthRange(monthKeys[0], monthKeys.at(-1)) : [];
  const newByMonth = new Map();
  for (const [name, ts] of firstArtist) if (artists.has(name) && ts >= start) {
    const [fy, fm] = parts(new Date(ts));
    bump(newByMonth, `${fy}-${pad(fm + 1)}`);
  }
  const timeline = keys.map(key => {
    const m = months.get(key);
    return { key, ms: m?.ms ?? 0, plays: m?.plays ?? 0, artists: m?.artists.size ?? 0, newArtists: newByMonth.get(key) ?? 0 };
  });
  for (const track of tracks.values()) {
    const key = `${track.artist}\u0000${track.name}`, skip = trackSkips.get(key);
    track.first = firstTrack.get(key);
    track.skips = skip?.skips ?? 0; track.known = skip?.plays ?? 0;
    const artist = artists.get(track.artist);
    if (artist) artist.trackCount++;
  }
  const rankedArtists = rank(artists);
  const artistTimeline = { keys, series: rankedArtists.slice(0, 6).map(a => ({ name: a.name, values: keys.map(k => a.monthly.get(k) ?? 0) })) };
  for (const artist of rankedArtists) {
    const skip = artistSkips.get(artist.name);
    artist.first = firstArtist.get(artist.name);
    artist.months = artist.monthly.size;
    artist.skips = skip?.skips ?? 0; artist.known = skip?.plays ?? 0;
    delete artist.monthly;
  }
  const byCount = map => [...map].sort((a, b) => b[1] - a[1]).map(([reason, count]) => ({ reason, count }));
  const tracksWithSkips = [...trackSkips.values()].filter(t => t.plays >= 5);
  const mostSkipped = tracksWithSkips.filter(t => t.skips).sort((a, b) => b.skips / b.plays - a.skips / a.plays || b.plays - a.plays).slice(0, 6);
  const neverSkipped = tracksWithSkips.filter(t => !t.skips).sort((a, b) => b.plays - a.plays).slice(0, 6);
  // Discoveries: artists first heard in the selected year, or in the last 12 months of an all-time view.
  const since = end - 365 * DAY;
  const discoveries = rankedArtists.filter(a => year === 'all' ? a.first >= since : parts(new Date(a.first))[0] === Number(year)).slice(0, 10);

  // Streaks and the biggest day.
  const dailyList = [...daily].sort((a, b) => a[0] < b[0] ? -1 : 1);
  let longest = null, run = null;
  for (const [key] of dailyList) {
    const n = dayNumber(key);
    if (run && n === run.n + 1) { run.days++; run.to = key; run.n = n; }
    else run = { days: 1, from: key, to: key, n };
    if (!longest || run.days > longest.days) longest = { ...run };
  }
  let biggestDay = null;
  for (const [key, value] of dailyList) if (!biggestDay || value.ms > biggestDay.ms) biggestDay = { key, ms: value.ms, plays: value.plays, ts: value.ts };
  if (biggestDay) {
    const dayTracks = new Map(), dayArtists = new Map();
    for (const row of rows) {
      if (Math.abs(row.ts - biggestDay.ts) > 2 * DAY || row.ms < minimum) continue;
      const [y, mo, dd] = parts(new Date(row.ts));
      if (`${y}-${pad(mo + 1)}-${pad(dd)}` !== biggestDay.key) continue;
      bump(dayTracks, `${row.artist}\u0000${row.track}`, row.ms); bump(dayArtists, row.artist, row.ms);
    }
    const topTrack = topOf(dayTracks), topArtist = topOf(dayArtists);
    if (topTrack) { const [artist, name] = topTrack[0].split('\u0000'); biggestDay.track = { name, artist }; }
    if (topArtist) biggestDay.artist = topArtist[0];
  }

  // Year by year, independent of the year filter.
  const newPerYear = new Map();
  for (const ts of firstArtist.values()) bump(newPerYear, parts(new Date(ts))[0]);
  const yearlyList = [...yearly.values()].sort((a, b) => a.year - b.year).map(ys => {
    const topArtist = topOf(ys.artists), topTrack = topOf(ys.tracks);
    const [trackArtist, trackName] = topTrack ? topTrack[0].split('\u0000') : [];
    return { year: ys.year, ms: ys.ms, plays: ys.plays, artistCount: ys.artists.size, trackCount: ys.tracks.size, activeDays: ys.days.size, newArtists: newPerYear.get(ys.year) ?? 0,
      topArtist: topArtist ? { name: topArtist[0], ms: topArtist[1] } : null,
      topTrack: topTrack ? { name: trackName, artist: trackArtist, album: trackAlbum.get(topTrack[0]) ?? '', ms: topTrack[1] } : null };
  });

  return { ms, plays, artistCount: artists.size, trackCount: tracks.size, albumCount: albums.size, activeDays: daily.size, yearly: yearlyList,
    start: has ? start : null, end: has ? end : null, years: [...years].sort((a, b) => b - a),
    artists: rankedArtists, tracks: rank(tracks), albums: rank(albums), timeline, heat, excluded, artistTimeline,
    daily: dailyList.map(([key, value]) => [key, value.ms, value.plays]),
    streak: longest ? { days: longest.days, from: longest.from, to: longest.to } : null,
    latestStreak: run ? { days: run.days, from: run.from, to: run.to } : null,
    biggestDay, firstPlay, repeat: bestRun,
    sessions: { count: sessionCount, avgMs: sessionCount ? sessionMs / sessionCount : 0, longest: longestSession },
    behaviour: { events: behaviour.events, known: behaviour.known, skips: behaviour.skips, shuffleKnown: behaviour.shuffleKnown, shuffles: behaviour.shuffles,
      offlineKnown: behaviour.offlineKnown, offline: behaviour.offline, short: behaviour.short, starts: byCount(behaviour.starts), ends: byCount(behaviour.ends), mostSkipped, neverSkipped },
    discoveries: { label: year === 'all' ? 'First heard in your last 12 months' : `First heard in ${year}`, items: has ? discoveries : [] },
    topShare: ms ? (rankedArtists[0]?.ms ?? 0) / ms : 0 };
}

// One artist up close, using the same filters as the dashboard.
export function artistDetail(rows, name, { year = 'all', minimum = 30000, utc = false } = {}) {
  const parts = partsOf(utc);
  const tracks = new Map(), albums = new Map(), months = new Map();
  const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
  let ms = 0, plays = 0, first = null, last = null, everFirst = null, everLast = null, known = 0, skips = 0, totalMs = 0;
  for (const row of rows) {
    const [y, mo, , wd, h] = parts(new Date(row.ts));
    const inYear = year === 'all' || y === Number(year);
    if (inYear && row.ms >= minimum) totalMs += row.ms;
    if (row.artist !== name) continue;
    if (row.ms >= minimum) { everFirst = everFirst === null ? row.ts : Math.min(everFirst, row.ts); everLast = everLast === null ? row.ts : Math.max(everLast, row.ts); }
    if (!inYear) continue;
    if (hasBehaviour(row)) { known++; if (isSkip(row)) skips++; }
    if (row.ms < minimum) continue;
    ms += row.ms; plays++;
    first = first === null ? row.ts : Math.min(first, row.ts); last = last === null ? row.ts : Math.max(last, row.ts);
    const t = tracks.get(row.track) ?? tracks.set(row.track, { name: row.track, artist: name, album: row.album, uri: row.uri, ms: 0, plays: 0 }).get(row.track);
    t.ms += row.ms; t.plays++;
    if (!t.uri && row.uri) t.uri = row.uri;
    if (row.album) { const a = albums.get(row.album) ?? albums.set(row.album, { name: row.album, artist: name, ms: 0, plays: 0 }).get(row.album); a.ms += row.ms; a.plays++; }
    bump(months, `${y}-${pad(mo + 1)}`, row.ms);
    hours[h] += row.ms; weekdays[(wd + 6) % 7] += row.ms;
  }
  const keys = months.size ? monthRange([...months.keys()].sort()[0], [...months.keys()].sort().at(-1)) : [];
  return { name, ms, plays, share: totalMs ? ms / totalMs : 0, trackCount: tracks.size, albumCount: albums.size, first, last, everFirst, everLast,
    known, skips, tracks: rank(tracks).slice(0, 10), albums: rank(albums).slice(0, 6), timeline: keys.map(key => ({ key, ms: months.get(key) ?? 0 })), hours, weekdays };
}

/* ---------- Sample library ---------- */
// A made-up listener, so the dashboard has something to show before an import.
// Every artist, album and track below is fictional. `joins` is the day (from Jan 1, 2024) they were first heard.
export const DEMO_CATALOG = [
  { artist: 'Velvet Harbour', weight: 10, joins: 0, albums: [['Low Tide Radio', ['Saltwater Static', 'Harbour Lights', 'Slow Fade', 'Ferry at Midnight', 'Undertow']], ['Shoreline Hymns', ['Gulls', 'Driftwood Choir', 'Last Ferry Home', 'Fog Bell']]] },
  { artist: 'Neon Orchard', weight: 8, joins: 0, fade: 420, albums: [['Polaroid Summer', ['Peach Fuzz', 'Cherry Cola Sky', 'Backseat Constellations', 'Sunburn Season']], ['Fruit Machine', ['Jackpot Heart', 'Plum Wine', 'Tangerine Static']]] },
  { artist: 'Mira Solano', weight: 6, joins: 0, albums: [['Glass Garden', ['Paper Moons', 'Ivy', 'Glasshouse', 'Bloom Slowly', 'Terrarium']]] },
  { artist: 'The Lantern Club', weight: 5, joins: 0, night: true, albums: [['Small Hours', ['3 A.M. Diner', 'Streetlight Waltz', 'Night Bus', 'Lantern', 'Closing Time Again']]] },
  { artist: 'Kite & Coral', weight: 5, joins: 0, summer: true, albums: [['Daylight Savings', ['Golden Hour', 'Sea Glass', 'Long Weekend', 'Weather Report']]] },
  { artist: 'Static Bloom', weight: 4, joins: 0, fade: 300, albums: [['Overgrown', ['Moss', 'Wildflower Interference', 'Pollen Count', 'Greenhouse Effect']]] },
  { artist: 'Juno Avery', weight: 9, joins: 130, albums: [['Soft Machinery', ['Clockwork Heart', 'Static Kiss', 'Velvet Gears', 'Pressure Points']], ['Second Light', ['Morning Person', 'Afterimage', 'Halflife', 'Lights On']]] },
  { artist: 'Cassette Ghosts', weight: 3, joins: 200, albums: [['Rewind', ['Side B', 'Tape Hiss', 'Auto-Reverse', 'Play / Pause']]] },
  { artist: 'Lumen Drive', weight: 6, joins: 300, peak: 560, albums: [['Night Swim', ['Chlorine', 'Underwater Lights', 'Deep End', 'Lifeguard Off Duty']]] },
  { artist: 'Pale Signal', weight: 3, joins: 380, albums: [['Transmissions', ['Shortwave', 'Numbers Station', 'Static Prayer', 'Carrier Wave']]] },
  { artist: 'Moth Parade', weight: 3, joins: 520, night: true, albums: [['Porchlight Dances', ['Lamplight', 'Wingbeat', 'Paper Lanterns', 'Gathering']]] },
  { artist: 'Hollow Pines', weight: 5, joins: 640, winter: true, albums: [['Cabin Recordings', ['Woodsmoke', 'Kettle Song', 'Snowed In', 'Pine Needle Rain']]] },
  { artist: 'Ada Monroe', weight: 9, joins: 745, albums: [['Northern Lights Motel', ['Room 12', 'Vacancy', 'Aurora', 'Ice Machine', 'Check-Out Time']]] },
  { artist: 'Sunday Fever', weight: 3, joins: 820, weekend: true, albums: [['Lazy Hymns', ['Hammock', 'Iced Coffee', 'Slow Sunday', 'Porch Light']]] },
  { artist: 'Tropic of Nowhere', weight: 3, joins: 870, albums: [['Postcards', ['Greetings From Nowhere', 'Palm Shadows', 'Souvenir', 'Duty Free']]] },
  { artist: 'Wren & the Wildfires', weight: 7, joins: 930, albums: [['Smoke Signals', ['Ember Season', 'Kindling', 'Firebreak', 'Spark']]] }
];

const hashString = text => { let h = 2166136261; for (const char of text) { h ^= char.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const seeded = seed => () => {
  seed = seed + 0x6d2b79f5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

export function demoRows() {
  const random = seeded(20240101), first = Date.UTC(2024, 0, 1);
  const weighted = (items, weights) => {
    let r = random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) if ((r -= weights[i]) <= 0) return items[i];
    return items.at(-1);
  };
  const hour = weekend => {
    const r = random(), n = span => Math.floor(random() * span);
    if (weekend) return r < .3 ? 10 + n(4) : r < .6 ? 14 + n(5) : r < .9 ? 19 + n(5) : n(3);
    return r < .22 ? 7 + n(2) : r < .35 ? 12 + n(2) : r < .85 ? 17 + n(6) : r < .95 ? 23 : n(2);
  };
  const artists = DEMO_CATALOG.map(entry => ({ ...entry, tracks: entry.albums.flatMap(([album, names]) => names.map((name, i) => ({
    // Opening tracks are the favourites nobody skips.
    name, album, artist: entry.artist, hit: 1 / (i + 1) ** .7, length: 150000 + hashString(entry.artist + name) % 180000, skip: i ? hashString(name) % 100 / 1000 : -1
  }))) }));
  const rows = [];
  let cursor = first;
  for (let d = 0; d < 1004; d++) {
    const date = new Date(first + d * DAY), weekday = date.getUTCDay(), weekend = weekday === 0 || weekday === 6;
    const season = Math.sin(2 * Math.PI * ((date - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY - 80) / 365);
    const summer = Math.max(0, season), winter = Math.max(0, -season), trip = d >= 587 && d <= 596;
    // Slow swings over the months, so the timeline has busy stretches and quiet ones.
    const mood = 1 + .32 * Math.sin(2 * Math.PI * d / 210) + .18 * Math.sin(2 * Math.PI * d / 97 + 1);
    let count = 18 * mood * (1 + .15 * winter) * (weekend ? 1.25 : 1) * (.5 + random());
    if (random() < .045 && !trip) continue;
    if (random() < .03) count *= 2.1;
    if (trip) count *= 1.3;
    count = Math.round(count);
    // New favourites get a honeymoon phase; some fade, one peaks, a couple are seasonal.
    const interest = artists.map(a => {
      if (d < a.joins) return 0;
      let w = a.weight * (a.joins ? 1 + 1.4 * Math.exp(-(d - a.joins) / 50) : 1);
      if (a.fade) w *= .25 + .75 * Math.exp(-d / a.fade);
      if (a.peak) w *= .3 + 1.6 * Math.exp(-(((d - a.peak) / 110) ** 2));
      if (a.summer) w *= .35 + 1.4 * summer;
      if (a.winter) w *= .3 + 1.5 * winter;
      if (a.weekend && weekend) w *= 2;
      return w;
    });
    const sessions = Math.min(count, 1 + Math.floor(random() * (weekend ? 4 : 3)));
    const starts = Array.from({ length: sessions }, () => hour(weekend)).sort((a, b) => a - b);
    let remaining = count;
    for (let s = 0; s < sessions && remaining > 0; s++) {
      const size = s === sessions - 1 ? remaining : Math.max(1, Math.round(remaining / (sessions - s) * (.6 + random() * .8)));
      remaining -= size;
      cursor = Math.max(first + d * DAY + starts[s] * 3600000 + Math.floor(random() * 3600000), cursor + 40 * 60000);
      const night = starts[s] >= 21 || starts[s] < 4;
      const weights = artists.map((a, i) => interest[i] * (a.night && night ? 2.4 : 1));
      const mode = random() < .35 ? 'album' : random() < .4 ? 'artist' : 'mix';
      const shuffle = mode !== 'album' && random() < .75, offline = trip || random() < .03;
      let artist = weighted(artists, weights), queue = [], position = 0, previous = null;
      if (mode === 'album') {
        const [album] = artist.albums[Math.floor(random() * artist.albums.length)];
        queue = artist.tracks.filter(t => t.album === album);
        if (random() < .3) position = Math.floor(random() * queue.length);
      }
      for (let p = 0; p < size; p++) {
        let track;
        if (previous && !previous.skipped && random() < .035) track = previous.track;
        else if (position < queue.length) track = queue[position++];
        else {
          if (mode !== 'artist') artist = weighted(artists, weights);
          track = weighted(artist.tracks, artist.tracks.map(t => t.hit));
        }
        const skipped = track.skip >= 0 && random() < .05 + track.skip + (shuffle ? .03 : 0);
        let ms = track.length, reasonEnd = 'trackdone';
        if (skipped) { ms = 1500 + Math.floor(random() * 26000); reasonEnd = 'fwdbtn'; }
        else if ((p === size - 1 && random() < .35) || random() < .03) { ms = Math.floor(track.length * (.35 + random() * .55)); reasonEnd = 'endplay'; }
        const reasonStart = !previous ? ['appload', 'clickrow', 'playbtn', 'clickrow'][Math.floor(random() * 4)] : previous.track === track ? 'backbtn' : previous.skipped ? 'fwdbtn' : 'trackdone';
        cursor += ms;
        rows.push({ ts: cursor, ms, track: track.name, artist: track.artist, album: track.album, uri: '', skipped, shuffle, offline, reasonStart, reasonEnd });
        cursor += 400 + Math.floor(random() * 2500);
        previous = { track, skipped };
      }
    }
  }
  // Trim the edges so no time zone sees a stub month at either end.
  return rows.filter(row => row.ts >= first + 12 * 3600000 && row.ts <= Date.UTC(2026, 8, 30, 10));
}
