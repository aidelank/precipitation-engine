import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';
import { RaiderAirship } from './RaiderAirship';

export type CorvetteState = 'DOCKED' | 'PATROL' | 'INTERCEPT' | 'ENGAGING' | 'RETURNING' | 'REBUILDING';

export class UnionCorvette extends Phaser.Physics.Arcade.Sprite {
  public corvetteIndex: number;
  public callsign: string;

  public maxHull: number = 220;
  public hull: number = 220;
  public isDestroyed: boolean = false;

  public state: CorvetteState = 'DOCKED';
  public rebuildTimer: number = 0;
  public readonly maxRebuildTime: number = 14;

  public homeBase: Phaser.Math.Vector2;
  public berthOffset: Phaser.Math.Vector2;
  public targetEnemy: any = null;

  private baseSpeed: number = 175;
  private combatSpeed: number = 210;
  private turnRate: number = 3.2;
  private attackCooldown: number = 0;
  private weaponRange: number = 400;
  private damage: number = 24;

  private laserGraphic: Phaser.GameObjects.Graphics;
  private hpGraphic: Phaser.GameObjects.Graphics;
  private statusLabel: Phaser.GameObjects.Text;
  private engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, homeX: number, homeY: number, index: number) {
    // Offset berths along the inner harbor pier slipways
    const berthOffsets = [
      new Phaser.Math.Vector2(-60, -32),
      new Phaser.Math.Vector2(-85, 0),
      new Phaser.Math.Vector2(-60, 38),
    ];
    const offset = berthOffsets[index % berthOffsets.length];

    super(scene, homeX + offset.x, homeY + offset.y, 'union_corvette');
    this.corvetteIndex = index;
    this.callsign = `DPC-CV-0${index + 1}`;
    this.homeBase = new Phaser.Math.Vector2(homeX, homeY);
    this.berthOffset = offset;

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDamping(true);
    this.setDrag(0.86);
    this.setDepth(9);
    this.rotation = Math.PI; // Face West towards Pacific approach

    this.laserGraphic = scene.add.graphics().setDepth(11);
    this.hpGraphic = scene.add.graphics().setDepth(11);

    this.statusLabel = scene.add.text(this.x, this.y - 20, `[${this.callsign}:GARRISON]`, {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#facc15',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);

    this.engineEmitter = scene.add.particles(0, 0, 'particle_smoke', {
      speed: { min: 15, max: 45 },
      scale: { start: 0.28, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 200,
      emitting: false,
    });
    this.engineEmitter.setDepth(8);
  }

  public scramble(target: RaiderAirship) {
    if (this.state === 'REBUILDING') return;
    this.targetEnemy = target;
    this.state = 'INTERCEPT';
    this.setVisible(true);
    this.setActive(true);
    if (this.body) this.body.enable = true;
    this.updateStatusVisuals();
  }

  public takeDamage(amount: number) {
    if (this.state === 'REBUILDING') return;
    this.hull -= amount;

    // Flash white on impact
    this.setTint(0xffffff);
    this.scene.time.delayedCall(50, () => {
      if (this.active && this.state !== 'REBUILDING') this.clearTint();
    });

    if (this.hull <= 0) {
      this.explode();
    }
  }

  private explode() {
    this.isDestroyed = true;
    this.state = 'REBUILDING';
    this.rebuildTimer = this.maxRebuildTime;
    soundSynth.playFlakBurst();

    const emitter = this.scene.add.particles(this.x, this.y, 'particle_spark', {
      speed: { min: 40, max: 160 },
      scale: { start: 1.0, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 300,
      emitting: false,
    });
    emitter.explode(15);
    this.scene.time.delayedCall(350, () => emitter.destroy());

    this.setVisible(false);
    this.setActive(false);
    if (this.body) this.body.enable = false;
    this.laserGraphic.clear();
    this.hpGraphic.clear();
    this.engineEmitter.emitting = false;
    this.targetEnemy = null;
    this.updateStatusVisuals();
  }

  public rebuild() {
    this.hull = this.maxHull;
    this.isDestroyed = false;
    this.state = 'DOCKED';
    this.setPosition(this.homeBase.x + this.berthOffset.x, this.homeBase.y + this.berthOffset.y);
    this.rotation = Math.PI;
    this.setVisible(true);
    this.setActive(true);
    if (this.body) {
      this.body.enable = true;
      this.body.velocity.set(0, 0);
    }
    this.targetEnemy = null;
    this.updateStatusVisuals();
  }

  public repair(amount: number) {
    if (this.isDestroyed || this.state === 'REBUILDING') return;
    this.hull = Math.min(this.maxHull, this.hull + amount);
  }

  public updateCorvette(
    _time: number,
    delta: number,
    enemies: RaiderAirship[],
    defensePerimeter: number
  ) {
    const dt = delta / 1000;
    this.laserGraphic.clear();
    this.hpGraphic.clear();

    if (this.state === 'REBUILDING') {
      this.rebuildTimer -= dt;
      this.statusLabel.setText(`[${this.callsign}:FABRICATING ${Math.ceil(this.rebuildTimer)}S]`);
      this.statusLabel.setColor('#737373');
      this.statusLabel.setPosition(this.homeBase.x + this.berthOffset.x, this.homeBase.y + this.berthOffset.y - 15);
      if (this.rebuildTimer <= 0) {
        this.rebuild();
      }
      return;
    }

    // Render spatial HP bar when damaged
    if (this.hull < this.maxHull && this.visible) {
      const barW = 32;
      const barH = 3;
      const hpRatio = Math.max(0, this.hull / this.maxHull);
      const barX = this.x - barW / 2;
      const barY = this.y - 22;

      this.hpGraphic.fillStyle(0x000000, 0.7);
      this.hpGraphic.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
      this.hpGraphic.fillStyle(0xfacc15, 0.9);
      this.hpGraphic.fillRect(barX, barY, barW * hpRatio, barH);
    }

    // Scan for hostile intruders and incoming missiles within Union City defense perimeter
    const missiles: any[] = (this.scene as any).activeMissiles || [];
    const missileIntruders = missiles.filter(m => {
      if (!m.active || m.health <= 0) return false;
      const d = Phaser.Math.Distance.Between(m.x, m.y, this.homeBase.x, this.homeBase.y);
      return d <= defensePerimeter + 100;
    });

    const intruders: any[] = [
      ...missileIntruders,
      ...enemies.filter(e => {
        if (!e.active || e.health <= 0) return false;
        const d = Phaser.Math.Distance.Between(e.x, e.y, this.homeBase.x, this.homeBase.y);
        return d <= defensePerimeter;
      })
    ];

    // Auto-scramble from dock if any hostile enters defense perimeter
    if ((this.state === 'DOCKED' || this.state === 'PATROL' || this.state === 'RETURNING') && intruders.length > 0) {
      let closestIntruder: any = null;
      let minD = 99999;
      for (const intruder of intruders) {
        const d = Phaser.Math.Distance.Between(this.x, this.y, intruder.x, intruder.y);
        if (d < minD) {
          minD = d;
          closestIntruder = intruder;
        }
      }
      if (closestIntruder) {
        this.targetEnemy = closestIntruder;
        this.state = 'INTERCEPT';
        soundSynth.playRadarWarning();
        this.updateStatusVisuals();
      }
    }

    // State Execution
    if (this.state === 'DOCKED') {
      const targetBerthX = this.homeBase.x + this.berthOffset.x;
      const targetBerthY = this.homeBase.y + this.berthOffset.y;
      this.x = Phaser.Math.Linear(this.x, targetBerthX, 0.1);
      this.y = Phaser.Math.Linear(this.y, targetBerthY, 0.1);
      this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, Math.PI, 1.5 * dt);
      if (this.body) this.body.velocity.scale(0.8);
      this.engineEmitter.emitting = false;

      // Auto-repair at dock (slower, deliberate repair rate)
      if (this.hull < this.maxHull) {
        this.repair(10 * dt);
      }
    } else if (this.state === 'INTERCEPT' || this.state === 'ENGAGING') {
      // Validate active target
      const targetInvalid =
        !this.targetEnemy ||
        !this.targetEnemy.active ||
        this.targetEnemy.health <= 0 ||
        Phaser.Math.Distance.Between(this.targetEnemy.x, this.targetEnemy.y, this.homeBase.x, this.homeBase.y) > defensePerimeter + 220;

      if (targetInvalid) {
        // Look for next intruder in perimeter
        let nextTarget: RaiderAirship | null = null;
        let minD = 99999;
        for (const intruder of intruders) {
          const d = Phaser.Math.Distance.Between(this.x, this.y, intruder.x, intruder.y);
          if (d < minD) {
            minD = d;
            nextTarget = intruder;
          }
        }

        if (nextTarget) {
          this.targetEnemy = nextTarget;
          this.state = 'INTERCEPT';
        } else {
          this.targetEnemy = null;
          this.state = 'RETURNING';
          this.updateStatusVisuals();
        }
      }

      if (this.targetEnemy && this.targetEnemy.active) {
        const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, this.targetEnemy.x, this.targetEnemy.y);
        const angleToTarget = Phaser.Math.Angle.Between(this.x, this.y, this.targetEnemy.x, this.targetEnemy.y);

        this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, angleToTarget, this.turnRate * dt);
        this.engineEmitter.emitting = true;
        this.engineEmitter.setPosition(
          this.x - Math.cos(this.rotation) * 20,
          this.y - Math.sin(this.rotation) * 20
        );

        // Dynamic combat maneuvering
        if (distToTarget > 220) {
          this.scene.physics.velocityFromRotation(this.rotation, this.combatSpeed, this.body?.velocity);
        } else if (distToTarget < 130) {
          this.scene.physics.velocityFromRotation(this.rotation + Math.PI, this.combatSpeed * 0.6, this.body?.velocity);
        } else {
          // Tactical orbit / strafe
          const strafeAngle = this.rotation + Math.PI / 2;
          this.scene.physics.velocityFromRotation(strafeAngle, this.combatSpeed * 0.75, this.body?.velocity);
        }

        // Fire twin heavy pulse lasers
        this.attackCooldown -= dt;
        if (distToTarget <= this.weaponRange && this.attackCooldown <= 0) {
          this.attackCooldown = 0.36;
          this.state = 'ENGAGING';
          soundSynth.playCorvetteVolley();

          // Sponson emitter coordinates (hull rotated offsets)
          const rad = this.rotation;
          const s1X = this.x + Math.cos(rad) * 16 - Math.sin(rad) * 11;
          const s1Y = this.y + Math.sin(rad) * 16 + Math.cos(rad) * 11;
          const s2X = this.x + Math.cos(rad) * 16 + Math.sin(rad) * 11;
          const s2Y = this.y + Math.sin(rad) * 16 - Math.cos(rad) * 11;

          this.laserGraphic.lineStyle(2.0, 0xfacc15, 0.95);
          this.laserGraphic.lineBetween(s1X, s1Y, this.targetEnemy.x, this.targetEnemy.y);
          this.laserGraphic.lineBetween(s2X, s2Y, this.targetEnemy.x, this.targetEnemy.y);

          this.targetEnemy.takeDamage(this.damage);

          this.scene.time.delayedCall(60, () => {
            if (this.laserGraphic && this.laserGraphic.active) {
              this.laserGraphic.clear();
            }
          });
        }
      }
    } else if (this.state === 'RETURNING') {
      const targetBerthX = this.homeBase.x + this.berthOffset.x;
      const targetBerthY = this.homeBase.y + this.berthOffset.y;
      const distToBerth = Phaser.Math.Distance.Between(this.x, this.y, targetBerthX, targetBerthY);
      const angleToBerth = Phaser.Math.Angle.Between(this.x, this.y, targetBerthX, targetBerthY);

      this.rotation = Phaser.Math.Angle.RotateTo(this.rotation, angleToBerth, this.turnRate * dt);
      this.engineEmitter.emitting = true;
      this.engineEmitter.setPosition(
        this.x - Math.cos(this.rotation) * 20,
        this.y - Math.sin(this.rotation) * 20
      );
      this.scene.physics.velocityFromRotation(this.rotation, this.baseSpeed, this.body?.velocity);

      if (distToBerth < 35) {
        this.state = 'DOCKED';
        if (this.body) this.body.velocity.set(0, 0);
        this.updateStatusVisuals();
      }
    }

    this.statusLabel.setPosition(this.x, this.y - 20);
    this.updateStatusVisuals();
  }

  private updateStatusVisuals() {
    switch (this.state) {
      case 'DOCKED':
        this.statusLabel.setText(`[${this.callsign}:GARRISON]`);
        this.statusLabel.setColor('#ffffff');
        break;
      case 'INTERCEPT':
        this.statusLabel.setText(`[${this.callsign}:INTERCEPT]`);
        this.statusLabel.setColor('#facc15');
        break;
      case 'ENGAGING':
        this.statusLabel.setText(`[${this.callsign}:ENGAGING]`);
        this.statusLabel.setColor('#4ade80');
        break;
      case 'RETURNING':
        this.statusLabel.setText(`[${this.callsign}:RTB_DOCK]`);
        this.statusLabel.setColor('#94a3b8');
        break;
      case 'REBUILDING':
        this.statusLabel.setText(`[${this.callsign}:FABRICATING]`);
        this.statusLabel.setColor('#737373');
        break;
      default:
        break;
    }
  }

  public destroy(fromScene?: boolean) {
    if (this.laserGraphic) this.laserGraphic.destroy();
    if (this.hpGraphic) this.hpGraphic.destroy();
    if (this.statusLabel) this.statusLabel.destroy();
    if (this.engineEmitter) this.engineEmitter.destroy();
    super.destroy(fromScene);
  }
}
