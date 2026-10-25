import type { WizardDef, WizardId } from "./types";

export const WIZARD_IDS: WizardId[] = ["sage", "twinkle", "tinker", "marigold", "nova", "coral"];

export const WIZARD_DEFS: Record<WizardId, WizardDef> = {
  sage: {
    id: "sage",
    name: "Sage Oakbeard",
    title: "the Wizard of Wisdom",
    emoji: "🦉",
    robe: "#6FAE7E",
    hat: "#3E6B4C",
    greeting: [
      "Ahh... hello, little one. Come, sit with me under the old oak.",
      "Welcome, welcome. Take a slow breath with me... there. Now we can learn.",
      "Hmm, I was hoping you would wander by today. I have a small wisdom for you.",
    ],
    farewell: [
      "Go gently now. Your kind heart is your strongest magic.",
      "Until tomorrow, friend. Remember... little steps still move you forward.",
      "Off you go. The oak and I will be here, growing slowly, just like you.",
    ],
  },
  twinkle: {
    id: "twinkle",
    name: "Professor Twinkle",
    title: "the Trivia Wizard",
    emoji: "✨",
    robe: "#8E6CF0",
    hat: "#FFD447",
    greeting: [
      "Great galaxies, a visitor! Quick, quick, I have an AMAZING fact for you!",
      "Oh-ho! Hello, hello! Did you know I know a fact you don't know... yet?",
      "Sparkling stars, you're just in time! Today's fact is a real corker!",
    ],
    farewell: [
      "Off you zoom! Tell someone your new fact and watch their jaw drop!",
      "Great galaxies, that was fun! Come back tomorrow for another whopper!",
      "Keep wondering, keep asking, keep sparkling! Toodle-oo!",
    ],
  },
  tinker: {
    id: "tinker",
    name: "Tinker Wren",
    title: "the Wizard of Clever Tricks",
    emoji: "🔧",
    robe: "#F2994A",
    hat: "#7A4B2A",
    greeting: [
      "Psst! Over here! Want to learn a sneaky-clever trick? Of course you do.",
      "Hehe, hello! I've got a trick up my sleeve. Actually, I've got forty up there.",
      "Shhh... don't tell the other wizards, but my tricks are the most useful ones.",
    ],
    farewell: [
      "Now go and use that trick. Bonus points if a grown-up says 'How did you know that?'",
      "Tricks are for using, not just knowing! Off you go, clever clogs.",
      "See you tomorrow. I'll have a new trick ready... hehe.",
    ],
  },
  marigold: {
    id: "marigold",
    name: "Marigold",
    title: "the Kitchen & Home Wizard",
    emoji: "🌼",
    robe: "#F7C873",
    hat: "#D9534F",
    greeting: [
      "Hello, sweet pea! Come in, come in, the kettle's on. My grown-up kettle, of course.",
      "Oh, lovely to see you, poppet. Shall we learn a handy home skill together?",
      "There you are, dearie! Roll up your sleeves, today we learn something useful.",
    ],
    farewell: [
      "Off you pop, poppet. Little helpers make a happy home.",
      "Cheerio, sweet pea! Try it at home and make your family proud.",
      "Bye for now, dearie. Stay safe and keep being helpful!",
    ],
  },
  nova: {
    id: "nova",
    name: "Nova",
    title: "the Star Wizard",
    emoji: "🔭",
    robe: "#2D3A7A",
    hat: "#9AD1FF",
    greeting: [
      "Oh! Hello, fellow scientist. Have you ever wondered... why things are the way they are?",
      "Hmm, I've been staring at the sky all morning. Want to hear what I found out?",
      "Welcome, curious one! Questions are the best kind of magic. Let's find an answer.",
    ],
    farewell: [
      "Keep asking 'why?'. That little word is how every scientist starts.",
      "Bye for now! Look up at the sky tonight and think of me.",
      "Go explore! And remember, real scientists test things safely with a grown-up.",
    ],
  },
  coral: {
    id: "coral",
    name: "Coral",
    title: "the Sea Wizard",
    emoji: "🐚",
    robe: "#3CC6C0",
    hat: "#FF8A80",
    greeting: [
      "Hello, little wave... drift over here. The sea has a secret for you today.",
      "Shhh... can you hear the ocean? It's whispering something. Let's listen.",
      "Welcome, sea friend. Float with me for a moment, and I'll tell you a story of the deep.",
    ],
    farewell: [
      "Drift home softly now. The ocean says thank you for caring.",
      "Until the next tide, little wave. Swim safe, and dream blue.",
      "Bye for now. Every time you help nature, the sea smiles.",
    ],
  },
};
