// SERVER-ONLY entry point ('@pantry-finder/shared/firestore'): Firestore
// document shapes and the pantry write/revert logic shared by the API and
// tools/crawler. Pulls in firebase-admin, so it is kept out of the main barrel.
export * from './schema.js';
export * from './pantry-writes.js';
