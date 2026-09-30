// Writes to live pantries from the crawler pipeline, shared by the API (admin
// approvals, reverts) and tools/crawler (automatic updates). Every write goes
// with a `pantry_changes` entry per target and a `fieldSources` update, so it
// can be audited and rolled back.
//
// Firestore transactions need all reads before any write, so updates are split
// into a pure `planFieldUpdates` (on an already-read pantry) and
// `writeFieldUpdates` (writes only).

import { createHash } from 'node:crypto';
import {
  FieldValue,
  type DocumentReference,
  type Firestore,
  type Timestamp,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  normalizeTargetValue,
  parseTarget,
  sameTargetValue,
  targetField,
  type MappingTarget,
  type TargetValue,
} from '../crawl.js';
import { pruneUndefined } from '../values.js';
import type {
  FieldMappingDocument,
  FieldSource,
  GeoHashField,
  PantryChangeDocument,
  PantryDocument,
  ServiceSchema,
  StoredLocation,
  TrackedPantryField,
} from './schema.js';

export const COLLECTIONS = {
  pantries: 'pantries',
  pantryChanges: 'pantry_changes',
  reviewItems: 'review_items',
  crawlRuns: 'crawl_runs',
  crawlSources: 'crawl_sources',
  fieldMappings: 'field_mappings',
  extractionCache: 'extraction_cache',
  llmEvals: 'llm_evals',
} as const;

// Subcollection of a `crawl_runs` doc holding the worker's log chunks.
export const CRAWL_RUN_LOG = 'log';

// The crawler worker refreshes a running run's `heartbeatAt` this often; a
// run not refreshed for CRAWL_STALE_MS is treated as abandoned.
export const CRAWL_HEARTBEAT_MS = 30_000;
export const CRAWL_STALE_MS = 120_000;

export type PantryWriteErrorCode = 'not_found' | 'bad_target' | 'not_revertible' | 'already_reverted' | 'conflict';

export class PantryWriteError extends Error {
  constructor(public readonly code: PantryWriteErrorCode, message?: string) {
    super(message ?? code);
  }
}

/** sha256 of a region's text, keyed by the kind of value parsed from it. */
export function rawHash(kind: 'text' | 'schedules', rawText: string): string {
  return createHash('sha256').update(`${kind}\n${rawText}`).digest('hex');
}

/** A URL's `crawl_sources` doc id. */
export function sourceId(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export function mappingId(pantryId: string, target: MappingTarget): string {
  return `${pantryId}_${target}`;
}

type StoredPantry = Omit<PantryDocument, 'id'>;

/** Current value of a target; undefined when the field (or the service) is absent. */
export function getTargetValue(pantry: StoredPantry, target: MappingTarget): TargetValue | undefined {
  const parsed = parseTarget(target);
  if (!parsed) return undefined;
  if (parsed.kind === 'text') return pantry[parsed.field];
  if (parsed.serviceIndex === null) return pantry.schedules ?? [];
  return pantry.services?.[parsed.serviceIndex]?.schedules;
}

export interface FieldUpdate {
  target: MappingTarget;
  value: TargetValue;
  mappingId?: string;
  source?: FieldSource;
}

export interface PlannedChange {
  target: MappingTarget;
  field: TrackedPantryField;
  /** null = the field was absent. */
  oldValue: TargetValue | null;
  newValue: TargetValue;
  mappingId?: string;
  /** Overrides the context source, e.g. 'admin' for a value the admin edited. */
  source?: FieldSource;
}

/** Normalizes the updates and keeps only those that actually change the pantry. */
export function planFieldUpdates(pantry: StoredPantry, updates: FieldUpdate[]): PlannedChange[] {
  const plan: PlannedChange[] = [];
  for (const u of updates) {
    const parsed = parseTarget(u.target);
    if (!parsed) throw new PantryWriteError('bad_target', `Unknown target ${u.target}`);
    if (parsed.kind === 'schedules' && parsed.serviceIndex !== null && !pantry.services?.[parsed.serviceIndex]) {
      throw new PantryWriteError('bad_target', `Pantry has no service #${parsed.serviceIndex}`);
    }
    const oldValue = getTargetValue(pantry, u.target);
    const newValue = normalizeTargetValue(u.target, u.value);
    if (sameTargetValue(u.target, oldValue, newValue)) continue;
    plan.push({
      target: u.target,
      field: targetField(u.target),
      oldValue: oldValue ?? null,
      newValue,
      mappingId: u.mappingId,
      source: u.source,
    });
  }
  return plan;
}

export interface WriteContext {
  source: FieldSource;
  /** Admin email, or 'crawler'. */
  actor: string;
  now: Timestamp;
  runId?: string;
  reviewItemId?: string;
  /** Set when these writes undo that change. */
  revertOf?: string;
}

/** Writes a plan from `planFieldUpdates` plus its change-log entries. Returns the change ids. */
export function writeFieldUpdates(
  tx: Transaction,
  db: Firestore,
  pantryRef: DocumentReference,
  pantry: StoredPantry,
  plan: PlannedChange[],
  ctx: WriteContext,
): string[] {
  if (plan.length === 0) return [];
  const update: Record<string, unknown> = { updatedAt: ctx.now };
  let services: ServiceSchema[] | undefined;
  const changeIds: string[] = [];

  for (const c of plan) {
    const parsed = parseTarget(c.target)!;
    if (parsed.kind === 'text') {
      // An emptied optional field is removed rather than stored as ''.
      update[parsed.field] = c.newValue === '' && parsed.field !== 'phone' ? FieldValue.delete() : c.newValue;
      // A new website goes to the front of the crawl queue; a cleared one
      // leaves it (tools/crawler/select.ts).
      if (parsed.field === 'website') update.lastCrawledAt = c.newValue === '' ? FieldValue.delete() : null;
    } else if (parsed.serviceIndex === null) {
      update.schedules = pruneUndefined(c.newValue);
    } else {
      // Services carry fields beyond ServiceSchema (serviceId, overview, ...);
      // replace only the schedules of the one service.
      services ??= (pantry.services ?? []).map((s) => ({ ...s }));
      services[parsed.serviceIndex] = {
        ...services[parsed.serviceIndex],
        schedules: pruneUndefined(c.newValue) as ServiceSchema['schedules'],
      };
      update.services = services;
    }
    const source = c.source ?? ctx.source;
    update[`fieldSources.${c.field}`] = { source, at: ctx.now };

    const changeRef = db.collection(COLLECTIONS.pantryChanges).doc();
    const change: PantryChangeDocument = {
      pantryId: pantryRef.id,
      kind: 'update',
      field: c.field,
      target: c.target,
      oldValue: c.oldValue,
      newValue: c.newValue,
      source,
      actor: ctx.actor,
      runId: ctx.runId,
      reviewItemId: ctx.reviewItemId,
      mappingId: c.mappingId,
      revertOf: ctx.revertOf,
      createdAt: ctx.now,
    };
    tx.create(changeRef, pruneUndefined(change));
    changeIds.push(changeRef.id);
  }

  tx.update(pantryRef, update);
  return changeIds;
}

const ADDRESS_FIELDS = ['address1', 'address2', 'city', 'state', 'zipCode'] as const;

/** The pantry's address and coordinates, with `address2` as stored ('' when absent). */
export function locationOf(pantry: StoredPantry, g: GeoHashField): StoredLocation {
  return {
    address1: pantry.address1,
    address2: pantry.address2 ?? '',
    city: pantry.city,
    state: pantry.state,
    zipCode: pantry.zipCode,
    coordinates: pantry.coordinates,
    g,
  };
}

/** Same address and coordinates (the geohash follows from the coordinates). */
export function sameLocation(a: StoredLocation, b: StoredLocation): boolean {
  return (
    ADDRESS_FIELDS.every((f) => (a[f] ?? '') === (b[f] ?? '')) &&
    a.coordinates.latitude === b.coordinates.latitude &&
    a.coordinates.longitude === b.coordinates.longitude
  );
}

/**
 * Moves a pantry to a new address: address fields, coordinates and geohash in
 * one update, logged as one `address` change so it is reverted as one unit.
 * `previous` is the pantry's current location (with its geohash). Returns the
 * change id.
 */
export function writeAddressUpdate(
  tx: Transaction,
  db: Firestore,
  pantryRef: DocumentReference,
  previous: StoredLocation,
  next: StoredLocation,
  ctx: WriteContext,
): string {
  const update: Record<string, unknown> = { ...next, updatedAt: ctx.now };
  for (const f of ADDRESS_FIELDS) {
    if ((previous[f] ?? '') !== (next[f] ?? '')) update[`fieldSources.${f}`] = { source: ctx.source, at: ctx.now };
  }
  tx.update(pantryRef, update);

  const changeRef = db.collection(COLLECTIONS.pantryChanges).doc();
  const change: PantryChangeDocument = {
    pantryId: pantryRef.id,
    kind: 'address',
    oldValue: previous,
    newValue: next,
    source: ctx.source,
    actor: ctx.actor,
    runId: ctx.runId,
    reviewItemId: ctx.reviewItemId,
    revertOf: ctx.revertOf,
    createdAt: ctx.now,
  };
  tx.create(changeRef, pruneUndefined(change));
  return changeRef.id;
}

/** What callers need to clear a pantry's cached copies (see pantryCacheKeys). */
export interface PantryLocation {
  id: string;
  state: string;
  city: string;
  /** The city it was listed under before an address change, when different. */
  movedFrom?: { state: string; city: string };
}

/**
 * Undoes one `update` change, provided the pantry still holds the value it
 * wrote. The mapping that produced it is marked `needs_recheck`, so later runs
 * send its changes to review instead of re-applying the bad value.
 * @returns The pantry, for cache invalidation.
 */
export async function revertChange(
  tx: Transaction,
  db: Firestore,
  changeId: string,
  actor: string,
  now: Timestamp,
): Promise<PantryLocation> {
  const changeRef = db.collection(COLLECTIONS.pantryChanges).doc(changeId);
  const changeSnap = await tx.get(changeRef);
  if (!changeSnap.exists) throw new PantryWriteError('not_found', 'Change not found.');
  const change = changeSnap.data() as PantryChangeDocument;
  const revertible = change.kind === 'address' || (change.kind === 'update' && change.target);
  if (!revertible || change.revertOf) {
    throw new PantryWriteError('not_revertible', 'Only crawler-pipeline field and address updates can be reverted.');
  }
  if (change.revertedAt) throw new PantryWriteError('already_reverted', 'Change was already reverted.');

  const pantryRef = db.collection(COLLECTIONS.pantries).doc(change.pantryId);
  const pantrySnap = await tx.get(pantryRef);
  if (!pantrySnap.exists) throw new PantryWriteError('not_found', 'Pantry no longer exists.');
  const pantry = pantrySnap.data() as StoredPantry;

  if (change.kind === 'address') {
    const written = change.newValue as StoredLocation;
    const restore = change.oldValue as StoredLocation;
    const current = locationOf(pantry, pantry.g ?? written.g);
    if (!sameLocation(current, written)) {
      throw new PantryWriteError('conflict', 'The address has changed since; revert the later change first.');
    }
    writeAddressUpdate(tx, db, pantryRef, current, restore, { source: 'admin', actor, now, revertOf: changeId });
    tx.update(changeRef, { revertedAt: now, revertedBy: actor });
    return {
      id: pantryRef.id,
      state: restore.state,
      city: restore.city,
      movedFrom: { state: current.state, city: current.city },
    };
  }
  const target = change.target!;

  const current = getTargetValue(pantry, target);
  if (!sameTargetValue(target, current, change.newValue as TargetValue)) {
    throw new PantryWriteError('conflict', 'The field has changed since; revert the later change first.');
  }

  const restore = (change.oldValue ??
    (parseTarget(target)?.kind === 'schedules' ? [] : '')) as TargetValue;
  const plan: PlannedChange[] = [
    {
      target,
      field: targetField(target),
      oldValue: current ?? null,
      newValue: restore,
      mappingId: change.mappingId,
    },
  ];
  writeFieldUpdates(tx, db, pantryRef, pantry, plan, { source: 'admin', actor, now, revertOf: changeId });
  tx.update(changeRef, { revertedAt: now, revertedBy: actor });

  if (change.mappingId) {
    const status: Pick<FieldMappingDocument, 'status' | 'updatedAt'> = { status: 'needs_recheck', updatedAt: now };
    tx.set(db.collection(COLLECTIONS.fieldMappings).doc(change.mappingId), status, { merge: true });
  }
  return { id: pantryRef.id, state: pantry.state, city: pantry.city };
}
