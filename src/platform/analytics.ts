/**
 * Minimal GA4 page-hit tracking.
 *
 * We only care about "how many people opened this page", nothing about which
 * book is being read — so this just loads gtag.js and lets it send the default
 * `page_view` on load. No content/title is ever sent to Google (the epubs are
 * served encrypted; keeping book metadata out of analytics is deliberate).
 *
 * Disabled unless `VITE_GA_ID` (a `G-XXXXXXX` measurement id) is set, so dev
 * builds never report. Note the app is embedded in an iframe on ranobe-hub, so
 * the `_ga` cookie may be blocked by the browser — page-hit counts stay correct,
 * only unique-visitor accuracy degrades, which we don't rely on.
 */
export function initAnalytics(): void {
  const id = import.meta.env.VITE_GA_ID;
  if (!id) return;

  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);

  window.dataLayer = window.dataLayer || [];
  // gtag pushes `arguments` verbatim, so it must not be an arrow/spread wrapper.
  function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  }
  gtag("js", new Date());
  gtag("config", id);
}
