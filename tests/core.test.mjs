import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize, mergeRows } from '../public/js/core.mjs';

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
