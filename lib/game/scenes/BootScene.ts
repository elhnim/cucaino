import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }
  create() {
    this.scale.scaleMode = Phaser.Scale.RESIZE;
    this.input.addPointer(2); // multi-touch for tablets
    this.scene.start("Preload");
  }
}
