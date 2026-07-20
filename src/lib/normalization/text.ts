/**
 * Text normalization shared by team, player, and outcome-label matching.
 * Strips accents, punctuation, and casing so provider-specific spelling
 * differences ("Nikola Jokic with an accent" vs "Nikola Jokic", "St. Louis"
 * vs "St Louis") resolve to the same key.
 */
const DIACRITICAL_MARKS = /[̀-ͯ]/g;
const NON_ALPHANUMERIC = /[^a-z0-9\s]/g;
const EXTRA_WHITESPACE = /\s+/g;

export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(DIACRITICAL_MARKS, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, " ")
    .replace(EXTRA_WHITESPACE, " ")
    .trim();
}

/** Common city/region shorthand seen in provider team names, expanded before final normalization. */
const CITY_ABBREVIATIONS: Record<string, string> = {
  la: "los angeles",
  ny: "new york",
  no: "new orleans",
  sf: "san francisco",
  sa: "san antonio",
  gs: "golden state",
};

export function normalizeTeamName(input: string): string {
  const normalized = normalizeText(input);
  const tokens = normalized.split(" ").map((token) => CITY_ABBREVIATIONS[token] ?? token);
  return tokens.join(" ");
}

export function normalizePlayerName(input: string): string {
  return normalizeText(input);
}

/** Normalized key for an outcome label ("Over", "Boston Celtics", "Draw" -> "over", "boston celtics", "draw"). */
export function normalizeOutcomeLabel(input: string): string {
  return normalizeText(input);
}
