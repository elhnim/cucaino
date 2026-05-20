export type NewsTemplate = {
  text: string;
  impact: 'positive' | 'negative' | 'neutral' | 'mixed';
  minPct: number;
  maxPct: number;
};

export const NEWS_TEMPLATES: Record<string, NewsTemplate[]> = {
  sales_up: [
    { text: "Sales jumped {X}% this quarter, beating all forecasts", impact: 'positive', minPct: 8, maxPct: 18 },
    { text: "Record {X} million units sold last month, company announces", impact: 'positive', minPct: 8, maxPct: 15 },
    { text: "Holiday season drives {X}% surge in customer orders", impact: 'positive', minPct: 10, maxPct: 18 },
    { text: "New markets open up as international sales climb {X}%", impact: 'positive', minPct: 8, maxPct: 14 },
    { text: "Viral social media trend boosts weekly sales by {X}%", impact: 'positive', minPct: 10, maxPct: 18 },
    { text: "Loyalty programme brings back {X}% more repeat customers", impact: 'positive', minPct: 8, maxPct: 14 },
  ],
  sales_down: [
    { text: "Quarterly sales drop {X}% as competition heats up", impact: 'negative', minPct: 8, maxPct: 18 },
    { text: "Supply chain issues cause {X}% fewer products on shelves", impact: 'negative', minPct: 8, maxPct: 15 },
    { text: "Rising costs force a {X}% price hike that customers aren't happy about", impact: 'negative', minPct: 10, maxPct: 18 },
    { text: "Customer complaints up {X}% after recent product changes", impact: 'negative', minPct: 8, maxPct: 14 },
    { text: "Rival company steals {X}% market share with cheaper prices", impact: 'negative', minPct: 8, maxPct: 16 },
    { text: "Warehouse fire destroys stock worth {X} million", impact: 'negative', minPct: 10, maxPct: 18 },
  ],
  product_hit: [
    { text: "New product launch sells {X} thousand units on day one", impact: 'positive', minPct: 5, maxPct: 15 },
    { text: "Kids rate the new release {X} out of 10 in early reviews", impact: 'positive', minPct: 5, maxPct: 12 },
    { text: "Celebrity partnership brings {X}% more eyeballs to the brand", impact: 'positive', minPct: 6, maxPct: 15 },
    { text: "Award win for best product of the year boosts confidence {X}%", impact: 'positive', minPct: 5, maxPct: 12 },
    { text: "Scientists confirm product is {X}% better than nearest rival", impact: 'positive', minPct: 5, maxPct: 13 },
    { text: "Surprise collaboration announcement sends excitement up {X}%", impact: 'positive', minPct: 6, maxPct: 15 },
  ],
  product_flop: [
    { text: "New product recall affects {X} thousand customers", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "Critics give the latest release just {X} out of 10", impact: 'negative', minPct: 5, maxPct: 10 },
    { text: "Product launch delayed by {X} months, fans frustrated", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "Safety investigation launched into {X} reported incidents", impact: 'negative', minPct: 6, maxPct: 12 },
    { text: "Failed experiment costs the company {X} million to fix", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "New CEO overhauls strategy, scraps {X} planned products", impact: 'negative', minPct: 5, maxPct: 10 },
  ],
  neutral_news: [
    { text: "Company announces {X} new jobs at headquarters", impact: 'neutral', minPct: 0, maxPct: 3 },
    { text: "CEO spotted at industry conference talking about the next {X} years", impact: 'neutral', minPct: 0, maxPct: 2 },
    { text: "Headquarters moves to new {X}-floor building downtown", impact: 'neutral', minPct: 0, maxPct: 2 },
    { text: "Company celebrates {X} years in business this week", impact: 'neutral', minPct: 0, maxPct: 2 },
    { text: "Annual report shows steady results with {X}% year-on-year change", impact: 'neutral', minPct: 0, maxPct: 3 },
    { text: "Analysts keep their {X} rating unchanged after quarterly review", impact: 'neutral', minPct: 0, maxPct: 2 },
    { text: "Company donates {X} thousand to local schools this month", impact: 'neutral', minPct: 0, maxPct: 2 },
    { text: "Research team expanded with {X} new scientists joining", impact: 'neutral', minPct: 0, maxPct: 3 },
  ],
  mixed_news: [
    { text: "Big merger talks leak — deal could change everything or fall apart", impact: 'mixed', minPct: 8, maxPct: 15 },
    { text: "Government announces new rules that could help or hurt the industry", impact: 'mixed', minPct: 5, maxPct: 12 },
    { text: "Mystery investor buys {X}% stake — nobody knows their plans", impact: 'mixed', minPct: 8, maxPct: 14 },
    { text: "Company enters brand new market for the first time — big risk, big reward", impact: 'mixed', minPct: 6, maxPct: 13 },
    { text: "CEO unexpectedly steps down after {X} years — replacement unknown", impact: 'mixed', minPct: 7, maxPct: 15 },
    { text: "Rumours of a secret product launch in {X} weeks — details unclear", impact: 'mixed', minPct: 5, maxPct: 12 },
    { text: "Major competitor shuts down — could mean more customers or market panic", impact: 'mixed', minPct: 8, maxPct: 14 },
    { text: "Leaked documents show bold new plan — analysts split on whether it works", impact: 'mixed', minPct: 6, maxPct: 12 },
  ],
};

export const CATEGORY_WEIGHTS: Record<string, number> = {
  sales_up: 0.22,
  sales_down: 0.22,
  product_hit: 0.10,
  product_flop: 0.10,
  neutral_news: 0.24,
  mixed_news: 0.12,
};

// Deterministic PRNG using FNV-1a hash — given the same seed returns the same number in [0, 1)
export function seededRandom(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return (h >>> 0) / 4294967296;
}
