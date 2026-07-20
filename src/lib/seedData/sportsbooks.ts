export interface SeedSportsbook {
  name: string;
  slug: string;
  websiteUrl: string;
  isSharp: boolean;
  /** Bookmaker key used by The Odds API. */
  theOddsApiKey: string;
}

/** ~10 major US sportsbooks, plus Pinnacle as a sharp reference book. */
export const SPORTSBOOKS: SeedSportsbook[] = [
  { name: "DraftKings", slug: "draftkings", websiteUrl: "https://draftkings.com", isSharp: false, theOddsApiKey: "draftkings" },
  { name: "FanDuel", slug: "fanduel", websiteUrl: "https://fanduel.com", isSharp: false, theOddsApiKey: "fanduel" },
  { name: "BetMGM", slug: "betmgm", websiteUrl: "https://betmgm.com", isSharp: false, theOddsApiKey: "betmgm" },
  { name: "Caesars", slug: "caesars", websiteUrl: "https://caesars.com/sportsbook", isSharp: false, theOddsApiKey: "williamhill_us" },
  { name: "PointsBet", slug: "pointsbet", websiteUrl: "https://pointsbet.com", isSharp: false, theOddsApiKey: "pointsbetus" },
  { name: "BetRivers", slug: "betrivers", websiteUrl: "https://betrivers.com", isSharp: false, theOddsApiKey: "betrivers" },
  { name: "ESPN BET", slug: "espnbet", websiteUrl: "https://espnbet.com", isSharp: false, theOddsApiKey: "espnbet" },
  { name: "Fanatics Sportsbook", slug: "fanatics", websiteUrl: "https://sportsbook.fanatics.com", isSharp: false, theOddsApiKey: "fanatics" },
  { name: "Bally Bet", slug: "ballybet", websiteUrl: "https://ballybet.com", isSharp: false, theOddsApiKey: "ballybet" },
  { name: "Pinnacle", slug: "pinnacle", websiteUrl: "https://pinnacle.com", isSharp: true, theOddsApiKey: "pinnacle" },
];
