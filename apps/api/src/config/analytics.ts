// Google Analytics 4 Measurement Protocol config.
// All values are optional so the API still boots locally without GA configured;
// when either var is missing, ANALYTICS_ENABLED is false and tracking no-ops.
export const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID || '';
export const GA_API_SECRET = process.env.GA_API_SECRET || '';
export const ANALYTICS_ENABLED = Boolean(GA_MEASUREMENT_ID && GA_API_SECRET);

export const GA_COLLECT_URL = 'https://www.google-analytics.com/mp/collect';

export const GA_CLIENT_COOKIE = 'ga_client_id';
// 2-year client cookie lifetime (ms).
export const GA_CLIENT_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 730;
