import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, mergeRows, aggregate, artistDetail, demoRows, toCSV } from '../public/js/core.mjs';

const event = (overrides = {}) => ({
  ts: '2024-01-01T15:30:00Z', ms_played: 180000,
  master_metadata_track_name: 'One', master_metadata_album_artist_name: 'Artist',
  master_metadata_album_album_name: 'Album', spotify_track_uri: 'spotify:track:abc123',
  ...overrides
});

test('extended export keeps music metadata and behaviour, and drops account and device fields', () => {
  const { rows, ignored } = normalize([
    event({ ip_addr: 'private', conn_country: 'DE', platform: 'android', username: 'someone', skipped: true, shuffle: false, offline: null, reason_start: 'clickrow', reason_end: 'fwdbtn' }),
    event({ master_metadata_track_name: null, episode_name: 'A podcast' }), null, event({ ms_played: -1 }), event({ ts: 'invalid' })
  ]);
  assert.equal(rows.length, 1); assert.equal(ignored, 4);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['album', 'artist', 'ms', 'reasonEnd', 'reasonStart', 'shuffle', 'skipped', 'track', 'ts', 'uri']);
  assert.deepEqual(Object.keys(normalize([event({ reason_end: '<script>' })]).rows[0]).sort(), ['album', 'artist', 'ms', 'track', 'ts', 'uri']);
  assert.equal(normalize([event({ spotify_track_uri: 'javascript:alert(1)' })]).rows[0].uri, '');
});

test('re-importing the extended export fills in behaviour without duplicating plays', () => {
  const old = normalize([event()]).rows;
  const merged = mergeRows(old, normalize([event({ skipped: true, shuffle: true, reason_end: 'fwdbtn' })]).rows);
  assert.equal(merged.rows.length, 1); assert.equal(merged.duplicates, 1); assert.equal(merged.enriched, 1);
  assert.equal(merged.rows[0].skipped, true); assert.equal(merged.rows[0].reasonEnd, 'fwdbtn');
});

test('account data export parses endTime as UTC and handles missing albums', () => {
  const { rows } = normalize([{ endTime: '2023-12-31 23:59', msPlayed: 120000, trackName: 'A', artistName: 'B' }]);
  assert.equal(rows[0].ts, Date.parse('2023-12-31T23:59:00Z'));
  assert.equal(rows[0].album, '');
  assert.throws(() => normalize({ items: [] }), /Spotify history array/);
});

test('importing the same history twice never inflates totals', () => {
  const { rows } = normalize([event(), event({ ts: '2024-01-01T15:33:00Z' })]);
  const merged = mergeRows(rows.slice(0, 1), [...rows, rows[1]]);
  assert.equal(merged.rows.length, 2); assert.equal(merged.duplicates, 2);
  assert.ok(merged.rows[0].ts < merged.rows[1].ts);
});

test('year filter, minimum duration, rankings, timeline gaps and heat bins agree', () => {
  const { rows } = normalize([
    event(), event({ ts: '2024-03-04T21:00:00Z', ms_played: 60000, master_metadata_track_name: 'Two', master_metadata_album_artist_name: 'Other' }),
    event({ ms_played: 29999 }), event({ ts: '2025-01-01T21:00:00Z', ms_played: 90000 })
  ]);
  const stats = aggregate(rows, { year: '2024', minimum: 30000, utc: true });
  assert.equal(stats.plays, 2); assert.equal(stats.ms, 240000); assert.equal(stats.excluded, 1);
  assert.equal(stats.artistCount, 2); assert.equal(stats.trackCount, 2); assert.equal(stats.albumCount, 2);
  assert.deepEqual(stats.timeline.map(x => x.ms), [180000, 0, 60000]);
  // Both plays are on a Monday, the first row.
  assert.equal(stats.heat[0][15], 180000); assert.equal(stats.heat[0][21], 60000);
  assert.equal(stats.heat.flat().reduce((a, b) => a + b, 0), stats.ms);
  assert.equal(stats.artists[0].name, 'Artist'); assert.equal(stats.topShare, .75);
  assert.deepEqual(stats.years, [2025, 2024]);
  assert.equal(aggregate(rows, { year: '2024', minimum: 0, utc: true }).plays, 3);
});

test('the same title by different artists is ranked as two tracks', () => {
  const { rows } = normalize([event(), event({ master_metadata_album_artist_name: 'Another artist' })]);
  assert.equal(aggregate(rows).trackCount, 2);
});

test('the sample library is reproducible, ordered, and its totals balance', () => {
  const rows = demoRows(), stats = aggregate(rows, { utc: true });
  assert.deepEqual(rows[1000], demoRows()[1000]);
  assert.ok(rows.every((row, i) => !i || rows[i - 1].ts <= row.ts));
  assert.equal(stats.timeline.reduce((sum, month) => sum + month.ms, 0), stats.ms);
  assert.equal(stats.artists.reduce((sum, artist) => sum + artist.plays, 0), stats.plays);
  assert.equal(stats.yearly.reduce((sum, year) => sum + year.ms, 0), stats.ms);
  assert.equal(stats.timeline.reduce((sum, month) => sum + month.newArtists, 0), stats.artistCount);
  assert.ok(stats.artistCount > 10 && stats.albumCount > 10);
  assert.ok(stats.behaviour.known > 0 && stats.behaviour.neverSkipped.length > 0 && stats.discoveries.items.length > 0);
});

test('discoveries follow the year filter and the artist timeline adds up', () => {
  const { rows } = normalize([
    event({ ts: '2024-02-01T10:00:00Z' }), event({ ts: '2025-03-01T10:00:00Z' }),
    event({ ts: '2025-03-02T10:00:00Z', master_metadata_album_artist_name: 'Newcomer' })
  ]);
  const y2025 = aggregate(rows, { year: '2025', utc: true });
  assert.deepEqual(y2025.discoveries.items.map(a => a.name), ['Newcomer']);
  assert.equal(y2025.artists.find(a => a.name === 'Artist').first, Date.parse('2024-02-01T10:00:00Z'));
  const all = aggregate(rows, { utc: true });
  assert.deepEqual(all.discoveries.items.map(a => a.name), ['Newcomer']);
  const stacked = all.artistTimeline.series.reduce((sum, s) => sum + s.values.reduce((a, b) => a + b, 0), 0);
  assert.equal(stacked, all.ms);
});

test('streaks, sessions, repeats and the biggest day are derived consistently', () => {
  const { rows } = normalize([
    event({ ts: '2024-01-01T10:03:00Z' }), event({ ts: '2024-01-01T10:06:00Z' }), event({ ts: '2024-01-01T10:09:00Z' }),
    event({ ts: '2024-01-02T10:00:00Z', master_metadata_track_name: 'Two' }), event({ ts: '2024-01-03T10:00:00Z', master_metadata_track_name: 'Two' }),
    event({ ts: '2024-01-05T10:00:00Z', master_metadata_track_name: 'Two', master_metadata_album_artist_name: 'New' }),
    event({ ts: '2024-01-05T10:01:00Z', ms_played: 5000, skipped: true, shuffle: true }), event({ ts: '2025-02-01T10:00:00Z', reason_end: 'trackdone', shuffle: false })
  ]);
  const stats = aggregate(mergeRows([], rows).rows, { utc: true });
  assert.deepEqual(stats.streak, { days: 3, from: '2024-01-01', to: '2024-01-03' });
  assert.equal(stats.latestStreak.days, 1);
  assert.equal(stats.biggestDay.key, '2024-01-01'); assert.equal(stats.biggestDay.track.name, 'One');
  assert.equal(stats.repeat.count, 3); assert.equal(stats.repeat.name, 'One');
  assert.equal(stats.sessions.count, 5); assert.equal(stats.sessions.longest.plays, 3);
  assert.equal(stats.firstPlay.ts, Date.parse('2024-01-01T10:03:00Z'));
  assert.equal(stats.daily.reduce((sum, day) => sum + day[1], 0), stats.ms);
  assert.deepEqual(stats.yearly.map(y => [y.year, y.plays, y.newArtists]), [[2024, 6, 2], [2025, 1, 0]]);
  assert.equal(stats.yearly[0].topTrack.name, 'One'); assert.equal(stats.yearly[0].topTrack.album, 'Album');
  assert.equal(stats.timeline[0].newArtists, 2); assert.equal(stats.timeline.at(-1).newArtists, 0);
  // The 5 second skip doesn't count as a play, but it does count towards behaviour.
  assert.equal(stats.behaviour.events, 8); assert.equal(stats.behaviour.known, 2); assert.equal(stats.behaviour.skips, 1);
  assert.equal(stats.behaviour.shuffleKnown, 2); assert.equal(stats.behaviour.shuffles, 1); assert.equal(stats.behaviour.short, 1);
});

test('a 25 minute pause does not split a listening session', () => {
  // The second play starts at 10:28, 25 minutes after the first one ended.
  const { rows } = normalize([event({ ts: '2024-01-01T10:03:00Z' }), event({ ts: '2024-01-01T10:31:00Z' })]);
  assert.equal(aggregate(rows, { utc: true }).sessions.count, 1);
});

test('artist detail matches the dashboard totals for the same filters', () => {
  const rows = demoRows(), filters = { year: '2025', minimum: 30000, utc: true };
  const stats = aggregate(rows, filters), top = stats.artists[0], detail = artistDetail(rows, top.name, filters);
  assert.equal(detail.ms, top.ms); assert.equal(detail.plays, top.plays); assert.equal(detail.trackCount, top.trackCount);
  assert.equal(detail.timeline.reduce((sum, m) => sum + m.ms, 0), top.ms);
  assert.equal(detail.hours.reduce((a, b) => a + b, 0), top.ms);
  assert.ok(Math.abs(detail.share - top.ms / stats.ms) < 1e-9);
});

test('CSV export handles quotes, commas, line breaks and formula injection', () => {
  const csv = toCSV([{ name: '=1+1', artist: 'A,"B"', album: 'Line\nbreak', plays: 2, ms: 120000, first: Date.parse('2024-05-01T10:00:00Z') }]);
  assert.ok(csv.startsWith('﻿"Track","Artist","Album","Plays","Minutes","First heard"'));
  assert.ok(csv.includes('"\'=1+1"')); assert.ok(csv.includes('"A,""B"""'));
  assert.ok(csv.includes('"2.00"')); assert.ok(csv.includes('"2024-05-01"'));
  assert.ok(toCSV([{ name: ' =SUM(A1)', plays: 1, ms: 0 }]).includes('"\' =SUM(A1)"'));
});

test('a filter with no matches returns an empty dashboard without NaN or infinite dates', () => {
  const result = aggregate(normalize([event()]).rows, { year: '2000', utc: true });
  assert.equal(result.plays, 0); assert.equal(result.start, null); assert.equal(result.end, null);
  assert.equal(result.topShare, 0); assert.deepEqual(result.timeline, []);
});
