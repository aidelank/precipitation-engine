import Phaser from 'phaser';

export type CloudType = 'CUMULUS' | 'SUPERCELL' | 'THUNDERHEAD';

export class CloudZone {
  public id: string;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number;
  public minRadius: number;
  public maxRadius: number;
  public growthSpeed: number;
  public phase: number;
  public intensity: number = 0;
  public isCharged: boolean = false;
  public isViolent: boolean = false; // Overgrown state with active lightning
  public canOvergrow: boolean = false; // Only select massive supercells can overgrow into red hypercells
  public rotationAngle: number = 0;
  public isobars: Phaser.GameObjects.Graphics;
  public label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    minRadius: number,
    maxRadius: number,
    initialPhase: number,
    growthSpeed: number,
    vx: number,
    vy: number,
    canOvergrow: boolean = false
  ) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.phase = initialPhase;
    this.growthSpeed = growthSpeed;
    this.vx = vx;
    this.vy = vy;
    this.canOvergrow = canOvergrow;

    const norm = (Math.sin(this.phase) + 1) * 0.5;
    this.radius = Phaser.Math.Linear(this.minRadius, this.maxRadius, norm);
    this.intensity = norm;
    this.isCharged = this.intensity >= 0.45;
    this.isViolent = this.canOvergrow && this.intensity >= 0.90;

    this.isobars = scene.add.graphics();
    this.isobars.setDepth(3);

    this.label = scene.add.text(x, y, '', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '9px',
      color: '#a3a3a3',
    }).setDepth(4);

    this.renderGraphics();
  }

  public update(dt: number, mapW: number, mapH: number, beaconX: number = 2850, beaconY: number = 480) {
    // 1. Organic Drift Physics
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Smooth boundary repellers keeping storms active within map
    const margin = 220;
    if (this.x < margin) this.vx += 8 * dt;
    else if (this.x > mapW - margin) this.vx -= 8 * dt;

    if (this.y < margin) this.vy += 8 * dt;
    else if (this.y > mapH - margin) this.vy -= 8 * dt;

    // Union City Exclusion Zone Repeller (storms NEVER enter Union City sector)
    const distToBeacon = Phaser.Math.Distance.Between(this.x, this.y, beaconX, beaconY);
    const minSafeDist = 1350;
    if (distToBeacon < minSafeDist) {
      const repelAngle = Phaser.Math.Angle.Between(beaconX, beaconY, this.x, this.y);
      const intensityScale = (minSafeDist - distToBeacon) / minSafeDist;
      const repelForce = (18 + intensityScale * 45) * dt;
      this.vx += Math.cos(repelAngle) * repelForce;
      this.vy += Math.sin(repelAngle) * repelForce;
    }

    // Dampen runaway speeds (halved speed cap)
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 21) {
      this.vx = (this.vx / speed) * 21;
      this.vy = (this.vy / speed) * 21;
    }

    // 2. Growth & Shrink Dynamic Lifecycle
    this.phase += this.growthSpeed * dt;
    const norm = (Math.sin(this.phase) + 1) * 0.5;
    this.radius = Phaser.Math.Linear(this.minRadius, this.maxRadius, norm);
    this.intensity = norm;
    this.isCharged = this.intensity >= 0.45;
    this.isViolent = this.canOvergrow && this.intensity >= 0.90; // Overgrown apex threshold -> triggers lightning and red display

    // 3. Slow Vector Rotation for Isobar Ticks
    this.rotationAngle += 0.06 * dt;

    // 4. Update Graphics & Labels
    this.renderGraphics();
  }

  private renderGraphics() {
    this.isobars.clear();

    // 3 Tiers of Atmosphere:
    // 1. Grey (< 0.45): Small/Forming cumulus
    // 2. Yellow (0.45 - 0.78): Normal mature supercell (no lightning)
    // 3. Red (>= 0.78): Overgrown hypercell with lethal lightning
    let color: number;
    let alphaStroke: number;
    let alphaFill: number;
    let labelColor: string;
    let labelText: string;

    const densityPct = Math.round(this.intensity * 100);
    const radiusM = Math.round(this.radius);

    if (this.isViolent) {
      // Overgrown storm: Threat Red with active lightning
      color = 0xef4444;
      alphaStroke = 0.65 + (this.intensity - 0.78) * 0.8;
      alphaFill = 0.07 + (this.intensity - 0.78) * 0.08;
      labelColor = '#ef4444';
      labelText = `⚡ CELL-${this.id} [APEX CUMULONIMBUS // ⚡ LIGHTNING]\n  DENS: ${densityPct}% // RAD: ${radiusM}M // YIELD: MAX`;
    } else if (this.isCharged) {
      // Mature Charged Supercell: Tactical High-Voltage Yellow (NO lightning)
      color = 0xfacc15;
      alphaStroke = 0.45 + (this.intensity - 0.45) * 0.3;
      alphaFill = 0.035 + (this.intensity - 0.45) * 0.04;
      labelColor = '#facc15';
      labelText = `▲ CELL-${this.id} [MATURE CUMULONIMBUS]\n  DENS: ${densityPct}% // RAD: ${radiusM}M // YIELD: HIGH`;
    } else {
      // Small/Forming storm: Slate Grey/White
      color = 0xd1d5db;
      alphaStroke = 0.26 + this.intensity * 0.12;
      alphaFill = 0.02 + this.intensity * 0.02;
      labelColor = '#737373';
      labelText = `△ CELL-${this.id} [DEVELOPING CUMULUS]\n  DENS: ${densityPct}% // RAD: ${radiusM}M // INSUFFICIENT VAPOR`;
    }

    // Outer Perimeter Isobar
    this.isobars.lineStyle(this.isViolent ? 2.0 : 1.5, color, alphaStroke);
    this.isobars.strokeCircle(this.x, this.y, this.radius);

    // Inner Concentric Moisture Layers
    this.isobars.lineStyle(1, color, alphaStroke * 0.7);
    this.isobars.strokeCircle(this.x, this.y, this.radius * 0.68);
    this.isobars.strokeCircle(this.x, this.y, this.radius * 0.38);

    // High Density Eye/Core Ring
    this.isobars.lineStyle(1.4, this.isViolent ? 0xff4444 : (this.isCharged ? 0xffffff : color), alphaStroke * 0.95);
    this.isobars.strokeCircle(this.x, this.y, Math.max(16, this.radius * 0.15));

    // Fill
    this.isobars.fillStyle(color, alphaFill);
    this.isobars.fillCircle(this.x, this.y, this.radius);

    // Radial Weather Barbs / Vector Ticks
    const numTicks = this.isViolent ? 12 : (this.isCharged ? 8 : 4);
    this.isobars.lineStyle(1, color, alphaStroke * 0.55);
    for (let i = 0; i < numTicks; i++) {
      const angle = this.rotationAngle + (i * Math.PI * 2) / numTicks;
      const innerX = this.x + Math.cos(angle) * (this.radius * 0.38);
      const innerY = this.y + Math.sin(angle) * (this.radius * 0.38);
      const outerX = this.x + Math.cos(angle) * (this.radius * 0.95);
      const outerY = this.y + Math.sin(angle) * (this.radius * 0.95);
      this.isobars.lineBetween(innerX, innerY, outerX, outerY);
    }

    // Dynamic Atmospheric Telemetry Label
    this.label.setPosition(this.x - this.radius + 12, this.y - this.radius + 12);
    this.label.setText(labelText);
    this.label.setColor(labelColor);
  }

  public checkContainment(px: number, py: number): boolean {
    const distSq = (this.x - px) ** 2 + (this.y - py) ** 2;
    return distSq <= this.radius ** 2;
  }

  public destroy() {
    this.isobars.destroy();
    this.label.destroy();
  }
}

export class UnionBeacon extends Phaser.Physics.Arcade.Sprite {
  public beaconGraphic: Phaser.GameObjects.Graphics;
  public beaconLabel: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'union_beacon');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setImmovable(true);
    this.setDepth(6);

    this.beaconGraphic = scene.add.graphics();
    this.beaconGraphic.setDepth(5);

    this.beaconLabel = scene.add.text(x, y + 36, '[UNION_13: DPC ARCOLOGY DOCK]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '10px',
      color: '#facc15',
      align: 'center',
    }).setOrigin(0.5).setDepth(12);
  }

  public update(_time: number) {
    this.beaconGraphic.clear();
    const r = 110;
    this.beaconGraphic.lineStyle(1.5, 0xfacc15, 0.6);
    this.beaconGraphic.strokeCircle(this.x, this.y, r);

    this.beaconGraphic.lineBetween(this.x - r - 8, this.y, this.x + r + 8, this.y);
    this.beaconGraphic.lineBetween(this.x, this.y - r - 8, this.x, this.y + r + 8);
  }

  public destroy(fromScene?: boolean) {
    this.beaconGraphic.destroy();
    this.beaconLabel.destroy();
    super.destroy(fromScene);
  }
}
