// Canonical "Brainy" task definitions — money-smarts, learning, and life-skill
// challenges seeded per-family so parents can edit them. Each family gets its
// own editable copy on signup (see seedNewFamily in lib/actions/auth.ts) and
// existing families are backfilled by migration 0040.
//
// These were originally seeded once as global built-in templates (family_id
// NULL, is_builtin true), but RLS blocks editing built-in rows, so parents
// couldn't change them. Per-family copies fix that.

export interface BrainySeed {
  name: string;
  icon: string;
  points: number;
  cashValueCents: number;
  description: string;
}

export const BRAINY_SEEDS: BrainySeed[] = [
  { name: "Watch a TED Talk", icon: "🎤", points: 30, cashValueCents: 300, description: "Watch any TED Talk (ted.com or YouTube). Report: the title, 2 things you learned, and 1 thing you want to try." },
  { name: "Listen to a Podcast", icon: "🎧", points: 25, cashValueCents: 250, description: "Listen to a full podcast episode on any topic. Report: the topic, 2 takeaways, and 1 question it made you think about." },
  { name: "Read a Non-Fiction Chapter", icon: "📖", points: 20, cashValueCents: 200, description: "Read one chapter from any non-fiction book. Write a short summary and one thing that surprised you." },
  { name: "Teach It Back", icon: "🧑‍🏫", points: 30, cashValueCents: 300, description: "Learn something new about any topic. Then teach it to a family member for at least 5 minutes. Parent rates your explanation." },
  { name: "Budget a Dream Purchase", icon: "💸", points: 40, cashValueCents: 400, description: "Pick something you want that costs over $50. Research the price, figure out how long it'll take to save for it, and present your plan." },
  { name: "Subscription Audit", icon: "📋", points: 50, cashValueCents: 500, description: "Find 3 subscriptions the family pays for. Write down how much each costs per year. Suggest one that could be cancelled and why." },
  { name: "Compound Interest Explorer", icon: "📈", points: 30, cashValueCents: 300, description: "Use an online calculator: if you save $5 a week for 10 years at 5% interest, how much do you end up with? What about $10/week? Report your findings and what surprised you." },
  { name: "Research a Successful Person", icon: "🌟", points: 30, cashValueCents: 300, description: "Pick someone successful. Research their story and share 3 decisions that helped them succeed." },
  { name: "Learn a New Skill (Tutorial)", icon: "🛠️", points: 25, cashValueCents: 250, description: "Watch a how-to video and learn a new practical skill. Describe what you learned and show or demonstrate it." },
  { name: "Read & Summarise a News Article", icon: "📰", points: 15, cashValueCents: 150, description: "Read a full news article (not social media). Summarise what happened, who it affects, and give your opinion." },
  { name: "Neighbourhood Business Idea", icon: "💡", points: 40, cashValueCents: 400, description: "Come up with a business idea for your street or neighbourhood. Who's the customer, what problem does it solve, and how much would you charge?" },
  { name: "Grocery Savings Hunt", icon: "🛒", points: 35, cashValueCents: 350, description: "Look at the family grocery list. Find 3 items where you could save money (generic brand, different store, or coupon). Report how much you could save in total." },
  { name: "Career Explorer", icon: "👩‍💼", points: 25, cashValueCents: 250, description: "Pick a job you find interesting. Research: what skills it needs, what it typically pays, and how you'd get there." },
  { name: "Watch a Documentary", icon: "🎬", points: 35, cashValueCents: 350, description: "Watch any documentary (nature, history, science, technology). Report 3 things you learned and one question you now have." },
  { name: "Compare Before You Buy", icon: "🔍", points: 30, cashValueCents: 300, description: "For any upcoming family purchase over $30, research at least 3 options or prices. Present your recommendation with reasons." },
  { name: "Interview an Adult", icon: "🎙️", points: 40, cashValueCents: 400, description: "Interview a parent, grandparent, or family friend. Ask: what do you do for work, what's the best money decision you ever made, and one piece of advice for kids. Report back." },
  { name: "Savings Goal Map", icon: "🗺️", points: 35, cashValueCents: 350, description: "Set a savings goal for something you want to buy. Write out: how much it costs, how long it'll take, and which gigs you'll do to earn it." },
  { name: '"How It\'s Made" Research', icon: "🏭", points: 25, cashValueCents: 250, description: "Pick any everyday product (phone, cereal, shoes). Research how it's made and where the materials come from. Share 3 facts you found interesting." },
  { name: "Generosity Research", icon: "🤝", points: 25, cashValueCents: 250, description: "Find 3 local or online charities or volunteer opportunities. Pick one you'd want to support and explain why giving matters to you." },
  { name: "Book Chapter (Rich Dad Poor Dad or similar)", icon: "💰", points: 30, cashValueCents: 300, description: "Read one chapter from an approved money/success book. Write a 5-sentence summary and one thing you want to apply in your life." },
];
