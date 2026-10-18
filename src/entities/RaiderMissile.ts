import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { CombatTarget } from './RaiderAirship';

export class RaiderMissile extends Phaser.Physics.Arcade.Sprite {
  public target: CombatTarget | null;
  public health: number = 16;
  public maxHealth: number = 16;
  public damage: number = 36;

  private currentSpeed: number = 160;
  private maxSpeed: number = 290;
  private acceleration: number = 75;
  private turnRate: number = 2.6;
  private lifespan: number = 11.0;
  private engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, x: number, y: number, rotation: number, target: CombatTarget) {
    super(scene, x, y, 'raider_missile_proj');
    this.target = target;
    this.rotation = rotation;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    this.setDepth(10);

    // Initial velocity
    if (this.body) {
      scene.physics.velocityFromRotation(this.rotation, this.currentSpeed, this.body.velocity);
    }

    // Rocket booster exhaust trail
    this.engineEmitter = scene.add.particles(this.x, this.y, 'particle_spark', {
      speed: { min: 25, max: 70 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: 160,
      frequency: 25,
      tint: [0xff4444, 0xfacc15, 0xffffff],
    });
    this.engineEmitter.setDepth(9);
  }

  public takeDamage(amount: number) {
    if (!this.active) return;
    this.health -= amount;

    // Flash white on hit
    this.setTint(0xffffff);
    this.scene.time.delayedCall(40, () => {
      if (this.active) this.clearTint();
    });

    if (this.health <= 0) {
      // Intercepted and neutralized in mid-air!
      this.explode(false);
    }
  }

  public updateMissile(dt: number, validTargets: CombatTarget[]) {
    if (!this.active) return;

    this.lifespan -= dt;
    if (this.lifespan <= 0) {
      this.explode(false);
      return;
    }

    // Accelerate missile toward max velocity
    this.currentSpeed = Math.min(this.maxSpeed, this.currentSpeed + this.acceleration * dt);

    // Check target validity
    let activeTarget = this.target;
    const isTargetInvalid =
      !activeTarget ||
      !activeTarget.active ||
      ('isDestroyed' in activeTarget && activeTarget.isDestroyed) ||
      ('state' in activeTarget && (activeTarget.state === 'REBUILDING' || activeTarget.state === 'DOCKED'));

    if (isTargetInvalid) {
      // Re-acquire nearest valid target in flight
      let closest: CombatTarget | null = null;
      let minD = 900;

      for (const t of validTargets) {
        if (!t.active) continue;
        if ('isDestroyed' in t && t.isDestroyed) continue;
        if ('state' in t && (t.state === 'REBUILDING' || t.state === 'DOCKED')) continue;

        const d = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
        if (d < minD) {
          minD = d;
          closest = t;
        }
      }

      this.target = closest;
      activeTarget = closest;
    }

    // Guidance tracking logic
    if (activeTarget && activeTarget.active) {
      const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, activeTarget.x, activeTarget.y);
      this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, angleToTarget, this.turnRate * dt);

      // Check proximity detonation
      const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, activeTarget.x, activeTarget.y);
      if (distToTarget <= 32) {
        // Direct hit on friendly target!
        activeTarget.takeDamage(this.damage);
        this.explode(true);
        return;
      }
    }

    // Physics step
    this.scene.physics.velocityFromRotation(this.rotation, this.currentSpeed, this.body?.velocity);

    // Update rocket exhaust trail emitter
    const tailX = this.x - Math.cos(this.rotation) * 10;
    const tailY = this.y - Math.sin(this.rotation) * 10;
    this.engineEmitter.setPosition(tailX, tailY);
  }

  public explode(onImpact: boolean = false) {
    if (!this.active) return;

    if (onImpact) {
      soundSynth.playFlakBurst();
      this.scene.cameras.main.shake(70, 0.005);
    } else {
      soundSynth.playLaserPulse();
    }

    const emitter = this.scene.add.particles(this.x, this.y, 'particle_spark', {
      speed: { min: 40, max: 180 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 260,
      emitting: false,
    });
    emitter.explode(12);
    this.scene.time.delayedCall(300, () => emitter.destroy());

    this.destroy();
  }

  public destroy(fromScene?: boolean) {
    if (this.engineEmitter) {
      this.engineEmitter.stop();
      this.scene.time.delayedCall(200, () => {
        if (this.engineEmitter && this.engineEmitter.active) {
          this.engineEmitter.destroy();
        }
      });
    }
    super.destroy(fromScene);
  }
}
