/**
 * Shared "how old is too old" cutoff for treating a sportsbook's quote as
 * live and comparable to other books' quotes, backed by
 * `Settings.maxQuoteAgeSeconds`. A snapshot older than this is a book that
 * hasn't reconfirmed its price recently -- including it in consensus/no-vig/
 * best-price/EV calculations (or showing it as a recommended opportunity)
 * would compare a possibly-outdated price against other books' fresh ones.
 */
export function staleCutoff(maxQuoteAgeSeconds: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - maxQuoteAgeSeconds * 1000);
}

/** Matches Settings.maxQuoteAgeSeconds' schema default, for call sites without a loaded Settings row. */
export const DEFAULT_MAX_QUOTE_AGE_SECONDS = 600;
