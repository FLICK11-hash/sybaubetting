import { normalizeText } from "./text";

/**
 * `outcomes.outcome_type` vocabulary. Kept as free text in the DB (see
 * SCHEMA_CHANGES.md) but enumerated here for consistency.
 */
export const OUTCOME_TYPES = {
  OVER: "over",
  UNDER: "under",
  HOME: "home",
  AWAY: "away",
  DRAW: "draw",
  YES: "yes",
  NO: "no",
  /** Generic entrant selection — futures winners, anytime-goalscorer subjects, etc. */
  SELECTION: "selection",
} as const;

export type OutcomeType = (typeof OUTCOME_TYPES)[keyof typeof OUTCOME_TYPES];

const DIRECT_LABELS: Record<string, OutcomeType> = {
  over: OUTCOME_TYPES.OVER,
  under: OUTCOME_TYPES.UNDER,
  draw: OUTCOME_TYPES.DRAW,
  tie: OUTCOME_TYPES.DRAW,
  yes: OUTCOME_TYPES.YES,
  no: OUTCOME_TYPES.NO,
};

export interface ClassifyOutcomeParams {
  outcomeName: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

/**
 * Classifies a provider outcome name into a canonical outcome type. Team
 * names are matched against the event's home/away teams (normalized) before
 * falling back to a generic "selection" (used for futures entrants and
 * yes/no-style props with no home/away context).
 */
export function classifyOutcomeType(params: ClassifyOutcomeParams): OutcomeType {
  const normalized = normalizeText(params.outcomeName);

  if (normalized in DIRECT_LABELS) {
    return DIRECT_LABELS[normalized];
  }
  if (params.homeTeamName && normalized === normalizeText(params.homeTeamName)) {
    return OUTCOME_TYPES.HOME;
  }
  if (params.awayTeamName && normalized === normalizeText(params.awayTeamName)) {
    return OUTCOME_TYPES.AWAY;
  }
  return OUTCOME_TYPES.SELECTION;
}
