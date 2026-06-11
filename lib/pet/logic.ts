/**
 * Star Pets game maths — pure functions, no I/O.
 * Shared by server actions (authoritative) and the client (live ticking).
 */

import {
  DECAY_PER_HOUR,
  MAX_LEVEL,
  PET_SPECIES,
  PLAY_MAX_SCORE,
  SLEEP_ENERGY_PER_HOUR,
  SPEECH_UNLOCK_LEVEL,
  STREAK_XP_CAP_DAYS,
  STREAK_XP_PER_DAY,
  type PetSpecies,
} from "@/lib/pet/config";
import type { Database } from "@/lib/supabase/database.types";

export type PetRow = Database["public"]["Tables"]["kid_pets"]["Row"];

export interface Pet {
  id: string;
  kidId: string;
  name: string;
  species: string;
  hunger: number;
  happiness: number;
  energy: number;
  cleanliness: number;
  xp: number;
  accessories: string[];
  tricks: string[];
  personalities: string[];
  isSleeping: boolean;
  totalStarsSpent: number;
  careStreak: number;
  lastCareDate: string | null;
  lastGiftDate: string | null;
  lastTickAt: string;
  createdAt: string;
}

export type PetStage = "baby" | "child" | "teen" | "adult";

export function rowToPet(row: PetRow): Pet {
  return {
    id: row.id,
    kidId: row.kid_id,
    name: row.name,
    species: row.species,
    hunger: row.hunger,
    happiness: row.happiness,
    energy: row.energy,
    cleanliness: row.cleanliness,
    xp: row.xp,
    accessories: Array.isArray(row.accessories) ? (row.accessories as string[]) : [],
    tricks: Array.isArray(row.tricks) ? (row.tricks as string[]) : [],
    personalities: Array.isArray(row.personalities) ? (row.personalities as string[]) : [],
    isSleeping: row.is_sleeping,
    totalStarsSpent: row.total_stars_spent,
    careStreak: row.care_streak,
    lastCareDate: row.last_care_date,
    lastGiftDate: row.last_gift_date,
    lastTickAt: row.last_tick_at,
    createdAt: row.created_at,
  };
}

export function applyCareStreak(pet: Pet, today: string): { pet: Pet; bonusXp: number } {
  if (pet.lastCareDate === today) return { pet, bonusXp: 0 };

  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const streak = pet.lastCareDate === yesterdayStr ? pet.careStreak + 1 : 1;
  const bonusXp = STREAK_XP_PER_DAY * Math.min(streak, STREAK_XP_CAP_DAYS);
  return {
    pet: { ...pet, careStreak: streak, lastCareDate: today, xp: pet.xp + bonusXp },
    bonusXp,
  };
}

export function playReward(score: number): { happiness: number; xp: number } {
  const s = Math.max(0, Math.min(PLAY_MAX_SCORE, Math.round(score)));
  return {
    happiness: Math.min(55, 15 + Math.round(s * 1.6)),
    xp: Math.min(16, 4 + Math.floor(s / 2)),
  };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function applyDecay(pet: Pet, now: Date = new Date()): Pet {
  const hours = Math.max(0, (now.getTime() - new Date(pet.lastTickAt).getTime()) / 3_600_000);
  if (hours === 0) return pet;

  if (pet.isSleeping) {
    return {
      ...pet,
      hunger: clamp(pet.hunger - (DECAY_PER_HOUR.hunger / 2) * hours),
      energy: clamp(pet.energy + SLEEP_ENERGY_PER_HOUR * hours),
      cleanliness: clamp(pet.cleanliness - DECAY_PER_HOUR.cleanliness * hours),
      lastTickAt: now.toISOString(),
    };
  }

  return {
    ...pet,
    hunger: clamp(pet.hunger - DECAY_PER_HOUR.hunger * hours),
    happiness: clamp(pet.happiness - DECAY_PER_HOUR.happiness * hours),
    energy: clamp(pet.energy - DECAY_PER_HOUR.energy * hours),
    cleanliness: clamp(pet.cleanliness - DECAY_PER_HOUR.cleanliness * hours),
    lastTickAt: now.toISOString(),
  };
}

export function levelFromXp(xp: number): number {
  return Math.min(MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, xp) / 12)) + 1);
}

export function xpForLevel(level: number): number {
  return 12 * (level - 1) * (level - 1);
}

/** Pets start tiny and grow with age: 60% at age 1 → 100% at age 5, then constant. */
export function sizeScaleForLevel(level: number): number {
  return Math.min(1, 0.5 + Math.max(1, level) * 0.1);
}

export function stageFromLevel(level: number): PetStage {
  if (level >= 12) return "adult";
  if (level >= 8) return "teen";
  if (level >= 4) return "child";
  return "baby";
}

export function getSpecies(id: string): PetSpecies {
  return PET_SPECIES.find((s) => s.id === id) ?? PET_SPECIES[0];
}

export function petEmoji(pet: Pet): string {
  const species = getSpecies(pet.species);
  const stage = stageFromLevel(levelFromXp(pet.xp));
  return stage === "teen" || stage === "adult" ? species.adultEmoji : species.babyEmoji;
}

export interface PetMood {
  id: "sleeping" | "starving" | "dirty" | "tired" | "lonely" | "ecstatic" | "happy";
  emoji: string;
  message: string;
}

export function moodFor(pet: Pet): PetMood {
  if (pet.isSleeping) return { id: "sleeping",  emoji: "💤", message: `Shh… ${pet.name} is snoozing.` };
  if (pet.hunger < 25)  return { id: "starving", emoji: "🍽️", message: `${pet.name} is really hungry!` };
  if (pet.cleanliness < 30) return { id: "dirty", emoji: "🛁", message: `${pet.name} needs a bath!` };
  if (pet.energy < 20)  return { id: "tired",    emoji: "🥱", message: `${pet.name} is sleepy. Time for a nap?` };
  if (pet.happiness < 30) return { id: "lonely", emoji: "😢", message: `${pet.name} misses you. Play together?` };
  if (pet.hunger > 70 && pet.happiness > 70 && pet.energy > 70 && pet.cleanliness > 70) {
    return { id: "ecstatic", emoji: "🤩", message: `${pet.name} feels amazing! Best buddy ever.` };
  }
  return { id: "happy", emoji: "😊", message: `${pet.name} is happy to see you!` };
}

// ── Dialogue system ────────────────────────────────────────────────────────────

export type SpeechAction = "feed" | "play" | "wash" | "cuddle" | "idle" | "hungry" | "tired" | "gift" | "trick";

// Baby sounds — species-specific cute noises fired for baby-stage pets regardless of level
const BABY_SOUNDS: Record<string, Partial<Record<SpeechAction, string[]>>> = {
  dragon: {
    idle:    ["Rwr!", "*tiny roar* 🐲", "Brarr~", "Raah~"],
    feed:    ["Nom nom!", "*happy chomp* 🍖", "Rar yum!"],
    play:    ["Rwr rwr!", "*happy wing flap*", "Weee!"],
    cuddle:  ["Prr~", "Rrrr~", "*nuzzles*"],
    tired:   ["Zzrr...", "*yawn roar*", "...rwr"],
    gift:    ["OOH! ✨", "Rar! 🎁", "*flaps excitedly*"],
    wash:    ["Splsh!", "Rwr wet!", "*shakes off water*"],
    hungry:  ["RWR! 🍖", "*tummy growl*", "Nom?"],
    trick:   ["Rwr! ✨", "*spins tiny*", "Rar!"],
  },
  kitten: {
    idle:    ["Mew!", "Nya~", "*chirps*", "Prr~"],
    feed:    ["Mrow! 😋", "Nyam nyam!", "*happy purr*"],
    play:    ["Mew mew!", "*zooms*", "Prrr!"],
    cuddle:  ["Prr prr~", "Mrrp~", "*kneads paws*"],
    tired:   ["Mrrr...", "*sleepy mew*", "Nyaa..."],
    gift:    ["Mew!! 🎁", "*bats excitedly*", "Mrow!"],
    wash:    ["Hiss! 💦", "Mew! Wet!", "*licks paw*"],
    hungry:  ["MROW! 🍎", "*tummy mew*", "Nya?"],
    trick:   ["Mew! ✨", "*tiny bounce*", "Prrr!"],
  },
  puppy: {
    idle:    ["Wuf!", "Yip!", "*tail wag*", "Arf!"],
    feed:    ["Wuf wuf! 😋", "*gobbles*", "Arf yum!"],
    play:    ["Yip yip!", "*spins circles*", "ARF ARF!"],
    cuddle:  ["Wuf~", "*licks*", "Yip yip!"],
    tired:   ["Wuf...", "*sleepy bark*", "Yip..."],
    gift:    ["ARF! 🎁", "*wags tail super fast*", "Wuf!!"],
    wash:    ["Yip! 💦", "*shakes water everywhere*", "Arf wet!"],
    hungry:  ["WUF! 🦴", "*big puppy eyes*", "Arf arf?"],
    trick:   ["ARF! ✨", "*zooms lap*", "Wuf!"],
  },
  bunny: {
    idle:    ["*nose wiggle*", "Mhm!", "*hops in place*", "Baa~"],
    feed:    ["Nom nom!", "*happy crunch*", "Mhm mhm!"],
    play:    ["*boing!*", "Wheee!", "*zoomy zoomies*"],
    cuddle:  ["*soft squeak*", "Mhm~", "*melts into hug*"],
    tired:   ["Mhm...", "*droopy ears*", "*sleepy hop*"],
    gift:    ["Ooh! 🎁", "*excited binky*", "Mhm!!"],
    wash:    ["*splish splash*", "Mhm wet!", "*shakes long ears*"],
    hungry:  ["Mhm?! 🥕", "*tummy grumble*", "NOM?"],
    trick:   ["*boing!* ✨", "Wheee!", "*spins*"],
  },
  panda: {
    idle:    ["Hmm~", "*nom nom*", "Muu~", "*happy roll*"],
    feed:    ["Nom~", "*happy chomp*", "Muu yum!"],
    play:    ["*slow zoom*", "Hmm!", "*waddles fast*"],
    cuddle:  ["Muu~", "*flops over happily*", "*belly rub please*"],
    tired:   ["Hmm...", "*big yawn*", "*just flops down*"],
    gift:    ["Ooh! 🎁", "*rolls toward gift*", "Hmm!"],
    wash:    ["Hmm wet~", "*splashes*", "Muu!"],
    hungry:  ["NOM?! 🎋", "*tummy rumble*", "Hmm HUNGRY!"],
    trick:   ["Hmm! ✨", "*slow clap*", "Muu!"],
  },
  unicorn: {
    idle:    ["*sparkle* ✨", "Eee!", "~♪", "*magical chirp*"],
    feed:    ["Eee yum! ✨", "*magic chomp*", "~♪ nom~"],
    play:    ["*zoom sparkles*", "Eee eee!", "~♪♪"],
    cuddle:  ["~♪", "*glows softly* 🌟", "Eee~"],
    tired:   ["~...", "*dim sparkles*", "Eee..."],
    gift:    ["EEE!! ✨🎁", "*rainbow burst*", "~♪♪♪"],
    wash:    ["*sparkle splash* 💦", "Eee!", "~♪ clean!"],
    hungry:  ["Eee?! 🌟", "*fading sparkle*", "~♪ hungry!"],
    trick:   ["✨✨✨", "EEE! ✨", "*rainbow burst*"],
  },
};

const SPEECH: Record<SpeechAction, Record<string, string[]>> = {
  feed: {
    brave:    ["Fuel for adventures! 💪", "A warrior needs sustenance!", "I'm ready to conquer anything now!"],
    cheerful: ["YUM YUM YUM! 😄", "THIS IS MY FAVOURITE!", "FOOOOOD! Best day ever!"],
    curious:  ["I wonder what this is made of...", "Interesting texture! Let me analyse it.", "Mmm, hypothesis confirmed: delicious!"],
    gentle:   ["That was very kind of you ☺️", "Thank you so much... you're the best.", "I'm grateful for every bite 🌸"],
    playful:  ["Nom nom nom! 🍽️", "FOOOOOD! My one true weakness! 😂", "Om nom nom... can't talk... eating!"],
    wise:     ["A full belly keeps the mind sharp.", "Nutrition is the foundation of all things.", "Thank you. I needed that."],
  },
  play: {
    brave:    ["That was NOTHING! Let's go again! 🔥", "I'm unstoppable! Who's next?!", "Victory is mine!"],
    cheerful: ["BEST. DAY. EVER! 🎉", "Wheeeeee! Again! Again!", "That was SO much fun I can't even!"],
    curious:  ["I have a theory about catching balls...", "Fascinating! The physics of this game...", "I'm studying your technique 🔍"],
    gentle:   ["That was so fun together ☺️", "I love playing with you!", "These are my favourite moments 🌸"],
    playful:  ["Hehe I'm AMAZING at this! 😝", "You can't catch me! 😂", "I declare myself champion! 🏆"],
    wise:     ["Play keeps us young and happy.", "Well played, my friend.", "The joy of movement — essential for life."],
  },
  wash: {
    brave:    ["I wasn't even dirty. Just... testing you. 😤", "Bring it on, bubbles!", "A champion stays clean!"],
    cheerful: ["Squeaky clean and sparkly! ✨", "BUBBLES! I love bubbles! 🫧", "I'm the shiniest pet in town!"],
    curious:  ["How does soap actually work? 🤔", "Interesting — the cleansing mechanism...", "Clean pet, clean thoughts!"],
    gentle:   ["That felt so refreshing ☺️", "I feel brand new!", "Thank you for taking such good care of me 🌸"],
    playful:  ["SPLASH! Haha got you wet! 💦", "Bubble beard! 🧼", "Bath time is secretly my favourite! Shh!"],
    wise:     ["Cleanliness nurtures the spirit.", "Fresh and ready for anything.", "Clean outside, calm inside."],
  },
  cuddle: {
    brave:    ["...I wasn't scared. I just wanted a hug. 😤", "Okay... that was actually really nice.", "Strong pets need hugs too! 💪"],
    cheerful: ["HUGS ARE THE BEST THING EVER! 🤗", "MORE cuddles please! Never stop!", "You're my favourite human EVER!"],
    curious:  ["Did you know hugging releases oxytocin? 🔬", "The science of love is fascinating!", "Warmth detected. Happiness: increasing!"],
    gentle:   ["This is my favourite moment ☺️", "I feel so loved and safe...", "You always know just when I need this 🌸"],
    playful:  ["ATTACK HUG! 🫂", "Gotcha! Squish! Hehe!", "I hugged you SO hard just then! 😄"],
    wise:     ["A hug says more than words ever could.", "Connection is everything.", "Hold close what matters most."],
  },
  idle: {
    brave:    ["What's the mission today? 🗺️", "Ready for ANYTHING!", "Let's go on an adventure!"],
    cheerful: ["Hi hi hi!! You came back! 🥳", "I've been SO excited waiting for you!", "Every time I see you I get butterflies!"],
    curious:  ["Oh! I was just thinking...", "Hey, I have a question for you!", "I've been doing some research today 🔍"],
    gentle:   ["I missed you ☺️", "So nice to see you...", "You make everything better 🌸"],
    playful:  ["Boo! Did I scare ya? 😜", "Guess who's BACK? It's me! Obviously.", "I've been practicing my surprised face 😮"],
    wise:     ["Ah, you're here. I had a feeling.", "Good timing, my friend.", "I've been expecting you."],
  },
  hungry: {
    brave:    ["A warrior NEEDS sustenance! Feed me! ⚔️", "Can't conquer on an empty stomach!", "The brave get hungry too, you know!"],
    cheerful: ["TUMMY IS RUMBLING! 🍕", "Feed me feed me feed me pleeeease!", "My tummy is doing a very loud dance!"],
    curious:  ["My hunger reminds me to ask — what's for lunch?", "Interesting... the stomach sends signals!", "Hunger: a fascinating biological response."],
    gentle:   ["I hate to bother you, but... 🥺 I'm a little hungry...", "Sorry to ask... could I please have something?", "My tummy is talking 🌸"],
    playful:  ["My tummy is doing a little CONCERT! 🎵", "FEED THE BEAST! (That's me, I'm the beast 😂)", "Hunger level: CRITICAL! SOS! 🆘"],
    wise:     ["The stomach speaks its own language.", "Food is fuel. I could use some fuel.", "A hungry mind cannot focus."],
  },
  tired: {
    brave:    ["I'm not tired. Just... resting my eyes. 😤", "Champions rest too. For strategy.", "I'll close my eyes... just for a moment..."],
    cheerful: ["zzzZZZ... wait what? I'm AWAKE! 😴", "I'm soooo sle— HI! How are you!", "Fighting sleepiness with pure happiness! 😄"],
    curious:  ["Sleep is when the brain processes memories... 💤", "Dreaming is just the brain reorganising data!", "I'll sleep now... and dream of research..."],
    gentle:   ["I could use a little rest, if that's okay... 🌸", "I'm getting a bit sleepy...", "Maybe just a short nap? ☺️"],
    playful:  ["Going to sleeeeep~ Good luck without me! 😂", "Can't play... too... sleepy... zzz 😴", "Wake me up for the good bits! Night!"],
    wise:     ["Rest is not weakness. It is wisdom.", "Even the wisest must sleep.", "Tomorrow's wisdom begins with tonight's rest."],
  },
  gift: {
    brave:    ["A gift? For me?! I mean... cool. 😎", "Worthy of a champion! I accept.", "A reward befitting my greatness! 🏆"],
    cheerful: ["OHHH MYYY! A PRESENT!! 🎁🎁🎁", "EEEEEE! IS IT FOR ME?! FOR MEEE?!", "BEST. GIFT. EVER! Whatever it is!"],
    curious:  ["I wonder what's inside! The possibilities!", "Opening gifts is my favourite scientific experiment!", "Let me analyse the contents... 🔍"],
    gentle:   ["This is so thoughtful... thank you ☺️", "You didn't have to do this... but I'm so glad you did!", "Every gift from you is special 🌸"],
    playful:  ["IS IT A PUPPY?! Oh wait I'm the pet 😂", "RIPPING IT OPEN! 🎁💥", "Whatever it is I already love it SO MUCH!"],
    wise:     ["The best gifts are always unexpected.", "A surprise for the soul.", "Gratitude fills me completely."],
  },
  trick: {
    brave:    ["TA-DAAA! The crowd goes wild! 🔥", "Easy. I could do that in my sleep.", "That's called TALENT! 💪"],
    cheerful: ["WOOOOO! Did you SEE that?! 🎉", "I am LITERALLY the best at this!", "I practised that SO much and it shows!"],
    curious:  ["The biomechanics of that move are fascinating!", "I've been analysing the optimal technique!", "Scientifically perfect execution! 🔬"],
    gentle:   ["I hope that made you smile ☺️", "I practiced that just for you 🌸", "Did you like it? I really tried my best!"],
    playful:  ["Hehe NAILED IT! Give me all the applause! 👏", "Was that cool? I think that was VERY cool! 😄", "Ta-da! I'm basically a superstar! 🌟"],
    wise:     ["Practice makes perfect.", "Mastery takes time and patience.", "Every skill learned is a treasure."],
  },
};

/**
 * Returns a speech line appropriate to the pet's stage and personality.
 * - baby stage: cute species-specific baby sounds (always, no level gate)
 * - level 5+ with personalities: full personality-flavoured dialogue
 * - otherwise: null
 */
export function getPetSpeech(
  species: string,
  personalities: string[],
  action: SpeechAction,
  level: number,
  stage: PetStage,
): string | null {
  // Baby stage — always use species baby sounds
  if (stage === "baby") {
    const speciesSounds = BABY_SOUNDS[species] ?? BABY_SOUNDS["puppy"]!;
    const lines = speciesSounds[action] ?? speciesSounds["idle"] ?? ["!"];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  // Personality speech unlocks at SPEECH_UNLOCK_LEVEL
  if (level < SPEECH_UNLOCK_LEVEL || personalities.length === 0) return null;
  const trait = personalities[Math.floor(Math.random() * personalities.length)];
  const lines = SPEECH[action]?.[trait] ?? SPEECH[action]?.["cheerful"] ?? [];
  return lines[Math.floor(Math.random() * lines.length)] ?? null;
}
