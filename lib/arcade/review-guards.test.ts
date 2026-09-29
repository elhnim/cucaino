import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "./token";
import { revealsCulprit, validateSuspectReply } from "./mystery";
import { DOODLE_MAX_PNG_BYTES, isPngBase64 } from "./doodle";

const SECRET = "review-secret-that-is-long-enough";

describe("sealed token integrity (every position)", () => {
  it("rejects a flip anywhere in iv, tag or ciphertext", () => {
    const t = sealToken({ kid: "k1", culpritId: "s3" }, SECRET, "mystery", 60_000);
    for (let i = 3; i < t.length - 1; i++) {
      const c = t[i] === "A" ? "B" : "A";
      const bad = t.slice(0, i) + c + t.slice(i + 1);
      expect(openToken(bad, SECRET, "mystery")).toBeNull();
    }
  });
});

describe("revealsCulprit guard", () => {
  const name = "Captain Waffles";
  it("blocks replies that name the culprit as the doer or quote the brief", () => {
    expect(revealsCulprit("Fine, fine — it was Waffles all along!", name)).toBe(true);
    expect(revealsCulprit("The culprit is Captain Waffles, obviously.", name)).toBe(true);
    expect(revealsCulprit("Waffles stole the golden ticket.", name)).toBe(true);
    expect(revealsCulprit("My SECRET SOLUTION says...", name)).toBe(true);
    expect(validateSuspectReply({ answer: "It was Waffles!" }, false, name)).toBeNull();
  });
  it("allows normal in-character answers", () => {
    expect(revealsCulprit("I saw Waffles near the café at 2pm, munching muffins.", name)).toBe(false);
    expect(revealsCulprit("I was feeding the ducks, honest!", name)).toBe(false);
    expect(validateSuspectReply({ answer: "I was at the Pet Meadow all day." }, false, name)).not.toBeNull();
  });
});

describe("doodle PNG size cap", () => {
  it("rejects payloads over the byte cap", () => {
    const big = "iVBORw0KGgo" + "A".repeat(Math.ceil((DOODLE_MAX_PNG_BYTES * 4) / 3) + 8);
    expect(isPngBase64(big)).toBe(false);
    expect(isPngBase64("iVBORw0KGgo" + "A".repeat(100))).toBe(true);
    expect(isPngBase64("/9j/" + "A".repeat(100))).toBe(false); // jpeg magic
  });
});
