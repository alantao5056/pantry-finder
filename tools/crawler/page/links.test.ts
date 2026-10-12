import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_EXTRA_PAGES, pickLinks } from './links.js';

const HOME = 'https://example.org/';

function anchors(links: [href: string, text: string][]): string {
  return links.map(([href, text]) => `<a href="${href}">${text}</a>`).join('');
}

test('a pantry page outranks calendar links', () => {
  const html = anchors([
    ['/calendar.aspx?CID=23', 'View All Events'],
    ['/calendar.aspx?CID=25', 'View All Events'],
    ['/calendar.aspx?CID=27', 'View All Events'],
    ['/Calendar.aspx?EID=1204', 'Closed'],
    ['/Calendar.aspx?EID=1152', 'Board Meeting'],
    ['/calendar.aspx?view=list&day=12', '12'],
    ['/calendar.aspx?view=list&day=19', '19'],
    ['/162/Food-Pantry', 'Food Pantry'],
    ['/35/Services', 'Services'],
  ]);
  const picked = pickLinks(html, HOME);
  assert.equal(picked[0], 'https://example.org/162/Food-Pantry');
  assert.equal(picked.length, MAX_EXTRA_PAGES);
});

test('query variants of one path only fill leftover slots', () => {
  const html = anchors([
    ['/calendar.aspx?CID=23', 'Events'],
    ['/calendar.aspx?CID=25', 'Events'],
    ['/Calendar.aspx?EID=1204', 'Events'],
    ['/contact', 'Contact'],
    ['/about', 'About'],
  ]);
  assert.deepEqual(pickLinks(html, HOME), [
    'https://example.org/calendar.aspx?CID=23',
    'https://example.org/contact',
    'https://example.org/about',
    'https://example.org/calendar.aspx?CID=25',
    'https://example.org/Calendar.aspx?EID=1204',
  ]);
});

test('pages routed by query string are all kept when slots allow', () => {
  const html = anchors([
    ['/?page_id=12', 'Hours'],
    ['/?page_id=14', 'Food Pantry'],
    ['/?page_id=16', 'Contact'],
  ]);
  assert.equal(pickLinks(html, HOME).length, 3);
});

test('links back to the homepage are dropped, fragment or not', () => {
  const html = anchors([
    ['/#tab1_1', 'Food Pantry'],
    ['#hours', 'Hours'],
    ['https://example.org/#tab2', 'Food Pantry'],
    ['https://www.example.org', 'Food Pantry'],
  ]);
  assert.deepEqual(pickLinks(html, HOME), []);
});
