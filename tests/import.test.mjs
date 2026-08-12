import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { normalize } from '../public/js/core.mjs';
import { unzip, entryText } from '../public/js/worker.mjs';

const history = JSON.stringify([{ ts: '2024-01-01T15:30:00Z', ms_played: 180000, master_metadata_track_name: 'One', master_metadata_album_artist_name: 'Artist' }]);

// A minimal single-entry ZIP, the same layout Spotify's export uses.
function zipFixture(name, text, compressed = true) {
  const nameBytes = Buffer.from(name), bytes = Buffer.from(text), packed = compressed ? deflateRawSync(bytes) : bytes;
  const header = Buffer.alloc(30), directory = Buffer.alloc(46), end = Buffer.alloc(22);
  header.writeUInt32LE(0x04034b50); header.writeUInt16LE(compressed ? 8 : 0, 8);
  header.writeUInt32LE(packed.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(nameBytes.length, 26);
  directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(compressed ? 8 : 0, 10);
  directory.writeUInt32LE(packed.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(nameBytes.length, 28);
  const local = Buffer.concat([header, nameBytes, packed]);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(directory.length + nameBytes.length, 12); end.writeUInt32LE(local.length, 16);
  return new Blob([local, directory, nameBytes, end]);
}

test('reads deflated and stored history files from nested folders in the ZIP', async () => {
  for (const compressed of [true, false]) {
    const entries = await unzip(zipFixture('Spotify Extended Streaming History/Streaming_History_Audio_2024.json', history, compressed));
    assert.equal(entries.length, 1);
    assert.equal(normalize(JSON.parse(await entryText(entries[0]))).rows.length, 1);
  }
});

test('explains broken, unrelated and unsupported archives', async () => {
  await assert.rejects(unzip(new Blob(['not a zip'])), /could not be read/);
  await assert.rejects(unzip(zipFixture('Userdata.json', '{}')), /No Spotify listening history/);
  await assert.rejects(entryText({ method: 99, data: new Uint8Array(), size: 0 }), /compression isn’t supported/);
});
