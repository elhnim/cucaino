// The kid's Book of Wisdom: every lesson they've learned from a wizard (lesson id -> the day it
// was learned). Kept on the device, like the sticker album.
const key = (kidId: string) => `cucaino.wisdom.${kidId}`;

export function readWisdom(kidId: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(key(kidId));
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function addWisdom(kidId: string, lessonId: string, day: string): Record<string, string> {
  const book = readWisdom(kidId);
  if (!book[lessonId]) book[lessonId] = day;
  try {
    window.localStorage.setItem(key(kidId), JSON.stringify(book));
  } catch {
    /* private mode: still counts for this visit */
  }
  return book;
}

/** Speak a wizard line aloud (young kids can't all read yet). Quietly does nothing if unsupported. */
export function speak(text: string, voice: { pitch: number; rate: number }) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ""));
    u.pitch = voice.pitch;
    u.rate = voice.rate;
    const en = synth.getVoices().find((v) => /en[-_](AU|GB)/i.test(v.lang)) ?? synth.getVoices().find((v) => /^en/i.test(v.lang));
    if (en) u.voice = en;
    synth.speak(u);
  } catch {
    /* no speech on this device */
  }
}

export function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
