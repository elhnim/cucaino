import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    // Sizing is driven manually in start.ts (Scale.NONE) for a retina-resolution
    // canvas backing store; do not switch to RESIZE here or it overrides that.
    this.input.addPointer(2); // multi-touch for tablets
    this.scene.start("Preload");
  }
}
