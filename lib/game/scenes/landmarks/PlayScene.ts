import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { room, sign, backButton, panel, grid, kidId, relayoutOnResize } from "./chrome";

interface Game { icon: string; name: string; scene?: string; tint: number; badge?: string }

/** Playground = pick a game to play. */
export class PlayScene extends Phaser.Scene {
  constructor() { super("Play"); }

  create() {
    room(this, 0xe3d6f5, 0xb98b53, 0xd6c0ff);
    backButton(this);
    const v = viewport(this);
    sign(this, v.cx, 54 * v.ui, "🛝 Playground", 38);

    const games: Game[] = [
      { icon: "🐾", name: "My Pet", scene: "Pet", tint: 0xffd6ec },
      { icon: "🪙", name: "Money Town", tint: 0xfff0c0, badge: "NEW" },
      { icon: "🌟", name: "Dream Life", tint: 0xd6ffce },
      { icon: "📈", name: "Invest", tint: 0xcdebff },
      { icon: "❓", name: "Quiz Quest", tint: 0xe8d6ff },
      { icon: "🕹️", name: "Arcade", tint: 0xccfbf1 },
    ];

    const cw = Math.min(230, (v.w - 60) / 2) * (v.portrait ? 1 : 0.95);
    const ch = cw * 0.92;
    const pos = grid(v, games.length, cw, ch, 18 * v.ui, 130 * v.ui);

    games.forEach((gm, i) => {
      const { x, y } = pos[i];
      panel(this, x, y, cw, ch, gm.tint, 0xc7a0d8);
      this.add.text(x, y - ch * 0.12, gm.icon, { fontSize: `${cw * 0.4}px` }).setOrigin(0.5).setDepth(11);
      this.add.text(x, y + ch * 0.12, gm.name, {
        fontFamily: "system-ui", fontStyle: "900", fontSize: `${cw * 0.12}px`, color: "#5a3a8a",
      }).setOrigin(0.5).setDepth(11);
      const play = this.add.text(x, y + ch * 0.34, "▶ Play", {
        fontFamily: "system-ui", fontStyle: "900", fontSize: `${cw * 0.11}px`, color: "#fff",
        backgroundColor: "#46c43a", padding: { x: 18, y: 7 },
      }).setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true });
      play.on("pointerdown", () => {
        if (gm.scene) {
          window.history.pushState({}, "", `/kid/${kidId(this)}/world?scene=pet`);
          this.scene.start(gm.scene);
        } else {
          const t = this.add.text(x, y, "Coming soon!", {
            fontFamily: "system-ui", fontStyle: "900", fontSize: "22px", color: "#fff",
            backgroundColor: "#7b53d4", padding: { x: 14, y: 8 },
          }).setOrigin(0.5).setDepth(300);
          this.tweens.add({ targets: t, y: y - 60, alpha: 0, duration: 900, onComplete: () => t.destroy() });
        }
      });
      if (gm.badge) {
        this.add.text(x + cw / 2 - 30, y - ch / 2 + 14, gm.badge, {
          fontFamily: "system-ui", fontStyle: "900", fontSize: `${cw * 0.08}px`, color: "#7a4a0f",
          backgroundColor: "#ffce3a", padding: { x: 8, y: 3 },
        }).setOrigin(0.5).setDepth(13);
      }
    });

    relayoutOnResize(this);
  }
}
