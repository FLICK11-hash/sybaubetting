/**
 * How far ahead a game is worth tracking. Lines for a game weeks out are
 * thin and barely move -- ingesting and displaying them just dilutes this
 * week's actual opportunities with noise nobody's about to bet on yet.
 */
export const TRACKING_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
