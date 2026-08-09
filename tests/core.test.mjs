import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, mergeRows, aggregate } from '../public/js/core.mjs';

const event = (overrides = {}) => ({
  ts: '2024-01-01T15:30:00Z', ms_played: 180000,
  master_metadata_track_name: 'One', master_metadata_album_artist_name: 'Artist',
  master_metadata_album_album_name: 'Album', spotify_track_uri: 'spotify:track:abc123',
  ...overrides
});

test('extended export keeps music metadata and drops account and device fields', () => {
  const { rows, ignored } = normalize([
    event({ ip_addr: 'private', conn_country: 'DE', platform: 'android', username: 'someone' }),
    event({ master_metadata_track_name: null, episode_name: 'A podcast' }), null, event({ ms_played: -1 }), event({ ts: 'invalid' })
  ]);
  assert.equal(rows.length, 1); assert.equal(ignored, 4);
  assert.deepEqual(Object.keys(rows[0]).sort(), ['album', 'artist', 'ms', 'track', 'ts', 'uri']);
  assert.equal(normalize([event({ spotify_track_uri: 'javascript:alert(1)' })]).rows[0].uri, '');
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
  // Both plays are on a Monday.
  assert.equal(stats.heat[1][15], 180000); assert.equal(stats.heat[1][21], 60000);
  assert.equal(stats.heat.flat().reduce((a, b) => a + b, 0), stats.ms);
  assert.equal(stats.artists[0].name, 'Artist'); assert.equal(stats.topShare, .75);
  assert.deepEqual(stats.years, [2025, 2024]);
  assert.equal(aggregate(rows, { year: '2024', minimum: 0, utc: true }).plays, 3);
});

test('the same title by different artists is ranked as two tracks', () => {
  const { rows } = normalize([event(), event({ master_metadata_album_artist_name: 'Another artist' })]);
  assert.equal(aggregate(rows).trackCount, 2);
});

test('a filter with no matches returns an empty dashboard without NaN or infinite dates', () => {
  const result = aggregate(normalize([event()]).rows, { year: '2000', utc: true });
  assert.equal(result.plays, 0); assert.equal(result.start, null); assert.equal(result.end, null);
  assert.equal(result.topShare, 0); assert.deepEqual(result.timeline, []);
});
