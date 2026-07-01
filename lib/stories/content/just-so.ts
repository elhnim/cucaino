import type { LibraryStory } from "@/lib/stories/types";

// Lively original retellings of Rudyard Kipling's "Just So Stories" (public
// domain). Witty origin tales pitched at older readers (~10–12).

export const JUST_SO_STORIES: LibraryStory[] = [
  {
    id: "elephants-child",
    collection: "Just So Stories",
    title: "The Elephant's Child",
    emoji: "🐘",
    illustration: "🐘❓🐊",
    level: "Tricky",
    minutes: 5,
    starReward: 4,
    paragraphs: [
      "In the high and far-off times, the Elephant had no trunk at all — just a bulgy, blackish nose he could wriggle from side to side, but with which he could pick up precisely nothing.",
      "Now, there was one Elephant's Child who was full of 'satiable curiosity, which is a grand way of saying he asked simply EVERYTHING. He asked why melons tasted of melon, and why his aunt the Ostrich had feathers, until every relative he had spanked him for being a nuisance.",
      "But one question kept itching at him: “What does the Crocodile have for dinner?” So down he went to the great grey-green, greasy Limpopo River to find out. He found out, all right — for the Crocodile seized his little nose between its teeth!",
      "The Elephant's Child pulled, and the Crocodile pulled, and the nose stretched longer… and longer… and LONGER, until — schloop! — it came free as a proper long trunk. And the Elephant's Child soon discovered it was marvellous for picking fruit, swatting flies, and giving spiteful relatives a thoroughly good splash.",
    ],
    moral: "Curiosity, used bravely, can lead to wonderful surprises.",
    quiz: [
      { q: "What does “'satiable curiosity” mean about the Elephant's Child?", options: ["He asked about absolutely everything", "He was never hungry", "He was very sleepy", "He was rude on purpose"], answer: 0, explain: "It means an endless appetite for asking questions." },
      { q: "How did the Elephant's Child end up with a trunk?", options: ["The Crocodile stretched his nose", "He was born with one", "An aunt gave it to him", "It grew in the rain"], answer: 0 },
      { q: "What does the tale suggest about being curious?", options: ["Curiosity can lead to wonderful things", "Questions only cause trouble", "Never go exploring", "Crocodiles make good friends"], answer: 0 },
    ],
  },
  {
    id: "camel-hump",
    collection: "Just So Stories",
    title: "How the Camel Got His Hump",
    emoji: "🐪",
    illustration: "🐪😤✨",
    level: "Medium",
    minutes: 4,
    starReward: 4,
    paragraphs: [
      "When the world was so new and all, the Camel lived in the middle of a Howling Desert because he did not want to work — and he was idle as a Sunday afternoon.",
      "The Horse, the Dog, and the Ox came to him, one by one, asking him to trot and fetch and plough like everybody else. To every single one the Camel said just one rude word: “Humph!” — and turned his back.",
      "The three hard-working animals complained to the Djinn in charge of All Deserts. The Djinn found the Camel admiring his own reflection in a pool, and when the Camel said “Humph!” one time too many, the word stuck — and puffed itself up into a great wobbling HUMP on his back.",
      "“That humph,” said the Djinn, “is for the three days of work you missed. Now you can labour three days without eating, living off your hump.” And the Camel has worn his hump — and pulled his weight — from that day to this.",
    ],
    moral: "Doing your fair share beats being lazy — laziness catches up with you.",
    quiz: [
      { q: "Why wouldn't the Camel help the other animals?", options: ["He was idle and didn't want to work", "He was too busy", "He was unwell", "He didn't know how"], answer: 0 },
      { q: "Where did the Camel's hump come from?", options: ["His own rude word “Humph!” puffed up", "He was born with it", "The Horse gave it to him", "It rained humps"], answer: 0 },
      { q: "What is the point of the story?", options: ["Pull your weight; laziness catches up", "Lazing about is rewarded", "Deserts are lovely", "Never speak to a Djinn"], answer: 0 },
    ],
  },
  {
    id: "rhino-skin",
    collection: "Just So Stories",
    title: "How the Rhinoceros Got His Skin",
    emoji: "🦏",
    illustration: "🦏🍰😖",
    level: "Tricky",
    minutes: 4,
    starReward: 4,
    paragraphs: [
      "Once upon a most early time, the Rhinoceros had skin that fitted him quite tight and smooth — and manners that did not fit him at all, for he had none.",
      "A kind Parsee man baked a magnificent cake, all sweet and crumbly. The Rhinoceros came barging up, tipped the man off his stove, and gobbled the whole cake without so much as a thank-you. The Parsee said nothing — but he was a man who got even, and got even cleverly.",
      "Some weeks later, on a blistering day, the Rhinoceros unbuttoned his skin (for in those days rhino skin buttoned underneath with three buttons) and left it on the beach for a swim. Quick as anything, the Parsee filled that skin with stale, dry, tickly, scratchy cake crumbs.",
      "When the Rhinoceros buttoned himself back in, he itched most dreadfully. He rubbed and rubbed against a palm tree until his skin went all loose and folded into great wrinkles — and his temper turned permanently sour. And that is why rhinos are baggy and bad-tempered to this very day.",
    ],
    moral: "Bad manners have a way of coming back to bite you.",
    quiz: [
      { q: "What rude thing did the Rhinoceros do?", options: ["Ate the man's cake with no thanks", "Squashed the stove on purpose", "Stole the man's buttons", "Insulted the cake"], answer: 0 },
      { q: "How did the Parsee man get his revenge?", options: ["Filled the rhino's skin with itchy crumbs", "Baked a bigger cake", "Chased him away", "Took his buttons"], answer: 0 },
      { q: "Why does the story say rhinos are wrinkly and grumpy?", options: ["From rubbing the itchy, crumb-filled skin", "They were born that way", "They eat too much cake", "The sun shrank them"], answer: 0 },
    ],
  },
];
