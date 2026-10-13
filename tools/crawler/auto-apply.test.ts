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
  const uncertain = [proposal('phone', '555-987-6543', 'Call 555-987-6543', true), proposal('aboutUs', 'We feed people.')];
  assert.deepEqual(autoApplyBlockers(pantry, uncertain, check('match'), check('match')), ['phone: uncertain']);

  const closure = [...clean, proposal('notes', 'Closed', 'Temporarily closed until spring')];
  assert.deepEqual(autoApplyBlockers(pantry, closure, check('match'), check('match')), ['notes: closure_words']);
});

test('an unsure parse of a free-text field passes, even over a stored value', () => {
  const stored = {
    ...pantry,
    notes: 'Old notes',
    contactName: 'Old Name',
    aboutUs: 'Old about',
    services: [{ notes: 'Old service notes', schedules: [] }],
  } as unknown as StoredPantry;
  const unsure = [
    proposal('notes', 'Bring ID', 'Bring ID', true),
    proposal('contactName', 'Jane Doe', 'Jane Doe', true),
    proposal('aboutUs', 'We feed people.', 'We feed people.', true),
    proposal('services.0.notes', 'Walk-ins welcome', 'Walk-ins welcome', true),
  ];
  assert.deepEqual(autoApplyBlockers(stored, unsure, check('match'), check('match')), []);
});

test('an unsure parse passes for a field the pantry has no value for', () => {
  const empty = { schedules: [], services: [{ schedules: [] }] } as unknown as StoredPantry;
  const hours = [{ day: 'Monday' }] as unknown as TargetValue;
  const unsure = [
    proposal('schedules', hours, 'Mon 9-5?', true),
    proposal('services.0.schedules', hours, 'Mon 9-5?', true),
    proposal('email', 'info@example.org', 'info@example.org', true),
    proposal('phone', '555-987-6543', '555-987-6543', true),
  ];
  assert.deepEqual(autoApplyBlockers(empty, unsure, check('match'), undefined), []);
});

test('an unsure parse over stored hours blocks', () => {
  const withHours = { ...pantry, schedules: [{ day: 'Monday' }] } as unknown as StoredPantry;
  const unsure = [proposal('schedules', [{ day: 'Tuesday' }] as unknown as TargetValue, 'Tue 9-5?', true)];
  assert.deepEqual(autoApplyBlockers(withHours, unsure, check('match'), check('match')), ['schedules: uncertain']);
});

test('closure wording still blocks an unsure free-text field', () => {
  const closure = [proposal('notes', 'Closed', 'Temporarily closed until spring', true)];
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
