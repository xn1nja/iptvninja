import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EpgIndex, nowNext, programmeProgress } from '../src/epg';
import { parseXmltv, parseXmltvTime } from '../src/xmltv';
import type { EpgEntry } from '../src/types';

const XMLTV = `<?xml version="1.0" encoding="UTF-8"?>
<tv>
  <channel id="bbc1.uk">
    <display-name>BBC One</display-name>
    <display-name>BBC 1 HD</display-name>
    <icon src="http://logo/bbc1.png" />
  </channel>
  <programme start="20240115200000 +0000" stop="20240115210000 +0000" channel="bbc1.uk">
    <title lang="en">The Six O&apos;Clock News</title>
    <desc lang="en">Headlines &amp; weather.</desc>
  </programme>
  <programme start="20240115210000 +0000" stop="20240115220000 +0000" channel="bbc1.uk">
    <title lang="en"><![CDATA[Panorama]]></title>
  </programme>
</tv>`;

test('parses XMLTV timestamps with and without offsets', () => {
  assert.equal(parseXmltvTime('20240115200000 +0000'), Date.UTC(2024, 0, 15, 20, 0, 0));
  assert.equal(parseXmltvTime('20240115200000 +0100'), Date.UTC(2024, 0, 15, 19, 0, 0));
  assert.equal(parseXmltvTime('20240115200000 -0500'), Date.UTC(2024, 0, 16, 1, 0, 0));
  assert.equal(parseXmltvTime('202401152000'), Date.UTC(2024, 0, 15, 20, 0, 0));
  assert.ok(Number.isNaN(parseXmltvTime('not a time')));
});

test('parses channels and programmes, decoding entities and CDATA', () => {
  const document = parseXmltv(XMLTV);

  assert.equal(document.channels.length, 1);
  assert.deepEqual(document.channels[0]?.displayNames, ['BBC One', 'BBC 1 HD']);
  assert.equal(document.channels[0]?.icon, 'http://logo/bbc1.png');

  assert.equal(document.programmes.length, 2);
  assert.equal(document.programmes[0]?.title, "The Six O'Clock News");
  assert.equal(document.programmes[0]?.description, 'Headlines & weather.');
  assert.equal(document.programmes[1]?.title, 'Panorama');
});

const entries: EpgEntry[] = [
  { channelId: 'a', title: 'First', start: 1_000, end: 2_000 },
  { channelId: 'a', title: 'Second', start: 2_000, end: 3_000 },
  { channelId: 'a', title: 'Third', start: 3_000, end: 4_000 },
];

test('now/next picks the airing programme and the one after it', () => {
  const result = nowNext(entries, 2_500);
  assert.equal(result.now?.title, 'Second');
  assert.equal(result.next?.title, 'Third');
});

test('now/next reports only the upcoming programme when nothing is on', () => {
  const result = nowNext(entries, 500);
  assert.equal(result.now, undefined);
  assert.equal(result.next?.title, 'First');
});

test('now/next is empty once the guide has run out', () => {
  assert.deepEqual(nowNext(entries, 9_000), {});
});

test('programme progress is clamped to 0..1', () => {
  const entry = entries[1] as EpgEntry;
  assert.equal(programmeProgress(entry, 2_500), 0.5);
  assert.equal(programmeProgress(entry, 0), 0);
  assert.equal(programmeProgress(entry, 99_999), 1);
});

test('EpgIndex matches by tvg-id and falls back to display name', () => {
  const document = parseXmltv(XMLTV);
  const index = new EpgIndex(document.programmes, {
    'bbc1.uk': document.channels[0]?.displayNames ?? [],
  });

  const byId = index.nowNextFor(
    { name: 'Anything', epgChannelId: 'bbc1.uk' },
    Date.UTC(2024, 0, 15, 20, 30),
  );
  assert.equal(byId.now?.title, "The Six O'Clock News");

  // No tvg-id, but the name matches a <display-name> once normalised.
  const byName = index.nowNextFor(
    { name: 'BBC 1 HD', epgChannelId: null },
    Date.UTC(2024, 0, 15, 21, 30),
  );
  assert.equal(byName.now?.title, 'Panorama');

  assert.deepEqual(index.entriesFor({ name: 'Unknown Channel', epgChannelId: 'nope' }), []);
});

test('EpgIndex windows programmes overlapping a range', () => {
  const document = parseXmltv(XMLTV);
  const index = new EpgIndex(document.programmes);
  const window = index.windowFor(
    { name: 'BBC One', epgChannelId: 'bbc1.uk' },
    Date.UTC(2024, 0, 15, 20, 30),
    Date.UTC(2024, 0, 15, 21, 30),
  );
  assert.equal(window.length, 2);
});
