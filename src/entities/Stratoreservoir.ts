import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';

export type PowerMode = 'EXTRACTION' | 'BALANCED' | 'COMBAT' | 'EMERGENCY';
export type DeployState = 'UNDEPLOYED' | 'DEPLOYING' | 'DEPLOYED' | 'UNDEPLOYING';

export class Stratoreservoir extends Phaser.Physics.Arcade.Sprite {
  public maxWater: number = 5000;
  public currentWater: number = 0;
  public maxHull: number = 500;
  public hull: number = 500;

  public powerMode: PowerMode = 'BALANCED';
  public deployState: DeployState = 'UNDEPLOYED';
  public isDeployed: boolean = false;
  public deployTimer: number = 0;
  public readonly deployDuration: number = 3.0;
  public deployProgress: number = 0;

  public isSiphoning: boolean = false;
  public isInCloud: boolean = false;
  public isInMatureCloud: boolean = false;
  public cloudQuality: number = 0;
  public isSelected: boolean = true;
  public isAutoReturning: boolean = false;
  private autoReturnTarget: Phaser.Math.Vector2 | null = null;

  public waypoints: Phaser.Math.Vector2[] = [];
  public queueDeployAtEnd: boolean = false;

  private lastDamageTime: number = 0;
  private boostTimer: number = 0;
  private deployLockMessage: Phaser.GameObjects.Text | null = null;

  private baseSpeed: number = 42.5;
  private baseTurnRate: number = 1.1;

  private tacticalOverlay: Phaser.GameObjects.Graphics;
  private waypointGraphics: Phaser.GameObjects.Graphics;
  private shipHudTopText: Phaser.GameObjects.Text;
  private shipHudH2OText: Phaser.GameObjects.Text;
  private shipHudStatusText: Phaser.GameObjects.Text;
  private engineEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'mothership');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    this.setDamping(true);
    this.setDrag(0.88);
    this.setAngularDrag(0.75);
    this.setDepth(10);

    this.waypointGraphics = scene.add.graphics().setDepth(7);
    this.tacticalOverlay = scene.add.graphics().setDepth(11);

    this.shipHudTopText = scene.add.text(x, y + 48, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);

    this.shipHudH2OText = scene.add.text(x, y + 72, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '10px',
      color: '#38bdf8',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);

    this.shipHudStatusText = scene.add.text(x, y + 86, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '9px',
      color: '#a3a3a3',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);

    this.engineEmitter = scene.add.particles(0, 0, 'particle_smoke', {
      speed: { min: 30, max: 80 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 350,
      emitting: false,
    });
    this.engineEmitter.setDepth(8);
  }

  // Toggle Deployment (2.0s Transition: Move Mode <-> Deployed Siphon Mode)
  public toggleDeploy(): boolean {
    if (this.isAutoReturning) {
      this.isAutoReturning = false;
    }

    if (this.deployState === 'UNDEPLOYED') {
      // Must be inside a mature extractable storm (intensity >= 0.45) to deploy
      if (!this.isInCloud || !this.isInMatureCloud) {
        soundSynth.playDamageAlert();
        this.showDeployLockedMessage();
        return false;
      }

      this.deployState = 'DEPLOYING';
      this.deployTimer = this.deployDuration;
      this.deployProgress = 0;
      this.clearWaypoints();
      this.queueDeployAtEnd = false;
      this.body?.velocity.scale(0.3);
      this.setAngularVelocity(0);
      soundSynth.playWaypointOrder();
      return true;
    } else if (this.deployState === 'DEPLOYING') {
      // Abort deployment -> reverse to undeploy
      this.deployState = 'UNDEPLOYING';
      this.deployTimer = this.deployDuration * (1.0 - this.deployProgress);
      soundSynth.playWaypointCancel();
      return true;
    } else if (this.deployState === 'DEPLOYED') {
      // Begin 2-second undeploy cycle
      this.deployState = 'UNDEPLOYING';
      this.deployTimer = this.deployDuration;
      this.deployProgress = 1.0;
      this.isSiphoning = false;
      soundSynth.setSiphonActive(false);
      soundSynth.playWaypointOrder();
      return true;
    } else if (this.deployState === 'UNDEPLOYING') {
      // Re-deploy only if still in mature cloud
      if (this.isInCloud && this.isInMatureCloud) {
        this.deployState = 'DEPLOYING';
        this.deployTimer = this.deployDuration * this.deployProgress;
        soundSynth.playWaypointOrder();
        return true;
      }
      return false;
    }
    return false;
  }

  // Quick floating warning that jumps out of the ship when deploy is denied (no mature storm)
  private showDeployLockedMessage() {
    // Destroy any previous message so rapid clicks don't stack callouts
    if (this.deployLockMessage && this.deployLockMessage.active) {
      this.deployLockMessage.destroy();
    }

    const msg = this.scene.add.text(this.x, this.y - 44, '⚠ WEP LOCKED // REQUIRE CUMULONIMBUS STORM CELL', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '12px',
      color: '#facc15',
      backgroundColor: '#050505',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(40).setScale(0.5);
    this.deployLockMessage = msg;

    // Pop out of the hull (slight overshoot = "jump")
    this.scene.tweens.add({
      targets: msg,
      scale: 1.0,
      duration: 220,
      ease: 'Back.easeOut',
    });

    // Rise and fade away
    this.scene.tweens.add({
      targets: msg,
      y: msg.y - 50,
      alpha: { from: 1, to: 0 },
      delay: 550,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (msg.active) msg.destroy();
      },
    });
  }

  public setWaypoint(x: number, y: number) {
    if (this.deployState !== 'UNDEPLOYED') {
      soundSynth.playDamageAlert();
      return;
    }
    this.isAutoReturning = false;
    this.queueDeployAtEnd = false;
    this.waypoints = [new Phaser.Math.Vector2(x, y)];
    soundSynth.playWaypointOrder();
  }

  public addWaypoint(x: number, y: number) {
    if (this.deployState !== 'UNDEPLOYED') {
      soundSynth.playDamageAlert();
      return;
    }
    this.isAutoReturning = false;
    this.waypoints.push(new Phaser.Math.Vector2(x, y));
    soundSynth.playWaypointOrder();
  }

  public clearWaypoints() {
    this.waypoints = [];
    this.queueDeployAtEnd = false;
  }

  public tryCancelWaypoint(wx: number, wy: number, threshold: number = 28): boolean {
    for (let i = 0; i < this.waypoints.length; i++) {
      const wp = this.waypoints[i];
      const dist = Phaser.Math.Distance.Between(wx, wy, wp.x, wp.y);
      if (dist <= threshold) {
        this.waypoints.splice(i, 1);
        if (this.waypoints.length === 0) {
          this.queueDeployAtEnd = false;
        }
        soundSynth.playWaypointCancel();
        return true;
      }
    }
    return false;
  }

  public returnToArcologyDock(dockX: number, dockY: number) {
    this.isAutoReturning = true;
    this.autoReturnTarget = new Phaser.Math.Vector2(dockX, dockY);

    if (this.deployState === 'DEPLOYED' || this.deployState === 'DEPLOYING') {
      this.deployState = 'UNDEPLOYING';
      this.deployTimer = this.deployDuration;
      this.isSiphoning = false;
      soundSynth.setSiphonActive(false);
    } else if (this.deployState === 'UNDEPLOYED') {
      this.waypoints = [new Phaser.Math.Vector2(dockX, dockY)];
      soundSynth.playWaypointOrder();
    }
  }

  public setPowerMode(mode: PowerMode) {
    if (this.powerMode === mode) return;

    if (mode === 'EMERGENCY') {
      if (this.currentWater >= 300) {
        this.currentWater -= 300;
        this.boostTimer = 3.5;
        this.powerMode = 'EMERGENCY';
        soundSynth.playDamageAlert();
        this.scene.cameras.main.shake(200, 0.015);
      } else {
        soundSynth.playDamageAlert();
        return;
      }
    } else {
      this.powerMode = mode;
      soundSynth.playWaypointOrder();
    }
  }

  public toggleSiphon() {
    if (this.powerMode === 'COMBAT') {
      soundSynth.playDamageAlert();
      return;
    }
    this.isSiphoning = !this.isSiphoning;
    soundSynth.setSiphonActive(this.isSiphoning);
  }

  public takeDamage(amount: number) {
    this.lastDamageTime = this.scene.time.now;
    soundSynth.playDamageAlert();
    this.scene.cameras.main.shake(140, 0.01);

    this.hull = Math.max(0, this.hull - amount);
    this.setTint(0xff4444);
    this.scene.time.delayedCall(70, () => {
      if (this.active) this.clearTint();
    });
  }

  public repair(amount: number) {
    if (this.hull < this.maxHull) {
      this.hull = Math.min(this.maxHull, this.hull + amount);
    }
  }

  public repairAndRefuel() {
    this.hull = this.maxHull;
    this.isAutoReturning = false;
    const delivered = this.currentWater;
    this.currentWater = 0;
    return delivered;
  }

  // Gradually offload stored water at the dock; returns the KG actually dumped
  public dumpWater(amount: number): number {
    if (this.currentWater <= 0) return 0;
    const dumped = Math.min(this.currentWater, amount);
    this.currentWater -= dumped;
    return dumped;
  }

  public update(time: number, delta: number) {
    const dt = delta / 1000;

    const loadRatio = this.currentWater / this.maxWater;
    const massPenaltySpeed = 1.0 - loadRatio * 0.45;
    const massPenaltyTurn = 1.0 - loadRatio * 0.55;

    let modeSpeedMod = 1.0;
    let modeExtractionMod = 1.0;

    if (this.powerMode === 'EXTRACTION') {
      modeSpeedMod = 0.65;
      modeExtractionMod = 1.7;
    } else if (this.powerMode === 'COMBAT') {
      modeSpeedMod = 1.05;
      modeExtractionMod = 0.0;
      this.isSiphoning = false;
      soundSynth.setSiphonActive(false);
    } else if (this.powerMode === 'EMERGENCY') {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.powerMode = 'BALANCED';
      }
      modeSpeedMod = 2.4;
      this.isSiphoning = false;
    }

    // 1. Deploy / Undeploy State Timer & Mechanical Sequencing
    if (this.deployState === 'DEPLOYING') {
      this.deployTimer -= dt;
      this.deployProgress = Math.min(1.0, 1.0 - (this.deployTimer / this.deployDuration));
      this.body?.velocity.scale(0.7);
      this.setAngularVelocity(0);

      // If storm disappears or shrinks below mature threshold while deploying, auto-reverse
      if (!this.isInCloud || !this.isInMatureCloud) {
        this.deployState = 'UNDEPLOYING';
        this.deployTimer = this.deployDuration * (1.0 - this.deployProgress);
        soundSynth.playWaypointCancel();
      } else if (this.deployTimer <= 0) {
        this.deployState = 'DEPLOYED';
        this.isDeployed = true;
        this.deployProgress = 1.0;
        this.isSiphoning = true;
        soundSynth.setSiphonActive(true);
        soundSynth.playPurchaseSound();
      }
    } else if (this.deployState === 'UNDEPLOYING') {
      this.deployTimer -= dt;
      this.deployProgress = Math.max(0.0, this.deployTimer / this.deployDuration);
      this.body?.velocity.scale(0.7);
      this.setAngularVelocity(0);

      if (this.deployTimer <= 0) {
        this.deployState = 'UNDEPLOYED';
        this.isDeployed = false;
        this.deployProgress = 0;
        soundSynth.playWaypointCancel();

        if (this.isAutoReturning && this.autoReturnTarget) {
          this.waypoints = [this.autoReturnTarget.clone()];
        }
      }
    } else if (this.deployState === 'DEPLOYED') {
      this.isDeployed = true;
      // Auto-undeploy if deployed and storm drifts away / drops below mature threshold
      if (!this.isInCloud || !this.isInMatureCloud) {
        this.deployState = 'UNDEPLOYING';
        this.deployTimer = this.deployDuration;
        this.isSiphoning = false;
        soundSynth.setSiphonActive(false);
        soundSynth.playWaypointCancel();
      }
    } else {
      this.isDeployed = false;
      this.deployProgress = 0;
    }

    const currentTurnRate = this.baseTurnRate * massPenaltyTurn;
    const targetSpeed = this.baseSpeed * massPenaltySpeed * modeSpeedMod;

    let throttle = 0;

    if (this.deployState !== 'UNDEPLOYED') {
      // Anchors extending/locked/retracting - cannot move
      this.body?.velocity.scale(0.7);
      this.setAngularVelocity(0);
      throttle = 0;
    } else if (this.waypoints.length > 0) {
      const targetWp = this.waypoints[0];
      const distToWp = Phaser.Math.Distance.Between(this.x, this.y, targetWp.x, targetWp.y);

      if (distToWp <= 28) {
        this.waypoints.shift();
        if (this.waypoints.length === 0) {
          this.body?.velocity.scale(0.8);
          this.setAngularVelocity(0);

          // Auto-trigger deployment if scheduled via Shift-Deploy
          if (this.queueDeployAtEnd) {
            this.queueDeployAtEnd = false;
            if (this.isInCloud && this.isInMatureCloud) {
              this.toggleDeploy();
            } else {
              soundSynth.playDamageAlert();
            }
          }
        }
      } else {
        const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, targetWp.x, targetWp.y);
        const angleDiff = Phaser.Math.Angle.Wrap(targetAngle - this.rotation);

        if (Math.abs(angleDiff) > 0.05) {
          const turnDir = angleDiff > 0 ? 1 : -1;
          const turnVelocity = Math.min(Math.abs(angleDiff) * 8, currentTurnRate);
          this.setAngularVelocity(Phaser.Math.RadToDeg(turnDir * turnVelocity));
        } else {
          this.setAngularVelocity(0);
          this.rotation = targetAngle;
        }

        const alignmentFactor = Math.max(0, Math.cos(angleDiff));
        if (alignmentFactor > 0.3) {
          let speedFactor = 1.0;
          if (distToWp < 120) {
            speedFactor = Math.max(0.25, distToWp / 120);
          }

          throttle = (this.powerMode === 'EMERGENCY' ? 1.5 : 1.0) * alignmentFactor * speedFactor;
          const forwardVector = this.scene.physics.velocityFromRotation(this.rotation, 1);
          this.body?.velocity.add(new Phaser.Math.Vector2(
            forwardVector.x * targetSpeed * 2.2 * throttle * dt,
            forwardVector.y * targetSpeed * 2.2 * throttle * dt
          ));
        }
      }
    } else {
      this.body?.velocity.scale(0.92);
      this.setAngularVelocity(0);
    }

    const maxVelocity = targetSpeed * 1.3;
    if (this.body?.velocity && this.body.velocity.length() > maxVelocity) {
      this.body.velocity.scale(maxVelocity / this.body.velocity.length());
    }

    soundSynth.setEngineThrottle(throttle);

    if (throttle > 0.1 && this.deployState === 'UNDEPLOYED') {
      const rearX = this.x - Math.cos(this.rotation) * 50;
      const rearY = this.y - Math.sin(this.rotation) * 50;
      this.engineEmitter.setPosition(rearX, rearY);
      this.engineEmitter.emitting = true;
    } else {
      this.engineEmitter.emitting = false;
    }

    // Absorption occurs ONLY when Fully Deployed and inside a Mature Cloud
    if (this.deployState === 'DEPLOYED' && this.isInCloud && this.isInMatureCloud && this.currentWater < this.maxWater) {
      const baseExtractSpeed = 32;
      const extractRate = (baseExtractSpeed * this.cloudQuality * modeExtractionMod) * dt;
      this.currentWater = Math.min(this.maxWater, this.currentWater + extractRate);
      soundSynth.setSiphonActive(true);
    } else {
      soundSynth.setSiphonActive(false);
    }

    this.renderWaypointLines();
    this.renderSpatialShipHUD();
  }

  private renderWaypointLines() {
    this.waypointGraphics.clear();
    if (this.waypoints.length === 0 || !this.isSelected || this.deployState !== 'UNDEPLOYED') return;

    this.waypointGraphics.lineStyle(1.5, 0xfacc15, 0.7);

    let fromX = this.x;
    let fromY = this.y;

    this.waypoints.forEach((wp, idx) => {
      this.waypointGraphics.lineBetween(fromX, fromY, wp.x, wp.y);

      const isFirst = idx === 0;
      const isLast = idx === this.waypoints.length - 1;
      const markerSize = isFirst ? 10 : 7;

      this.waypointGraphics.lineStyle(1.5, 0xfacc15, isFirst ? 0.9 : 0.6);
      this.waypointGraphics.strokeRect(wp.x - markerSize, wp.y - markerSize, markerSize * 2, markerSize * 2);

      this.waypointGraphics.fillStyle(0xfacc15, isFirst ? 0.9 : 0.5);
      this.waypointGraphics.fillCircle(wp.x, wp.y, 2);

      // Render special auto-deploy marker if scheduled for the destination waypoint
      if (isLast && this.queueDeployAtEnd) {
        this.waypointGraphics.lineStyle(2, 0xfacc15, 0.9);
        this.waypointGraphics.strokeCircle(wp.x, wp.y, 16);
        // 90° vertical FLIP rotation glyph
        this.waypointGraphics.lineBetween(wp.x - 10, wp.y, wp.x + 10, wp.y);
        this.waypointGraphics.lineBetween(wp.x, wp.y - 10, wp.x, wp.y + 10);
        this.waypointGraphics.beginPath();
        this.waypointGraphics.arc(wp.x, wp.y, 12, 0, Math.PI * 0.5, false);
        this.waypointGraphics.strokePath();
      }

      fromX = wp.x;
      fromY = wp.y;
    });
  }

  private renderSpatialShipHUD() {
    this.tacticalOverlay.clear();

    const px = this.x;
    const py = this.y;
    const rot = this.rotation;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // Local-to-world transformation helper rotated with ship heading
    const toWorld = (lx: number, ly: number): { x: number; y: number } => {
      return {
        x: px + lx * cosR - ly * sinR,
        y: py + lx * sinR + ly * cosR,
      };
    };

    // Hard 90-Degree Terminal Selection Brackets (Rotated with ship)
    const bw = 58;
    const bh = 36;
    const bracketAlpha = this.isSelected ? 0.95 : 0.35;
    const bracketColor = this.isSelected ? 0xfacc15 : 0x888888;
    this.tacticalOverlay.lineStyle(this.isSelected ? 1.5 : 1, bracketColor, bracketAlpha);

    const corners = [
      { lx: -bw, ly: -bh, dx: 12, dy: 10 },
      { lx: bw, ly: -bh, dx: -12, dy: 10 },
      { lx: -bw, ly: bh, dx: 12, dy: -10 },
      { lx: bw, ly: bh, dx: -12, dy: -10 },
    ];
    corners.forEach(c => {
      const p = toWorld(c.lx, c.ly);
      const pxH = toWorld(c.lx + c.dx, c.ly);
      const pyV = toWorld(c.lx, c.ly + c.dy);
      this.tacticalOverlay.lineBetween(p.x, p.y, pxH.x, pxH.y);
      this.tacticalOverlay.lineBetween(p.x, p.y, pyV.x, pyV.y);
    });

    // Animated 90° FLIP Transformation: Ballast Purge Vents, Sensor Booms, and Cryogenic Condensation Arrays
    if (this.deployProgress > 0.01) {
      const alpha = 0.4 + 0.55 * this.deployProgress;
      this.tacticalOverlay.lineStyle(2, 0xfacc15, alpha);

      // 4 Lateral Sensor Telemetry & Ballast Purge Booms:
      // Fore-Port, Fore-Stbd, Aft-Port, Aft-Stbd
      const boomConfigs = [
        { mx: 24, my: -18, extX: 22, extY: -26 },
        { mx: 24, my: 18, extX: 22, extY: 26 },
        { mx: -30, my: -18, extX: -22, extY: -26 },
        { mx: -30, my: 18, extX: -22, extY: 26 },
      ];

      boomConfigs.forEach(boom => {
        const mount = toWorld(boom.mx, boom.my);
        const endLx = boom.mx + boom.extX * this.deployProgress;
        const endLy = boom.my + boom.extY * this.deployProgress;
        const tip = toWorld(endLx, endLy);

        // Main structural sensor boom beam
        this.tacticalOverlay.lineStyle(2, 0xfacc15, alpha);
        this.tacticalOverlay.lineBetween(mount.x, mount.y, tip.x, tip.y);

        // Lateral Telemetry Sensor Node Box
        const nodeSize = 3.5;
        const p1 = toWorld(endLx - nodeSize, endLy - nodeSize);
        const p2 = toWorld(endLx + nodeSize, endLy - nodeSize);
        const p3 = toWorld(endLx + nodeSize, endLy + nodeSize);
        const p4 = toWorld(endLx - nodeSize, endLy + nodeSize);

        this.tacticalOverlay.lineStyle(1.5, 0xfacc15, alpha);
        this.tacticalOverlay.beginPath();
        this.tacticalOverlay.moveTo(p1.x, p1.y);
        this.tacticalOverlay.lineTo(p2.x, p2.y);
        this.tacticalOverlay.lineTo(p3.x, p3.y);
        this.tacticalOverlay.lineTo(p4.x, p4.y);
        this.tacticalOverlay.closePath();
        this.tacticalOverlay.strokePath();

        this.tacticalOverlay.fillStyle(0xfacc15, alpha * 0.85);
        this.tacticalOverlay.beginPath();
        this.tacticalOverlay.moveTo(p1.x, p1.y);
        this.tacticalOverlay.lineTo(p2.x, p2.y);
        this.tacticalOverlay.lineTo(p3.x, p3.y);
        this.tacticalOverlay.lineTo(p4.x, p4.y);
        this.tacticalOverlay.closePath();
        this.tacticalOverlay.fillPath();

        // Atmospheric Barometric Sensor Antennas when rotated > 65%
        if (this.deployProgress > 0.65) {
          const antLen = 8 * ((this.deployProgress - 0.65) / 0.35);
          const antDirX = boom.extX > 0 ? 1 : -1;
          const antDirY = boom.extY > 0 ? 1 : -1;
          const antTip = toWorld(endLx + antDirX * antLen, endLy + antDirY * antLen);
          this.tacticalOverlay.lineStyle(1.5, 0x38bdf8, alpha);
          this.tacticalOverlay.lineBetween(tip.x, tip.y, antTip.x, antTip.y);
        }
      });

      // Forward Vacuum Condensation Nozzle Shrouds extending into storm core
      const shroudProg = this.deployProgress;
      const shroudLeftMount = toWorld(44, -12);
      const shroudRightMount = toWorld(44, 12);
      const shroudLeftTip = toWorld(44 + 18 * shroudProg, -16 - 4 * shroudProg);
      const shroudRightTip = toWorld(44 + 18 * shroudProg, 16 + 4 * shroudProg);

      this.tacticalOverlay.lineStyle(1.8, 0x38bdf8, alpha);
      this.tacticalOverlay.lineBetween(shroudLeftMount.x, shroudLeftMount.y, shroudLeftTip.x, shroudLeftTip.y);
      this.tacticalOverlay.lineBetween(shroudRightMount.x, shroudRightMount.y, shroudRightTip.x, shroudRightTip.y);

      // Vacuum Inflow Vortex Stream Lines when fully rotated 90°
      if (this.deployState === 'DEPLOYED') {
        const intakeCenter = toWorld(54, 0);
        const streamLen = 70;
        const numStreams = 5;
        this.tacticalOverlay.lineStyle(1.2, 0x38bdf8, 0.75);

        for (let s = 0; s < numStreams; s++) {
          const spread = (s - 2) * 14;
          const streamSource = toWorld(54 + streamLen, spread);
          this.tacticalOverlay.lineBetween(streamSource.x, streamSource.y, intakeCenter.x, intakeCenter.y);
        }

        if (this.isInMatureCloud) {
          this.tacticalOverlay.fillStyle(0xffffff, 0.95);
          this.tacticalOverlay.fillCircle(intakeCenter.x, intakeCenter.y, 4);
          this.tacticalOverlay.lineStyle(1.5, 0x38bdf8, 0.9);
          this.tacticalOverlay.strokeCircle(intakeCenter.x, intakeCenter.y, 8);
        }
      }
    }

    // Terminal Monospace Telemetry Block attached to ship (Thick block bars)
    const hullRatio = Math.max(0, this.hull / this.maxHull);
    const waterRatio = Math.max(0, Math.min(1.0, this.currentWater / this.maxWater));
    const isTankFull = this.currentWater >= this.maxWater;
    const isExtracting = this.deployState === 'DEPLOYED' && this.isInCloud && this.isInMatureCloud && !isTankFull;

    const flowRate = isExtracting
      ? Math.floor(32 * this.cloudQuality * (this.powerMode === 'EXTRACTION' ? 1.7 : 1.0))
      : 0;
    
    let statusLine = '';
    if (this.deployState === 'DEPLOYING') {
      const pct = Math.round(this.deployProgress * 100);
      statusLine = `90° FLIP ROTATION [${pct}% // ${(Math.max(0, this.deployTimer)).toFixed(1)}S]`;
    } else if (this.deployState === 'UNDEPLOYING') {
      const pct = Math.round((1.0 - (this.deployTimer / this.deployDuration)) * 100);
      statusLine = `RESTORING TRIM [${pct}% // ${(Math.max(0, this.deployTimer)).toFixed(1)}S]`;
    } else if (this.deployState === 'DEPLOYED') {
      statusLine = `WEP CONDENSATION ACTIVE [${flowRate} KG/S]`;
    } else if (this.queueDeployAtEnd) {
      statusLine = 'AUTOPILOT >> AUTO-FLIP (WEP)';
    } else if (this.isInMatureCloud) {
      statusLine = 'CUMULONIMBUS READY >> [L-CLICK] ROTATE 90°';
    } else if (this.isInCloud && !this.isInMatureCloud) {
      statusLine = 'DEVELOPING CUMULUS (INSUFFICIENT VAPOR)';
    } else {
      statusLine = 'CLEAR AIRSPACE';
    }

    if (isTankFull && this.deployState === 'UNDEPLOYED') {
      statusLine = 'RESERVOIR FULL >> RTB UNION-13 DOCK';
    } else if (this.isAutoReturning && this.deployState === 'UNDEPLOYED') {
      statusLine = 'AUTOPILOT >> EN ROUTE TO UNION-13';
    }

    const hullBlocks = '█'.repeat(Math.ceil(hullRatio * 10)) + '░'.repeat(10 - Math.ceil(hullRatio * 10));
    const waterBlocks = '█'.repeat(Math.ceil(waterRatio * 10)) + '░'.repeat(10 - Math.ceil(waterRatio * 10));

    // 1. Top Header & Classic Thick Block HP Bar (Monochrome/White)
    this.shipHudTopText.setPosition(px, py + 48);
    this.shipHudTopText.setText(
      `[1] STRATORESERVOIR WEP-01\n` +
      `HULL [${hullBlocks}] ${Math.floor(this.hull)}/${this.maxHull} HP`
    );
    this.shipHudTopText.setColor(this.isSelected ? '#facc15' : '#ffffff');

    // 2. Matching Thick Block H2O Bar (Directly below HP bar in Electric Blue #38bdf8)
    this.shipHudH2OText.setPosition(px, py + 68);
    this.shipHudH2OText.setText(
      `H2O  [${waterBlocks}] ${Math.floor(this.currentWater)}/${this.maxWater} KG${isExtracting ? ` (+${flowRate} KG/S)` : ''}`
    );
    this.shipHudH2OText.setColor('#38bdf8');

    // 3. Status Line
    this.shipHudStatusText.setPosition(px, py + 82);
    this.shipHudStatusText.setText(`[${statusLine}]`);
  }

  public destroy(fromScene?: boolean) {
    this.waypointGraphics.destroy();
    this.tacticalOverlay.destroy();
    this.shipHudTopText.destroy();
    this.shipHudH2OText.destroy();
    this.shipHudStatusText.destroy();
    this.engineEmitter.destroy();
    super.destroy(fromScene);
  }
}
