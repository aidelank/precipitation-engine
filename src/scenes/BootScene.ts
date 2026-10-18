import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Zero external image dependencies - 100% procedural vector wireframe
  }

  create() {
    this.createTacticalGlyphs();
    this.scene.start('MainMenuScene');
  }

  private createTacticalGlyphs() {
    // 1. Stratoreservoir Atmospheric Airship Glyph (128x80)
    const shipCanvas = this.textures.createCanvas('mothership', 128, 80);
    if (shipCanvas) {
      const ctx = shipCanvas.context;
      ctx.imageSmoothingEnabled = false;

      // Heavy Carrier Diamond Hull
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(110, 40); // Bow
      ctx.lineTo(80, 16);
      ctx.lineTo(20, 16);
      ctx.lineTo(10, 40);  // Stern
      ctx.lineTo(20, 64);
      ctx.lineTo(80, 64);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fill();

      // Core Bridge / Siphon Pylon (Yellow)
      ctx.fillStyle = '#facc15';
      ctx.fillRect(50, 32, 28, 16);

      // Fore Vacuum Condensation Array
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(84, 22, 16, 10);
      ctx.strokeRect(84, 48, 16, 10);

      // Serial Tag
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('WEP-01', 44, 44);

      shipCanvas.refresh();
    }

    // 1b. DPC Stratoreservoir WEP-02 Hull Texture (120x80)
    const ship02Canvas = this.textures.createCanvas('mothership_02', 120, 80);
    if (ship02Canvas) {
      const ctx = ship02Canvas.context;
      ctx.imageSmoothingEnabled = false;

      // Heavy Carrier Diamond Hull (Green/Gold Union Fleet Finish)
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(110, 40); // Bow
      ctx.lineTo(80, 16);
      ctx.lineTo(20, 16);
      ctx.lineTo(10, 40);  // Stern
      ctx.lineTo(20, 64);
      ctx.lineTo(80, 64);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fill();

      // Core Bridge / Siphon Pylon (Vibrant Emerald)
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(50, 32, 28, 16);

      // Fore Vacuum Condensation Array
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.strokeRect(84, 22, 16, 10);
      ctx.strokeRect(84, 48, 16, 10);

      // Serial Tag
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('WEP-02', 44, 44);

      ship02Canvas.refresh();
    }

    // 2. DPC Aegis Escort Carrier (64x42)
    const carrierCanvas = this.textures.createCanvas('escort_carrier', 64, 42);
    if (carrierCanvas) {
      const ctx = carrierCanvas.context;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(56, 21); // Bow
      ctx.lineTo(38, 7);
      ctx.lineTo(10, 7);
      ctx.lineTo(6, 21);  // Stern
      ctx.lineTo(10, 35);
      ctx.lineTo(38, 35);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(20, 20, 20, 0.9)';
      ctx.fill();

      // Wing weapon sponsons
      ctx.fillStyle = '#facc15';
      ctx.fillRect(24, 4, 14, 4);
      ctx.fillRect(24, 34, 14, 4);

      // Bridge core
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(28, 18, 12, 6);

      carrierCanvas.refresh();
    }

    // 2b. DPC Defense Drone - Tactical Miniature Chevron (18x18)
    const droneCanvas = this.textures.createCanvas('drone', 18, 18);
    if (droneCanvas) {
      const ctx = droneCanvas.context;
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(15, 9);
      ctx.lineTo(3, 3);
      ctx.lineTo(7, 9);
      ctx.lineTo(3, 15);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(8, 8, 2, 2);

      droneCanvas.refresh();
    }

    // 2c. Union DPC Flak Patrol Corvette - Fast Interceptor (48x30)
    const corvetteCanvas = this.textures.createCanvas('union_corvette', 48, 30);
    if (corvetteCanvas) {
      const ctx = corvetteCanvas.context;
      
      // Main armored corvette hull wedge
      ctx.fillStyle = 'rgba(10, 18, 30, 0.9)';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(44, 15); // Bow
      ctx.lineTo(26, 4);
      ctx.lineTo(6, 4);
      ctx.lineTo(2, 15);  // Stern
      ctx.lineTo(6, 26);
      ctx.lineTo(26, 26);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Twin Heavy Pulse Cannon Barrels
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(24, 2, 14, 2.5);
      ctx.fillRect(24, 25.5, 14, 2.5);

      // Centerline Reinforced Spine Armor
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(38, 15);
      ctx.lineTo(8, 15);
      ctx.stroke();

      // Armored Bridge / Target Acquisition Optics
      ctx.fillStyle = '#facc15';
      ctx.fillRect(18, 12, 10, 6);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(22, 13.5, 4, 3);

      corvetteCanvas.refresh();
    }

    // 3. Exile Scout Airship - Inverted Scrap Hull (32x24)
    const scoutCanvas = this.textures.createCanvas('raider_scout', 32, 24);
    if (scoutCanvas) {
      const ctx = scoutCanvas.context;
      ctx.fillStyle = 'rgba(220, 38, 38, 0.45)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(28, 12);
      ctx.lineTo(4, 3);
      ctx.lineTo(10, 12);
      ctx.lineTo(4, 21);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Red armored cockpit spine
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(22, 12);
      ctx.lineTo(10, 12);
      ctx.stroke();

      // Cockpit red phosphor eye
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(16, 11, 4, 2);

      scoutCanvas.refresh();
    }

    // 4. Exile Heavy Raider - Reinforced Scrap Citadel (56x40)
    const heavyCanvas = this.textures.createCanvas('raider_heavy', 56, 40);
    if (heavyCanvas) {
      const ctx = heavyCanvas.context;
      
      // 1. Lateral Armored Sponsons / Cross Plating (Extended top and bottom)
      ctx.fillStyle = 'rgba(40, 5, 5, 0.85)';
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1.5;
      ctx.fillRect(18, 5, 20, 30);
      ctx.strokeRect(18, 5, 20, 30);

      // 2. Main Rectangular Citadel Hull
      ctx.fillStyle = 'rgba(153, 27, 27, 0.75)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.fillRect(8, 10, 40, 20);
      ctx.strokeRect(8, 10, 40, 20);

      // 3. Single Heavy Forward Cannon (centered prow barrel)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(44, 18, 11, 4);

      // 4. Armored Command Bridge Core
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.fillRect(22, 14, 12, 12);
      ctx.strokeRect(22, 14, 12, 12);

      // 5. Red Targeting Optic
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(26, 18, 4, 4);

      heavyCanvas.refresh();
    }

    // 4b. Exile Missile Frigate - Long-Range Standoff Silo Cruiser (52x30)
    const missileShipCanvas = this.textures.createCanvas('raider_missile', 52, 30);
    if (missileShipCanvas) {
      const ctx = missileShipCanvas.context;

      // Elongated missile cruiser hull
      ctx.fillStyle = 'rgba(180, 20, 20, 0.6)';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(48, 15); // Needle Bow
      ctx.lineTo(34, 6);
      ctx.lineTo(8, 6);
      ctx.lineTo(2, 15);  // Engine Bay
      ctx.lineTo(8, 24);
      ctx.lineTo(34, 24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Top and Bottom External Missile Silo Pods (Vertical launch cells)
      ctx.fillStyle = '#991b1b';
      ctx.strokeStyle = '#fca5a5';
      ctx.lineWidth = 1;

      // Top Silo Pod
      ctx.fillRect(16, 2, 18, 5);
      ctx.strokeRect(16, 2, 18, 5);
      // Bottom Silo Pod
      ctx.fillRect(16, 23, 18, 5);
      ctx.strokeRect(16, 23, 18, 5);

      // Silo Hatch Tubes
      ctx.fillStyle = '#facc15';
      ctx.fillRect(19, 3, 3, 3);
      ctx.fillRect(24, 3, 3, 3);
      ctx.fillRect(29, 3, 3, 3);

      ctx.fillRect(19, 24, 3, 3);
      ctx.fillRect(24, 24, 3, 3);
      ctx.fillRect(29, 24, 3, 3);

      // Long-range Target Acquisition Radar / Optics
      ctx.fillStyle = '#000000';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.fillRect(22, 11, 14, 8);
      ctx.strokeRect(22, 11, 14, 8);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(30, 13, 4, 4);

      missileShipCanvas.refresh();
    }

    // 4c. Destructible Guided Exile Rocket Projectile (20x10)
    const missileProjCanvas = this.textures.createCanvas('raider_missile_proj', 20, 10);
    if (missileProjCanvas) {
      const ctx = missileProjCanvas.context;

      // Rocket Body Cone
      ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(18, 5);  // Nose Warhead
      ctx.lineTo(6, 1.5);
      ctx.lineTo(2, 1.5);  // Top Fin
      ctx.lineTo(5, 5);    // Motor Core
      ctx.lineTo(2, 8.5);  // Bottom Fin
      ctx.lineTo(6, 8.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Glowing Active Tracking Tip
      ctx.fillStyle = '#facc15';
      ctx.fillRect(14, 4, 3, 2);

      missileProjCanvas.refresh();
    }

    // 5. Union-13 Arcology Dock Beacon (64x64)
    const beaconCanvas = this.textures.createCanvas('union_beacon', 64, 64);
    if (beaconCanvas) {
      const ctx = beaconCanvas.context;
      ctx.fillStyle = '#000000';
      ctx.fillRect(16, 16, 32, 32);

      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.strokeRect(16, 16, 32, 32);

      ctx.beginPath();
      ctx.arc(32, 32, 8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(30, 30, 4, 4);

      beaconCanvas.refresh();
    }

    // 6. Particle textures
    this.createCircleParticle('particle_smoke', 6, '#ffffff');
    this.createCircleParticle('particle_spark', 4, '#facc15');
    this.createCircleParticle('particle_water', 5, '#ffffff');
  }

  private createCircleParticle(key: string, size: number, color: string) {
    const canvas = this.textures.createCanvas(key, size * 2, size * 2);
    if (!canvas) return;
    const ctx = canvas.context;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size, size, size - 1, 0, Math.PI * 2);
    ctx.fill();
    canvas.refresh();
  }
}
