// Firestore shape for one logged-in pantry search, stored in the `search_logs`
// collection. Written only when the request carried a valid session (anonymous
// searches are not logged). One document per search request, so paging through
// results produces one entry per page (distinguished by `page`).

export interface SearchLogDocument {
  // The searcher's account email (the JWT `sub`).
  userEmail: string;

  // What was searched: the raw location text (trimmed) and the radius in miles,
  // exactly as validated by the controller.
  location: string;
  radiusMiles: number;
  page: number;

  // What came back: total pantries matched within the radius (across all
  // pages) and how many were returned on this page.
  totalResults: number;
  returnedResults: number;

  searchedAt: string; // ISO timestamp
}
