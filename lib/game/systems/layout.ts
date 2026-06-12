import Phaser from "phaser";

/**
 * Responsive helpers. We run the Scale Manager in RESIZE mode so every scene
 * gets the real viewport size and lays itself out for the actual aspect ratio
 * (iPad landscape vs iPhone portrait) rather than just being letterboxed.
 */
export interface Viewport {
  w: number;
  h: number;
  cx: number;
  cy: number;
  portrait: boolean;
  /** uniform UI scale relative to a 1024-wide design, clamped for phones */
  ui: number;
}

export function viewport(scene: Phaser.Scene): Viewport {
  const { width: w, height: h } = scene.scale.gameSize;
  const portrait = h > w;
  const ui = Phaser.Math.Clamp(Math.min(w, h) / (portrait ? 600 : 768), 0.6, 1.4);
  return { w, h, cx: w / 2, cy: h / 2, portrait, ui };
}

/** Re-run a scene's layout() on every resize, and clean the listener up on shutdown. */
export function onResize(scene: Phaser.Scene, fn: () => void) {
  scene.scale.on(Phaser.Scale.Events.RESIZE, fn);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
    scene.scale.off(Phaser.Scale.Events.RESIZE, fn),
  );
}

/** Scale a game object so its widest side fits `target` px. */
export function fitWidth(obj: Phaser.GameObjects.Components.Transform & { width: number }, target: number) {
  obj.setScale(target / obj.width);
}
