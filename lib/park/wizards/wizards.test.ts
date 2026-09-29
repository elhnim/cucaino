import { describe, expect, it } from "vitest";
import { ALL_LESSONS, WIZARDS, WIZARD_IDS, dayNumber, lessonsFor, todaysLesson } from "./index";
import type { Lesson } from "./types";

const PER_WIZARD = 45;

const allText = (l: Lesson) =>
  [
    l.title,
    ...l.lines,
    l.tryIt ?? "",
    l.funFact ?? "",
    l.quiz ? [l.quiz.q, ...l.quiz.options, l.quiz.explain].join(" ") : "",
  ]
    .join(" ")
    .toLowerCase();

describe("wizard definitions", () => {
  it("has six wizards with unique ids, hex colours and 3 greetings/farewells", () => {
    expect(WIZARDS).toHaveLength(6);
    expect(new Set(WIZARDS.map((w) => w.id)).size).toBe(6);
    for (const w of WIZARDS) {
      expect(w.robe).toMatch(/^#[0-9a-f]{6}$/i);
      expect(w.hat).toMatch(/^#[0-9a-f]{6}$/i);
      expect(w.greeting).toHaveLength(3);
      expect(w.farewell).toHaveLength(3);
    }
  });
});

describe("lesson content", () => {
  it("has unique, kebab-case ids prefixed by the wizard", () => {
    const ids = ALL_LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of ALL_LESSONS) {
      expect(l.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(l.id.startsWith(`${l.wizard}-`)).toBe(true);
    }
  });

  it(`has ${PER_WIZARD} lessons per wizard`, () => {
    for (const id of WIZARD_IDS) {
      expect(lessonsFor(id), id).toHaveLength(PER_WIZARD);
      for (const l of lessonsFor(id)) expect(l.wizard).toBe(id);
    }
    expect(ALL_LESSONS).toHaveLength(PER_WIZARD * WIZARD_IDS.length);
  });

  it("has no duplicate titles within a wizard", () => {
    for (const id of WIZARD_IDS) {
      const titles = lessonsFor(id).map((l) => l.title.toLowerCase());
      expect(new Set(titles).size, id).toBe(titles.length);
    }
  });

  it("respects field length limits", () => {
    for (const l of ALL_LESSONS) {
      expect(l.title.length, `${l.id} title`).toBeLessThanOrEqual(40);
      expect(l.emoji.length, `${l.id} emoji`).toBeGreaterThan(0);
      expect(l.lines.length, `${l.id} lines`).toBeGreaterThanOrEqual(2);
      expect(l.lines.length, `${l.id} lines`).toBeLessThanOrEqual(4);
      for (const line of l.lines) {
        expect(line.length, `${l.id} line: ${line}`).toBeLessThanOrEqual(140);
        expect(line.trim().length).toBeGreaterThan(0);
      }
      if (l.tryIt !== undefined) expect(l.tryIt.length, `${l.id} tryIt`).toBeLessThanOrEqual(120);
      if (l.funFact !== undefined) expect(l.funFact.length, `${l.id} funFact`).toBeLessThanOrEqual(140);
      if (l.quiz) {
        expect(l.quiz.q.length, `${l.id} quiz q`).toBeLessThanOrEqual(140);
        expect(l.quiz.explain.length, `${l.id} quiz explain`).toBeLessThanOrEqual(140);
        for (const o of l.quiz.options) expect(o.length, `${l.id} option ${o}`).toBeLessThanOrEqual(80);
      }
    }
  });

  it("has valid quizzes with distinct options", () => {
    for (const l of ALL_LESSONS) {
      if (!l.quiz) continue;
      expect(l.quiz.options).toHaveLength(3);
      expect([0, 1, 2]).toContain(l.quiz.answer);
      const opts = l.quiz.options.map((o) => o.trim().toLowerCase());
      expect(new Set(opts).size, l.id).toBe(3);
    }
  });

  it("mostly has quizzes, plenty of tryIts, some funFacts, and at least 70% ages 5+", () => {
    for (const id of WIZARD_IDS) {
      const ls = lessonsFor(id);
      const quizzes = ls.filter((l) => l.quiz).length;
      const tries = ls.filter((l) => l.tryIt).length;
      const fives = ls.filter((l) => (l.age ?? "5+") === "5+").length;
      expect(quizzes, `${id} quizzes`).toBeGreaterThanOrEqual(Math.ceil(ls.length * 0.8));
      expect(tries, `${id} tryIts`).toBeGreaterThanOrEqual(Math.floor(ls.length * 0.25));
      expect(fives / ls.length, `${id} 5+ share`).toBeGreaterThanOrEqual(0.7);
    }
    expect(ALL_LESSONS.filter((l) => l.funFact).length).toBeGreaterThanOrEqual(20);
  });

  it("only mentions risky things alongside a grown-up/adult", () => {
    const risky = /\b(matches|lighters?|knife|knives|oven|ovens|stove|stoves|kettle|kettles|candles?|bleach|power points?|boiling)\b/;
    const supervised = /\b(grown-ups?|adults?)\b/;
    for (const l of ALL_LESSONS) {
      const text = allText(l);
      if (risky.test(text)) expect(supervised.test(text), `${l.id} mentions a risky item without a grown-up`).toBe(true);
    }
  });

  it("uses Australian spelling for common words", () => {
    const us = /\b(color|colors|colorful|favorite|mom|moms|mommy|organize|center)\b/;
    for (const l of ALL_LESSONS) expect(us.test(allText(l)), l.id).toBe(false);
  });
});

describe("todaysLesson", () => {
  it("is deterministic", () => {
    for (const id of WIZARD_IDS) expect(todaysLesson(id, 123).id).toBe(todaysLesson(id, 123).id);
  });

  it("never repeats on consecutive days and covers every lesson in 45 days", () => {
    for (const id of WIZARD_IDS) {
      for (const start of [0, 7, 44, 300, -5]) {
        const seen = new Set<string>();
        let prev = "";
        for (let d = start; d < start + PER_WIZARD; d++) {
          const l = todaysLesson(id, d);
          expect(l.wizard).toBe(id);
          expect(l.id).not.toBe(prev);
          prev = l.id;
          seen.add(l.id);
        }
        expect(seen.size, `${id} from day ${start}`).toBe(PER_WIZARD);
      }
      // across the cycle boundary too
      for (let d = 0; d < PER_WIZARD * 3; d++) expect(todaysLesson(id, d).id).not.toBe(todaysLesson(id, d + 1).id);
    }
  });

  it("is shuffled, not just file order", () => {
    const inOrder = WIZARD_IDS.every((id) =>
      lessonsFor(id).every((l, i) => todaysLesson(id, i).id === l.id),
    );
    expect(inOrder).toBe(false);
  });
});

describe("dayNumber", () => {
  it("counts days since 2026-01-01 in Sydney time", () => {
    expect(dayNumber(new Date("2026-01-01T00:00:00+11:00"))).toBe(0);
    expect(dayNumber(new Date("2026-01-02T09:00:00+11:00"))).toBe(1);
    // 23:00 UTC on 31 Dec 2025 is already 1 Jan 2026 in Sydney
    expect(dayNumber(new Date("2025-12-31T23:00:00Z"))).toBe(0);
    expect(dayNumber(new Date("2025-12-31T23:00:00Z"), "UTC")).toBe(-1);
    expect(dayNumber(new Date("2026-09-29T12:00:00+10:00"))).toBe(271);
  });

  it("handles daylight-saving changeover days", () => {
    // Sydney DST ends 5 Apr 2026 and starts 4 Oct 2026
    const a = dayNumber(new Date("2026-04-04T12:00:00+11:00"));
    expect(dayNumber(new Date("2026-04-05T12:00:00+10:00"))).toBe(a + 1);
    const b = dayNumber(new Date("2026-10-03T12:00:00+10:00"));
    expect(dayNumber(new Date("2026-10-04T12:00:00+11:00"))).toBe(b + 1);
  });
});
