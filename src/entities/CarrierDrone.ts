import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { RaiderAirship } from './RaiderAirship';
import { EscortCarrier } from './EscortCarrier';

export type DroneState = 'DOCKED' | 'TRANSIT_TO_WAYPOINT' | 'COMBAT_ENGAGE' | 'RETURN_TO_CARRIER' | 'REBUILDING';

export class CarrierDrone extends Phaser.Physics.Arcade.Sprite {
  public carrier: EscortCarrier;
  public droneIndex: number;
  public state: DroneState = 'DOCKED';

  public maxAmmo: number = 8;
  public ammo: number = 8;
  public maxHealth: number = 35;
  public health: number = 35;

  private speed: number = 240;
  private fireCooldown: number = 0;
  private orbitAngle: number = 0;
  private noTargetTimer: number = 0;

  private laserGraphic: Phaser.GameObjects.Graphics;
  private hpGraphic: Phaser.GameObjects.Graphics;
  private engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, carrier: EscortCarrier, index: number) {
    super(scene, carrier.x, carrier.y, 'drone');
    this.carrier = carrier;
    this.droneIndex = index;
    this.orbitAngle = (index / 4) * Math.PI * 2;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDamping(true);
    this.setDrag(0.85);
    this.setDepth(10);

    // Drones start docked and completely hidden inside the carrier
    this.setVisible(false);
    this.setActive(true);

    this.laserGraphic = scene.add.graphics().setDepth(12);
    this.hpGraphic = scene.add.graphics().setDepth(12);

    this.engineEmitter = scene.add.particles(0, 0, 'particle_smoke', {
      speed: { min: 8, max: 20 },
      scale: { start: 0.16, end: 0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 140,
      emitting: false,
    });
    this.engineEmitter.setDepth(8);
  }

  public launchToward(targetWaypoint: Phaser.Math.Vector2) {
    if (this.state === 'REBUILDING') return;

    if (this.state === 'DOCKED') {
      // Scatter launch position around the carrier so drones don't stack on a single point
      const angle = this.droneIndex * (Math.PI * 2 / 4) + Math.PI / 4;
      const radius = 22;
      this.setPosition(
        this.carrier.x + Math.cos(angle) * radius,
        this.carrier.y + Math.sin(angle) * radius,
      );
    }

    // Seamless course redirection for airborne drones
    this.setVisible(true);
    this.state = 'TRANSIT_TO_WAYPOINT';
    this.noTargetTimer = 0;
  }

  public takeDamage(amount: number) {
    if (this.state === 'REBUILDING' || this.state === 'DOCKED') return;
    this.health -= amount;

    // Flash clean white on damage impact instead of red (to prevent confusing with hostile red units)
    this.setTint(0xffffff);
    this.scene.time.delayedCall(45, () => {
      if (this.active && this.state !== 'REBUILDING') this.clearTint();
    });

    if (this.health <= 0) {
      this.explode();
    }
  }

  private explode() {
    this.state = 'REBUILDING';
    soundSynth.playFlakBurst();

    const emitter = this.scene.add.particles(this.x, this.y, 'particle_spark', {
      speed: { min: 30, max: 120 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 250,
      emitting: false,
    });
    emitter.explode(10);
    this.scene.time.delayedCall(300, () => emitter.destroy());

    this.setVisible(false);
    this.setActive(false);
    if (this.body) this.body.enable = false;
    this.laserGraphic.clear();
    this.hpGraphic.clear();
    this.engineEmitter.emitting = false;

    // If all drones of this carrier are now destroyed, immediately clear the strike targeting reticles
    const remainingActive = this.carrier.drones.filter(d => d.state !== 'REBUILDING' && d !== this);
    if (remainingActive.length === 0) {
      this.carrier.droneTargets = [];
      this.carrier.clearDroneTarget();
    }
  }

  public rebuild() {
    this.health = this.maxHealth;
    this.ammo = this.maxAmmo;
    this.state = 'DOCKED';
    this.setPosition(this.carrier.x, this.carrier.y);
    this.setVisible(false);
    this.setActive(true);
    if (this.body) {
      this.body.enable = true;
      this.body.velocity.set(0, 0);
    }
  }

  public updateDrone(time: number, delta: number, enemies: RaiderAirship[], targetWaypoint: Phaser.Math.Vector2 | null) {
    const dt = delta / 1000;
    this.laserGraphic.clear();
    this.hpGraphic.clear();

    if (this.state === 'REBUILDING') return;

    // If carrier is destroyed, drone is lost
    if (this.carrier.isDestroyed || !this.carrier.active) {
      this.explode();
      return;
    }

    this.orbitAngle += 2.2 * dt;

    if (this.state === 'DOCKED') {
      // Stowed inside the carrier hangar bay - completely invisible and follows carrier position
      this.setPosition(this.carrier.x, this.carrier.y);
      this.setVisible(false);
      this.engineEmitter.emitting = false;
      this.ammo = this.maxAmmo;

      // Actively regenerate health while docked inside carrier (25 HP/sec)
      if (this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + 25 * dt);
      }
      return;
    }

    // Drone is active in flight -> ensure visible
    this.setVisible(true);

    if (this.state === 'TRANSIT_TO_WAYPOINT') {
      if (!targetWaypoint) {
        this.state = 'RETURN_TO_CARRIER';
        return;
      }

      const distToWp = Phaser.Math.Distance.Between(this.x, this.y, targetWaypoint.x, targetWaypoint.y);
      if (distToWp <= 90) {
        // Reached destination waypoint -> switch to combat engagement!
        this.state = 'COMBAT_ENGAGE';
        this.noTargetTimer = 0;
      } else {
        // Fly toward destination waypoint with a per-drone formation offset so the
        // wing spreads out instead of stacking on a single point
        const angleToWp = Phaser.Math.Angle.Between(this.x, this.y, targetWaypoint.x, targetWaypoint.y);
        const spread = (this.droneIndex - 1.5) * 34;
        const perpX = -Math.sin(angleToWp);
        const perpY = Math.cos(angleToWp);
        this.steerToward(targetWaypoint.x + perpX * spread, targetWaypoint.y + perpY * spread, this.speed, dt);

        // Attack enemies of opportunity while in flight (missiles first, no course change)
        this.fireCooldown -= dt;
        let flybyTarget: { x: number; y: number; takeDamage: (dmg: number) => void } | null = null;
        let flybyDist = 350;

        const missiles: any[] = (this.scene as any).activeMissiles || [];
        for (const m of missiles) {
          if (!m.active || m.health <= 0) continue;
          const d = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
          if (d < flybyDist) {
            flybyDist = d;
            flybyTarget = m;
          }
        }

        if (!flybyTarget) {
          for (const enemy of enemies) {
            if (!enemy.active || enemy.health <= 0) continue;
            const d = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
            if (d < flybyDist) {
              flybyDist = d;
              flybyTarget = enemy;
            }
          }
        }

        if (flybyTarget) {
          this.tryFireAt(flybyTarget);
        }
      }
    } else if (this.state === 'COMBAT_ENGAGE') {
      if (!targetWaypoint) {
        this.state = 'RETURN_TO_CARRIER';
        return;
      }

      // If out of ammo, return to carrier immediately
      if (this.ammo <= 0) {
        this.state = 'RETURN_TO_CARRIER';
        return;
      }

      // Check if there are any active hostiles or incoming missiles within sector range of the target waypoint
      let targetToAttack: { x: number; y: number; takeDamage: (dmg: number) => void } | null = null;
      let minDist = 450;

      // 1. Point defense check for nearby missiles
      const missiles: any[] = (this.scene as any).activeMissiles || [];
      for (const m of missiles) {
        if (!m.active || m.health <= 0) continue;
        const distToDrone = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
        if (distToDrone < 350 && distToDrone < minDist) {
          minDist = distToDrone;
          targetToAttack = m;
        }
      }

      // 2. Check for raider airships if no immediate missile target
      if (!targetToAttack) {
        for (const enemy of enemies) {
          if (!enemy.active) continue;
          const distToWp = Phaser.Math.Distance.Between(targetWaypoint.x, targetWaypoint.y, enemy.x, enemy.y);
          const distToDrone = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);

          if (distToWp < 550 && distToDrone < minDist) {
            minDist = distToDrone;
            targetToAttack = enemy;
          }
        }
      }

      // If NO TARGETS are in the area, advance to next target or return to carrier
      if (!targetToAttack) {
        this.noTargetTimer += dt;
        if (this.noTargetTimer >= 0.4) {
          if (this.carrier.hasMoreDroneTargets()) {
            this.carrier.advanceDroneTarget();
            this.noTargetTimer = 0;
            return;
          } else {
            this.state = 'RETURN_TO_CARRIER';
            this.carrier.clearDroneTarget();
            return;
          }
        }
      } else {
        this.noTargetTimer = 0;
      }

      // Combat engagement orbit around target waypoint
      const patrolX = targetWaypoint.x + Math.cos(this.orbitAngle * 1.5 + this.droneIndex * 1.57) * 45;
      const patrolY = targetWaypoint.y + Math.sin(this.orbitAngle * 1.5 + this.droneIndex * 1.57) * 45;
      this.steerToward(patrolX, patrolY, this.speed * 0.75, dt);

      // Attack closest enemy / missile in weapon range
      this.fireCooldown -= dt;
      if (targetToAttack && minDist < 350) {
        if (this.tryFireAt(targetToAttack)) {
          // Aim the drone nose at the target for visual fidelity
          const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, targetToAttack.x, targetToAttack.y);
          this.rotation = angleToTarget;
        }
      }
    } else if (this.state === 'RETURN_TO_CARRIER') {
      const distToCarrier = Phaser.Math.Distance.Between(this.x, this.y, this.carrier.x, this.carrier.y);
      if (distToCarrier <= 40) {
        // Docked inside carrier -> stow and hide
        this.state = 'DOCKED';
        this.setVisible(false);
        this.setPosition(this.carrier.x, this.carrier.y);
        this.ammo = this.maxAmmo;
        this.engineEmitter.emitting = false;
        return;
      } else {
        this.steerToward(this.carrier.x, this.carrier.y, this.speed * 1.2, dt);
      }
    }

    // Thruster trail for flying drones
    if (this.visible && this.body && this.body.velocity.length() > 30) {
      const rearX = this.x - Math.cos(this.rotation) * 10;
      const rearY = this.y - Math.sin(this.rotation) * 10;
      this.engineEmitter.setPosition(rearX, rearY);
      this.engineEmitter.emitting = true;
    } else {
      this.engineEmitter.emitting = false;
    }

    // Render Small Tactical HP Bar Below Drone (unified 0xfacc15 palette)
    if (this.visible) {
      const hpRatio = Math.max(0, this.health / this.maxHealth);
      const barW = 16;
      const barH = 2.5;
      const barX = this.x - barW / 2;
      const barY = this.y + 13;

      // Dark background
      this.hpGraphic.fillStyle(0x000000, 0.85);
      this.hpGraphic.fillRect(barX, barY, barW, barH);

      // Unified amber fill
      this.hpGraphic.fillStyle(0xfacc15, 0.95);
      this.hpGraphic.fillRect(barX, barY, barW * hpRatio, barH);

      // Unified amber border
      this.hpGraphic.lineStyle(0.8, 0xfacc15, 0.5);
      this.hpGraphic.strokeRect(barX, barY, barW, barH);
    }
  }

  // Fire a laser volley at a target. Returns true if a shot was actually fired.
  // Does NOT alter drone rotation so it can be used while in transit without breaking steering.
  private tryFireAt(target: { x: number; y: number; takeDamage: (dmg: number) => void }): boolean {
    if (this.fireCooldown > 0 || this.ammo <= 0) return false;

    this.fireCooldown = 1.05; // 3x slower attack interval (1.05s vs 0.35s)
    this.ammo--;

    this.laserGraphic.lineStyle(2.0, 0xfacc15, 0.95);
    this.laserGraphic.lineBetween(this.x, this.y, target.x, target.y);
    soundSynth.playLaserPulse();
    target.takeDamage(40); // 25% damage reduction (54 -> 40)

    this.scene.time.delayedCall(70, () => {
      if (this.laserGraphic && this.laserGraphic.active) {
        this.laserGraphic.clear();
      }
    });

    if (this.ammo <= 0) {
      this.state = 'RETURN_TO_CARRIER';
    }
    return true;
  }

  private steerToward(tx: number, ty: number, maxSpeed: number, dt: number) {
    const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const angleDiff = Phaser.Math.Angle.Wrap(targetAngle - this.rotation);

    if (Math.abs(angleDiff) > 0.08) {
      const turnDir = angleDiff > 0 ? 1 : -1;
      this.setAngularVelocity(turnDir * 380);
    } else {
      this.setAngularVelocity(0);
      this.rotation = targetAngle;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const speedFactor = Math.min(1.0, dist / 40);
    const forwardVector = this.scene.physics.velocityFromRotation(this.rotation, 1);
    this.body?.velocity.add(new Phaser.Math.Vector2(
      forwardVector.x * maxSpeed * 3.8 * speedFactor * dt,
      forwardVector.y * maxSpeed * 3.8 * speedFactor * dt
    ));

    if (this.body?.velocity && this.body.velocity.length() > maxSpeed) {
      this.body.velocity.scale(maxSpeed / this.body.velocity.length());
    }
  }

  public destroy(fromScene?: boolean) {
    this.laserGraphic.destroy();
    this.hpGraphic.destroy();
    this.engineEmitter.destroy();
    super.destroy(fromScene);
  }
}
