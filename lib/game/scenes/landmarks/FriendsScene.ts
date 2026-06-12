import Phaser from "phaser";
import { viewport } from "../../systems/layout";
import { backdrop, sign, backButton, panel, grid, relayoutOnResize } from "./chrome";

interface Friend { face: string; name: string; online: boolean; note?: string }

/** Friends = see your friends and send a wave or sticker. */
export class FriendsScene extends Phaser.Scene {
  constructor() { super("Friends"); }

  create() {
    backdrop(this, 0xe2f0ff);
    backButton(this);
    const v = viewport(this);
    sign(this, v.cx, 54 * v.ui, "💌 Friends", 38);

    const friends: Friend[] = [
      { face: "🦊", name: "Leo", online: true, note: "sent you a 👋" },
      { face: "🐰", name: "Ava", online: true },
      { face: "🐼", name: "Sam", online: false, note: "last seen today" },
      { face: "🐯", name: "Mia", online: false },
      { face: "🐧", name: "Kai", online: true },
    ];

    const wide = !v.portrait;
    const cw = Math.min(wide ? 340 : v.w - 48, 460);
    const ch = 116 * v.ui;
    const pos = grid({ w: v.w }, friends.length, cw, ch, 16 * v.ui, 120 * v.ui);

    friends.forEach((f, i) => {
      const { x, y } = pos[i];
      panel(this, x, y, cw, ch, 0xffffff, 0x9fc0e0);
      // avatar bubble
      const ar = ch * 0.34;
      this.add.circle(x - cw / 2 + ar + 16, y, ar, 0xffe9c7).setStrokeStyle(4, 0xffffff).setDepth(11);
      this.add.text(x - cw / 2 + ar + 16, y, f.face, { fontSize: `${ar * 1.3}px` }).setOrigin(0.5).setDepth(12);
      // status dot
      this.add.circle(x - cw / 2 + ar * 2 + 6, y - ar + 8, 9, f.online ? 0x46c43a : 0xbbbbbb).setDepth(13).setStrokeStyle(3, 0xffffff);
      // name + note
      const tx = x - cw / 2 + ar * 2 + 40;
      this.add.text(tx, y - 22, f.name, {
        fontFamily: "system-ui", fontStyle: "900", fontSize: `${24 * v.ui}px`, color: "#3a5a7a",
      }).setOrigin(0, 0.5).setDepth(11);
      this.add.text(tx, y + 14, f.online ? (f.note ?? "online") : (f.note ?? "offline"), {
        fontFamily: "system-ui", fontSize: `${16 * v.ui}px`, color: f.online ? "#46955a" : "#999",
      }).setOrigin(0, 0.5).setDepth(11);
      // actions
      const wave = this.add.text(x + cw / 2 - 56, y, "👋", {
        fontSize: `${30 * v.ui}px`, backgroundColor: "#eaf4ff", padding: { x: 10, y: 8 },
      }).setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true });
      wave.on("pointerdown", () => this.toast(x, y - ch / 2, `Waved at ${f.name}! 👋`));
      const sticker = this.add.text(x + cw / 2 - 116, y, "😀", {
        fontSize: `${30 * v.ui}px`, backgroundColor: "#fff3df", padding: { x: 10, y: 8 },
      }).setOrigin(0.5).setDepth(12).setInteractive({ useHandCursor: true });
      sticker.on("pointerdown", () => this.toast(x, y - ch / 2, `Sticker sent to ${f.name}! 😀`));
    });

    relayoutOnResize(this);
  }

  private toast(x: number, y: number, msg: string) {
    const t = this.add.text(x, y, msg, {
      fontFamily: "system-ui", fontStyle: "900", fontSize: "20px", color: "#fff",
      backgroundColor: "#3a8ad4", padding: { x: 14, y: 8 },
    }).setOrigin(0.5).setDepth(300);
    this.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 1000, onComplete: () => t.destroy() });
  }
}
