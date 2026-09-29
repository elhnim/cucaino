/**
 * Prompts for the AI Arcade. Pure string builders (tested in prompts.test.ts).
 *
 * Multi-turn games (Stump The AI, Mystery Detective) send the whole game so far as ONE user
 * message instead of alternating assistant/user turns. The old code sent histories that
 * started with an assistant turn, which the Messages API rejects — so every second turn
 * failed. One self-contained message is also cheaper to keep consistent.
 */
import { sanitizeKidText } from "./json";
import { STUMP_MAX_GUESSES, STUMP_MAX_QUESTIONS, type StumpTurn } from "./rules";
import { MYSTERY_LOCATIONS, MYSTERY_LEVELS, type CaseFile, type MysteryDifficulty, type Statement } from "./mystery";

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

// ---- Doodle Guess --------------------------------------------------------

export function doodlePrompt(input: { previous: string[]; final: boolean; look: number }): string {
  const prev = input.previous.length
    ? `\nYour guesses on the last look were: ${input.previous.slice(0, 8).map((g) => sanitizeKidText(g, 40)).join(", ")}. They were NOT right, and the child has kept drawing — look again with fresh eyes and don't just repeat them unless the drawing really still looks like that.`
    : "";
  return `Game: "Doodle Guess" (like Quick, Draw!). A child aged 8–12 is drawing ONE thing on a tablet right now and you must guess what it is from the picture alone. It may be unfinished, wobbly and very simple — they draw fast with a finger. It is something a kid could draw in a minute: an animal, a food, an everyday object, something at a theme park, something in nature, or a person doing an action (running, sleeping…).
This is look number ${input.look}.${prev}${input.final ? "\nThe child pressed DONE — this is your final look, so give your very best guesses." : ""}

Rules:
- Give your 5 best guesses, most likely first. Each guess is a plain, common name, 1–3 words, lowercase ("turtle", "ice cream", "roller coaster") — never a description like "a round shape".
- Look at the overall shape first, then the details (ears, legs, handles, windows, stripes). Colours are hints too.
- If the picture is blank or just a line or two, still give your wildest best guesses.
- Also write "line": ONE short, funny, encouraging thing you say out loud while guessing, like an excited game-show contestant thinking aloud (max 16 words), e.g. "Is it… a potato with legs? No wait — a TURTLE!" Never be mean about the drawing.

JSON shape:
{"guesses":["turtle","potato","rock","hamburger","beetle"],"line":"..."}`;
}

// ---- Mystery Detective ---------------------------------------------------

const LEVEL_GUIDE: Record<MysteryDifficulty, string> = {
  easy: "EASY (age 8): clues are clear and direct, and the culprit's lie is obvious once you find the clue that contradicts it.",
  medium: "MEDIUM: the detective must link two clues together to be sure; one innocent has an odd-looking but harmless secret.",
  hard: "HARD: clues are subtle, two innocents have suspicious-looking harmless secrets, and the culprit's lie is a small detail (a time, a colour, an item).",
};

export function mysteryCasePrompt(input: { difficulty: MysteryDifficulty; premise: string; cast: string[]; seed: string }): string {
  const n = MYSTERY_LEVELS[input.difficulty].clues;
  const places = MYSTERY_LOCATIONS.map((l) => `${l.id} (${l.name})`).join(", ");
  return `Invent a brand-new whodunit for a kids' detective game set in Cucaino Park, a candy-coloured theme park with rides, a Pet Meadow, Mini Golf, a Friends Café, a Prize Shop and a Quest Board. (variety seed: ${input.seed})
Mystery idea to build on (you may twist it): ${input.premise}
Suspect inspiration (use, mix or replace): ${input.cast.join("; ")}.

Tone: cartoon mischief only — something went missing, got swapped, hidden or pranked. Nobody is hurt, nothing scary, no real-crime words (no murder, kidnap, weapons, jail). The culprit has an understandable, even slightly sweet motive (wanted to surprise a friend, felt left out, got carried away) and everything is put right in the end.

Suspects: exactly 4 funny park characters (animals or people who work or play in the park). Each has a distinct name (all first names start with different letters), one emoji, a one-line personality, an "alibi" (what they SAY they were doing), their real "truth" (what they actually did) and, for innocents, a harmless embarrassing "secret" they'd rather hide (it explains anything odd about them). Exactly ONE is the culprit; the culprit's alibi contains a specific "lie" that a clue contradicts.

Clues: exactly ${n} clues, each hidden in a DIFFERENT place, using only these place ids: ${places}.
- kind "implicates": evidence pointing at the culprit (a trait, an item, a habit, a time) — NEVER their name (describing their species, look or habits is fine and fair). At least 2 of these, and one must contradict the culprit's lie. Set "suspect" to the culprit's id.
- kind "clears": proves one innocent suspect could not have done it (set "suspect" to that innocent's id). At least 1.
- Every clue is concrete and fair, something a child can reason with ("Orange fur snagged on the ticket stand", "A café receipt shows Pip bought 3 muffins at 2pm — she was in the café the whole time").
- ${LEVEL_GUIDE[input.difficulty]}
- The case must be solvable from the clues plus questioning the suspects.

"solution": 2–3 sentences explaining exactly how the clues prove who did it.

JSON shape:
{"title":"The Case of the ...","emoji":"🎟️","intro":"2–3 lively sentences setting the scene for the detective (the child), ending with a question like: who did it?","item":"golden ticket","crime_scene":"prize-shop","suspects":[{"id":"s1","name":"...","emoji":"🦦","personality":"...","alibi":"...","truth":"...","secret":"..."}],"culprit":"s2","motive":"...","lie":"...","clues":[{"location":"pet-meadow","title":"Sticky paw prints","text":"...","kind":"implicates","suspect":"s2"}],"solution":"..."}`;
}

function caseBrief(c: CaseFile): string {
  const name = (id: string) => c.suspects.find((s) => s.id === id)?.name ?? id;
  const culprit = c.suspects.find((s) => s.id === c.culpritId);
  return `Case: ${c.title} — the ${c.item} went missing at the ${MYSTERY_LOCATIONS.find((l) => l.id === c.crimeScene)?.name ?? c.crimeScene}.
Suspects: ${c.suspects.map((s) => `${s.name} ${s.emoji} (${s.personality}) says: "${s.alibi}"`).join(" | ")}
SECRET SOLUTION: the culprit is ${culprit?.name ?? "unknown"}. Motive: ${c.motive} Their lie: ${c.lie} What really happened: ${c.solution}
Planted clues: ${c.clues.map((cl) => `[${cl.location}] ${cl.title}: ${cl.text} (${cl.kind} ${name(cl.suspectId)})`).join(" | ")}`;
}

export function mysteryAskPrompt(input: { caseFile: CaseFile; suspectId: string; question: string; log: Statement[] }): string {
  const c = input.caseFile;
  const me = c.suspects.find((s) => s.id === input.suspectId) ?? c.suspects[0];
  const t = c.truths[me.id] ?? { truth: me.alibi, secret: "" };
  const isCulprit = me.id === c.culpritId;
  const name = (id: string) => c.suspects.find((s) => s.id === id)?.name ?? id;
  const log = input.log.length
    ? input.log.map((s) => `Detective to ${name(s.suspectId)}: ${sanitizeKidText(s.question, 160)}\n${name(s.suspectId)}: ${sanitizeKidText(s.answer, 420)}`).join("\n")
    : "(nothing yet)";
  const role = isCulprit
    ? `You ARE the culprit. NEVER confess or say you did it. Stick to your alibi and lie subtly — but keep the lie catchable: never invent new facts that contradict the planted clues, get a little flustered or change the subject when asked about this: ${c.lie} If the detective mentions evidence against you, give a weak, funny excuse.`
    : `You are innocent. Tell the truth about what you really did. You may dodge questions about your harmless secret (${t.secret || "none"}) at first, but admit it sheepishly if asked directly. You can share honest opinions about the others, but never claim to know who did it.`;
  return `You are role-playing ONE suspect in a kids' detective game. Stay in character the whole time and stay consistent with the secret solution and everything already said.
${caseBrief(c)}

YOU are ${me.name} ${me.emoji} — ${me.personality}. Your alibi (what you tell people): ${me.alibi} What you really did: ${t.truth}
${role}

Everything said in the interviews so far:
${log}

The detective now asks you: "${sanitizeKidText(input.question, 160)}"
Reply in character: 1–3 short sentences, funny and full of personality, easy for a 9-year-old to read. Never reveal the secret solution or other suspects' truths. If the question is off-topic, silly or unkind, answer briefly in character and steer back to the case.
Also give "mood" (one emoji showing how you feel) and "note": a neutral one-line summary of what you claimed, for the detective's notebook (max 15 words, third person, e.g. "Says she was feeding the ducks at 2pm.").

JSON shape:
{"answer":"...","mood":"😅","note":"..."}`;
}

export function mysteryRevealPrompt(input: { caseFile: CaseFile; accusedId: string; correct: boolean; reason: string; found: string[] }): string {
  const c = input.caseFile;
  const accused = c.suspects.find((s) => s.id === input.accusedId)?.name ?? "someone";
  return `Write the big reveal for a kids' detective game.
${caseBrief(c)}

The detective (a child) accused ${accused} — they were ${input.correct ? "RIGHT" : "WRONG"}.
Their reasoning: "${sanitizeKidText(input.reason, 240) || "(no reason given)"}"
Clues they found: ${input.found.length ? input.found.map((f) => sanitizeKidText(f, 80)).join("; ") : "none"}.

Write:
- "headline": dramatic and fun, max 10 words.
- "reveal": 2–3 short paragraphs — the culprit is unmasked (funny, never scary), how each clue fits, the motive, and a kind ending where everything is put right and the culprit says sorry.
- "about_reason": one warm sentence about the child's reasoning — praise what was right; if they were wrong, gently point to the clue that would have cracked it.

JSON shape:
{"headline":"...","reveal":["...","..."],"about_reason":"..."}`;
}
