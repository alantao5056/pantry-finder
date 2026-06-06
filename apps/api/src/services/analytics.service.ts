import {
  ANALYTICS_ENABLED,
  GA_API_SECRET,
  GA_COLLECT_URL,
  GA_MEASUREMENT_ID,
} from '../config/analytics';

export interface TrackEvent {
  clientId: string;
  userId?: string;
  // GA4 event name rules: ^[a-zA-Z][a-zA-Z0-9_]{0,39}$
  name: string;
  // GA caps param names at 40 chars and string values at 100 chars.
  params: Record<string, string | number | boolean>;
}

export class AnalyticsService {
  // Fire-and-forget: builds the Measurement Protocol payload and POSTs it without
  // awaiting, so a slow or failing GA endpoint never blocks or fails an API request.
  track(event: TrackEvent): void {
    if (!ANALYTICS_ENABLED) {
      return;
    }

    const url = `${GA_COLLECT_URL}?measurement_id=${GA_MEASUREMENT_ID}`
      + `&api_secret=${GA_API_SECRET}`;

    const body = {
      client_id: event.clientId,
      ...(event.userId ? { user_id: event.userId } : {}),
      events: [
        {
          name: event.name,
          // engagement_time_msec helps the event surface in standard GA reports.
          params: { engagement_time_msec: 1, ...event.params },
        },
      ],
    };

    fetch(url, { method: 'POST', body: JSON.stringify(body) }).catch((err) => {
      console.error('GA track failed', err);
    });
  }
}

export const analyticsService = new AnalyticsService();
