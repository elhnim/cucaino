import type { LibraryStory } from "@/lib/stories/types";

// Original multi-chapter stories (our own writing) for kids who want a longer
// read. Adventure-flavoured, ~10–12 level. Same library, chapter-by-chapter.

export const CHAPTER_BOOKS: LibraryStory[] = [
  {
    id: "bronze-labyrinth",
    collection: "Chapter Books",
    title: "The Bronze Labyrinth",
    author: "Cucaino Originals",
    emoji: "🌀",
    illustration: "🗝️🌀🐂",
    level: "Chapter book",
    minutes: 20,
    starReward: 8,
    chapters: [
      {
        title: "The Dog That Vanished",
        paragraphs: [
          "Nia was eleven and quite sure that nothing interesting ever happened in her sleepy town of Olivar. She was wrong, of course, but it would take a runaway dog to prove it.",
          "It was her little brother Theo's fault. He had been throwing a stick for their scruffy dog, Pip, near the old olive grove at the edge of town — the grove everyone said was older than the town itself.",
          "“Pip, no!” Theo shouted. But Pip had caught a scent. He shot between two ancient, twisted trees, gave one excited bark, and simply… vanished. Not behind a tree. Not into a bush. Gone, as if the air had swallowed him whole.",
          "Nia ran to the spot. Where Pip had disappeared, the dry grass hid something cold and smooth under her sandal. She brushed the dirt away and her breath caught.",
          "It was bronze — a great ring set into a slab, green with age, carved with a maze that seemed to twist as she looked at it. A door in the ground. And from somewhere far below came the faint, echoing bark of a very confused dog.",
        ],
      },
      {
        title: "The Door in the Olive Grove",
        paragraphs: [
          "“We are NOT going down there,” said Theo, which is the sort of thing people say right before they go down there.",
          "Nia grabbed the bronze ring and pulled. With a groan like a waking giant, the slab lifted, revealing worn steps spiralling into the dark. Cool air drifted up, smelling of old metal and rain.",
          "She had two things in her pockets: half a cheese sandwich, and a ball of red wool her gran had given her to mend a jumper. She had a feeling the wool might matter more than the sandwich.",
          "“We tie the wool here,” Nia said, knotting one end around the bronze ring, “and we unwind it as we go. However twisty it gets, the red thread leads us home.”",
          "Theo looked at the dark, then at his brave big sister, and took her hand. Together they stepped down into the Bronze Labyrinth, the ball of wool unspooling softly behind them.",
        ],
      },
      {
        title: "The Riddling Statues",
        paragraphs: [
          "The walls below were bronze, polished smooth, and they branched left and right and left again until even clever Nia felt dizzy. But the red thread trailed reassuringly behind them.",
          "At a fork stood two statues, a smiling one and a frowning one, each guarding a different path. As the children approached, both creaked to life, bronze eyes glowing.",
          "“One path leads onward,” said the smiling statue. “One path leads in circles forever. You may ask each of us a single question — but one of us only ever lies, and one of us only ever tells the truth.”",
          "Theo groaned. Nia thought hard. Then she smiled, walked to one statue, and asked: “If I asked the OTHER statue which way is correct, what would it point to?” The statue pointed left. “Then we go right,” Nia said.",
          "“Whether I asked the liar or the truth-teller,” she explained to Theo, “that question always points to the wrong path. So we just do the opposite.” The frowning statue scowled, impressed, and let them pass.",
        ],
      },
      {
        title: "The Keeper of the Maze",
        paragraphs: [
          "At the heart of the labyrinth sat Pip, tail thumping, beside a towering figure of bronze — a great mechanical guardian with gears for joints and lamplight for eyes. The Keeper.",
          "“Visitors,” the Keeper rumbled, sounding less fierce than terribly lonely. “No one has come in a hundred years. I keep the maze. The maze keeps me. It is… very quiet.”",
          "Theo, who was small and not at all sensible, marched up and patted the Keeper's huge bronze hand. “You must be lonely,” he said simply. The lamplight eyes flickered, surprised.",
          "“I will set a riddle,” said the Keeper. “Answer it and you may leave with your hound. Fail, and you stay and keep me company forever.” It leaned close. “What grows the more you give it away?”",
          "Nia thought of her gran, and her town, and Theo's hand in hers in the dark. “Kindness,” she said. “Kindness grows the more you give it away.” The Keeper went very still — and then, with a sound like a sigh, it smiled.",
        ],
      },
      {
        title: "The Red Thread Home",
        paragraphs: [
          "“Correct,” said the Keeper softly. “And the kindest thing anyone has done in a hundred years was a small boy patting my hand.” It lowered its great head. “Take your dog. The way out is the way you marked.”",
          "Nia began to wind the red wool back into a ball, and step by step the thread led them out of the twisting dark — past the statues, up the spiral stair, into the green light of the olive grove.",
          "But before they left, Nia had done one more thing: she had promised the Keeper they would visit. And they did, every week, bringing stories and once a very confused cat.",
          "The Keeper was never lonely again. And the maze, strangely, stopped trying to trap anyone — because a guardian who is happy has no need to keep prisoners.",
          "Theo still says nothing interesting ever happens in Olivar. Nia just smiles, pats Pip, and keeps a ball of red wool in her pocket — just in case.",
        ],
      },
    ],
    quiz: [
      { q: "How did Nia make sure they could find their way out of the maze?", options: ["She unwound a red thread to follow back", "She drew a map", "She left a trail of sandwiches", "She memorised every turn"], answer: 0, explain: "The ball of red wool marked the path home." },
      { q: "How did Nia get past the two statues?", options: ["She asked a question, then took the opposite path", "She guessed", "She fought them", "She climbed over"], answer: 0 },
      { q: "What was the answer to the Keeper's riddle?", options: ["Kindness", "Gold", "Time", "A shadow"], answer: 0 },
      { q: "Why did the Keeper stop trapping people?", options: ["It was no longer lonely", "It ran out of gears", "The maze collapsed", "Nia tricked it"], answer: 0, explain: "A happy guardian had no need for prisoners." },
    ],
  },
  {
    id: "lantern-of-the-north",
    collection: "Chapter Books",
    title: "The Lantern of the North",
    author: "Cucaino Originals",
    emoji: "🏮",
    illustration: "🏮❄️🐦‍⬛",
    level: "Chapter book",
    minutes: 22,
    starReward: 8,
    chapters: [
      {
        title: "The Day the Light Went Out",
        paragraphs: [
          "In the far north, where winter lasts half the year, the village of Frosthollow had one precious treasure: the Great Lantern on the hill, whose warm golden light kept the worst of the dark and cold away.",
          "Bjorn had watched the lantern glow his whole life. So on the morning it sputtered, dimmed, and went out — plunging the village into grey, biting gloom — he knew something was very wrong.",
          "The elders wrung their hands. The lantern had never gone out, not in three hundred years. No one knew how to relight it. The long dark was coming, and they were not ready.",
          "“The flame came from the Ember of the North, beyond the frozen lake,” croaked the oldest elder. “But the journey is deadly, and the way is forgotten.”",
          "Bjorn was not the biggest or the bravest boy in Frosthollow. But he was the only one who picked up an empty lantern, pulled on his warmest coat, and started walking toward the lake.",
        ],
      },
      {
        title: "Across the Frozen Lake",
        paragraphs: [
          "The lake was a vast sheet of black ice, groaning and cracking beneath Bjorn's boots. Halfway across, a glossy black raven landed beside him with a thoughtful tilt of its head.",
          "“Going to the Ember, are we?” said the raven, for ravens in the north can talk if they think you're worth the trouble. “You'll not make it alone, small one. But I'm bored, so I'll come.”",
          "“Step where I step,” the raven warned. “The thin ice looks just like the thick — but I can see the difference from above.” And so they crossed, boy below and bird above, the raven cawing left, right, straight on.",
          "Twice the ice cracked where Bjorn would have walked. Twice the raven's sharp eyes saved him. Bjorn began to understand that even a small companion could be worth more than an army.",
          "On the far shore rose a cave of blue ice, and from deep inside came a low, grumbling, distinctly unfriendly voice.",
        ],
      },
      {
        title: "The Frost Troll's Bargain",
        paragraphs: [
          "The Frost Troll was made of ice and bad temper, and it guarded the path to the Ember. “No one passes,” it growled, “unless they can give me something I have never had.”",
          "Bjorn's heart sank. What could a poor village boy give a troll that it had never had? He had a coil of rope, a crust of bread, and an empty lantern. The troll had stood here for a thousand frozen years.",
          "Then Bjorn understood. A thousand years alone in the ice — the troll had had cold, and silence, and loneliness. But it had never had one simple thing.",
          "“I'll give you a thank-you,” said Bjorn. He bowed politely. “Thank you for guarding this path so faithfully, for so long. That can't have been easy.” The troll froze — not with cold, but with surprise.",
          "No one had ever thanked it. Not once. A crack ran through its icy frown, and what might have been a smile appeared. “Pass,” it whispered. “And… you're welcome.”",
        ],
      },
      {
        title: "The Raven's Secret",
        paragraphs: [
          "Deep in the cave, the Ember of the North floated above a pedestal — a single coal glowing soft and gold, the last warm thing for a hundred miles. Bjorn reached for it eagerly.",
          "“Wait,” said the raven. “Here is the secret the elders forgot. The Ember does not burn on wood, or oil, or coal. It burns on kindness freely given. Take it greedily and it will die in your hands.”",
          "Bjorn paused. He thought of the raven guiding him, the troll he had thanked, the cold villagers waiting in the dark. He cupped his hands gently, not grabbing but offering, and quietly thanked the Ember for its long, faithful light.",
          "The coal flared bright and warm and leapt willingly into his empty lantern, glowing stronger than before. The raven bobbed its head. “Well done. You listened. Most people don't.”",
          "With the lantern blazing, the long walk home felt shorter, and far less cold.",
        ],
      },
      {
        title: "Bringing Back the Dawn",
        paragraphs: [
          "When Bjorn climbed the hill and set the Ember into the Great Lantern, golden light burst across Frosthollow. People wept and cheered and hugged the small, tired boy who had done what the elders could not.",
          "“How?” they asked. “How did you relight it when none of us could?” Bjorn thought of the raven, the troll, and the Ember.",
          "“The light doesn't run on flame,” he said. “It runs on kindness. I just gave some away — to a bird, to a troll, to a coal — and it gave the light back.”",
          "From then on, Frosthollow kept the lantern fed not with oil but with good deeds, and it never went dark again. And every winter, a glossy black raven came to visit the boy who had listened.",
          "Bjorn was still not the biggest or the bravest boy in the village. But everyone agreed he was the warmest — and in the far north, that is the very best thing to be.",
        ],
      },
    ],
    quiz: [
      { q: "Why did Bjorn set out on the journey?", options: ["To relight the village's Great Lantern", "To find treasure", "To catch a raven", "To win a race"], answer: 0 },
      { q: "How did the raven help Bjorn cross the lake?", options: ["It spotted the thin ice from above", "It carried him", "It melted the ice", "It scared away wolves"], answer: 0 },
      { q: "What did Bjorn give the Frost Troll that it had never had?", options: ["A genuine thank-you", "Gold", "Bread", "A song"], answer: 0, explain: "In a thousand years, no one had ever thanked it." },
      { q: "What does the Ember of the North really burn on?", options: ["Kindness freely given", "Wood", "Oil", "Coal"], answer: 0 },
      { q: "What was the secret to relighting the lantern?", options: ["Giving kindness, not grabbing greedily", "Walking faster", "A magic word", "A bigger flame"], answer: 0 },
    ],
  },
];
