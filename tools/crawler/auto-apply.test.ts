import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MappingTarget, SiteCheck, SiteCheckStatus, TargetProposal, TargetValue } from '@pantry-finder/shared';
import { autoApplyBlockers } from './auto-apply.js';
import type { StoredPantry } from './pipeline.js';

const pantry = { phone: '555-123-4567', schedules: [], services: [] } as unknown as StoredPantry;
const check = (status: SiteCheckStatus): SiteCheck => ({ status, found: [] });
const proposal = (target: MappingTarget, value: TargetValue, rawText = 'text', uncertain = false): TargetProposal => ({
  target,
  candidates: [{ url: 'https://example.org/', selector: 'p', rawText, value, uncertain }],
});
const clean = [proposal('phone', '555-123-4567'), proposal('aboutUs', 'We feed people.')];

test('address match with a matching phone auto-applies', () => {
  assert.deepEqual(autoApplyBlockers(pantry, clean, check('match'), check('match')), []);
});

test('a phone the site does not state, or the pantry does not have, passes', () => {
  assert.deepEqual(autoApplyBlockers(pantry, clean, check('match'), check('not_found')), []);
  assert.deepEqual(autoApplyBlockers(pantry, clean, check('match'), undefined), []);
});

test('the address has to match', () => {
  assert.deepEqual(autoApplyBlockers(pantry, clean, check('not_found'), check('match')), ['address not_found']);
  assert.deepEqual(autoApplyBlockers(pantry, clean, check('mismatch'), check('match')), ['address mismatch']);
});

test('a phone mismatch blocks', () => {
  assert.deepEqual(autoApplyBlockers(pantry, clean, check('match'), check('mismatch')), ['phone mismatch']);
});

test('one target tripping a guardrail blocks the whole proposal', () => {
  const uncertain = [...clean, proposal('notes', 'Bring ID', 'Bring ID', true)];
  assert.deepEqual(autoApplyBlockers(pantry, uncertain, check('match'), check('match')), ['notes: uncertain']);

  const closure = [...clean, proposal('notes', 'Closed', 'Temporarily closed until spring')];
  assert.deepEqual(autoApplyBlockers(pantry, closure, check('match'), check('match')), ['notes: closure_words']);
});

test('only the top candidate of a target counts', () => {
  const p = proposal('notes', 'Bring ID');
  p.candidates.push({ ...p.candidates[0], value: 'Maybe', uncertain: true });
  assert.deepEqual(autoApplyBlockers(pantry, [p], check('match'), check('match')), []);
});

test('hours that would be emptied block', () => {
  const withHours = { ...pantry, schedules: [{ day: 'Monday' }] } as unknown as StoredPantry;
  assert.deepEqual(autoApplyBlockers(withHours, [proposal('schedules', [])], check('match'), check('match')), [
    'schedules: emptied_schedules',
  ]);
});
