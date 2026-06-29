import type { LibraryStory } from "@/lib/stories/types";

// Original, cheeky stories for older readers (~10–12) in a Roald-Dahl-ish
// spirit: a rotten grown-up or a sneaky scheme that gets its comeuppance,
// usually thanks to a clever kid. Wording and characters are entirely our own.

export const TALES_WITH_A_TWIST: LibraryStory[] = [
  {
    id: "sweet-shop-swindler",
    collection: "Tales with a Twist",
    title: "The Sweet Shop Swindler",
    emoji: "🍬",
    illustration: "🍬⚖️😈",
    level: "Tricky",
    minutes: 5,
    starReward: 4,
    paragraphs: [
      "Mr. Grimble owned the only sweet shop in town, and Mr. Grimble was a cheat. His weighing scales were rigged so that a hundred grams of fizz-bombs always came out as sixty, and he pocketed the difference with a small, greasy smile.",
      "The children all knew it. But what could they do? Grown-ups never believed a kid over a smiling shopkeeper in a stripy apron. All except clever Nia, aged eleven, who owned two things Mr. Grimble had not counted on: a sharp eye and a very good notebook.",
      "For three whole weeks Nia wrote it all down — every weight, every price, every short-changed gram. Then she did something bold. She invited the town baker, whose own scales were perfectly honest, to weigh a bag of Grimble's sweets right in the middle of the town square.",
      "The bag that proudly claimed 200 grams weighed barely 120. The crowd gasped. Mr. Grimble turned the exact colour of a beetroot. By the next morning the shop had honest scales — and Nia had a year's supply of fizz-bombs. Cheats, it turns out, simply cannot abide a child with a notebook.",
    ],
    moral: "Patience and proof can topple even a smiling cheat.",
    quiz: [
      { q: "How did Mr. Grimble cheat his customers?", options: ["His scales gave less than people paid for", "He sold stale sweets", "He shouted prices", "He hid the good sweets"], answer: 0 },
      { q: "How did Nia finally prove it?", options: ["She recorded weights and had the baker re-weigh a bag publicly", "She shouted at him", "She stole his scales", "She told her teacher"], answer: 0 },
      { q: "What really won the day for Nia?", options: ["Patience and solid evidence", "Pure luck", "Being the loudest", "A magic trick"], answer: 0, explain: "She gathered proof over weeks, then showed it in public." },
    ],
  },
  {
    id: "allergic-to-chores",
    collection: "Tales with a Twist",
    title: "The Boy Who Was Allergic to Chores",
    emoji: "🧦",
    illustration: "🧦🌀😅",
    level: "Medium",
    minutes: 4,
    starReward: 4,
    paragraphs: [
      "Oliver announced, very seriously, that he was ALLERGIC to chores. One whiff of a dirty sock, he claimed, and he came over all faint. Dusting made him sneeze like a foghorn. Washing up brought him out in imaginary spots the size of dinner plates.",
      "His gran, who was nobody's fool, nodded with enormous sympathy. “Allergies are dreadful,” she agreed. “We must protect you completely. No chores for you, Oliver — and, sadly, no chore-related fun, either. Wouldn't want to risk it.”",
      "So while his sister tidied the kitchen and then zoomed off on her brand-new bike (a reward for helping), Oliver sat 'safely' indoors. While she baked muffins and licked the bowl, Oliver watched through the window, his stomach rumbling like distant thunder.",
      "By Thursday, Oliver made a truly miraculous recovery. The funny thing about a chore allergy is that it vanishes the very instant you notice everyone else is having all the fun. Gran just winked and handed him a duster.",
    ],
    moral: "Wriggle out of your share and you wriggle out of the rewards too.",
    quiz: [
      { q: "What was Oliver pretending?", options: ["That he was allergic to chores", "That he was ill in bed", "That he was too busy", "That he'd already finished"], answer: 0 },
      { q: "How did Gran cleverly outsmart him?", options: ["No chores meant no chore rewards either", "She made him do double", "She shouted at him", "She did them all herself"], answer: 0 },
      { q: "Why did Oliver suddenly 'recover'?", options: ["He was missing out on the fun and treats", "The allergy faded on its own", "He took medicine", "Gran gave up"], answer: 0 },
    ],
  },
  {
    id: "homework-eating-dog",
    collection: "Tales with a Twist",
    title: "The Homework-Eating Dog (Who Told the Truth)",
    emoji: "🐶",
    illustration: "🐶📓🤥",
    level: "Tricky",
    minutes: 4,
    starReward: 4,
    paragraphs: [
      "Everybody says “the dog ate my homework,” but at our school it actually happened — once. A scruffy mutt named Biscuit genuinely did eat Tom's maths sheet, soggy corner, long division and all.",
      "The trouble was, Tom had used that exact excuse about fifty times before, on days when it most certainly was NOT true. So when it finally was true, Mrs. Okafor simply folded her arms and said, “Of course it did, Tom.”",
      "It was rather like the boy who cried wolf — only with fractions instead of sheep. Nobody believed a single word, because Tom had spent a whole year not being believable.",
      "Tom redid the homework that lunchtime, grumbling. But from then on he told the truth even about small, silly things — because he'd discovered that the most useful thing a person can own isn't a clever excuse. It's a reputation for being honest.",
    ],
    moral: "An honest reputation is worth more than any excuse.",
    quiz: [
      { q: "Why didn't Mrs. Okafor believe Tom this time?", options: ["He'd used the excuse falsely many times before", "She disliked dogs", "Tom mumbled", "Biscuit ran off"], answer: 0 },
      { q: "Which fable is Tom's situation most like?", options: ["The Boy Who Cried Wolf", "The Tortoise and the Hare", "The Lion and the Mouse", "Goldilocks"], answer: 0, explain: "A known liar isn't believed even when finally telling the truth." },
      { q: "What did Tom decide was most valuable?", options: ["A reputation for being honest", "A faster dog", "A better excuse", "Skipping homework"], answer: 0 },
    ],
  },
];
