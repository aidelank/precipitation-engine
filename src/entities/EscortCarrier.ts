import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { RaiderAirship } from './RaiderAirship';
import { CarrierDrone } from './CarrierDrone';

export class EscortCarrier extends Phaser.Physics.Arcade.Sprite {
  public shipId: number; // 2..9
  public callsign: string;

  public maxHull: number = 100;
  public hull: number = 100;

  public waypoints: Phaser.Math.Vector2[] = [];
  public droneTargets: Phaser.Math.Vector2[] = [];
  public drones: CarrierDrone[] = [];
  public maxDrones: number = 4;

  public get droneTargetWaypoint(): Phaser.Math.Vector2 | null {
    return this.droneTargets.length > 0 ? this.droneTargets[0] : null;
  }

  public isSelected: boolean = false;
  public isDestroyed: boolean = false;
  public respawnTimer: number = 0;
  public maxRespawnTime: number = 16; // seconds

  private baseSpeed: number = 130;
  private turnRate: number = 2.4;
  private lastDamageTime: number = 0;
  private droneRebuildTimer: number = 0;
  private deckFireCooldown: number = 0;

  private tacticalOverlay: Phaser.GameObjects.Graphics;
  private waypointGraphics: Phaser.GameObjects.Graphics;
  private droneTargetGraphics: Phaser.GameObjects.Graphics;
  private deckLaserGraphic: Phaser.GameObjects.Graphics;
  private statusText: Phaser.GameObjects.Text;
  private engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, x: number, y: number, shipId: number) {
    super(scene, x, y, 'escort_carrier');
    this.shipId = shipId;
    this.callsign = `DPC-AEGIS-0${shipId}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDamping(true);
    this.setDrag(0.86);
    this.setAngularDrag(0.75);
    this.setDepth(9);

    this.waypointGraphics = scene.add.graphics().setDepth(7);
    this.droneTargetGraphics = scene.add.graphics().setDepth(8);
    this.deckLaserGraphic = scene.add.graphics().setDepth(10);
    this.tacticalOverlay = scene.add.graphics().setDepth(11);

    this.statusText = scene.add.text(x, y + 36, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '9px',
      color: '#facc15',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);

    this.engineEmitter = scene.add.particles(0, 0, 'particle_smoke', {
      speed: { min: 20, max: 60 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 260,
      emitting: false,
    });
    this.engineEmitter.setDepth(8);

    // Initialize 4 carrier strike drones
    for (let i = 0; i < this.maxDrones; i++) {
      const drone = new CarrierDrone(scene, this, i);
      this.drones.push(drone);
    }
  }

  // Left-Click: Dispatches Strike Drones to target coordinate (Clears previous queue)
  public dispatchDronesTo(x: number, y: number) {
    if (this.isDestroyed) return;
    const activeDrones = this.drones.filter(d => d.state !== 'REBUILDING');
    if (activeDrones.length === 0) {
      soundSynth.playDamageAlert();
      return;
    }

    this.droneTargets = [new Phaser.Math.Vector2(x, y)];
    soundSynth.playWaypointOrder();

    // Launch stowed drones and redirect active drones to first target area
    for (const drone of this.drones) {
      if (drone.state !== 'REBUILDING') {
        drone.launchToward(this.droneTargets[0]);
      }
    }
  }

  // Shift + Left-Click: Queues an additional strike target waypoint
  public addDroneTarget(x: number, y: number) {
    if (this.isDestroyed) return;
    const activeDrones = this.drones.filter(d => d.state !== 'REBUILDING');
    if (activeDrones.length === 0) {
      soundSynth.playDamageAlert();
      return;
    }

    const newTarget = new Phaser.Math.Vector2(x, y);
    this.droneTargets.push(newTarget);
    soundSynth.playWaypointOrder();

    // If drones are currently docked or returning, launch them toward first target
    for (const drone of this.drones) {
      if (drone.state === 'DOCKED' || drone.state === 'RETURN_TO_CARRIER') {
        drone.launchToward(this.droneTargets[0]);
      }
    }
  }

  public hasMoreDroneTargets(): boolean {
    return this.droneTargets.length > 1;
  }

  public advanceDroneTarget(): boolean {
    if (this.droneTargets.length > 1) {
      this.droneTargets.shift();
      const nextTarget = this.droneTargets[0];
      for (const drone of this.drones) {
        if (drone.state !== 'REBUILDING' && drone.ammo > 0) {
          drone.launchToward(nextTarget);
        }
      }
      return true;
    } else {
      this.clearDroneTarget();
      return false;
    }
  }

  public clearDroneTarget() {
    this.droneTargets = [];
    soundSynth.playWaypointCancel();
    for (const drone of this.drones) {
      if (drone.state !== 'REBUILDING' && drone.state !== 'DOCKED') {
        drone.state = 'RETURN_TO_CARRIER';
      }
    }
  }

  // Right-Click: Carrier Navigation Waypoints
  public setWaypoint(x: number, y: number) {
    if (this.isDestroyed) return;
    this.waypoints = [new Phaser.Math.Vector2(x, y)];
    soundSynth.playWaypointOrder();
  }

  public addWaypoint(x: number, y: number) {
    if (this.isDestroyed) return;
    this.waypoints.push(new Phaser.Math.Vector2(x, y));
    soundSynth.playWaypointOrder();
  }

  public clearWaypoints() {
    this.waypoints = [];
  }

  // Cancel Waypoint on re-click (applies to both ship waypoints and drone targets)
  public tryCancelWaypoint(wx: number, wy: number, threshold: number = 28): boolean {
    // 1. Check queued drone strike waypoints
    for (let i = 0; i < this.droneTargets.length; i++) {
      const dt = this.droneTargets[i];
      const dist = Phaser.Math.Distance.Between(wx, wy, dt.x, dt.y);
      if (dist <= threshold) {
        if (i === 0) {
          if (this.droneTargets.length > 1) {
            this.advanceDroneTarget();
          } else {
            this.clearDroneTarget();
          }
        } else {
          this.droneTargets.splice(i, 1);
          soundSynth.playWaypointCancel();
        }
        return true;
      }
    }

    // 2. Check ship navigation waypoints
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const dist = Phaser.Math.Distance.Between(wx, wy, wp.x, wp.y);
      if (dist <= threshold) {
        this.waypoints.splice(i, 1);
        soundSynth.playWaypointCancel();
        return true;
      }
    }

    return false;
  }

  public takeDamage(amount: number) {
    if (this.isDestroyed) return;
    this.lastDamageTime = this.scene.time.now;
    soundSynth.playDamageAlert();
    this.setTint(0xff4444);
    this.scene.time.delayedCall(60, () => {
      if (this.active && !this.isDestroyed) this.clearTint();
    });

    this.hull = Math.max(0, this.hull - amount);

    if (this.hull <= 0) {
      this.hull = 0;
      this.destroyShip();
    }
  }

  public repair(amount: number) {
    if (!this.isDestroyed && this.hull < this.maxHull) {
      this.hull = Math.min(this.maxHull, this.hull + amount);
    }
  }

  private destroyShip() {
    this.isDestroyed = true;
    this.respawnTimer = this.maxRespawnTime;
    soundSynth.playFlakBurst();
    this.scene.cameras.main.shake(120, 0.007);

    const emitter = this.scene.add.particles(this.x, this.y, 'particle_spark', {
      speed: { min: 50, max: 180 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 380,
      emitting: false,
    });
    emitter.explode(20);
    this.scene.time.delayedCall(400, () => emitter.destroy());

    this.setVisible(false);
    this.setActive(false);
    if (this.body) this.body.enable = false;
    this.clearWaypoints();
    this.droneTargets = [];
    this.tacticalOverlay.clear();
    this.waypointGraphics.clear();
    this.droneTargetGraphics.clear();
    this.deckLaserGraphic.clear();
    this.engineEmitter.emitting = false;
  }

  public respawn(dockX: number, dockY: number) {
    this.isDestroyed = false;
    this.respawnTimer = 0;
    this.hull = this.maxHull;
    this.setPosition(dockX + (this.shipId % 3 - 1) * 60, dockY + 80 + Math.floor(this.shipId / 3) * 50);
    this.setRotation(0);
    this.setVisible(true);
    this.setActive(true);
    if (this.body) {
      this.body.enable = true;
      this.body.velocity.set(0, 0);
    }
    // Rebuild all drones
    for (const drone of this.drones) {
      drone.rebuild();
    }
    soundSynth.playRespawnSound();
  }

  public updateCarrier(time: number, delta: number, enemies: RaiderAirship[], dockX: number, dockY: number) {
    const dt = delta / 1000;
    this.deckLaserGraphic.clear();

    if (this.isDestroyed) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.respawn(dockX, dockY);
      }
      return;
    }

    // Direct Onboard Deck Battery (Point defense - prioritizes incoming missiles, then hostiles)
    let targetToAttack: { x: number; y: number; takeDamage: (dmg: number) => void } | null = null;
    let minDist = 340;

    const missiles: any[] = (this.scene as any).activeMissiles || [];
    for (const m of missiles) {
      if (!m.active || m.health <= 0) continue;
      const dist = Phaser.Math.Distance.Between(this.x, this.y, m.x, m.y);
      if (dist < minDist) {
        minDist = dist;
        targetToAttack = m;
      }
    }

    if (!targetToAttack) {
      for (const enemy of enemies) {
        if (!enemy.active || enemy.health <= 0) continue;
        const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
        if (dist < minDist) {
          minDist = dist;
          targetToAttack = enemy;
        }
      }
    }

    this.deckFireCooldown -= dt;
    if (targetToAttack && this.deckFireCooldown <= 0) {
      this.deckFireCooldown = 1.05; // 3x slower attack interval (1.05s vs 0.35s)
      targetToAttack.takeDamage(40); // 25% damage reduction (54 -> 40)
      soundSynth.playLaserPulse();

      this.deckLaserGraphic.lineStyle(2.4, 0xfacc15, 0.95);
      this.deckLaserGraphic.lineBetween(this.x, this.y, targetToAttack.x, targetToAttack.y);

      this.scene.time.delayedCall(70, () => {
        if (this.deckLaserGraphic && this.deckLaserGraphic.active) {
          this.deckLaserGraphic.clear();
        }
      });
    }

    // Drone Rebuild Loop (rebuilds destroyed drones after a couple seconds)
    const deadDrone = this.drones.find(d => d.state === 'REBUILDING');
    if (deadDrone) {
      this.droneRebuildTimer += dt;
      if (this.droneRebuildTimer >= 3.5) {
        deadDrone.rebuild();
        this.droneRebuildTimer = 0;
      }
    } else {
      this.droneRebuildTimer = 0;
    }

    // Update Carrier's Drones and check active drone wing status
    const activeDrones = this.drones.filter(d => d.state !== 'REBUILDING');
    if (activeDrones.length === 0 && this.droneTargets.length > 0) {
      this.droneTargets = [];
      this.droneTargetGraphics.clear();
    }

    for (const drone of this.drones) {
      drone.updateDrone(time, delta, enemies, this.droneTargetWaypoint);
    }

    // Navigation along waypoints
    let throttle = 0;
    if (this.waypoints.length > 0) {
      const targetWp = this.waypoints[0];
      const distToWp = Phaser.Math.Distance.Between(this.x, this.y, targetWp.x, targetWp.y);

      if (distToWp <= 24) {
        this.waypoints.shift();
        if (this.waypoints.length === 0) {
          this.body?.velocity.scale(0.75);
          this.setAngularVelocity(0);
        }
      } else {
        const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, targetWp.x, targetWp.y);
        const angleDiff = Phaser.Math.Angle.Wrap(targetAngle - this.rotation);

        if (Math.abs(angleDiff) > 0.06) {
          const turnDir = angleDiff > 0 ? 1 : -1;
          const turnVelocity = Math.min(Math.abs(angleDiff) * 8, this.turnRate);
          this.setAngularVelocity(Phaser.Math.RadToDeg(turnDir * turnVelocity));
        } else {
          this.setAngularVelocity(0);
          this.rotation = targetAngle;
        }

        const alignmentFactor = Math.max(0, Math.cos(angleDiff));
        if (alignmentFactor > 0.3) {
          let speedFactor = 1.0;
          if (distToWp < 100) speedFactor = Math.max(0.25, distToWp / 100);
          throttle = alignmentFactor * speedFactor;

          const forwardVector = this.scene.physics.velocityFromRotation(this.rotation, 1);
          this.body?.velocity.add(new Phaser.Math.Vector2(
            forwardVector.x * this.baseSpeed * 3.0 * throttle * dt,
            forwardVector.y * this.baseSpeed * 3.0 * throttle * dt
          ));
        }
      }
    } else {
      this.body?.velocity.scale(0.92);
      this.setAngularVelocity(0);
    }

    const maxVelocity = this.baseSpeed * 1.3;
    if (this.body?.velocity && this.body.velocity.length() > maxVelocity) {
      this.body.velocity.scale(maxVelocity / this.body.velocity.length());
    }

    // Particle thruster
    if (throttle > 0.1) {
      const rearX = this.x - Math.cos(this.rotation) * 24;
      const rearY = this.y - Math.sin(this.rotation) * 24;
      this.engineEmitter.setPosition(rearX, rearY);
      this.engineEmitter.emitting = true;
    } else {
      this.engineEmitter.emitting = false;
    }

    this.renderWaypointLines();
    this.renderDroneTargetZone();
    this.renderSpatialOverlay();
  }

  private renderWaypointLines() {
    this.waypointGraphics.clear();
    if (this.waypoints.length === 0 || !this.isSelected) return;

    this.waypointGraphics.lineStyle(1.5, 0xfacc15, 0.75);

    let fromX = this.x;
    let fromY = this.y;

    this.waypoints.forEach((wp, idx) => {
      this.waypointGraphics.lineBetween(fromX, fromY, wp.x, wp.y);
      const isFirst = idx === 0;
      const markerSize = isFirst ? 8 : 5;

      this.waypointGraphics.lineStyle(1.5, 0xfacc15, isFirst ? 0.9 : 0.6);
      this.waypointGraphics.strokeRect(wp.x - markerSize, wp.y - markerSize, markerSize * 2, markerSize * 2);
      this.waypointGraphics.fillStyle(0xfacc15, isFirst ? 0.9 : 0.5);
      this.waypointGraphics.fillCircle(wp.x, wp.y, 2);

      fromX = wp.x;
      fromY = wp.y;
    });
  }

  private renderDroneTargetZone() {
    this.droneTargetGraphics.clear();
    const activeDrones = this.drones.filter(d => d.state !== 'REBUILDING');
    if (this.droneTargets.length === 0 || activeDrones.length === 0) return;

    const baseAlpha = this.isSelected ? 0.9 : 0.45;

    // 1. Render leader line from carrier to first target if selected
    if (this.isSelected && this.droneTargets.length > 0) {
      this.droneTargetGraphics.lineStyle(1, 0xfacc15, 0.3);
      this.droneTargetGraphics.lineBetween(this.x, this.y, this.droneTargets[0].x, this.droneTargets[0].y);
    }

    // 2. Render all queued strike targets in sequence
    let prevX = 0;
    let prevY = 0;

    this.droneTargets.forEach((tgt, idx) => {
      const isFirst = idx === 0;
      const alpha = isFirst ? baseAlpha : baseAlpha * 0.65;
      const color = isFirst ? 0xfacc15 : 0xffffff;
      const radius = isFirst ? 48 : 34;

      // Connecting path between queued strike targets
      if (idx > 0) {
        this.droneTargetGraphics.lineStyle(1.2, 0xffffff, 0.4);
        this.droneTargetGraphics.lineBetween(prevX, prevY, tgt.x, tgt.y);
      }

      // Tactical Target Reticle
      this.droneTargetGraphics.lineStyle(1.5, color, alpha);
      this.droneTargetGraphics.strokeCircle(tgt.x, tgt.y, radius);

      // Crosshairs
      const armLen = isFirst ? 18 : 12;
      this.droneTargetGraphics.lineBetween(tgt.x - radius - armLen, tgt.y, tgt.x - radius + 6, tgt.y);
      this.droneTargetGraphics.lineBetween(tgt.x + radius - 6, tgt.y, tgt.x + radius + armLen, tgt.y);
      this.droneTargetGraphics.lineBetween(tgt.x, tgt.y - radius - armLen, tgt.x, tgt.y - radius + 6);
      this.droneTargetGraphics.lineBetween(tgt.x, tgt.y + radius - 6, tgt.x, tgt.y + radius + armLen);

      // Center marker
      this.droneTargetGraphics.fillStyle(color, alpha);
      this.droneTargetGraphics.fillCircle(tgt.x, tgt.y, 3);

      // Strike Badge Frame [S1], [S2]
      const badgeW = 16;
      const badgeH = 10;
      this.droneTargetGraphics.fillStyle(0x000000, 0.85);
      this.droneTargetGraphics.fillRect(tgt.x - badgeW / 2, tgt.y - radius - 14, badgeW, badgeH);
      this.droneTargetGraphics.lineStyle(1, color, alpha);
      this.droneTargetGraphics.strokeRect(tgt.x - badgeW / 2, tgt.y - radius - 14, badgeW, badgeH);

      prevX = tgt.x;
      prevY = tgt.y;
    });
  }

  private renderSpatialOverlay() {
    this.tacticalOverlay.clear();
    if (this.isDestroyed) {
      this.statusText.setText('');
      return;
    }

    const px = this.x;
    const py = this.y;

    const hullRatio = Math.max(0, this.hull / this.maxHull);

    // Selected Tactical Frame
    if (this.isSelected) {
      const bw = 38;
      const bh = 26;
      this.tacticalOverlay.lineStyle(1.5, 0xfacc15, 0.9);
      this.tacticalOverlay.lineBetween(px - bw, py - bh, px - bw + 8, py - bh);
      this.tacticalOverlay.lineBetween(px - bw, py - bh, px - bw, py - bh + 8);
      this.tacticalOverlay.lineBetween(px + bw, py - bh, px + bw - 8, py - bh);
      this.tacticalOverlay.lineBetween(px + bw, py - bh, px + bw, py - bh + 8);
      this.tacticalOverlay.lineBetween(px - bw, py + bh, px - bw + 8, py + bh);
      this.tacticalOverlay.lineBetween(px - bw, py + bh, px - bw, py + bh - 8);
      this.tacticalOverlay.lineBetween(px + bw, py + bh, px + bw - 8, py + bh);
      this.tacticalOverlay.lineBetween(px + bw, py + bh, px + bw, py + bh - 8);
    }

    const activeDrones = this.drones.filter(d => d.state !== 'REBUILDING').length;
    const readyDrones = this.drones.filter(d => d.state === 'DOCKED' || d.state === 'COMBAT_ENGAGE' || d.state === 'TRANSIT_TO_WAYPOINT').length;

    this.statusText.setPosition(px, py + 34);
    const hullBlocks = '█'.repeat(Math.ceil(hullRatio * 8)) + '░'.repeat(8 - Math.ceil(hullRatio * 8));

    this.statusText.setText(
      `[${this.shipId}] ${this.callsign}\n` +
      `HULL [${hullBlocks}] ${Math.floor(this.hull)}/${this.maxHull} HP\n` +
      `DRONES: ${readyDrones}/${activeDrones}`
    );
  }

  public destroy(fromScene?: boolean) {
    this.waypointGraphics.destroy();
    this.droneTargetGraphics.destroy();
    this.deckLaserGraphic.destroy();
    this.tacticalOverlay.destroy();
    this.statusText.destroy();
    this.engineEmitter.destroy();
    for (const drone of this.drones) {
      drone.destroy(fromScene);
    }
    super.destroy(fromScene);
  }
}
