import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { WorldScene } from "./scenes/WorldScene";
import { HudScene } from "./scenes/HudScene";
import { PetScene } from "./scenes/PetScene";
import { WorkScene } from "./scenes/landmarks/WorkScene";
import { ShopScene } from "./scenes/landmarks/ShopScene";
import { PlayScene } from "./scenes/landmarks/PlayScene";
import { FriendsScene } from "./scenes/landmarks/FriendsScene";
import { REGISTRY_DATA } from "./types";
import { DPR } from "./systems/layout";
import type { InitialGameData } from "./types";

/** Boots the single Phaser.Game into `parent`. Returns a disposer. */
export function startGame(parent: HTMLElement, data: InitialGameData): () => void {
  const cssW = () => parent.clientWidth || window.innerWidth;
  const cssH = () => parent.clientHeight || window.innerHeight;

  // We drive sizing manually (Scale.NONE) so the canvas *backing store* is
  // cssSize * DPR (real retina pixels) while its CSS box stays at cssSize. Phaser's
  // RESIZE mode renders the framebuffer at CSS pixels only, which the browser then
  // upscales on retina screens — that's what made all text/emoji look blurry.
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#fde7f3",
    scale: {
      mode: Phaser.Scale.NONE,
      width: cssW() * DPR,
      height: cssH() * DPR,
    },
    render: { antialias: true, powerPreference: "high-performance" },
    scene: [BootScene, PreloadScene, WorldScene, HudScene, PetScene, WorkScene, ShopScene, PlayScene, FriendsScene],
  });

  game.registry.set(REGISTRY_DATA, data);

  const applySize = () => {
    const w = cssW(), h = cssH();
    game.scale.resize(w * DPR, h * DPR);
    game.canvas.style.width = `${w}px`;
    game.canvas.style.height = `${h}px`;
  };
  game.events.once(Phaser.Core.Events.READY, applySize);
  window.addEventListener("resize", applySize);

  // Phaser already pauses the render loop on blur/visibility-hidden via its
  // built-in Page Visibility handling and resumes seamlessly on focus — no
  // manual sleep/wake (a manual handler fights the built-in one and the canvas
  // fails to resume).

  return () => {
    window.removeEventListener("resize", applySize);
    game.destroy(true);
  };
}
