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

/**
 * Device-pixel ratio the canvas backing store is rendered at. The Phaser canvas
 * is sized at `cssSize * DPR` and CSS-scaled back down, so the WebGL framebuffer
 * has real retina resolution instead of being upscaled (= blurry) by the browser.
 * Capped at 2 to bound memory/fill cost on phones with DPR 3.
 */
export const DPR = typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);

/**
 * `gameSize` is in *physical* pixels (cssSize * DPR). UI scenes lay out in CSS
 * units, so we divide here and have each UI scene apply a matching camera zoom
 * (see `hiDpiCamera`). The net visual size is unchanged; only sharpness improves.
 */
export function viewport(scene: Phaser.Scene): Viewport {
  const w = scene.scale.gameSize.width / DPR;
  const h = scene.scale.gameSize.height / DPR;
  const portrait = h > w;
  const ui = Phaser.Math.Clamp(Math.min(w, h) / (portrait ? 600 : 768), 0.6, 1.4);
  return { w, h, cx: w / 2, cy: h / 2, portrait, ui };
}

/**
 * Make a UI scene's main camera render its CSS-unit layout into the physical
 * framebuffer: zoom by DPR from the TOP-LEFT origin with zero scroll, so world
 * point (x,y) maps to screen pixel (x*DPR, y*DPR) and input hit-testing lines up
 * exactly with what's drawn. (centreOn here mis-scrolls under zoom, which made
 * the D-pad / buttons unclickable.) Idempotent; NOT for world cameras that follow.
 */
export function hiDpiCamera(scene: Phaser.Scene) {
  const cam = scene.cameras.main;
  if (!cam) return;
  cam.setOrigin(0, 0);
  cam.setZoom(DPR);
  cam.setScroll(0, 0);
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
