import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentPage } from './page/segment.js';
import { toCandidates, type LoadedPage } from './site.js';

const url = 'https://example.org/';
const page = segmentPage(`<html><body>
  <main><h2>Hours of Operation</h2><p id="body-hours">Monday 10:00am - 6:00pm</p></main>
  <div id="side"><h2>Hours of Operation</h2><p id="side-hours">Mon 10:00am - 6:00pm</p><p id="old-hours">Mon 9:00am - 5:00pm</p></div>
</body></html>`);
const site: LoadedPage[] = [{ url, fetch: { finalUrl: url } as LoadedPage['fetch'], page }];

const blockId = (text: string) => `p0${page.segments.find((s) => s.text === text)!.id}`;
const monday = (startTime: string, endTime: string) => [{ weekDay: 'Monday', startTime, endTime }];

test('candidates repeating an earlier value are dropped', () => {
  const [proposal] = toCandidates(site, [
    {
      target: 'schedules',
      candidates: [
        { blockIds: [blockId('Monday 10:00am - 6:00pm')], value: monday('10:00 AM', '6:00 PM'), uncertain: false },
        { blockIds: [blockId('Mon 10:00am - 6:00pm')], value: monday('10:00am', '6:00pm'), uncertain: false },
        { blockIds: [blockId('Mon 9:00am - 5:00pm')], value: monday('9:00 AM', '5:00 PM'), uncertain: true },
      ],
    },
  ]);
  assert.deepEqual(
    proposal!.candidates.map((c) => c.rawText),
    ['Monday 10:00am - 6:00pm', 'Mon 9:00am - 5:00pm'],
  );
});
