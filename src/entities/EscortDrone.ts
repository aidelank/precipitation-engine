import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { RaiderAirship } from './RaiderAirship';
import { Stratoreservoir } from './Stratoreservoir';

export class EscortDrone extends Phaser.Physics.Arcade.Sprite {
  private mothership: Stratoreservoir;
  private offsetAngle: number;
  private orbitDistance: number = 130;
  private fireCooldown: number = 0;
  private laserGraphic: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, mothership: Stratoreservoir, index: number, totalDrones: number) {
    const angle = (index / totalDrones) * Math.PI * 2;
    const spawnX = mothership.x + Math.cos(angle) * 130;
    const spawnY = mothership.y + Math.sin(angle) * 130;

    super(scene, spawnX, spawnY, 'drone');
    this.mothership = mothership;
    this.offsetAngle = angle;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setDepth(9);
    this.laserGraphic = scene.add.graphics();
    this.laserGraphic.setDepth(12);
  }

  public update(time: number, delta: number, enemies: RaiderAirship[]) {
    const dt = delta / 1000;
    this.laserGraphic.clear();

    this.offsetAngle += 0.4 * dt;
    const targetX = this.mothership.x + Math.cos(this.mothership.rotation + this.offsetAngle) * this.orbitDistance;
    const targetY = this.mothership.y + Math.sin(this.mothership.rotation + this.offsetAngle) * this.orbitDistance;

    this.x = Phaser.Math.Linear(this.x, targetX, 0.12);
    this.y = Phaser.Math.Linear(this.y, targetY, 0.12);

    this.fireCooldown -= dt;
    let closestEnemy: RaiderAirship | null = null;
    let minDist = 420;

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
      if (dist < minDist) {
        minDist = dist;
        closestEnemy = enemy;
      }
    }

    if (closestEnemy) {
      const angleToEnemy = Phaser.Math.Angle.Between(this.x, this.y, closestEnemy.x, closestEnemy.y);
      this.rotation = angleToEnemy;

      if (this.fireCooldown <= 0) {
        const combatMod = this.mothership.powerMode === 'COMBAT' ? 0.6 : 1.0;
        this.fireCooldown = 0.45 * combatMod;

        // Clean Avionics Pulse Tracer
        this.laserGraphic.lineStyle(1.5, 0xfacc15, 0.95);
        this.laserGraphic.lineBetween(this.x, this.y, closestEnemy.x, closestEnemy.y);
        soundSynth.playLaserPulse();

        closestEnemy.takeDamage(18);

        this.scene.time.delayedCall(50, () => {
          if (this.laserGraphic && this.laserGraphic.active) {
            this.laserGraphic.clear();
          }
        });
      }
    } else {
      this.rotation = this.mothership.rotation;
    }
  }

  public destroy(fromScene?: boolean) {
    if (this.laserGraphic) this.laserGraphic.destroy();
    super.destroy(fromScene);
  }
}
