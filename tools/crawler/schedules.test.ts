import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sameTargetValue, type ScheduleDraft } from '@pantry-finder/shared';

// Shape of an imported "contact for hours" schedule as stored in Firestore.
const contactForHours = {
  weekDay: '',
  startTime: null,
  endTime: null,
  notes: 'Open Saturdays from 9-11 AM.',
} as unknown as ScheduleDraft;

test('stored schedules with null times compare without throwing', () => {
  const crawled: ScheduleDraft[] = [
    { weekDay: 'Saturday', startTime: '9am', endTime: '11am', everyOtherWeekIndicator: false },
  ];
  assert.equal(sameTargetValue('schedules', [contactForHours], crawled), false);
  assert.equal(sameTargetValue('schedules', [contactForHours], [contactForHours]), true);
});
