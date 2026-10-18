import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { Stratoreservoir } from './Stratoreservoir';
import { EscortCarrier } from './EscortCarrier';
import { CarrierDrone } from './CarrierDrone';
import { UnionCorvette } from './UnionCorvette';
import { CorvetteSquadron } from './CorvetteSquadron';
import { RaiderMissile } from './RaiderMissile';

export type RaiderType = 'SCOUT' | 'HEAVY' | 'MISSILE';
export type RaiderAIState = 'ROAMING' | 'ENGAGING';
export type CombatTarget = Stratoreservoir | EscortCarrier | CarrierDrone | UnionCorvette | CorvetteSquadron;

export class RaiderAirship extends Phaser.Physics.Arcade.Sprite {
  public raiderType: RaiderType;
  public maxHealth: number;
  public health: number;
  public aiState: RaiderAIState = 'ROAMING';
  public visionRange: number;
  public loseTargetRange: number = 900;

  // Convoy traversal: fly a fixed straight heading across the map until fired upon
  public convoyMode: boolean = false;
  public convoyHeading: number = 0;
  public convoySpeed: number = 65;
  
  private roamSpeed: number;
  private combatSpeed: number;
  private wanderTarget: Phaser.Math.Vector2;
  private wanderTimer: number = 0;
  private attackCooldown: number = 0;
  private flakGraphic: Phaser.GameObjects.Graphics;
  private statusLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, type: RaiderType, initialState: RaiderAIState = 'ROAMING') {
    const textureKey = type === 'SCOUT' ? 'raider_scout' : (type === 'MISSILE' ? 'raider_missile' : 'raider_heavy');
    super(scene, x, y, textureKey);

    this.raiderType = type;
    this.aiState = initialState;
    this.maxHealth = type === 'SCOUT' ? 75 : (type === 'MISSILE' ? 140 : 260);
    this.health = this.maxHealth;
    this.roamSpeed = type === 'SCOUT' ? 55 : (type === 'MISSILE' ? 44 : 36);
    this.combatSpeed = type === 'SCOUT' ? 145 : (type === 'MISSILE' ? 90 : 75);
    this.visionRange = type === 'SCOUT' ? 480 : (type === 'MISSILE' ? 1300 : 580);
    this.loseTargetRange = type === 'MISSILE' ? 1650 : 900;

    this.wanderTarget = new Phaser.Math.Vector2(
      Phaser.Math.Between(300, 3300),
      Phaser.Math.Between(300, 2100)
    );
    this.wanderTimer = Phaser.Math.Between(6, 14);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);

    this.setDepth(9);
    this.flakGraphic = scene.add.graphics();
    this.flakGraphic.setDepth(11);

    this.statusLabel = scene.add.text(x, y - 24, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#737373',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);

    this.updateStatusVisuals();
  }

  public takeDamage(amount: number) {
    this.health -= amount;
    // Taking fire immediately alerts and provokes the exile airship
    if (this.aiState === 'ROAMING') {
      this.aiState = 'ENGAGING';
      this.updateStatusVisuals();
    }

    this.setTint(0xffffff);
    this.scene.time.delayedCall(50, () => {
      if (this.active) {
        this.clearTint();
      }
    });

    if (this.health <= 0) {
      this.explode();
    }
  }

  private explode() {
    soundSynth.playFlakBurst();
    this.scene.cameras.main.shake(120, 0.007);

    const emitter = this.scene.add.particles(this.x, this.y, 'particle_spark', {
      speed: { min: 60, max: 220 },
      scale: { start: 1.3, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 380,
      emitting: false,
    });
    emitter.explode(20);
    this.scene.time.delayedCall(400, () => emitter.destroy());

    this.destroy();
  }

  public updateRaider(time: number, delta: number, targets: CombatTarget[]) {
    if (!this.active) return;

    // Convoy ships despawn when they reach the EXIT edge (never at the entry side).
    // World bounds keep them inside, so watch for proximity to the exit edge.
    if (this.convoyMode && this.aiState === 'ROAMING') {
      const hx = Math.cos(this.convoyHeading);
      const hy = Math.sin(this.convoyHeading);
      const nearExit =
        (hx > 0.3 && this.x >= 3600 - 60) ||
        (hx < -0.3 && this.x <= 60) ||
        (hy > 0.3 && this.y >= 2400 - 60) ||
        (hy < -0.3 && this.y <= 60);
      if (nearExit) {
        this.destroy();
        return;
      }
    }

    const dt = delta / 1000;
    this.flakGraphic.clear();

    // Find closest active fleet ship or airborne drone
    let closestTarget: CombatTarget | null = null;
    let minDist = 99999;

    for (const t of targets) {
      if (!t.active) continue;
      if ('isDestroyed' in t && t.isDestroyed) continue;
      if (t instanceof CarrierDrone && (t.state === 'DOCKED' || t.state === 'REBUILDING' || !t.visible)) continue;
      if (t instanceof UnionCorvette && (t.state === 'REBUILDING' || !t.visible)) continue;

      const d = Phaser.Math.Distance.Between(this.x, this.y, t.x, t.y);
      if (d < minDist) {
        minDist = d;
        closestTarget = t;
      }
    }

    // AI State Transitions
    if (this.aiState === 'ROAMING') {
      if (this.convoyMode) {
        // Convoy: hold a fixed straight heading and ignore nearby targets until fired upon
        this.rotation = this.convoyHeading;
        this.scene.physics.velocityFromRotation(this.convoyHeading, this.convoySpeed, this.body?.velocity);
        this.statusLabel.setPosition(this.x, this.y - 24);
        return;
      }

      // Check if any fleet ship or drone entered visual detection radius
      if (closestTarget && minDist <= this.visionRange) {
        this.aiState = 'ENGAGING';
        this.updateStatusVisuals();
      } else {
        // Execute Peaceful Wasteland Roaming / Patrol
        this.wanderTimer -= dt;
        const distToWander = Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        
        if (distToWander < 60 || this.wanderTimer <= 0) {
          this.wanderTarget.set(
            Phaser.Math.Between(350, 3250),
            Phaser.Math.Between(300, 2100)
          );
          this.wanderTimer = Phaser.Math.Between(8, 16);
        }

        const angleToWander = Phaser.Math.Angle.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, angleToWander, 1.2 * dt);
        this.scene.physics.velocityFromRotation(this.rotation, this.roamSpeed, this.body?.velocity);

        // Keep label updated
        this.statusLabel.setPosition(this.x, this.y - 24);
        return;
      }
    }

    // ENGAGING State
    if (this.aiState === 'ENGAGING') {
      if (!closestTarget || minDist > this.loseTargetRange) {
        // Lost line of sight -> resume wandering
        this.aiState = 'ROAMING';
        this.wanderTimer = 3;
        this.updateStatusVisuals();
        this.statusLabel.setPosition(this.x, this.y - 24);
        return;
      }

      const dist = minDist;
      const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, closestTarget.x, closestTarget.y);
      this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, angleToTarget, 2.8 * dt);

      this.attackCooldown -= dt;

      if (this.raiderType === 'SCOUT') {
        this.scene.physics.velocityFromRotation(this.rotation, this.combatSpeed, this.body?.velocity);

        // Scout combat behavior
        if (closestTarget instanceof CarrierDrone) {
          // Fire anti-drone plasma repeater
          if (this.attackCooldown <= 0 && dist < 320) {
            this.attackCooldown = 0.45;
            soundSynth.playLaserPulse();

            this.flakGraphic.lineStyle(1.8, 0xff4444, 0.95);
            this.flakGraphic.lineBetween(this.x, this.y, closestTarget.x, closestTarget.y);

            closestTarget.takeDamage(18);

            this.scene.time.delayedCall(60, () => {
              if (this.flakGraphic && this.flakGraphic.active) {
                this.flakGraphic.clear();
              }
            });
          }
        } else {
          // Ram heavy capital ships
          if (dist < 75) {
            closestTarget.takeDamage(45);
            this.explode();
          }
        }
      } else if (this.raiderType === 'MISSILE') {
        // Long-range missile frigate kiting & standoff positioning
        if (dist > 1000) {
          this.scene.physics.velocityFromRotation(this.rotation, this.combatSpeed, this.body?.velocity);
        } else if (dist < 700) {
          // Kites away if player or fleet gets too close
          this.scene.physics.velocityFromRotation(this.rotation + Math.PI, this.combatSpeed * 0.85, this.body?.velocity);
        } else {
          // Tactical standoff strafe / orbit
          const strafeAngle = this.rotation + Math.PI * 0.5;
          this.scene.physics.velocityFromRotation(strafeAngle, this.combatSpeed * 0.55, this.body?.velocity);
        }

        // Launch long-range guided missile from extreme standoff range (1.5x original 850px)
        if (this.attackCooldown <= 0 && dist <= 1275) {
          this.attackCooldown = 3.8;
          soundSynth.playMissileLaunch();

          const missile = new RaiderMissile(this.scene, this.x, this.y, this.rotation, closestTarget);
          if ((this.scene as any).activeMissiles) {
            (this.scene as any).activeMissiles.push(missile);
          }

          // Silo exhaust flash
          this.flakGraphic.lineStyle(2.0, 0xfacc15, 0.95);
          const rad = this.rotation;
          const m1X = this.x + Math.cos(rad) * 14 - Math.sin(rad) * 12;
          const m1Y = this.y + Math.sin(rad) * 14 + Math.cos(rad) * 12;
          const m2X = this.x + Math.cos(rad) * 14 + Math.sin(rad) * 12;
          const m2Y = this.y + Math.sin(rad) * 14 - Math.cos(rad) * 12;
          this.flakGraphic.lineBetween(this.x, this.y, m1X, m1Y);
          this.flakGraphic.lineBetween(this.x, this.y, m2X, m2Y);

          this.scene.time.delayedCall(75, () => {
            if (this.flakGraphic && this.flakGraphic.active) {
              this.flakGraphic.clear();
            }
          });
        }
      } else { // HEAVY
        if (dist > 320) {
          this.scene.physics.velocityFromRotation(this.rotation, this.combatSpeed, this.body?.velocity);
        } else if (dist < 200) {
          this.scene.physics.velocityFromRotation(this.rotation + Math.PI, this.combatSpeed * 0.7, this.body?.velocity);
        } else {
          this.body?.velocity.scale(0.92);
        }

        if (this.attackCooldown <= 0) {
          if (closestTarget instanceof CarrierDrone) {
            // Rapid anti-air flak turret on drones
            if (dist < 420) {
              this.attackCooldown = 0.55;
              soundSynth.playFlakBurst();

              this.flakGraphic.lineStyle(2.0, 0xff3333, 0.95);
              this.flakGraphic.lineBetween(this.x, this.y, closestTarget.x, closestTarget.y);

              closestTarget.takeDamage(20);

              this.scene.time.delayedCall(60, () => {
                if (this.flakGraphic && this.flakGraphic.active) {
                  this.flakGraphic.clear();
                }
              });
            }
          } else {
            // Heavy capital ship artillery
            if (dist < 580) {
              this.attackCooldown = 1.8;
              soundSynth.playHeavyCannon();

              // High intensity red-white plasma tracer
              this.flakGraphic.lineStyle(2.8, 0xff5555, 0.95);
              this.flakGraphic.lineBetween(this.x, this.y, closestTarget.x, closestTarget.y);
              
              closestTarget.takeDamage(38);

              this.scene.time.delayedCall(70, () => {
                if (this.flakGraphic && this.flakGraphic.active) {
                  this.flakGraphic.clear();
                }
              });
            }
          }
        }
      }

      this.statusLabel.setPosition(this.x, this.y - 24);
    }
  }

  private updateStatusVisuals() {
    if (this.aiState === 'ROAMING') {
      this.statusLabel.setText(`[EXILE ${this.raiderType} // PATROL]`);
      this.statusLabel.setColor('#737373');
      this.clearTint();
    } else {
      this.statusLabel.setText(`[EXILE ${this.raiderType} // ENGAGING]`);
      this.statusLabel.setColor('#ef4444');
    }
  }

  public destroy(fromScene?: boolean) {
    if (this.flakGraphic) this.flakGraphic.destroy();
    if (this.statusLabel) this.statusLabel.destroy();
    super.destroy(fromScene);
  }
}

