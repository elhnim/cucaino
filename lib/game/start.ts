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

  // pause the render loop when the tab/app is hidden (battery)
  const onVis = () => (document.hidden ? game.loop.sleep() : game.loop.wake());
  document.addEventListener("visibilitychange", onVis);

  return () => {
    document.removeEventListener("visibilitychange", onVis);
    game.destroy(true);
  };
}
