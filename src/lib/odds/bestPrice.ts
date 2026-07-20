import { BookPrice } from "./consensus";

/** Highest decimal odds (= best payout) among a set of prices for the same exact outcome. */
export function findBestPrice(prices: BookPrice[]): BookPrice | null {
  if (prices.length === 0) return null;
  return prices.reduce((best, p) => (p.decimalOdds > best.decimalOdds ? p : best));
}

/** True if this price ties or beats every other price for the outcome. */
export function isBestPrice(price: BookPrice, allPrices: BookPrice[]): boolean {
  const best = findBestPrice(allPrices);
  if (!best) return false;
  return price.decimalOdds >= best.decimalOdds;
}
