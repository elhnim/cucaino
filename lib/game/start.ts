import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { PreloadScene } from "./scenes/PreloadScene";
import { WorldScene } from "./scenes/WorldScene";
import { HudScene } from "./scenes/HudScene";
import { PetScene } from "./scenes/PetScene";
import { REGISTRY_DATA } from "./types";
import type { InitialGameData } from "./types";

/** Boots the single Phaser.Game into `parent`. Returns a disposer. */
export function startGame(parent: HTMLElement, data: InitialGameData): () => void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: "#fde7f3",
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: parent.clientWidth || window.innerWidth,
      height: parent.clientHeight || window.innerHeight,
    },
    render: { antialias: true, powerPreference: "high-performance" },
    scene: [BootScene, PreloadScene, WorldScene, HudScene, PetScene],
  });

  game.registry.set(REGISTRY_DATA, data);

  // Phaser already pauses the render loop on blur/visibility-hidden via its
  // built-in Page Visibility handling and resumes seamlessly on focus — no
  // manual sleep/wake (a manual handler fights the built-in one and the canvas
  // fails to resume).

  return () => {
    game.destroy(true);
  };
}
