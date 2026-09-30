import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAddress } from './address.js';
import type { StoredPantry } from './pipeline.js';

const pantry = (address1: string, zipCode = '') => ({ address1, zipCode }) as StoredPantry;
const status = (address1: string, zipCode: string, found: string[]) => checkAddress(pantry(address1, zipCode), found).status;

test('no addresses on the site is not_found', () => {
  assert.equal(status('123 Main St', '12345', []), 'not_found');
});

test('suffix and direction spellings are folded', () => {
  assert.equal(status('123 N Main St', '12345', ['123 North Main Street, Springfield, IL 12345']), 'match');
});

test('spelled-out ordinal streets match their numeric form', () => {
  assert.equal(status('120 2nd Ave', '25951', ['120 Second Ave, Hinton, WV 25951']), 'match');
  assert.equal(status('120 Second Ave', '25951', ['120 2nd Avenue, Hinton, WV 25951']), 'match');
  assert.equal(status('120 2nd Ave', '25951', ['120 Third Ave, Hinton, WV 25951']), 'mismatch');
});

test('a different house number or street is a mismatch', () => {
  assert.equal(status('123 N Main St', '12345', ['124 N Main St, Springfield 12345']), 'mismatch');
  assert.equal(status('123 N Main St', '12345', ['123 Oak St, Springfield 12345']), 'mismatch');
});

test('any one matching address is enough', () => {
  assert.equal(status('123 Main St', '12345', ['9 Elm St, Springfield 12345', '123 Main Street, Springfield 12345']), 'match');
});

test('the ZIP has to agree when the site states one', () => {
  assert.equal(status('123 Main St', '12345', ['123 Main St, Springfield 54321']), 'mismatch');
  assert.equal(status('123 Main St', '12345', ['123 Main St, Springfield']), 'match');
});

test('a house-number range skips to the street name', () => {
  assert.equal(status('123 Main St', '12345', ['123-125 Main St, Springfield 12345']), 'match');
});

test('grid addresses use the numbered street as the street name', () => {
  assert.equal(status('2375 E 3300 S', '84109', ['2375 East 3300 South, Salt Lake City/Millcreek']), 'match');
  assert.equal(status('2375 E 3300 S', '84109', ['2375 East 3300 South, Salt Lake City, UT 84109']), 'match');
  assert.equal(status('2375 E 3300 S', '84109', ['2375 East 3900 South, Salt Lake City, UT 84109']), 'mismatch');
});

test('an address without a house number has to appear whole', () => {
  assert.equal(status('PO Box 42', '12345', ['Mail: P.O. Box 42, Springfield 12345']), 'match');
  assert.equal(status('PO Box 42', '12345', ['PO Box 420, Springfield 12345']), 'mismatch');
});
