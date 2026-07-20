/**
 * GA4 page-hit tracking via react-ga4. Sends only the default `page_view` — no
 * book metadata, deliberately. Disabled unless `VITE_GA_ID` is set (dev builds
 * never report). Embedded in an iframe, so the `_ga` cookie may be blocked;
 * page-hit counts stay correct, only unique-visitor accuracy degrades.
 */
import ReactGA from "react-ga4";

export function initAnalytics(): void {
  const id = import.meta.env.VITE_GA_ID;
  if (!id) return;

  ReactGA.initialize(id);
}
