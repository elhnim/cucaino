// Market stall mini-game data: kid-level true facts about money, markets and trade, shown one at
// a time after a sale is made. Pure data, no logic. Each fact is <=120 characters.
export interface MarketFact {
  id: string;
  text: string;
}

export const MARKET_FACTS: readonly MarketFact[] = [
  { id: "bartering", text: "Before coins, people bartered — swapping things they had for things they needed." },
  { id: "first-coins", text: "The first coins were made in Lydia (in what is now Turkey) about 2,600 years ago." },
  { id: "cowrie-shells", text: "Shiny cowrie shells from the sea were once used as money across Africa and Asia." },
  { id: "town-square", text: "Markets gather in the town square so everyone in the village can reach them easily." },
  { id: "farmers-market", text: "At a farmers' market, you buy food straight from the people who grew or made it." },
  { id: "paper-money", text: "Paper money was invented in China over 1,000 years ago, to replace heavy coins." },
  { id: "banks", text: "Banks keep people's money safe and help them save it up for later." },
  { id: "trade-routes", text: "Ancient traders carried goods for thousands of miles along routes like the Silk Road." },
  { id: "supply-demand", text: "When lots of people want something rare, it often costs more to buy." },
  { id: "saving-up", text: "Saving a little bit of money each week can add up to something big later on." },
  { id: "salt-wages", text: "Salt was once so precious it paid wages — that's where the word 'salary' comes from!" },
  { id: "giving-change", text: "Giving change means handing back the extra money a customer paid over the price." },
] as const;

export function getMarketFact(id: string): MarketFact | undefined {
  return MARKET_FACTS.find((f) => f.id === id);
}
