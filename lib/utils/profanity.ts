import leoProfanity from "leo-profanity";

export function containsProfanity(text: string): boolean {
  return leoProfanity.check(text);
}
