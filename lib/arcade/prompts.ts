/**
 * Prompts for the AI Arcade. Pure string builders (tested in prompts.test.ts).
 *
 * Multi-turn games (Stump The AI, Lie Detector) send the whole game so far as ONE user
 * message instead of alternating assistant/user turns. The old code sent histories that
 * started with an assistant turn, which the Messages API rejects — so every second turn
 * failed. One self-contained message is also cheaper to keep consistent.
 */
import { sanitizeKidText } from "./json";
import { LIE_MAX_QUESTIONS, STUMP_MAX_GUESSES, STUMP_MAX_QUESTIONS, type StumpTurn } from "./rules";

export const KID_SAFE_SYSTEM = `You run games in a kids' app for children aged 8 to 12.
Rules you always follow:
- Everything is friendly, kind and age-appropriate. No violence, weapons, gore, horror, romance, adult themes, drugs, gambling, politics or religion.
- No mean humour, bullying, toilet-level grossness or body shaming. Silly and cheeky is great.
- Never ask for or repeat personal details (full name, address, school, phone, passwords, where they live, photos). If the child types personal details or something unkind or unsafe, ignore it and keep the game going gently.
- Use short, lively sentences a 9-year-old can read aloud. Use British/Australian spelling.
- Be playful and encouraging. Never make the child feel bad for losing.
- Reply with ONE raw JSON object only — no markdown, no code fences, no text before or after it.`;

export function storyStartPrompt(input: { emojis: string[]; style: string; hero: string; seed: string }): string {
  const hero = input.hero ? `The hero is called ${input.hero}.` : "Invent a fun hero with a memorable name.";
  return `Write the FIRST HALF of a choose-your-path story built from these 5 emoji ingredients: ${input.emojis.join(" ")}
Style: ${input.style}. ${hero} (variety seed: ${input.seed})

Rules:
- Every emoji must matter to the plot (as a character, object or place) — weave all 5 in, but write words, not emojis.
- 3 short paragraphs, 2–3 sentences each. Funny, vivid, surprising — like a great kids' comic, not a bedtime lecture.
- End on a cliffhanger, then offer exactly 2 very different, exciting choices for what the hero does next.

JSON shape:
{"title":"catchy title","paragraphs":["...","...","..."],"question":"What should <hero> do?","choices":[{"emoji":"🚀","text":"short choice"},{"emoji":"🍩","text":"short choice"}]}`;
}

export function storyEndPrompt(input: { emojis: string[]; title: string; story: string[]; choice: string; hero: string }): string {
  return `Finish this choose-your-path story. The reader chose: "${input.choice}".
Title: ${input.title}
Emoji ingredients: ${input.emojis.join(" ")}${input.hero ? `\nHero: ${input.hero}` : ""}
Story so far:
${input.story.map((p) => `- ${p}`).join("\n")}

Rules:
- 2 short paragraphs (2–3 sentences each) that follow the reader's choice, include a funny twist, and wrap up happily.
- Then one short, warm "moral" line (not preachy — make it a bit funny).

JSON shape:
{"paragraphs":["...","..."],"moral":"..."}`;
}

export function wyrPackPrompt(input: { topics: string[]; seed: string; avoid: string[]; rounds: number }): string {
  const avoid = input.avoid.length ? `\nDo NOT reuse any of these recent dilemmas or close copies: ${input.avoid.slice(0, 20).join("; ")}.` : "";
  return `Make a pack of ${input.rounds} "Would you rather" dilemmas for kids aged 8–12. Themes to draw from: ${input.topics.join(", ")}. (variety seed: ${input.seed})

Rules:
- Each option is a short, vivid, specific scenario (max 14 words). Both options in a pair must be equally tempting or equally ridiculous — a genuinely hard choice.
- Mix it up: some funny, some "superpower" style, some tricky trade-offs. No gross-out, scary or mean options.
- For each dilemma also write the AI's cheeky, persuasive 2-sentence case FOR each option, with a clever reason a kid wouldn't have thought of.${avoid}

JSON shape:
{"rounds":[{"a":"...","emoji_a":"🦖","b":"...","emoji_b":"🚀","for_a":"why A is secretly better","for_b":"why B is secretly better"}]}`;
}

export function whatAmIPrompt(input: { category: string; flavor: string; seed: string; avoid: string[] }): string {
  const avoid = input.avoid.length ? `\nDo NOT pick any of these (used recently): ${input.avoid.slice(0, 25).join(", ")}.` : "";
  return `Game: "What Am I?" riddle. Secretly pick one ${input.category} that most 8–12 year olds would know${input.flavor ? ` — lean towards ${input.flavor}` : ""}. Avoid the most obvious pick. (variety seed: ${input.seed})

Write exactly 5 riddle clues in the first person ("I..."), from tricky to easy:
- Clue 1: clever and sneaky — true but could fit several things.
- Clues 2–4: each adds a new, specific fact (appearance, where found, what it does, a fun fact).
- Clue 5: nearly gives it away without saying it.
- NEVER use the answer word, any part of it, or a rhyme that gives it away.
Also give 1–4 aliases (other names or spellings we should accept), a matching emoji, and one amazing true fun fact.${avoid}

JSON shape:
{"answer":"penguin","aliases":["emperor penguin"],"emoji":"🐧","clues":["...","...","...","...","..."],"fun_fact":"..."}`;
}

export function wordDetectivePrompt(input: { theme: string; seed: string; avoid: string[] }): string {
  const avoid = input.avoid.length ? `\nDo NOT pick any of these (used recently): ${input.avoid.slice(0, 25).join(", ")}.` : "";
  return `Game: "Word Detective". Secretly pick ONE real English word (a single word, letters only, 5–10 letters) connected to "${input.theme}" that an 8–12 year old knows. Not too easy: think "telescope", "avalanche", "compass", "volcano", "orchestra". (variety seed: ${input.seed})

Write exactly 5 clues, from cryptic to obvious, like a detective's case notes:
- Clue 1: a clever riddle or wordplay.
- Clues 2–4: each adds a new, specific fact.
- Clue 5: very obvious, but still never says the word.
- NEVER use the word itself, part of it, or its plural in any clue.
Also give 0–3 aliases (accepted spellings/synonyms), a matching emoji and one amazing true fun fact about it.${avoid}

JSON shape:
{"word":"telescope","aliases":[],"emoji":"🔭","clues":["...","...","...","...","..."],"fun_fact":"..."}`;
}

export function stumpPrompt(input: { category: string; turns: StumpTurn[]; opener: string; mustGuess: boolean }): string {
  const asked = input.turns.length;
  const left = STUMP_MAX_QUESTIONS - asked;
  const wrong = input.turns.filter((t) => t.kind === "guess" && t.answer !== "Yes").map((t) => sanitizeKidText(t.text, 60));
  const guessesLeft = STUMP_MAX_GUESSES - wrong.length;
  const log = input.turns.length
    ? input.turns
        .map((t, i) => `${i + 1}. ${t.kind === "guess" ? `GUESS: ${sanitizeKidText(t.text, 80)}` : `Q: ${sanitizeKidText(t.text, 160)}`} → ${t.answer}`)
        .join("\n")
    : "(no questions yet)";
  return `We are playing 20 Questions. A child has secretly thought of something in the category: ${input.category}.
You have ${STUMP_MAX_QUESTIONS} turns in total; every question AND every guess uses a turn. You get at most ${STUMP_MAX_GUESSES} guesses.
Turns used: ${asked}. Turns left: ${left}. Guesses left: ${guessesLeft}.${wrong.length ? `\nWrong guesses so far (never repeat them): ${wrong.join(", ")}.` : ""}

The game so far:
${log}

How to play well:
- Think about everything the answers rule in and out. "Sometimes" and "Not sure" mean the fact is fuzzy — don't rely on it.
- Ask sharp yes/no questions that split the remaining possibilities roughly in half. Never ask something already answered.
- Only guess when you are fairly sure, or when turns are running out. Guess one specific thing (e.g. "a penguin", not "a bird").
${asked === 0 && input.opener ? `- For this first question, open by exploring ${input.opener}.\n` : ""}${input.mustGuess ? "- This is your LAST chance: you MUST make a guess now.\n" : ""}
Also add a tiny playful "reaction" (max 8 words) to the child's last answer, like a game-show host.

JSON shape — either
{"type":"question","text":"Does it live in water?","reaction":"Ooh, interesting!"}
or
{"type":"guess","guess":"a penguin","reaction":"I've got it, I think!"}`;
}

export function liePrompt(input: { statements: string[]; qa: { q: string; a: string }[]; mustGuess: boolean }): string {
  const used = input.qa.length;
  const log = input.qa.length
    ? input.qa.map((x, i) => `Q${i + 1}: ${sanitizeKidText(x.q, 240)}\nChild: ${sanitizeKidText(x.a, 200)}`).join("\n")
    : "(no questions yet)";
  return `Game: "Two Truths and a Lie". A child wrote 3 statements about themselves. Exactly ONE is a lie. You are the AI Lie Detector.
1. ${sanitizeKidText(input.statements[0])}
2. ${sanitizeKidText(input.statements[1])}
3. ${sanitizeKidText(input.statements[2])}

You may ask up to ${LIE_MAX_QUESTIONS} follow-up questions, then you must accuse one statement. Questions used: ${used}.
Interview so far:
${log}

How to play well:
- Ask specific, detective-style follow-ups about the details (when, what it looked like, how it felt) — liars struggle with details. Spread your questions over different statements.
- Keep questions short and fun (max 20 words). Never ask for personal details like their school, address or full name.
- When accusing, be dramatic and fun, and explain your reasoning in one kid-friendly sentence.
${input.mustGuess ? "- You have used all your questions: you MUST accuse one statement now.\n" : used < 2 ? "- Ask a question now — you need at least 2 answers before you accuse anyone.\n" : "- Accuse now if you are fairly sure, otherwise ask your last question.\n"}
JSON shape — either
{"type":"question","text":"Ooh, what colour was the snake?"}
or
{"type":"guess","guess":2,"text":"J'accuse! Statement 2 is the LIE!","reason":"You answered super fast but gave no details about the trip."}`;
}
