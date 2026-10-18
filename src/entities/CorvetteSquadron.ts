import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { RaiderAirship } from './RaiderAirship';

export type CorvetteWeaponMode = 'RAPID' | 'RAILGUN';

export class CorvetteSquadron extends Phaser.Physics.Arcade.Sprite {
  public shipId: number; // 2..9
  public callsign: string;

  // Lead Corvette (this sprite)
  public maxLeadHull: number = 180;
  public leadHull: number = 180;
  public leadDestroyed: boolean = false;

  // Wingman Corvette (companion sprite)
  public wingman: Phaser.Physics.Arcade.Sprite;
  public maxWingmanHull: number = 180;
  public wingmanHull: number = 180;
  public wingmanDestroyed: boolean = false;

  public get hull(): number {
    return (this.leadDestroyed ? 0 : this.leadHull) + (this.wingmanDestroyed ? 0 : this.wingmanHull);
  }

  public get maxHull(): number {
    return this.maxLeadHull + this.maxWingmanHull;
  }

  public waypoints: Phaser.Math.Vector2[] = [];
  public isSelected: boolean = false;
  public leadRespawnTimer: number = 0;
  public wingmanRespawnTimer: number = 0;
  public readonly maxRespawnTime: number = 14; // seconds per ship

  // Weapon mode: RAPID = short-range fast twin cannons, RAILGUN = long-range heavy cannon
  public weaponMode: CorvetteWeaponMode = 'RAPID';
  public weaponSwitchTimer: number = 0;
  public readonly weaponSwitchDuration: number = 0.75;

  // A squadron is only "destroyed" (dead to GameScene) while BOTH ships are down.
  public get isDestroyed(): boolean {
    return this.leadDestroyed && this.wingmanDestroyed;
  }

  // Remaining seconds until the next destroyed ship rebuilds (for HUD/PDA display).
  public get respawnTimer(): number {
    if (this.leadDestroyed && this.wingmanDestroyed) {
      return Math.max(this.leadRespawnTimer, this.wingmanRespawnTimer);
    }
    if (this.leadDestroyed) return this.leadRespawnTimer;
    if (this.wingmanDestroyed) return this.wingmanRespawnTimer;
    return 0;
  }

  public get isSwitchingWeapon(): boolean {
    return this.weaponSwitchTimer > 0;
  }

  // Left-Click: toggle between RAPID cannons and RAILGUN (0.75s reconfiguration).
  public toggleWeaponMode() {
    if (this.isDestroyed || this.isSwitchingWeapon) return;
    this.weaponSwitchTimer = this.weaponSwitchDuration;
    soundSynth.playWaypointOrder();
  }

  private baseSpeed: number = 195;
  private turnRate: number = 3.2;
  private leadFireCooldown: number = 0;
  private wingmanFireCooldown: number = 0;

  // Mode-dependent combat stats: RAPID (fast twin cannons) vs RAILGUN (slow heavy beam)
  private get weaponStats() {
    if (this.weaponMode === 'RAILGUN') {
      return { range: 720, damage: 90, cooldown: 2.5 };
    }
    return { range: 380, damage: 22, cooldown: 0.36 };
  }

  private tacticalOverlay: Phaser.GameObjects.Graphics;
  private waypointGraphics: Phaser.GameObjects.Graphics;
  private laserGraphic: Phaser.GameObjects.Graphics;
  private hpGraphic: Phaser.GameObjects.Graphics;
  private statusText: Phaser.GameObjects.Text;
  private leadEngineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private wingEngineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, x: number, y: number, shipId: number) {
    super(scene, x, y, 'union_corvette');
    this.shipId = shipId;
    this.callsign = `DPC-CV-SQUAD-0${shipId}`;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDamping(true);
    this.setDrag(0.86);
    this.setAngularDrag(0.75);
    this.setDepth(9);

    // Create companion wingman corvette in tight formation (starboard flank offset)
    const wingX = x - 28;
    const wingY = y + 26;
    this.wingman = scene.physics.add.sprite(wingX, wingY, 'union_corvette');
    this.wingman.setCollideWorldBounds(true);
    this.wingman.setDamping(true);
    this.wingman.setDrag(0.86);
    this.wingman.setDepth(9);

    this.waypointGraphics = scene.add.graphics().setDepth(7);
    this.laserGraphic = scene.add.graphics().setDepth(10);
    this.hpGraphic = scene.add.graphics().setDepth(11);
    this.tacticalOverlay = scene.add.graphics().setDepth(12);

    this.statusText = scene.add.text(x, y + 32, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#facc15',
      align: 'center',
    }).setOrigin(0.5).setDepth(13);

    this.leadEngineEmitter = scene.add.particles(0, 0, 'particle_smoke', {
      speed: { min: 15, max: 40 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 180,
      emitting: false,
    });
    this.leadEngineEmitter.setDepth(8);

    this.wingEngineEmitter = scene.add.particles(0, 0, 'particle_smoke', {
      speed: { min: 15, max: 40 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.35, end: 0 },
      lifespan: 180,
      emitting: false,
    });
    this.wingEngineEmitter.setDepth(8);
  }

  // Right-Click: Movement Waypoints
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
    this.waypointGraphics.clear();
    if (this.body) this.body.velocity.scale(0.5);
    if (this.wingman.body) (this.wingman.body as Phaser.Physics.Arcade.Body).velocity.scale(0.5);
  }

  public tryCancelWaypoint(x: number, y: number, radius: number = 28): boolean {
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      if (Phaser.Math.Distance.Between(x, y, wp.x, wp.y) <= radius) {
        this.waypoints.splice(i, 1);
        soundSynth.playWaypointCancel();
        return true;
      }
    }
    return false;
  }

  public takeDamage(amount: number, targetWingman: boolean = false) {
    soundSynth.playDamageAlert();

    if (targetWingman) {
      if (this.wingmanDestroyed) return;
      this.wingmanHull = Math.max(0, this.wingmanHull - amount);
      this.wingman.setTint(0xffffff);
      this.scene.time.delayedCall(50, () => {
        if (this.wingman.active && !this.wingmanDestroyed) this.wingman.clearTint();
      });
      if (this.wingmanHull <= 0) this.destroyWingmanShip();
    } else {
      // Un-targeted fire hits a living ship: lead first, then the surviving wingman
      if (!this.leadDestroyed) {
        this.leadHull = Math.max(0, this.leadHull - amount);
        this.setTint(0xffffff);
        this.scene.time.delayedCall(50, () => {
          if (this.active && !this.leadDestroyed) this.clearTint();
        });
        if (this.leadHull <= 0) this.destroyLeadShip();
      } else if (!this.wingmanDestroyed) {
        this.wingmanHull = Math.max(0, this.wingmanHull - amount);
        this.wingman.setTint(0xffffff);
        this.scene.time.delayedCall(50, () => {
          if (this.wingman.active && !this.wingmanDestroyed) this.wingman.clearTint();
        });
        if (this.wingmanHull <= 0) this.destroyWingmanShip();
      }
    }
  }

  private destroyLeadShip() {
    this.leadDestroyed = true;
    this.leadRespawnTimer = this.maxRespawnTime;
    soundSynth.playFlakBurst();
    this.explodeAt(this.x, this.y);

    // Hide the destroyed lead; the surviving wingman keeps the squadron live
    this.setVisible(false);
    if (this.body) this.body.enable = false;
    this.leadEngineEmitter.emitting = false;
  }

  private destroyWingmanShip() {
    this.wingmanDestroyed = true;
    this.wingmanRespawnTimer = this.maxRespawnTime;
    soundSynth.playFlakBurst();
    this.explodeAt(this.wingman.x, this.wingman.y);
    this.wingman.setVisible(false);
    if (this.wingman.body) (this.wingman.body as Phaser.Physics.Arcade.Body).enable = false;
    this.wingEngineEmitter.emitting = false;
  }

  private explodeAt(x: number, y: number) {
    const emitter = this.scene.add.particles(x, y, 'particle_spark', {
      speed: { min: 40, max: 160 },
      scale: { start: 1.0, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 300,
      emitting: false,
    });
    emitter.explode(15);
    this.scene.time.delayedCall(350, () => emitter.destroy());
  }

  public repair(amount: number) {
    // Dock repair only heals living hulls; destroyed ships rebuild via their own
    // respawn timers (respawnLead / respawnWingman).
    if (!this.leadDestroyed && this.leadHull < this.maxLeadHull) {
      this.leadHull = Math.min(this.maxLeadHull, this.leadHull + amount);
    }
    if (!this.wingmanDestroyed && this.wingmanHull < this.maxWingmanHull) {
      this.wingmanHull = Math.min(this.maxWingmanHull, this.wingmanHull + amount);
    }
  }

  public respawnLead(dockX: number, dockY: number) {
    this.leadDestroyed = false;
    this.leadRespawnTimer = 0;
    this.leadHull = this.maxLeadHull;

    const spawnX = dockX + (this.shipId % 3 - 1) * 60;
    const spawnY = dockY + 90 + Math.floor(this.shipId / 3) * 50;

    this.setPosition(spawnX, spawnY);
    this.setRotation(Math.PI);
    this.setVisible(true);
    this.setActive(true);
    if (this.body) {
      this.body.enable = true;
      this.body.velocity.set(0, 0);
    }
    soundSynth.playRespawnSound();
  }

  public respawnWingman(dockX: number, dockY: number) {
    this.wingmanDestroyed = false;
    this.wingmanRespawnTimer = 0;
    this.wingmanHull = this.maxWingmanHull;

    const spawnX = dockX + (this.shipId % 3 - 1) * 60;
    const spawnY = dockY + 90 + Math.floor(this.shipId / 3) * 50;

    this.wingman.setPosition(spawnX - 26, spawnY + 26);
    this.wingman.setRotation(Math.PI);
    this.wingman.setVisible(true);
    this.wingman.setActive(true);
    if (this.wingman.body) {
      (this.wingman.body as Phaser.Physics.Arcade.Body).enable = true;
      (this.wingman.body as Phaser.Physics.Arcade.Body).velocity.set(0, 0);
    }
    soundSynth.playRespawnSound();
  }

  public updateSquadron(
    _time: number,
    delta: number,
    enemies: RaiderAirship[],
    dockX: number,
    dockY: number
  ) {
    const dt = delta / 1000;
    this.laserGraphic.clear();
    this.hpGraphic.clear();
    this.tacticalOverlay.clear();
    this.waypointGraphics.clear();

    // Defensive: non-finite coordinates/rotations/velocities corrupt Arcade physics
    // and can hang the whole game with no error. Recover to a sane state if detected.
    if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
      this.setPosition(dockX, dockY);
    }
    if (!Number.isFinite(this.rotation)) {
      this.setRotation(0);
    }
    if (this.body && (!Number.isFinite(this.body.velocity.x) || !Number.isFinite(this.body.velocity.y))) {
      this.body.velocity.set(0, 0);
    }
    if (!Number.isFinite(this.wingman.x) || !Number.isFinite(this.wingman.y)) {
      this.wingman.setPosition(this.x - 26, this.y + 26);
    }
    if (!Number.isFinite(this.wingman.rotation)) {
      this.wingman.setRotation(0);
    }
    if (this.wingman.body && (!Number.isFinite((this.wingman.body as Phaser.Physics.Arcade.Body).velocity.x) || !Number.isFinite((this.wingman.body as Phaser.Physics.Arcade.Body).velocity.y))) {
      (this.wingman.body as Phaser.Physics.Arcade.Body).velocity.set(0, 0);
    }

    // Individual per-ship respawn: each destroyed corvette rebuilds at the Union City
    // dock on its own timer, independent of the other ship's state.
    if (this.leadDestroyed) {
      this.leadRespawnTimer -= dt;
      if (this.leadRespawnTimer <= 0) this.respawnLead(dockX, dockY);
    }
    if (this.wingmanDestroyed) {
      this.wingmanRespawnTimer -= dt;
      if (this.wingmanRespawnTimer <= 0) this.respawnWingman(dockX, dockY);
    }

    // 1. Waypoint Navigation & Movement
    // Survivor state: the lead sprite ("this") and the wingman can be down independently,
    // and the squadron must remain commandable in every combination.
    const leadAlive = !this.leadDestroyed;
    const wingAlive = !this.wingmanDestroyed;

    if (!leadAlive && !wingAlive) {
      // Both ships fabricating at dock
      this.statusText.setPosition(dockX, dockY + 60);
      this.statusText.setText(`[${this.callsign}:FABRICATING ${Math.ceil(Math.max(this.leadRespawnTimer, this.wingmanRespawnTimer))}S]`);
      this.statusText.setColor('#737373');
      return;
    }

    // Weapon-mode switch progress (0.75s reconfiguration; no firing while switching)
    if (this.weaponSwitchTimer > 0) {
      this.weaponSwitchTimer -= dt;
      if (this.weaponSwitchTimer <= 0) {
        this.weaponSwitchTimer = 0;
        this.weaponMode = this.weaponMode === 'RAPID' ? 'RAILGUN' : 'RAPID';
        soundSynth.playUnitSelectSound();
      }
    }

    // Command re-anchor: when the lead is destroyed the surviving wingman becomes the
    // squadron's live position reference for ALL consumers (enemy targeting, missile
    // homing, dock-repair proximity, camera refocus, HUD anchoring). The dead lead sprite
    // stays hidden with its physics body disabled, so mirroring the wingman's position
    // here is inert to physics and simply keeps the entity centered on a ship that flies.
    if (!leadAlive && wingAlive) {
      this.setPosition(this.wingman.x, this.wingman.y);
    }

    // activePos anchors every distance/arrival check on a LIVE ship.
    const activePos = new Phaser.Math.Vector2(leadAlive ? this.x : this.wingman.x, leadAlive ? this.y : this.wingman.y);

    if (this.waypoints.length > 0) {
      const currentWP = this.waypoints[0];
      const distToWP = Phaser.Math.Distance.Between(activePos.x, activePos.y, currentWP.x, currentWP.y);

      if (distToWP < 30) {
        this.waypoints.shift();
        if (this.waypoints.length === 0) {
          if (leadAlive && this.body) this.body.velocity.scale(0.8);
          if (wingAlive && this.wingman.body) (this.wingman.body as Phaser.Physics.Arcade.Body).velocity.scale(0.8);
        }
      } else {
        const angleToWP = Phaser.Math.Angle.Between(activePos.x, activePos.y, currentWP.x, currentWP.y);

        if (leadAlive) {
          // Lead drives the squadron toward the waypoint
          this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, angleToWP, this.turnRate * dt);
          this.scene.physics.velocityFromRotation(this.rotation, this.baseSpeed, this.body?.velocity);
          this.leadEngineEmitter.emitting = true;
          this.leadEngineEmitter.setPosition(
            this.x - Math.cos(this.rotation) * 18,
            this.y - Math.sin(this.rotation) * 18
          );
        } else if (wingAlive) {
          // Lead destroyed: the surviving wingman becomes the navigator and steers itself
          // toward the waypoint. (Previously nothing ever drove it — the formation follower
          // chased a phantom offset derived from the wingman's own position, so the squadron
          // could not reach any waypoint once the lead was down.)
          this.wingman.rotation = Phaser.Math.Angle.RotateTo(this.wingman.rotation, angleToWP, this.turnRate * dt);
          this.scene.physics.velocityFromRotation(
            this.wingman.rotation,
            this.baseSpeed,
            (this.wingman.body as Phaser.Physics.Arcade.Body).velocity
          );
          this.wingEngineEmitter.emitting = true;
          this.wingEngineEmitter.setPosition(
            this.wingman.x - Math.cos(this.wingman.rotation) * 18,
            this.wingman.y - Math.sin(this.wingman.rotation) * 18
          );
        }
      }
    } else {
      // Idle: decelerate whichever ship is the live navigator
      if (leadAlive && this.body) this.body.velocity.scale(0.92);
      if (!leadAlive && wingAlive && this.wingman.body) {
        (this.wingman.body as Phaser.Physics.Arcade.Body).velocity.scale(0.92);
      }
      this.leadEngineEmitter.emitting = false;
      this.wingEngineEmitter.emitting = false;
    }

    // Wingman Tight Formation Follower Physics
    // Slot-holding only applies while the lead is alive to anchor it. When the lead is
    // destroyed the wingman navigates as its own leader (see above) and must NOT chase a
    // formation point computed from its own position.
    if (wingAlive && leadAlive) {
      const refHeading = this.rotation;
      const formationAngle = refHeading + Math.PI * 0.75;
      const formationDist = 46;
      const targetWingX = this.x + Math.cos(formationAngle) * formationDist;
      const targetWingY = this.y + Math.sin(formationAngle) * formationDist;

      const distToFormation = Phaser.Math.Distance.Between(this.wingman.x, this.wingman.y, targetWingX, targetWingY);
      const angleToFormation = Phaser.Math.Angle.Between(this.wingman.x, this.wingman.y, targetWingX, targetWingY);

      if (distToFormation > 8) {
        this.wingman.rotation = Phaser.Math.Angle.RotateTo(this.wingman.rotation, refHeading, this.turnRate * 1.2 * dt);
        // Proportional approach speed: smooths convergence and removes the
        // overshoot oscillation that made the pair appear to "bump" into each other.
        const wingSpeed = Math.min(240, distToFormation * 6);
        this.scene.physics.velocityFromRotation(angleToFormation, wingSpeed, (this.wingman.body as Phaser.Physics.Arcade.Body).velocity);
        this.wingEngineEmitter.emitting = true;
        this.wingEngineEmitter.setPosition(
          this.wingman.x - Math.cos(this.wingman.rotation) * 18,
          this.wingman.y - Math.sin(this.wingman.rotation) * 18
        );
      } else {
        (this.wingman.body as Phaser.Physics.Arcade.Body).velocity.scale(0.92);
        this.wingman.rotation = Phaser.Math.Angle.RotateTo(this.wingman.rotation, refHeading, this.turnRate * dt);
        this.wingEngineEmitter.emitting = false;
      }
    }

    // 2. Combat Engagement (mode-dependent: RAPID twin cannons vs RAILGUN heavy beam)
    const stats = this.weaponStats;
    let targetToAttack: { x: number; y: number; takeDamage: (dmg: number) => void } | null = null;
    let minD = stats.range;

    // Prioritize destroying incoming missiles in range
    const missiles: any[] = (this.scene as any).activeMissiles || [];
    for (const m of missiles) {
      if (!m.active || m.health <= 0) continue;
      const d = Phaser.Math.Distance.Between(activePos.x, activePos.y, m.x, m.y);
      if (d < minD) {
        minD = d;
        targetToAttack = m;
      }
    }

    if (!targetToAttack) {
      for (const enemy of enemies) {
        if (!enemy.active || enemy.health <= 0) continue;
        const d = Phaser.Math.Distance.Between(activePos.x, activePos.y, enemy.x, enemy.y);
        if (d < minD) {
          minD = d;
          targetToAttack = enemy;
        }
      }
    }

    this.leadFireCooldown -= dt;
    this.wingmanFireCooldown -= dt;

    const canFire = !this.isSwitchingWeapon;
    const isRailgun = this.weaponMode === 'RAILGUN';
    const laserColor = isRailgun ? 0xffffff : 0xfacc15;
    const laserThickness = isRailgun ? 3.0 : 2.0;

    if (targetToAttack && canFire) {
      // Lead Corvette Fires
      if (!this.leadDestroyed && this.leadFireCooldown <= 0) {
        this.leadFireCooldown = stats.cooldown;
        if (isRailgun) soundSynth.playHeavyCannon();
        else soundSynth.playCorvetteVolley();

        this.laserGraphic.lineStyle(laserThickness, laserColor, 0.95);
        if (isRailgun) {
          // Single long-range high-damage white beam
          const rad = this.rotation;
          const mx = this.x + Math.cos(rad) * 20;
          const my = this.y + Math.sin(rad) * 20;
          this.laserGraphic.lineBetween(mx, my, targetToAttack.x, targetToAttack.y);
        } else {
          // Twin rapid amber pulse cannons
          const rad = this.rotation;
          const s1X = this.x + Math.cos(rad) * 16 - Math.sin(rad) * 10;
          const s1Y = this.y + Math.sin(rad) * 16 + Math.cos(rad) * 10;
          const s2X = this.x + Math.cos(rad) * 16 + Math.sin(rad) * 10;
          const s2Y = this.y + Math.sin(rad) * 16 - Math.cos(rad) * 10;
          this.laserGraphic.lineBetween(s1X, s1Y, targetToAttack.x, targetToAttack.y);
          this.laserGraphic.lineBetween(s2X, s2Y, targetToAttack.x, targetToAttack.y);
        }

        targetToAttack.takeDamage(stats.damage);
      }

      // Wingman Corvette Fires
      if (!this.wingmanDestroyed && this.wingmanFireCooldown <= 0) {
        this.wingmanFireCooldown = stats.cooldown;

        this.laserGraphic.lineStyle(laserThickness, laserColor, 0.95);
        if (isRailgun) {
          const wRad = this.wingman.rotation;
          const wmx = this.wingman.x + Math.cos(wRad) * 20;
          const wmy = this.wingman.y + Math.sin(wRad) * 20;
          this.laserGraphic.lineBetween(wmx, wmy, targetToAttack.x, targetToAttack.y);
        } else {
          const wRad = this.wingman.rotation;
          const ws1X = this.wingman.x + Math.cos(wRad) * 16 - Math.sin(wRad) * 10;
          const ws1Y = this.wingman.y + Math.sin(wRad) * 16 + Math.cos(wRad) * 10;
          const ws2X = this.wingman.x + Math.cos(wRad) * 16 + Math.sin(wRad) * 10;
          const ws2Y = this.wingman.y + Math.sin(wRad) * 16 - Math.cos(wRad) * 10;
          this.laserGraphic.lineBetween(ws1X, ws1Y, targetToAttack.x, targetToAttack.y);
          this.laserGraphic.lineBetween(ws2X, ws2Y, targetToAttack.x, targetToAttack.y);
        }

        targetToAttack.takeDamage(stats.damage);
      }

      this.scene.time.delayedCall(55, () => {
        if (this.laserGraphic && this.laserGraphic.active) {
          this.laserGraphic.clear();
        }
      });
    }

    // 3. Render Visuals & Formation HUD
    this.renderTacticalOverlay();
    this.renderWaypoints();

    const anchorX = !this.leadDestroyed ? this.x : this.wingman.x;
    const anchorY = !this.leadDestroyed ? this.y : this.wingman.y;
    this.statusText.setPosition(anchorX, anchorY + 34);

    // Monospace block-bar HULL telemetry aligned with other units (Stratoreservoir / EscortCarrier)
    const hullRatio = Math.max(0, this.hull / this.maxHull);
    const hullBlocks = '█'.repeat(Math.ceil(hullRatio * 10)) + '░'.repeat(10 - Math.ceil(hullRatio * 10));
    const activeCount = (this.leadDestroyed ? 0 : 1) + (this.wingmanDestroyed ? 0 : 1);

    let weaponLine: string;
    if (this.isSwitchingWeapon) {
      weaponLine = `WEAPON: [RECONFIGURING ${this.weaponSwitchTimer.toFixed(1)}S]`;
    } else if (this.weaponMode === 'RAILGUN') {
      weaponLine = 'WEAPON: [RAILGUN // RNG 720 // DMG 90]';
    } else {
      weaponLine = 'WEAPON: [RAPID CANNONS // RNG 380 // DMG 22]';
    }

    this.statusText.setText(
      `[${this.shipId}] ${this.callsign}\n` +
      `HULL [${hullBlocks}] ${Math.floor(this.hull)}/${this.maxHull} HP\n` +
      `SHIPS: ${activeCount}/2 ACTIVE\n` +
      weaponLine
    );
    this.statusText.setColor(this.isSelected ? '#facc15' : '#ffffff');
  }

  private renderTacticalOverlay() {
    if (!this.isSelected) return;

    // Selection-ring color signals weapon mode (amber = RAPID, white = RAILGUN)
    const ringColor = this.weaponMode === 'RAILGUN' ? 0xffffff : 0xfacc15;

    // Formation Bracket Link between Lead and Wingman
    if (!this.leadDestroyed && !this.wingmanDestroyed) {
      this.tacticalOverlay.lineStyle(1.0, ringColor, 0.4);
      this.tacticalOverlay.lineBetween(this.x, this.y, this.wingman.x, this.wingman.y);
    }

    // Tactical Selection Rings
    if (!this.leadDestroyed) {
      this.tacticalOverlay.lineStyle(1.5, ringColor, 0.85);
      this.tacticalOverlay.strokeCircle(this.x, this.y, 24);
    }
    if (!this.wingmanDestroyed) {
      this.tacticalOverlay.lineStyle(1.2, ringColor, 0.65);
      this.tacticalOverlay.strokeCircle(this.wingman.x, this.wingman.y, 22);
    }

    // Weapon barrel indicator (short twin for RAPID, long heavy for RAILGUN)
    const barrelLen = this.weaponMode === 'RAILGUN' ? 40 : 22;
    const barrelColor = this.weaponMode === 'RAILGUN' ? 0xffffff : 0xfacc15;
    if (!this.leadDestroyed) {
      this.tacticalOverlay.lineStyle(2, barrelColor, 0.9);
      this.tacticalOverlay.lineBetween(
        this.x, this.y,
        this.x + Math.cos(this.rotation) * barrelLen,
        this.y + Math.sin(this.rotation) * barrelLen
      );
    }
    if (!this.wingmanDestroyed) {
      this.tacticalOverlay.lineStyle(1.5, barrelColor, 0.75);
      this.tacticalOverlay.lineBetween(
        this.wingman.x, this.wingman.y,
        this.wingman.x + Math.cos(this.wingman.rotation) * barrelLen,
        this.wingman.y + Math.sin(this.wingman.rotation) * barrelLen
      );
    }

    // Reconfiguring progress arc while the weapon switch is in progress
    if (this.isSwitchingWeapon) {
      const anchorX = this.leadDestroyed ? this.wingman.x : this.x;
      const anchorY = this.leadDestroyed ? this.wingman.y : this.y;
      const progress = 1.0 - (this.weaponSwitchTimer / this.weaponSwitchDuration);
      this.tacticalOverlay.lineStyle(2, 0xfacc15, 0.9);
      this.tacticalOverlay.beginPath();
      this.tacticalOverlay.arc(anchorX, anchorY, 30, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2, false);
      this.tacticalOverlay.strokePath();
    }
  }

  private renderWaypoints() {
    if (this.waypoints.length === 0) return;

    const startX = !this.leadDestroyed ? this.x : this.wingman.x;
    const startY = !this.leadDestroyed ? this.y : this.wingman.y;

    this.waypointGraphics.lineStyle(1.2, 0xfacc15, 0.6);
    this.waypointGraphics.beginPath();
    this.waypointGraphics.moveTo(startX, startY);

    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      this.waypointGraphics.lineTo(wp.x, wp.y);
    }
    this.waypointGraphics.strokePath();

    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      this.waypointGraphics.lineStyle(1.5, 0xfacc15, 0.9);
      this.waypointGraphics.strokeCircle(wp.x, wp.y, 6);
      this.waypointGraphics.fillStyle(0xfacc15, 0.4);
      this.waypointGraphics.fillCircle(wp.x, wp.y, 3);
    }
  }

  public destroy(fromScene?: boolean) {
    if (this.tacticalOverlay) this.tacticalOverlay.destroy();
    if (this.waypointGraphics) this.waypointGraphics.destroy();
    if (this.laserGraphic) this.laserGraphic.destroy();
    if (this.hpGraphic) this.hpGraphic.destroy();
    if (this.statusText) this.statusText.destroy();
    if (this.leadEngineEmitter) this.leadEngineEmitter.destroy();
    if (this.wingEngineEmitter) this.wingEngineEmitter.destroy();
    if (this.wingman) this.wingman.destroy(fromScene);
    super.destroy(fromScene);
  }
}
