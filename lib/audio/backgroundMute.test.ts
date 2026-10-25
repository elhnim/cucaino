import { describe, expect, it } from "vitest";
import { installBackgroundMute } from "./backgroundMute";

// a tiny fake browser: an AudioContext class, a media element class, a document and listeners
function fakeWindow() {
  const listeners: Record<string, (() => void)[]> = {};
  const on = (t: string, fn: () => void) => (listeners[t] ??= []).push(fn);
  const doc = { visibilityState: "visible", addEventListener: on };
  class FakeCtx {
    state = "running";
    suspend() {
      this.state = "suspended";
      return Promise.resolve();
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
  }
  class FakeMedia {
    paused = true;
    pause() {
      this.paused = true;
    }
    play() {
      this.paused = false;
      return Promise.resolve();
    }
    addEventListener() {}
  }
  let spoken = 0;
  const win = { document: doc, addEventListener: on, AudioContext: FakeCtx, HTMLMediaElement: FakeMedia, speechSynthesis: { cancel: () => spoken++ } };
  const fire = (t: string, vis?: string) => {
    if (vis) doc.visibilityState = vis;
    for (const fn of (t === "visibilitychange" ? listeners[t] : listeners[t]) ?? []) fn();
  };
  return { win, fire, FakeMedia, cancels: () => spoken };
}

describe("background mute", () => {
  it("suspends running sound when hidden and resumes exactly it when back", async () => {
    const { win, fire, FakeMedia, cancels } = fakeWindow();
    installBackgroundMute(win);
    const AC = win.AudioContext as unknown as new () => { state: string; suspend(): Promise<void>; resume(): Promise<void> };
    const running = new AC();
    const quiet = new AC();
    await quiet.suspend();
    const song = new FakeMedia();
    await song.play();
    fire("visibilitychange", "hidden");
    expect(running.state).toBe("suspended");
    expect(song.paused).toBe(true);
    expect(cancels()).toBe(1);
    // sound code trying to wake its context while the app is away is held back
    await running.resume();
    expect(running.state).toBe("suspended");
    fire("visibilitychange", "visible");
    expect(running.state).toBe("running");
    expect(quiet.state).toBe("suspended"); // it wasn't playing before, so it stays quiet
    expect(song.paused).toBe(false);
  });

  it("closing the app (pagehide) silences it too, and a context made while away starts quiet", () => {
    const { win, fire } = fakeWindow();
    const mute = installBackgroundMute(win);
    fire("pagehide");
    expect(mute.away).toBe(true);
    const AC = win.AudioContext as unknown as new () => { state: string };
    expect(new AC().state).toBe("suspended");
  });

  it("installs only once", () => {
    const { win } = fakeWindow();
    expect(installBackgroundMute(win)).toBe(installBackgroundMute(win));
  });
});
