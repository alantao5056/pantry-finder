import { Timestamp } from 'firebase-admin/firestore';

// Firestore shape for one pantry search, stored in the `search_logs` collection.
// Every search is logged, signed in or not: `clientId` identifies the browser
// and `userEmail` is null for anonymous searches. One document per search
// request, so paging through results produces one entry per page (distinguished
// by `page`).

export interface SearchLogDocument {
  // The searcher's account email (the JWT `sub`), or null when anonymous.
  userEmail: string | null;

  // Stable per-browser id from the `ga_client_id` cookie, present for every
  // search. Distinguishes "100 searches by one visitor" from "100 visitors".
  clientId: string;

  // What was searched: the raw location text (trimmed) and the radius in miles,
  // exactly as validated by the controller.
  location: string;
  radiusMiles: number;
  page: number;

  // What came back: total pantries matched within the radius (across all
  // pages) and how many were returned on this page.
  totalResults: number;
  returnedResults: number;

  // When the search happened. A real Firestore Timestamp, like every other
  // date in this schema directory, so range queries and exports behave.
  searchedAt: Timestamp;
}

// What the request layer hands the service so it can write the log entry.
export interface SearchLogContext {
  userEmail: string | null;
  clientId?: string;
}
