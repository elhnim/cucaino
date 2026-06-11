export type NewsTemplate = {
  /** Headline — punchy, may contain {X} which is replaced with a number. */
  text: string;
  /** 2-sentence newspaper-style body. May contain {X}. Asset-agnostic ("the company"). */
  body: string;
  impact: 'positive' | 'negative' | 'neutral' | 'mixed';
  minPct: number;
  maxPct: number;
  /**
   * Display range for {X} when it is NOT a percentage (years, jobs, floors…).
   * Without these, {X} falls back to the minPct–maxPct range — which produced
   * absurd headlines like "the next 0 years" for low-impact neutral news.
   */
  minX?: number;
  maxX?: number;
};

// A large, fully-templated news pool. The reel seeds a pick per (asset, day),
// so a big pool means lots of variety before anything repeats — no AI required.
export const NEWS_TEMPLATES: Record<string, NewsTemplate[]> = {
  sales_up: [
    { text: "Sales jumped {X}% this quarter, beating all forecasts", body: "The company reported that sales climbed {X}% over the last three months, well ahead of what analysts expected. Bosses thanked customers for the busy quarter and said demand had stayed strong week after week.", impact: 'positive', minPct: 8, maxPct: 18 },
    { text: "Record {X} million units sold last month, company announces", body: "A new monthly record of {X} million units flew off the shelves, the company said in a statement. Staff worked extra shifts to keep up with the rush of orders.", impact: 'positive', minPct: 8, maxPct: 15 },
    { text: "Holiday season drives {X}% surge in customer orders", body: "Orders rose {X}% as shoppers stocked up over the holiday period, according to the company. Stores reported queues out the door and several lines selling out early.", impact: 'positive', minPct: 10, maxPct: 18 },
    { text: "New markets open up as international sales climb {X}%", body: "Overseas sales grew {X}% after the company began shipping to several new countries. Managers said the brand was catching on quickly with customers abroad.", impact: 'positive', minPct: 8, maxPct: 14 },
    { text: "Viral social media trend boosts weekly sales by {X}%", body: "A clip shared millions of times online sent weekly sales up {X}%, the company confirmed. Younger shoppers in particular drove the sudden spike in interest.", impact: 'positive', minPct: 10, maxPct: 18 },
    { text: "Loyalty programme brings back {X}% more repeat customers", body: "The company's new rewards scheme pulled in {X}% more returning shoppers this month. Bosses said members were spending more often than ever before.", impact: 'positive', minPct: 8, maxPct: 14 },
    { text: "Online store traffic up {X}% after website revamp", body: "Visits to the company's website rose {X}% following a fresh redesign that made checkout faster. Shoppers said the new site was much easier to use.", impact: 'positive', minPct: 8, maxPct: 16 },
    { text: "Back-to-school rush lifts sales {X}% in a single week", body: "Families snapping up supplies pushed weekly sales up {X}%, the company reported. Several popular items sold out within days of going on shelves.", impact: 'positive', minPct: 9, maxPct: 16 },
    { text: "Bulk orders from big retailers push revenue up {X}%", body: "A wave of large orders from major stores lifted revenue {X}% this quarter. Bosses said the new wholesale deals would keep factories busy for months.", impact: 'positive', minPct: 8, maxPct: 15 },
    { text: "Weekend sale clears the warehouse, takings up {X}%", body: "A blockbuster weekend event lifted takings {X}% as bargain hunters cleared the shelves. The company said it shifted more stock in two days than in a normal fortnight.", impact: 'positive', minPct: 9, maxPct: 17 },
    { text: "Subscriber numbers grow {X}% as new fans sign up", body: "The company added {X}% more subscribers this month as word of mouth spread. Bosses said most new members had joined on the recommendation of a friend.", impact: 'positive', minPct: 8, maxPct: 15 },
    { text: "Mobile app downloads soar {X}% after update", body: "App downloads jumped {X}% following a popular new update, the company said. Users praised the smoother experience and handy new features.", impact: 'positive', minPct: 9, maxPct: 16 },
    { text: "Demand outpaces supply as orders climb {X}%", body: "Customer orders rose {X}%, leaving the company racing to make enough to go around. Managers said they were adding production lines to keep up.", impact: 'positive', minPct: 8, maxPct: 15 },
    { text: "Festival pop-up stalls sell out, sales up {X}%", body: "Pop-up stalls at summer festivals sold out in hours, lifting sales {X}%. The company said it would book even more events next season.", impact: 'positive', minPct: 9, maxPct: 16 },
    { text: "Word-of-mouth boom adds {X}% to monthly takings", body: "Happy customers telling their friends helped takings rise {X}% this month. Bosses said the brand had never been more talked about.", impact: 'positive', minPct: 8, maxPct: 14 },
  ],
  sales_down: [
    { text: "Quarterly sales drop {X}% as competition heats up", body: "Sales slid {X}% over the past three months as rival brands fought for shoppers. Bosses admitted it had been a tougher quarter than they had hoped.", impact: 'negative', minPct: 8, maxPct: 18 },
    { text: "Supply chain issues cause {X}% fewer products on shelves", body: "Delivery delays left {X}% fewer products in stores, the company said. Shoppers in several towns found shelves half empty.", impact: 'negative', minPct: 8, maxPct: 15 },
    { text: "Rising costs force a {X}% price hike customers dislike", body: "The company raised prices by {X}% to cover higher costs, and shoppers were not pleased. Some customers said they would shop around for cheaper options.", impact: 'negative', minPct: 10, maxPct: 18 },
    { text: "Customer complaints up {X}% after recent product changes", body: "Complaints climbed {X}% after the company tweaked one of its popular products. Bosses promised to listen to feedback and make improvements.", impact: 'negative', minPct: 8, maxPct: 14 },
    { text: "Rival company steals {X}% market share with cheaper prices", body: "A competitor undercutting on price grabbed {X}% of the market, analysts said. The company said it was reviewing its own pricing in response.", impact: 'negative', minPct: 8, maxPct: 16 },
    { text: "Warehouse fire destroys stock worth {X} million", body: "A fire at a storage site wiped out around {X} million worth of stock overnight. Nobody was hurt, but the company warned of short-term shortages.", impact: 'negative', minPct: 10, maxPct: 18 },
    { text: "Sales slump {X}% as shoppers tighten their belts", body: "With families spending carefully, sales fell {X}% over the month. The company said shoppers were treating themselves less often.", impact: 'negative', minPct: 8, maxPct: 15 },
    { text: "Returns spike {X}% after a batch of faulty goods", body: "Returns jumped {X}% when a batch of products failed to work properly. The company offered refunds and said it had fixed the problem.", impact: 'negative', minPct: 8, maxPct: 14 },
    { text: "Key supplier walks away, output falls {X}%", body: "Output dropped {X}% after an important supplier ended its deal with the company. Managers scrambled to find a replacement in time for the busy season.", impact: 'negative', minPct: 9, maxPct: 16 },
    { text: "Bad weather keeps shoppers home, sales down {X}%", body: "Storms and floods kept customers indoors, dragging sales down {X}% for the week. The company hoped trade would bounce back once skies cleared.", impact: 'negative', minPct: 8, maxPct: 14 },
    { text: "Website crash blamed for {X}% drop in online orders", body: "A long website outage cost the company an estimated {X}% of online orders. Engineers worked through the night to bring the site back up.", impact: 'negative', minPct: 8, maxPct: 15 },
    { text: "Negative reviews drag monthly sales down {X}%", body: "A run of poor reviews knocked {X}% off monthly sales, the company said. Bosses vowed to win back trust with better service.", impact: 'negative', minPct: 8, maxPct: 14 },
    { text: "Strike halts production, output down {X}%", body: "A staff walkout stopped the lines for several days, cutting output {X}%. The two sides said they were still in talks.", impact: 'negative', minPct: 9, maxPct: 16 },
    { text: "Shipping costs jump, squeezing margins by {X}%", body: "Soaring delivery costs ate into profits by {X}% this quarter. The company said it was looking for cheaper ways to get goods to shops.", impact: 'negative', minPct: 8, maxPct: 14 },
    { text: "Popular line discontinued, fans cut spending {X}%", body: "Loyal customers spent {X}% less after a favourite product line was axed. The company said the decision was needed to focus on newer ranges.", impact: 'negative', minPct: 8, maxPct: 15 },
  ],
  product_hit: [
    { text: "New product launch sells {X} thousand units on day one", body: "The company's latest release sold {X} thousand units within hours of going on sale. Fans queued overnight to be among the first to get one.", impact: 'positive', minPct: 5, maxPct: 15 },
    { text: "Kids rate the new release {X} out of 10 in early reviews", body: "Early reviewers gave the new product {X} out of 10, praising how easy and fun it was. The company said it was thrilled with the warm welcome.", impact: 'positive', minPct: 5, maxPct: 12, minX: 8, maxX: 10 },
    { text: "Celebrity partnership brings {X}% more eyes to the brand", body: "A famous face teamed up with the company, lifting brand interest {X}%. Social media lit up with fans sharing the announcement.", impact: 'positive', minPct: 6, maxPct: 15 },
    { text: "Award win for best product of the year boosts confidence {X}%", body: "Judges named the company's flagship product the best of the year. Bosses said the award capped off months of hard work by the team.", impact: 'positive', minPct: 5, maxPct: 12 },
    { text: "Scientists confirm product is {X}% better than nearest rival", body: "Independent tests found the product performed {X}% better than its closest competitor. The company said the results proved its years of research had paid off.", impact: 'positive', minPct: 5, maxPct: 13 },
    { text: "Surprise collaboration announcement sends excitement up {X}%", body: "An unexpected team-up sent fan excitement up {X}% overnight. Details were scarce, but early buzz online was overwhelmingly positive.", impact: 'positive', minPct: 6, maxPct: 15 },
    { text: "New feature wins over critics, praise up {X}%", body: "A clever new feature impressed reviewers, lifting positive coverage {X}%. Users said it solved a problem they had complained about for years.", impact: 'positive', minPct: 5, maxPct: 13 },
    { text: "Limited edition sells out in {X} minutes", body: "A special limited run sold out in just {X} minutes after going live. The company said it might bring back the popular design by demand.", impact: 'positive', minPct: 6, maxPct: 14 },
    { text: "Updated design wins {X} new design awards", body: "A fresh redesign picked up {X} industry awards this season. Judges praised the bold new look and clever details.", impact: 'positive', minPct: 5, maxPct: 12, minX: 2, maxX: 5 },
    { text: "Eco-friendly version cuts waste by {X}%", body: "A greener version of the product cut waste by {X}%, the company said. Shoppers welcomed the move toward more sustainable packaging.", impact: 'positive', minPct: 5, maxPct: 12 },
    { text: "Fans queue overnight for new release, {X}% sell out", body: "Eager fans camped outside stores, and {X}% of stock sold out by lunchtime. The company called the launch its biggest yet.", impact: 'positive', minPct: 6, maxPct: 14 },
    { text: "Reviewers call it the best yet, ratings up {X}%", body: "Critics hailed the new product as the company's best so far, lifting ratings {X}%. One reviewer said it set a new standard for the whole industry.", impact: 'positive', minPct: 5, maxPct: 13 },
    { text: "Smart upgrade saves customers {X} hours a week", body: "A handy upgrade saves users around {X} hours a week, according to the company. Busy customers said the time-saver was a game-changer.", impact: 'positive', minPct: 5, maxPct: 12 },
    { text: "New colours and styles spark {X}% more pre-orders", body: "Fresh colours and styles drove pre-orders up {X}%, the company reported. Shoppers rushed to reserve their favourite before stock ran low.", impact: 'positive', minPct: 6, maxPct: 14 },
  ],
  product_flop: [
    { text: "New product recall affects {X} thousand customers", body: "The company recalled a product that reached {X} thousand customers after a fault was found. Shoppers were offered a full refund or a replacement.", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "Critics give the latest release just {X} out of 10", body: "Reviewers handed the new product a disappointing {X} out of 10. Many said it failed to live up to the hype.", impact: 'negative', minPct: 5, maxPct: 10, minX: 2, maxX: 4 },
    { text: "Product launch delayed by {X} months, fans frustrated", body: "The eagerly awaited release slipped back {X} months, leaving fans annoyed. The company blamed problems getting the product just right.", impact: 'negative', minPct: 5, maxPct: 12, minX: 2, maxX: 6 },
    { text: "Safety investigation launched into {X} reported incidents", body: "Officials opened an investigation after {X} reports of problems with the product. The company said it was cooperating fully and checking its safety.", impact: 'negative', minPct: 6, maxPct: 12 },
    { text: "Failed experiment costs the company {X} million to fix", body: "A project that went wrong will cost about {X} million to put right. Bosses admitted the setback was a costly lesson.", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "New CEO overhauls strategy, scraps {X} planned products", body: "The new boss cancelled {X} products that were in the works as part of a shake-up. Some fans were sad to see favourites dropped before launch.", impact: 'negative', minPct: 5, maxPct: 10, minX: 2, maxX: 5 },
    { text: "Glitchy update frustrates {X} thousand users", body: "A buggy update caused headaches for {X} thousand users before it was pulled. The company apologised and promised a proper fix soon.", impact: 'negative', minPct: 5, maxPct: 11 },
    { text: "Rushed release returns flood in, {X}% sent back", body: "A product pushed out too soon saw {X}% of units returned. The company said it had paused sales to fix the issues.", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "Big launch falls flat, sales {X}% below target", body: "A heavily promoted launch landed {X}% short of its sales target. Analysts said shoppers simply weren't convinced.", impact: 'negative', minPct: 5, maxPct: 11 },
    { text: "Design flaw forces {X} thousand repairs", body: "A design fault meant around {X} thousand units needed repairs. The company set up free fix-it centres for affected customers.", impact: 'negative', minPct: 5, maxPct: 12 },
    { text: "Hyped gadget panned as 'boring', interest down {X}%", body: "Reviewers called the much-hyped gadget dull, and interest dropped {X}%. The company said it would take the feedback on board.", impact: 'negative', minPct: 5, maxPct: 10 },
    { text: "Packaging mix-up delays {X} thousand orders", body: "A packaging error held up {X} thousand orders at the warehouse. The company offered a discount to say sorry for the wait.", impact: 'negative', minPct: 5, maxPct: 11 },
    { text: "Knock-off copies confuse shoppers, sales dip {X}%", body: "Cheap copies flooding the market confused buyers and trimmed sales {X}%. The company warned customers to check they were buying the real thing.", impact: 'negative', minPct: 5, maxPct: 11 },
    { text: "Early testers report {X} bugs in new release", body: "Testers flagged {X} separate bugs in the new product before launch. The company delayed the wider rollout to sort them out.", impact: 'negative', minPct: 5, maxPct: 10 },
  ],
  neutral_news: [
    { text: "Company announces {X} new jobs at headquarters", body: "The company said it would hire {X} new staff at its head office over the coming year. Local leaders welcomed the extra jobs for the area.", impact: 'neutral', minPct: 0, maxPct: 3, minX: 20, maxX: 150 },
    { text: "CEO spotted at industry conference talking about the next {X} years", body: "The boss gave a talk at a big industry event about plans for the next {X} years. The speech was light on detail but heavy on big ideas.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 5, maxX: 10 },
    { text: "Headquarters moves to new {X}-floor building downtown", body: "The company is moving into a new {X}-floor office in the city centre. Staff said they were looking forward to the modern space.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 8, maxX: 30 },
    { text: "Company celebrates {X} years in business this week", body: "The company marked {X} years in business with a small celebration for staff. Founders thanked loyal customers for the journey so far.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 5, maxX: 50 },
    { text: "Annual report shows steady results with {X}% year-on-year change", body: "The yearly report showed a modest {X}% change from last year, broadly in line with expectations. Bosses described it as a steady, no-surprises year.", impact: 'neutral', minPct: 0, maxPct: 3, minX: 1, maxX: 3 },
    { text: "Analysts keep their 'hold' rating unchanged after quarterly review", body: "Market watchers left their 'hold' rating untouched following the latest review. They said there was little new to change their minds.", impact: 'neutral', minPct: 0, maxPct: 2 },
    { text: "Company donates {X} thousand to local schools this month", body: "The company gave {X} thousand to schools in its home town this month. Teachers said the money would go toward new books and equipment.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 5, maxX: 50 },
    { text: "Research team expanded with {X} new scientists joining", body: "The company welcomed {X} new scientists to its research team. Bosses said the hires would help with long-term projects.", impact: 'neutral', minPct: 0, maxPct: 3, minX: 3, maxX: 12 },
    { text: "Board reshuffle brings in {X} new directors", body: "The company added {X} new directors in a routine board reshuffle. Bosses said the fresh faces brought useful experience.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 2, maxX: 4 },
    { text: "Company refreshes its logo after {X} years", body: "A new logo was unveiled after {X} years with the old design. Reaction was mixed, with some fans nostalgic for the original.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 8, maxX: 25 },
    { text: "Factory tour opens to the public for {X} weekends", body: "The company opened its factory to visitors for {X} weekends running. Families enjoyed a behind-the-scenes peek at how things are made.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 2, maxX: 6 },
    { text: "Company publishes its {X}-page sustainability report", body: "A detailed {X}-page report set out the company's environmental plans. Campaigners said they would be watching to see if the promises were kept.", impact: 'neutral', minPct: 0, maxPct: 3, minX: 40, maxX: 120 },
    { text: "Annual general meeting draws {X} shareholders", body: "About {X} shareholders turned up to the company's yearly meeting. The agenda was routine, with no big announcements expected.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 100, maxX: 900 },
    { text: "Company sponsors local youth team for {X} seasons", body: "The company signed up to back a local youth team for the next {X} seasons. Coaches said the support would help buy kit and equipment.", impact: 'neutral', minPct: 0, maxPct: 2, minX: 2, maxX: 5 },
  ],
  mixed_news: [
    { text: "Big merger talks leak — deal could change everything or fall apart", body: "Word leaked that the company is in talks about a major merger. Experts said the deal could reshape the business — or collapse before it starts.", impact: 'mixed', minPct: 8, maxPct: 15 },
    { text: "Government announces new rules that could help or hurt the industry", body: "New government rules are coming for the whole industry, officials confirmed. Analysts were split on whether the changes would help or hurt the company.", impact: 'mixed', minPct: 5, maxPct: 12 },
    { text: "Mystery investor buys {X}% stake — nobody knows their plans", body: "An unknown investor quietly bought a {X}% stake in the company. Nobody is sure what they intend to do next.", impact: 'mixed', minPct: 8, maxPct: 14 },
    { text: "Company enters brand new market for the first time — big risk, big reward", body: "The company is stepping into a brand new market it has never tried before. Bosses called it a bold bet that could pay off big or flop.", impact: 'mixed', minPct: 6, maxPct: 13 },
    { text: "CEO unexpectedly steps down after {X} years — replacement unknown", body: "The long-serving boss stepped down after {X} years, surprising the market. No replacement has been named, leaving the future uncertain.", impact: 'mixed', minPct: 7, maxPct: 15, minX: 6, maxX: 18 },
    { text: "Rumours of a secret product launch in {X} weeks — details unclear", body: "Whispers suggest a secret product could launch in about {X} weeks. The company would neither confirm nor deny the rumours.", impact: 'mixed', minPct: 5, maxPct: 12, minX: 2, maxX: 8 },
    { text: "Major competitor shuts down — could mean more customers or market panic", body: "A big rival suddenly closed its doors, shaking up the whole market. Some say the company could win the extra customers; others fear shoppers may grow nervous.", impact: 'mixed', minPct: 8, maxPct: 14 },
    { text: "Leaked documents show bold new plan — analysts split on whether it works", body: "Leaked papers revealed an ambitious new plan inside the company. Analysts were divided on whether the gamble would pay off.", impact: 'mixed', minPct: 6, maxPct: 12 },
    { text: "Company splits into two — investors unsure what to make of it", body: "The company announced it would split into two separate businesses. Investors were left puzzling over whether the move was clever or risky.", impact: 'mixed', minPct: 7, maxPct: 14 },
    { text: "Huge new factory planned — exciting but {X} million to build", body: "Plans for a massive new factory were unveiled, set to cost {X} million. Supporters called it a vote of confidence; doubters worried about the price tag.", impact: 'mixed', minPct: 6, maxPct: 13, minX: 20, maxX: 200 },
    { text: "Surprise price change leaves {X}% of shoppers undecided", body: "An unexpected price change left about {X}% of shoppers unsure whether to buy. The company said it was confident customers would come around.", impact: 'mixed', minPct: 5, maxPct: 12, minX: 10, maxX: 40 },
    { text: "New boss promises big changes — staff excited and nervous", body: "The incoming boss promised sweeping changes across the company. Staff said they were equal parts excited and nervous about what comes next.", impact: 'mixed', minPct: 6, maxPct: 13 },
    { text: "Company bets {X} million on untested new technology", body: "The company is pouring {X} million into a brand new technology no rival has tried. It could leap ahead of the pack — or be a costly dead end.", impact: 'mixed', minPct: 7, maxPct: 14, minX: 10, maxX: 150 },
    { text: "Takeover offer on the table — board can't agree", body: "Another company put a takeover offer on the table, but the board is divided. Talks could lead to a big payday or drag on for months.", impact: 'mixed', minPct: 7, maxPct: 14 },
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
