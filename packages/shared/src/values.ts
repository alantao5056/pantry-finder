// Value helpers shared by the API, the admin app and tools/crawler: comparing
// pantry field values, and normalizing crawled values into the stored format.
//
// Stored formats (from the prod data): phone `555-123-4567`, times `9:00 AM`,
// full weekday names, `everyOtherWeekIndicator` always present as a boolean.

import type { AddressFields, ScheduleDraft } from './admin.js';
import { US_STATES } from './states.js';

/** JSON with sorted object keys, so value comparisons ignore key order. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
}

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Recursively drops keys whose value is `undefined`. The Firestore admin SDK
 * rejects `undefined` anywhere in a document (top level OR nested inside
 * arrays such as services/schedules), so optional fields left undefined must be
 * removed before writing.
 */
export function pruneUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => pruneUndefined(v)) as unknown as T;
  }
  // Only plain objects: Timestamp / GeoPoint instances must pass through intact.
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = pruneUndefined(v);
    }
    return out as T;
  }
  return value;
}

/** `(555) 123-4567`, `5551234567`, `+1 555.123.4567` → `555-123-4567`. Anything else is trimmed as-is. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  // Keep extensions and other free text untouched; only reformat a bare number.
  if (ten.length === 10 && !/[a-z]/i.test(trimmed)) {
    return `${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
  }
  return trimmed;
}

// Full state name (lowercase, no dots) → 2-letter code.
const STATE_CODES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(US_STATES).map(([code, name]) => [name.replace(/\./g, '').toLowerCase(), code.toUpperCase()])),
  'district of columbia': 'DC',
};

/** `TX`, `tx.`, `Texas`, `D.C.` → `TX` / `DC`; anything else → undefined. */
function stateCode(raw: string): string | undefined {
  const s = raw.replace(/\./g, '').trim().replace(/\s+/g, ' ').toLowerCase();
  return /^[a-z]{2}$/.test(s) ? s.toUpperCase() : STATE_CODES[s];
}

/**
 * Best-effort split of a one-line US address — `street[, line 2], city, ST 12345[, USA]`,
 * where the state may be a code or a full name (`Texas 78666`) and the city may
 * share the last part with it (`San Marcos TX 78666`) — into pantry address
 * fields. A line that doesn't fit lands whole in `address1` for the admin to
 * split by hand.
 */
export function parseAddressLine(line: string): AddressFields {
  const fallback = { address1: line.trim(), address2: '', city: '', state: '', zipCode: '' };
  const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length && /^(usa?|united states( of america)?)$/i.test(parts[parts.length - 1]!)) parts.pop();
  if (parts.length < 2) return fallback;

  const [, rest, zipCode = ''] = /^(.*?)(?:\s+(\d{5})(?:-\d{4})?)?$/.exec(parts.pop()!)!;
  let state = stateCode(rest!);
  let city: string | undefined;
  if (state) {
    // `…, city, ST 12345`: the city is its own part.
    if (parts.length < 2) return fallback;
    city = parts.pop()!;
  } else if (zipCode) {
    // `…, city ST 12345`: peel a state (up to 3 words) off the end. Only with a
    // ZIP, so a lone city part like "Fort Worth" is never misread.
    const words = rest!.split(/\s+/);
    for (let n = Math.min(3, words.length - 1); n >= 1 && !state; n--) {
      state = stateCode(words.slice(-n).join(' '));
      if (state) city = words.slice(0, -n).join(' ');
    }
  }
  if (!state || !city) return fallback;
  return {
    address1: parts[0]!,
    address2: parts.slice(1).join(', '),
    city,
    state,
    zipCode,
  };
}

/** `mailto:Info@Example.org` → `info@example.org`. */
export function normalizeEmail(raw: string): string {
  return raw.trim().replace(/^mailto:/i, '').toLowerCase();
}

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

function normalizeWeekDay(raw: string): string {
  const key = raw.trim().slice(0, 3).toLowerCase();
  return WEEKDAYS.find((d) => d.slice(0, 3).toLowerCase() === key) ?? raw.trim();
}

/** `9am`, `09:00`, `9:00am`, `noon`, `17:30` → `9:00 AM` style. Unparseable input is trimmed as-is. */
export function normalizeTime(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/\./g, '');
  if (s === 'noon') return '12:00 PM';
  if (s === 'midnight') return '12:00 AM';
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/.exec(s);
  if (!m) return raw.trim();
  let hour = Number(m[1]);
  const minute = m[2] ?? '00';
  const suffix = m[3];
  if (hour > 23 || Number(minute) > 59) return raw.trim();
  let period: 'AM' | 'PM';
  if (suffix) {
    if (hour === 0 || hour > 12) return raw.trim();
    period = suffix.startsWith('p') ? 'PM' : 'AM';
  } else {
    period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
  }
  return `${hour}:${minute} ${period}`;
}

function minutesOf(time: string): number {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(time);
  if (!m) return Number.MAX_SAFE_INTEGER;
  return ((Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + Number(m[2]);
}

/** Canonical form of a schedule list: stored formats, sorted by day then start time. */
export function normalizeSchedules(list: ScheduleDraft[]): ScheduleDraft[] {
  return list
    .map((s) => {
      const out: ScheduleDraft = {
        weekDay: normalizeWeekDay(s.weekDay),
        startTime: normalizeTime(s.startTime),
        endTime: normalizeTime(s.endTime),
        everyOtherWeekIndicator: s.everyOtherWeekIndicator === true,
      };
      const notes = s.notes?.trim();
      if (notes) out.notes = notes;
      return out;
    })
    .sort((a, b) => {
      const day = WEEKDAYS.indexOf(a.weekDay as never) - WEEKDAYS.indexOf(b.weekDay as never);
      return day !== 0 ? day : minutesOf(a.startTime) - minutesOf(b.startTime);
    });
}
