import Phaser from 'phaser';
import { Stratoreservoir, PowerMode } from '../entities/Stratoreservoir';
import { EscortCarrier } from '../entities/EscortCarrier';
import { RaiderAirship, RaiderType } from '../entities/RaiderAirship';
import { CloudZone, CloudType, UnionBeacon } from '../entities/CloudField';
import { UnionCorvette } from '../entities/UnionCorvette';
import { CorvetteSquadron } from '../entities/CorvetteSquadron';
import { RaiderMissile } from '../entities/RaiderMissile';
import { soundSynth } from '../audio/SoundSynth';

export type FleetUnit = EscortCarrier | CorvetteSquadron;

// Slots 2..9 (indices 0..7) each hold a GROUP of units that are commanded together.
// New ships land in the first open slot by default; the player can drag ships between
// slots in the Tab PDA menu to merge/regroup them into combined command groups.
export class GameScene extends Phaser.Scene {
  public player!: Stratoreservoir;
  public fleet: FleetUnit[][] = [[], [], [], [], [], [], [], []];
  public readonly unionDefenseRange: number = 460; // Defense perimeter range for Arcology Strike Laser
  public selectedSlot: number = 1; // 1 = Stratoreservoir, 2..9 = fleet[selectedSlot - 2]
  public enemies: RaiderAirship[] = [];
  public activeMissiles: RaiderMissile[] = [];
  public cloudZones: CloudZone[] = [];
  public beacon!: UnionBeacon;

  public credits: number = 500;
  public totalWaterDelivered: number = 0;
  public currentWave: number = 1;
  public level: number = 1;
  public days: number = 1;
  public isGameOver: boolean = false;
  public isPdaOpen: boolean = false;
  public isPaused: boolean = false;
  public hasPurchasedSecondStratoreservoir: boolean = false;
  private secondStratoreservoirSprite: Phaser.Physics.Arcade.Sprite | null = null;
  private secondStratoreservoirLabel: Phaser.GameObjects.Text | null = null;
  private secondStratoMooringFx: Phaser.GameObjects.Graphics | null = null;

  private enemySpawnTimer: number = 45.0;
  private convoySpawnTimer: number = 90;
  private convoyRaiders: RaiderAirship[] = [];
  private lightningTimer: number = 3.0;
  private sensorSweepAngle: number = 0;
  private hudUpdateTimer: number = 0;
  private dayTimer: number = 0;
  private unionLaserCooldown: number = 0;
  private creditFraction: number = 0;
  private readonly waterDumpRate: number = 125; // KG/s offload while docked
  private readonly creditPerKg: number = 0.4; // full tank (5000 KG) = ₳2000
  private starterChosen: boolean = false;
  private lastErrorLog: number = 0;
  private nextShipId: number = 2;
  private dragState: { slotIdx: number; unitIdx: number } | null = null;

  // Keyboard
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyUp!: Phaser.Input.Keyboard.Key;
  private keyLeft!: Phaser.Input.Keyboard.Key;
  private keyDown!: Phaser.Input.Keyboard.Key;
  private keyRight!: Phaser.Input.Keyboard.Key;
  private keySpace!: Phaser.Input.Keyboard.Key;
  private keyM!: Phaser.Input.Keyboard.Key;
  private keyShift!: Phaser.Input.Keyboard.Key;
  private numKeys: Phaser.Input.Keyboard.Key[] = [];

  private terrainGraphics!: Phaser.GameObjects.Graphics;
  private sensorGraphics!: Phaser.GameObjects.Graphics;
  private cursorHudGraphics!: Phaser.GameObjects.Graphics;
  private lightningGraphic!: Phaser.GameObjects.Graphics;
  private unionLaserGraphic!: Phaser.GameObjects.Graphics;
  private convoyPathGraphics!: Phaser.GameObjects.Graphics;

  private targetZoom: number = 1.0;
  private readonly minZoom: number = 0.35;
  private readonly maxZoom: number = 2.2;

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.isGameOver = false;
    this.isPdaOpen = false;
    this.isPaused = false;
    this.starterChosen = false;
    this.credits = 500;
    this.totalWaterDelivered = 0;
    this.creditFraction = 0;
    this.currentWave = 1;
    this.level = 1;
    this.days = 1;
    this.dayTimer = 0;
    this.selectedSlot = 1;
    this.nextShipId = 2;
    this.dragState = null;
    this.fleet = [[], [], [], [], [], [], [], []];
    this.enemies = [];
    this.convoyRaiders = [];
    this.hasPurchasedSecondStratoreservoir = false;
    this.secondStratoreservoirSprite = null;
    this.secondStratoreservoirLabel = null;
    this.secondStratoMooringFx = null;

    // Defensive modal reset (page reload normally rebuilds the DOM from scratch)
    document.getElementById('pause-modal')?.classList.add('hidden');
    document.getElementById('game-over-modal')?.classList.add('hidden');
    document.getElementById('demo-complete-modal')?.classList.add('hidden');

    // Show & initialize the top-left level/day HUD
    const lvlHud = document.getElementById('level-days-hud');
    if (lvlHud) {
      lvlHud.classList.remove('hidden');
      lvlHud.innerText = 'LEVEL 1 · WAVE 1 · DAY 1';
    }

    this.activeMissiles = [];
    this.cloudZones = [];
    this.enemySpawnTimer = 50.0;
    this.convoySpawnTimer = 90;
    this.lightningTimer = 3.0;
    this.targetZoom = 1.0;
    this.unionLaserCooldown = 0;

    const mapW = 3600;
    const mapH = 2400;
    this.physics.world.setBounds(0, 0, mapW, mapH);

    // 1. Terrain & Dimmed Tactical Grid
    this.terrainGraphics = this.add.graphics().setDepth(0);
    this.drawSector13TexturedMap(mapW, mapH);
    this.createDimmedTacticalOverlay(mapW, mapH);

    // 2. Union City Arcology Dock (Top-Right Coastal Bay)
    this.beacon = new UnionBeacon(this, 2850, 480);

    // 3. Spawn Primary Water Harvester (Slot 1)
    this.player = new Stratoreservoir(this, 2760, 520);
    this.player.isSelected = true;

    // 4. Starter escort ship & initial hostiles are deferred until the player picks a package
    // 5. Clouds
    this.generateSector13Clouds();

    // 6. Camera Settings (Free WASD Pan, Space to Re-focus, Scroll Wheel Zoom)
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.cameras.main.setZoom(1.0);

    // Graphics Layers
    this.sensorGraphics = this.add.graphics().setDepth(2);
    this.cursorHudGraphics = this.add.graphics().setDepth(20);
    this.lightningGraphic = this.add.graphics().setDepth(15);
    this.unionLaserGraphic = this.add.graphics().setDepth(16);
    this.convoyPathGraphics = this.add.graphics().setDepth(4);

    // Setup Keyboard Controls
    this.setupKeyboard();

    // Setup Mouse Wheel Zoom
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gameObjects: any, _deltaX: number, deltaY: number) => {
      const factor = deltaY > 0 ? 0.88 : 1.14;
      this.targetZoom = Phaser.Math.Clamp(this.targetZoom * factor, this.minZoom, this.maxZoom);
    });

    // Setup PDA DOM Listeners
    this.setupPdaDom();

    // Setup Starter Package Selection (defers escort ship + initial hostiles until chosen)
    this.setupStarterPackage();

    const startAudio = () => {
      soundSynth.startControlRoomAtmosphere();
    };
    this.input.once('pointerdown', startAudio);
    this.input.keyboard?.once('keydown', startAudio);

    // Pointer Down: Left Click = Unit Action (Drone strike / Siphon Deploy) | Right Click = Navigation & Cancel Waypoints
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      startAudio();
      if (!this.starterChosen || this.isPaused) return;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const isShiftHeld = (this.keyShift?.isDown || (pointer.event as MouseEvent)?.shiftKey) ?? false;

      if (this.selectedSlot === 1) {
        // Flagship (single unit)
        const activeShip = this.player;
        if (!activeShip.active) return;

        if (pointer.leftButtonDown()) {
          if (isShiftHeld && activeShip.waypoints.length > 0) {
            // Shift + Left-Click toggles scheduled auto-deploy when arriving at final waypoint
            activeShip.queueDeployAtEnd = !activeShip.queueDeployAtEnd;
            soundSynth.playWaypointOrder();
          } else {
            activeShip.toggleDeploy();
          }
        } else if (pointer.rightButtonDown()) {
          // Right-Click: Movement & Click-to-Cancel Waypoints
          const cancelled = activeShip.tryCancelWaypoint(worldPoint.x, worldPoint.y, 28);
          if (!cancelled) {
            if (isShiftHeld) {
              activeShip.addWaypoint(worldPoint.x, worldPoint.y);
            } else {
              activeShip.setWaypoint(worldPoint.x, worldPoint.y);
            }
          }
        }
      } else {
        // Fleet slot — command every live ship in the selected group at once
        const group = this.getSelectedFleetUnits().filter(u => u.active && !u.isDestroyed);
        if (group.length === 0) return;

        if (pointer.leftButtonDown()) {
          // Left-Click: Execute Unit Function / Scheduled Action (per ship type)
          for (const ship of group) {
            if (ship instanceof EscortCarrier) {
              const cancelled = ship.tryCancelWaypoint(worldPoint.x, worldPoint.y, 28);
              if (!cancelled) {
                if (isShiftHeld) ship.addDroneTarget(worldPoint.x, worldPoint.y);
                else ship.dispatchDronesTo(worldPoint.x, worldPoint.y);
              }
            } else if (ship instanceof CorvetteSquadron) {
              // Corvette left-click toggles weapon mode (RAPID <-> RAILGUN)
              ship.toggleWeaponMode();
            }
          }
        } else if (pointer.rightButtonDown()) {
          // Right-Click: Movement & Click-to-Cancel Waypoints (whole group)
          const cancelled = this.cancelGroupWaypoint(worldPoint.x, worldPoint.y, 28);
          if (!cancelled) {
            const targets = this.scatterGroupTargets(group, worldPoint.x, worldPoint.y);
            for (let i = 0; i < group.length; i++) {
              const t = targets[i];
              if (isShiftHeld) group[i].addWaypoint(t.x, t.y);
              else group[i].setWaypoint(t.x, t.y);
            }
          }
        }
      }
    });
  }

  private setupKeyboard() {
    if (!this.input.keyboard) return;

    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.TAB,
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
    ]);

    this.keyW = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyUp = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    this.keyLeft = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT);
    this.keyDown = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN);
    this.keyRight = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT);

    this.keySpace = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyM = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.M);
    this.keyShift = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Space: Snappy re-focus to selected ship
    this.keySpace.on('down', () => this.refocusCameraOnSelected());

    // Tab is handled globally in handleGlobalKeyDown (single source of truth) so it never
    // double-toggles against Phaser's own window-level keydown listener.
    // M: Mute
    this.keyM.on('down', () => soundSynth.toggleMute());

    // Selection Keys: 1 = flagship, 2-9 = fleet slots (each slot can hold a merged group)
    const keyCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE,
    ];

    keyCodes.forEach((code, index) => {
      const key = this.input.keyboard!.addKey(code);
      key.on('down', () => this.selectFleetSlot(index + 1));
      this.numKeys.push(key);
    });
  }

  // All units in the currently selected fleet slot (empty for flagship slot 1).
  public getSelectedFleetUnits(): FleetUnit[] {
    if (this.selectedSlot === 1) return [];
    const index = this.selectedSlot - 2;
    return (index >= 0 && index < this.fleet.length) ? this.fleet[index] : [];
  }

  // Single unit used for camera / radar / HUD anchoring.
  public getSelectedUnit(): Stratoreservoir | FleetUnit | null {
    if (this.selectedSlot === 1) return this.player;
    const group = this.getSelectedFleetUnits();
    return group.find(u => u.active && !u.isDestroyed) ?? group[0] ?? null;
  }

  // Flattened list of every fleet unit across all slots.
  public getAllFleetUnits(): FleetUnit[] {
    const all: FleetUnit[] = [];
    for (const group of this.fleet) {
      for (const unit of group) all.push(unit);
    }
    return all;
  }

  public selectFleetSlot(slotNumber: number) {
    if (slotNumber < 1 || slotNumber > 9) return;
    this.selectedSlot = slotNumber;

    // Update selection states — every ship in the selected slot is highlighted together
    this.player.isSelected = (this.selectedSlot === 1);
    for (let i = 0; i < this.fleet.length; i++) {
      for (const unit of this.fleet[i]) {
        unit.isSelected = (this.selectedSlot === i + 2);
      }
    }

    soundSynth.playUnitSelectSound();
  }

  // Re-click cancellation across a group: any unit whose waypoint sits under the cursor
  // cancels that node. Returns true if at least one node was cancelled (suppresses the
  // subsequent order so a click never both cancels and issues a new command).
  private cancelGroupWaypoint(wx: number, wy: number, threshold: number = 28): boolean {
    let cancelled = false;
    for (const unit of this.getSelectedFleetUnits()) {
      if (unit.active && !unit.isDestroyed && unit.tryCancelWaypoint(wx, wy, threshold)) {
        cancelled = true;
      }
    }
    return cancelled;
  }

  // Spread a group's move targets into a perpendicular line formation so multiple
  // units commanded together don't stack on a single point.
  private scatterGroupTargets(group: FleetUnit[], tx: number, ty: number): { x: number; y: number }[] {
    const n = group.length;
    if (n <= 1) return [{ x: tx, y: ty }];

    const cx = group.reduce((s, u) => s + u.x, 0) / n;
    const cy = group.reduce((s, u) => s + u.y, 0) / n;

    // Perpendicular to the group's approach direction
    const angle = Math.atan2(ty - cy, tx - cx);
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    const spacing = 130;
    const targets: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * spacing;
      targets.push({ x: tx + perpX * off, y: ty + perpY * off });
    }
    return targets;
  }

  public refocusCameraOnSelected() {
    const unit = this.getSelectedUnit();
    const target = (unit && unit.active && !('isDestroyed' in unit && unit.isDestroyed)) ? unit : this.player;
    // Force snappy smooth center-on pan
    this.cameras.main.pan(target.x, target.y, 280, 'Cubic.easeOut', true);
    soundSynth.playRadarPing();
  }

  public toggleFleetPda() {
    if (!this.starterChosen) return;
    this.isPdaOpen = !this.isPdaOpen;
    const pdaEl = document.getElementById('fleet-pda-modal');
    if (pdaEl) {
      if (this.isPdaOpen) {
        pdaEl.classList.remove('hidden');
        this.updatePdaContent();
      } else {
        pdaEl.classList.add('hidden');
      }
    }
    soundSynth.playUnitSelectSound();
  }

  public pauseGame() {
    if (!this.starterChosen || this.isGameOver || this.isPaused) return;
    this.isPaused = true;
    this.physics.world.pause();
    const modal = document.getElementById('pause-modal');
    if (modal) modal.classList.remove('hidden');
    soundSynth.playUnitSelectSound();
  }

  public resumeGame() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.physics.world.resume();
    const modal = document.getElementById('pause-modal');
    if (modal) modal.classList.add('hidden');
    soundSynth.playUnitSelectSound();
  }

  public restartGame() {
    // Full page reload guarantees a clean slate (DOM modals, listeners, and scene state).
    window.location.reload();
  }

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      if (!this.starterChosen || this.isGameOver || this.isPaused) return;
      this.toggleFleetPda();
    } else if (e.code === 'Escape' || e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!this.starterChosen || this.isGameOver) return;
      const demoModal = document.getElementById('demo-complete-modal');
      if (demoModal && !demoModal.classList.contains('hidden')) {
        this.resumeFromVictory();
        return;
      }
      if (this.isPdaOpen) {
        this.toggleFleetPda();
      } else if (this.isPaused) {
        this.resumeGame();
      } else {
        this.pauseGame();
      }
    }
  };

  private setupPdaDom() {
    window.addEventListener('keydown', this.handleGlobalKeyDown);

    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this.handleGlobalKeyDown);
    });
    this.events.once('destroy', () => {
      window.removeEventListener('keydown', this.handleGlobalKeyDown);
    });

    const closeBtn = document.getElementById('pda-close-btn');
    closeBtn?.addEventListener('click', () => {
      if (this.isPdaOpen) this.toggleFleetPda();
    });

    const buyCarrierBtn = document.getElementById('buy-carrier-btn');
    buyCarrierBtn?.addEventListener('click', () => this.purchaseCarrier(1200));

    const buyCorvettesBtn = document.getElementById('buy-corvettes-btn');
    buyCorvettesBtn?.addEventListener('click', () => this.purchaseCorvetteSquadron(1200));

    const buyStratoBtn = document.getElementById('buy-stratoreservoir-btn');
    buyStratoBtn?.addEventListener('click', () => this.purchaseStratoreservoir(5000));

    // Pause menu & restart wiring (onclick is idempotent across scene restarts)
    const pauseResumeBtn = document.getElementById('pause-resume-btn');
    if (pauseResumeBtn) pauseResumeBtn.onclick = () => this.resumeGame();

    const pauseRestartBtn = document.getElementById('pause-restart-btn');
    if (pauseRestartBtn) pauseRestartBtn.onclick = () => this.restartGame();

    const gameOverRestartBtn = document.getElementById('restart-btn');
    if (gameOverRestartBtn) gameOverRestartBtn.onclick = () => this.restartGame();

    // Victory modal wiring
    const victoryContinueBtn = document.getElementById('victory-continue-btn');
    if (victoryContinueBtn) victoryContinueBtn.onclick = () => this.resumeFromVictory();

    const victoryRestartBtn = document.getElementById('victory-restart-btn');
    if (victoryRestartBtn) victoryRestartBtn.onclick = () => this.restartGame();

    // Roster drag-and-drop merging (delegated so innerHTML re-renders keep working)
    this.setupRosterDragDrop();
  }

  private showDemoCompleteModal() {
    this.isPaused = true;
    this.physics.world.pause();

    const victoryDaysEl = document.getElementById('victory-days');
    const victoryWavesEl = document.getElementById('victory-waves');
    const victoryWaterEl = document.getElementById('victory-water');
    const victoryCreditsEl = document.getElementById('victory-credits');

    if (victoryDaysEl) victoryDaysEl.innerText = `DAY ${this.days}`;
    if (victoryWavesEl) victoryWavesEl.innerText = `${this.currentWave}`;
    if (victoryWaterEl) victoryWaterEl.innerText = `${Math.floor(this.totalWaterDelivered).toLocaleString()} KG`;
    if (victoryCreditsEl) victoryCreditsEl.innerText = `₳ ${this.credits.toLocaleString()} UC`;

    const modal = document.getElementById('demo-complete-modal');
    if (modal) modal.classList.remove('hidden');
  }

  public resumeFromVictory() {
    const modal = document.getElementById('demo-complete-modal');
    if (modal) modal.classList.add('hidden');
    this.isPaused = false;
    this.physics.world.resume();
    soundSynth.playUnitSelectSound();
  }

  private spawnMooredSecondStratoreservoir() {
    if (this.secondStratoreservoirSprite) return;
    const sx = this.beacon.x + 85;
    const sy = this.beacon.y + 40;
    this.secondStratoreservoirSprite = this.physics.add.sprite(sx, sy, 'mothership_02');
    this.secondStratoreservoirSprite.setRotation(0.35);
    this.secondStratoreservoirSprite.setDepth(9);
    this.secondStratoreservoirSprite.setImmovable(true);

    this.secondStratoreservoirLabel = this.add.text(sx, sy + 44, '[WEP-02: DOCKED · COMMISSIONED]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '9px',
      color: '#4ade80',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      padding: { x: 4, y: 2 }
    }).setOrigin(0.5).setDepth(12);

    // Subtle pulsating mooring beacon perimeter
    this.secondStratoMooringFx = this.add.graphics().setDepth(8);
    this.secondStratoMooringFx.lineStyle(1.5, 0x4ade80, 0.7);
    this.secondStratoMooringFx.strokeCircle(sx, sy, 72);
    this.tweens.add({
      targets: this.secondStratoMooringFx,
      alpha: 0.25,
      duration: 1200,
      yoyo: true,
      repeat: -1
    });
  }

  private setupRosterDragDrop() {
    const rosterList = document.getElementById('pda-roster-list');
    if (!rosterList) return;

    rosterList.addEventListener('dragstart', (e: DragEvent) => {
      const card = (e.target as HTMLElement | null)?.closest?.('[data-drag-unit]');
      if (!card) return;
      const slotIdx = Number(card.getAttribute('data-slot-idx'));
      const unitIdx = Number(card.getAttribute('data-unit-idx'));
      if (!Number.isFinite(slotIdx) || !Number.isFinite(unitIdx)) return;
      this.dragState = { slotIdx, unitIdx };
      e.dataTransfer?.setData('text/plain', `${slotIdx}:${unitIdx}`);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    rosterList.addEventListener('dragend', () => {
      this.dragState = null;
      rosterList.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      rosterList.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
      this.updatePdaContent();
    });

    rosterList.addEventListener('dragover', (e: DragEvent) => {
      const slot = (e.target as HTMLElement | null)?.closest?.('[data-drop-slot]');
      if (!slot || !this.dragState) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      slot.classList.add('drop-target');
    });

    rosterList.addEventListener('dragleave', (e: DragEvent) => {
      const slot = (e.target as HTMLElement | null)?.closest?.('[data-drop-slot]');
      if (slot) slot.classList.remove('drop-target');
    });

    rosterList.addEventListener('drop', (e: DragEvent) => {
      e.preventDefault();
      const slot = (e.target as HTMLElement | null)?.closest?.('[data-drop-slot]');
      rosterList.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
      if (!slot || !this.dragState) return;
      const targetIdx = Number(slot.getAttribute('data-drop-slot'));
      const { slotIdx, unitIdx } = this.dragState;
      this.dragState = null;
      this.mergeUnitIntoSlot(slotIdx, unitIdx, targetIdx);
    });
  }

  private mergeUnitIntoSlot(srcIdx: number, unitIdx: number, dstIdx: number) {
    if (srcIdx === dstIdx) return;
    if (srcIdx < 0 || dstIdx < 0 || srcIdx >= this.fleet.length || dstIdx >= this.fleet.length) {
      return;
    }
    const srcGroup = this.fleet[srcIdx];
    const unit = srcGroup[unitIdx];
    if (!unit) return;

    srcGroup.splice(unitIdx, 1);
    this.fleet[dstIdx].push(unit);
    unit.isSelected = (this.selectedSlot === dstIdx + 2);

    soundSynth.playUnitSelectSound();
    this.updatePdaContent();
  }

  // Starter package: pick one free escort vessel at game start (carrier OR corvette pair)
  private setupStarterPackage() {
    const modal = document.getElementById('starter-modal');
    if (modal) modal.classList.remove('hidden');

    const carrierBtn = document.getElementById('starter-carrier-btn');
    const corvetteBtn = document.getElementById('starter-corvette-btn');
    if (carrierBtn) carrierBtn.onclick = () => this.chooseStarterPackage('carrier');
    if (corvetteBtn) corvetteBtn.onclick = () => this.chooseStarterPackage('corvette');
  }

  private chooseStarterPackage(type: 'carrier' | 'corvette') {
    if (this.starterChosen) return;
    this.starterChosen = true;

    const modal = document.getElementById('starter-modal');
    if (modal) modal.classList.add('hidden');

    if (type === 'carrier') {
      this.fleet[0].push(new EscortCarrier(this, 2840, 590, this.nextShipId++));
    } else {
      this.fleet[0].push(new CorvetteSquadron(this, 2840, 590, this.nextShipId++));
    }

    // Deferred initial hostile population spawns once the expedition begins
    this.spawnInitialExilePopulation(6);
    soundSynth.playPurchaseSound();
  }

  public purchaseCarrier(cost: number = 1200) {
    if (this.credits < cost) {
      soundSynth.playDamageAlert();
      return;
    }

    // New ships land in the first OPEN slot by default; the player can merge later.
    const emptyIndex = this.fleet.findIndex(group => group.length === 0);
    if (emptyIndex === -1) {
      soundSynth.playDamageAlert();
      return; // All 8 berths occupied
    }

    this.credits -= cost;
    const spawn = this.slotSpawnOffset(emptyIndex);
    this.fleet[emptyIndex].push(new EscortCarrier(this, spawn.x, spawn.y, this.nextShipId++));

    soundSynth.playPurchaseSound();
    this.updatePdaContent();
  }

  public purchaseCorvetteSquadron(cost: number = 800) {
    if (this.credits < cost) {
      soundSynth.playDamageAlert();
      return;
    }

    const emptyIndex = this.fleet.findIndex(group => group.length === 0);
    if (emptyIndex === -1) {
      soundSynth.playDamageAlert();
      return; // All 8 berths occupied
    }

    this.credits -= cost;
    const spawn = this.slotSpawnOffset(emptyIndex);
    this.fleet[emptyIndex].push(new CorvetteSquadron(this, spawn.x, spawn.y, this.nextShipId++));

    soundSynth.playPurchaseSound();
    this.updatePdaContent();
  }

  // Commissioning the second Stratoreservoir (WEP-02) completes the playable demo objective!
  public purchaseStratoreservoir(cost: number = 5000) {
    if (this.hasPurchasedSecondStratoreservoir) {
      soundSynth.playDamageAlert();
      return;
    }
    if (this.credits < cost) {
      soundSynth.playDamageAlert();
      return;
    }
    this.credits -= cost;
    this.hasPurchasedSecondStratoreservoir = true;
    this.level = 2;

    // Close PDA so the player can witness the new vessel moored at the Arcology dock
    if (this.isPdaOpen) {
      this.toggleFleetPda();
    }

    // Spawn the newly commissioned Stratoreservoir WEP-02 at the Arcology slipway
    this.spawnMooredSecondStratoreservoir();

    // Pan camera smoothly to the Arcology Dock
    this.cameras.main.pan(this.beacon.x + 40, this.beacon.y + 25, 900, 'Power2');

    // Play triumphant completion fanfare
    soundSynth.playDemoCompleteSound();

    // Show congratulations and completion debrief modal
    this.showDemoCompleteModal();

    this.updateLevelDaysHud();
    this.updatePdaContent();
  }

  // Spread newly commissioned ships around the Arcology dock so grouped units don't stack.
  private slotSpawnOffset(index: number): { x: number; y: number } {
    const col = (index % 3) - 1;
    const row = Math.floor(index / 3);
    return { x: this.beacon.x + col * 70, y: this.beacon.y + 90 + row * 60 };
  }

  private spawnInitialExilePopulation(count: number = 6) {
    this.enemies.forEach(e => e.destroy());
    this.enemies = [];

    const mapW = 3600;
    const mapH = 2400;
    const initialTypes: RaiderType[] = ['SCOUT', 'MISSILE', 'HEAVY', 'SCOUT', 'MISSILE', 'HEAVY'];

    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      let attempts = 0;

      while (attempts < 30) {
        x = Phaser.Math.Between(300, mapW - 300);
        y = Phaser.Math.Between(250, mapH - 250);
        const distToBeacon = Phaser.Math.Distance.Between(x, y, this.beacon.x, this.beacon.y);
        const distToPlayer = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
        if (distToBeacon > 850 && distToPlayer > 850) break;
        attempts++;
      }

      const type: RaiderType = initialTypes[i % initialTypes.length];
      const raider = new RaiderAirship(this, x, y, type, 'ROAMING');
      this.enemies.push(raider);
    }
  }

  private spawnEnemyWave() {
    this.currentWave++;
    const count = Math.min(3, 1 + Math.floor(this.currentWave * 0.4));
    
    soundSynth.playRadarWarning();

    for (let i = 0; i < count; i++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist = Phaser.Math.Between(1300, 1700);
      const spawnX = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 150, 3450);
      const spawnY = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 150, 2250);

      const roll = Math.random();
      const type: RaiderType = roll < 0.35 ? 'MISSILE' : (roll < 0.7 ? 'HEAVY' : 'SCOUT');
      const enemy = new RaiderAirship(this, spawnX, spawnY, type, 'ROAMING');
      this.enemies.push(enemy);
    }
  }

  // Convoy: a column of raiders flying a fixed straight heading across the map.
  // They pass through and leave unless fired upon. A faint red dashed telegraph
  // line warns the player when they spawn.
  private spawnConvoy() {
    const mapW = 3600;
    const mapH = 2400;
    const margin = 40;

    // Union City Arcology defense zone must never sit on the convoy route (the strike
    // laser + garrison corvettes would wipe the whole column). Keep a healthy clearance.
    const safeDist = this.unionDefenseRange + 250;

    // Entry edge = the map edge furthest from the player, so convoys never appear
    // on top of the fleet. Exit stays on the opposite edge (no special change).
    const ppx = this.player.x;
    const ppy = this.player.y;
    let edge = 0; // 0=TOP 1=BOTTOM 2=LEFT 3=RIGHT
    let maxDist = ppy; // distance to TOP edge (y=0)
    if (mapH - ppy > maxDist) { edge = 1; maxDist = mapH - ppy; }
    if (ppx > maxDist) { edge = 2; maxDist = ppx; }
    if (mapW - ppx > maxDist) { edge = 3; maxDist = mapW - ppx; }

    const inset = 30; // spawn just inside the entry edge (world bounds lock all units in)

    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    let clear = false;

    for (let attempt = 0; attempt < 40 && !clear; attempt++) {
      if (edge === 0) { // TOP -> BOTTOM
        startX = Phaser.Math.Between(200, mapW - 200);
        startY = inset;
        endX = Phaser.Math.Between(200, mapW - 200);
        endY = mapH + margin;
      } else if (edge === 1) { // BOTTOM -> TOP
        startX = Phaser.Math.Between(200, mapW - 200);
        startY = mapH - inset;
        endX = Phaser.Math.Between(200, mapW - 200);
        endY = -margin;
      } else if (edge === 2) { // LEFT -> RIGHT
        startX = inset;
        startY = Phaser.Math.Between(200, mapH - 200);
        endX = mapW + margin;
        endY = Phaser.Math.Between(200, mapH - 200);
      } else { // RIGHT -> LEFT
        startX = mapW - inset;
        startY = Phaser.Math.Between(200, mapH - 200);
        endX = -margin;
        endY = Phaser.Math.Between(200, mapH - 200);
      }

      clear = this.distancePointToSegment(this.beacon.x, this.beacon.y, startX, startY, endX, endY) >= safeDist;
    }

    const heading = Phaser.Math.Angle.Between(startX, startY, endX, endY);

    // Telegraph warning: faint red dashed line along the convoy route. It persists
    // until the whole convoy has left the map (or been destroyed), then fades out.
    this.convoyPathGraphics.clear();
    this.tweens.killTweensOf(this.convoyPathGraphics);
    this.drawDashedLine(this.convoyPathGraphics, startX, startY, endX, endY, 28, 16, 0xff4444, 0.8);
    this.convoyPathGraphics.setAlpha(1);

    soundSynth.playRadarWarning();

    // Column of raiders flying in formation along the same heading
    this.convoyRaiders = [];
    const count = Phaser.Math.Between(5, 10);
    const spacing = 85;
    for (let i = 0; i < count; i++) {
      const offset = i * spacing;
      const x = Phaser.Math.Clamp(startX + Math.cos(heading) * offset, 40, mapW - 40);
      const y = Phaser.Math.Clamp(startY + Math.sin(heading) * offset, 40, mapH - 40);

      const roll = Math.random();
      const type: RaiderType = roll < 0.35 ? 'MISSILE' : (roll < 0.7 ? 'HEAVY' : 'SCOUT');

      const raider = new RaiderAirship(this, x, y, type, 'ROAMING');
      raider.convoyMode = true;
      raider.convoyHeading = heading;
      raider.convoySpeed = 65;
      raider.rotation = heading;
      this.enemies.push(raider);
      this.convoyRaiders.push(raider);
    }
  }

  // Minimum distance from a point to a line segment (for keeping convoys out of Union airspace)
  private distancePointToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Phaser.Math.Distance.Between(px, py, x1, y1);

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Phaser.Math.Clamp(t, 0, 1);
    return Phaser.Math.Distance.Between(px, py, x1 + t * dx, y1 + t * dy);
  }

  private drawDashedLine(
    g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
    dashLen: number, gapLen: number, color: number, alpha: number,
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;

    const seg = dashLen + gapLen;
    g.lineStyle(2.5, color, alpha);
    for (let t = 0; t < dist; t += seg) {
      const t0 = t / dist;
      const t1 = Math.min(1, (t + dashLen) / dist);
      g.beginPath();
      g.moveTo(x1 + dx * t0, y1 + dy * t0);
      g.lineTo(x1 + dx * t1, y1 + dy * t1);
      g.strokePath();
    }
  }

  update(time: number, delta: number) {
    try {
      this.updateInternal(time, delta);
    } catch (err) {
      // Log at most once per second so a persistent error doesn't spam the console
      if (time - this.lastErrorLog > 1000) {
        this.lastErrorLog = time;
        console.error('[GameScene.update] error:', err);
      }
    }
  }

  private updateInternal(time: number, delta: number) {
    if (this.isGameOver || !this.starterChosen || this.isPaused) return;
    const dt = delta / 1000;

    // 1. Smooth Camera Zoom Interpolation
    if (Math.abs(this.cameras.main.zoom - this.targetZoom) > 0.001) {
      const newZoom = Phaser.Math.Linear(this.cameras.main.zoom, this.targetZoom, Math.min(1, 14 * dt));
      this.cameras.main.setZoom(newZoom);
    }

    // 2. Camera WASD Free Pan
    this.handleCameraPan(dt);

    // 3. Update Dynamic Storm Clouds (repelling from Union City top-right dock)
    for (const cloud of this.cloudZones) {
      cloud.update(dt, 3600, 2400, this.beacon.x, this.beacon.y);
    }

    // 3b. Storm cells repel each other — no overlap, so buffeting/yield/lightning never stack
    this.separateCloudZones(dt);

    const activeCloud = this.nearestContainingCloud(this.player.x, this.player.y);
    const bestProximity = activeCloud
      ? Math.max(0, 1.0 - (Phaser.Math.Distance.Between(this.player.x, this.player.y, activeCloud.x, activeCloud.y) / activeCloud.radius))
      : 0;

    if (activeCloud) {
      const isMature = activeCloud.isCharged || activeCloud.isViolent;
      this.player.isInCloud = true;
      this.player.isInMatureCloud = isMature;

      // Center proximity bonus: closer to eye increases yield smoothly (up to 2.0x at dead center)
      const coreBonus = 1.0 + Math.pow(bestProximity, 1.2) * 1.0;
      const baseYield = activeCloud.isViolent
        ? (2.2 + activeCloud.intensity * 1.2)
        : (activeCloud.isCharged ? (1.2 + activeCloud.intensity * 0.8) : 0);
      this.player.cloudQuality = isMature ? (baseYield * coreBonus) : 0;

      if (activeCloud.isViolent) {
        // Proximity scaling: closer to eye -> much higher strike frequency (0.6s at eye vs 4.5s at edge)
        this.lightningTimer -= dt;
        if (this.lightningTimer <= 0) {
          const nextInterval = Phaser.Math.FloatBetween(0.5, 0.9) + (1.0 - bestProximity) * 3.8;
          this.lightningTimer = nextInterval;
          this.triggerLightningStrike(this.player);
        }
      }

      // Auto-return if tank is full
      if (this.player.currentWater >= this.player.maxWater && !this.player.isAutoReturning) {
        this.player.returnToArcologyDock(this.beacon.x, this.beacon.y);
      }
    } else {
      this.player.isInCloud = false;
      this.player.isInMatureCloud = false;
      this.player.cloudQuality = 0;
    }

    // 3c. Atmospheric buffeting affects every ship (flagship, fleet carriers/corvettes, hostile raiders)
    this.applyStormTurbulence(this.player, dt);
    for (const unit of this.getAllFleetUnits()) {
      if (!unit.isDestroyed && unit.active) {
        this.applyStormTurbulence(unit, dt);
      }
    }
    for (const enemy of this.enemies) {
      if (enemy.active && enemy.health > 0) {
        this.applyStormTurbulence(enemy, dt);
      }
    }

    // 4. Update Player (Stratoreservoir)
    this.player.update(time, delta);

    // 5. Union Arcology Dock Unload, Refuel & Passive Fleet Repairs
    this.beacon.update(time);
    const distToBeacon = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.beacon.x, this.beacon.y);
    if (distToBeacon < 125) {
      // Continuous hull repair while parked in Union City Arcology Dock (slower deliberate pace)
      if (this.player.hull < this.player.maxHull) {
        this.player.repair(14 * dt);
      }
      if (this.player.currentWater > 0) {
        // Docking with water: full hull restore + clear auto-return, then a slow,
        // continuous water offload so the player watches their credits tick up.
        this.player.hull = this.player.maxHull;
        this.player.isAutoReturning = false;

        const dumped = this.player.dumpWater(this.waterDumpRate * dt);
        if (dumped > 0) {
          this.totalWaterDelivered += dumped;
          this.creditFraction += dumped * this.creditPerKg;
          const gained = Math.floor(this.creditFraction);
          if (gained > 0) {
            this.creditFraction -= gained;
            this.credits += gained;
          }
          if (this.isPdaOpen) this.updatePdaContent();
        }
      }
    }

    // 6. Update Fleet Ships (Carriers & Corvette Squadrons) & Dock Repairs
    const activeCombatTargets: (Stratoreservoir | EscortCarrier | import('../entities/CarrierDrone').CarrierDrone | UnionCorvette | CorvetteSquadron)[] = [this.player];

    for (const unit of this.getAllFleetUnits()) {
      if (unit instanceof EscortCarrier) {
        unit.updateCarrier(time, delta, this.enemies, this.beacon.x, this.beacon.y);

        if (!unit.isDestroyed && unit.active) {
          activeCombatTargets.push(unit);

          // Collect airborne active drones as valid combat targets
          for (const drone of unit.drones) {
            if (drone.active && drone.visible && drone.state !== 'DOCKED' && drone.state !== 'REBUILDING') {
              activeCombatTargets.push(drone);
            }
          }
        }
      } else if (unit instanceof CorvetteSquadron) {
        try {
          unit.updateSquadron(time, delta, this.enemies, this.beacon.x, this.beacon.y);
        } catch (err) {
          console.error('[CorvetteSquadron] update error:', err);
        }

        if (!unit.isDestroyed && unit.active) {
          activeCombatTargets.push(unit);
        }
      }

      // Continuous hull repair while parked in Union City Dock (slower deliberate pace)
      if (!unit.isDestroyed && unit.hull < unit.maxHull) {
        const cDist = Phaser.Math.Distance.Between(unit.x, unit.y, this.beacon.x, this.beacon.y);
        if (cDist < 125) {
          unit.repair(10 * dt);
        }
      }
    }

    // 6b. Union City Arcology High-Energy Defense Strike Laser (One-shots any hostile in perimeter)
    this.unionLaserCooldown -= dt;
    const intruders: { x: number; y: number; takeDamage: (dmg: number) => void; active: boolean; health?: number }[] = [];

    // Collect hostile missiles entering defense perimeter
    for (const m of this.activeMissiles) {
      if (!m.active || m.health <= 0) continue;
      const d = Phaser.Math.Distance.Between(m.x, m.y, this.beacon.x, this.beacon.y);
      if (d <= this.unionDefenseRange) {
        intruders.push(m);
      }
    }

    // Collect hostile raider airships entering defense perimeter
    for (const e of this.enemies) {
      if (!e.active || e.health <= 0) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, this.beacon.x, this.beacon.y);
      if (d <= this.unionDefenseRange) {
        intruders.push(e);
      }
    }

    if (intruders.length > 0 && this.unionLaserCooldown <= 0) {
      // Prioritize closest intruder to dock beacon core
      let closestIntruder = intruders[0];
      let minDist = Phaser.Math.Distance.Between(closestIntruder.x, closestIntruder.y, this.beacon.x, this.beacon.y);

      for (let i = 1; i < intruders.length; i++) {
        const d = Phaser.Math.Distance.Between(intruders[i].x, intruders[i].y, this.beacon.x, this.beacon.y);
        if (d < minDist) {
          minDist = d;
          closestIntruder = intruders[i];
        }
      }

      this.unionLaserCooldown = 0.45;
      soundSynth.playLaserPulse();

      const bx = this.beacon.x;
      const by = this.beacon.y;
      const tx = closestIntruder.x;
      const ty = closestIntruder.y;

      // Clean, minimal white laser line
      this.unionLaserGraphic.clear();
      this.unionLaserGraphic.lineStyle(2.0, 0xffffff, 1.0);
      this.unionLaserGraphic.lineBetween(bx, by, tx, ty);

      // One-shot kill (9999 lethal damage)
      closestIntruder.takeDamage(9999);

      this.time.delayedCall(70, () => {
        if (this.unionLaserGraphic && this.unionLaserGraphic.active) {
          this.unionLaserGraphic.clear();
        }
      });
    }

    // 7. Update Hostile Raider Airships
    this.enemies = this.enemies.filter(e => e.active);
    for (const enemy of this.enemies) {
      enemy.updateRaider(time, delta, activeCombatTargets);
    }

    // 7b. Update Destructible Guided Missiles
    this.activeMissiles = this.activeMissiles.filter(m => m.active);
    for (const missile of this.activeMissiles) {
      missile.updateMissile(dt, activeCombatTargets);
    }

    // 8. Enemy Wave Spawner
    this.enemySpawnTimer -= dt;
    if (this.enemySpawnTimer <= 0) {
      this.enemySpawnTimer = Math.max(35, 60 - this.currentWave * 3);
      this.spawnEnemyWave();
    }

    // 8b. Convoy Spawner (straight-line raider columns crossing the map)
    this.convoySpawnTimer -= dt;
    if (this.convoySpawnTimer <= 0) {
      this.convoySpawnTimer = Phaser.Math.Between(70, 110);
      this.spawnConvoy();
    }

    // 8c. Fade the convoy telegraph once the whole column has left the map or died
    if (this.convoyRaiders.length > 0 && this.convoyRaiders.every(r => !r.active)) {
      this.convoyRaiders = [];
      this.tweens.killTweensOf(this.convoyPathGraphics);
      this.tweens.add({
        targets: this.convoyPathGraphics,
        alpha: 0,
        duration: 1200,
        ease: 'Linear',
      });
    }

    // 8d. In-game clock: 4 real seconds = 1 day
    this.dayTimer += dt;
    if (this.dayTimer >= 4) {
      this.dayTimer -= 4;
      this.days++;
    }

    // 9. Game Over check
    if (this.player.hull <= 0) {
      this.triggerGameOver();
    }

    // 10. Sensor Radar Sweeps & Spatial Cursor HUD
    this.renderSensorsMap(dt);
    this.renderSpatialCursorHUD();

    // 11. Throttle DOM updates
    this.hudUpdateTimer -= dt;
    if (this.hudUpdateTimer <= 0) {
      this.hudUpdateTimer = 0.2;
      this.updateHudDom();
    }
  }

  private handleCameraPan(dt: number) {
    let dirX = 0;
    let dirY = 0;
    const speed = 1100 / Math.max(0.35, this.cameras.main.zoom); // px/sec scaled with current zoom

    if (this.keyA?.isDown || this.keyLeft?.isDown) dirX -= 1;
    if (this.keyD?.isDown || this.keyRight?.isDown) dirX += 1;
    if (this.keyW?.isDown || this.keyUp?.isDown) dirY -= 1;
    if (this.keyS?.isDown || this.keyDown?.isDown) dirY += 1;

    if (dirX !== 0 || dirY !== 0) {
      // Immediately reset any active centering pan so WASD input takes direct, smooth control
      if (this.cameras.main.panEffect.isRunning) {
        this.cameras.main.panEffect.reset();
      }

      const len = Math.hypot(dirX, dirY);
      const dx = (dirX / len) * speed * dt;
      const dy = (dirY / len) * speed * dt;

      const cam = this.cameras.main;
      const currentCenterX = cam.midPoint.x;
      const currentCenterY = cam.midPoint.y;

      const mapW = 3600;
      const mapH = 2400;

      const newCenterX = Phaser.Math.Clamp(currentCenterX + dx, 50, mapW - 50);
      const newCenterY = Phaser.Math.Clamp(currentCenterY + dy, 50, mapH - 50);

      cam.centerOn(newCenterX, newCenterY);
    } else if (this.keySpace?.isDown) {
      // Continuous camera tracking while Spacebar is held
      const unit = this.getSelectedUnit();
      const target = (unit && unit.active && !('isDestroyed' in unit && unit.isDestroyed)) ? unit : this.player;
      if (target) {
        const cam = this.cameras.main;
        if (cam.panEffect.isRunning) {
          cam.panEffect.reset();
        }
        // Smoothly and swiftly track the target unit coordinates
        const curX = cam.midPoint.x;
        const curY = cam.midPoint.y;
        const lerpFactor = Math.min(1.0, 18 * dt);
        const nextX = Phaser.Math.Linear(curX, target.x, lerpFactor);
        const nextY = Phaser.Math.Linear(curY, target.y, lerpFactor);
        cam.centerOn(nextX, nextY);
      }
    }
  }

  private updateHudDom() {
    this.updateLevelDaysHud();
    // Refresh the PDA while open, but freeze the roster DOM during a drag so the
    // drag-and-drop gesture isn't torn down mid-drag by the periodic re-render.
    if (this.isPdaOpen && !this.dragState) this.updatePdaContent();
  }

  private updateLevelDaysHud() {
    const el = document.getElementById('level-days-hud');
    if (el) {
      if (this.hasPurchasedSecondStratoreservoir) {
        el.innerText = `LEVEL 2 (DEMO COMPLETE · TO BE CONTINUED) · WAVE ${this.currentWave} · DAY ${this.days}`;
      } else {
        el.innerText = `LEVEL ${this.level} · WAVE ${this.currentWave} · DAY ${this.days}`;
      }
    }
  }

  private updatePdaHeader() {
    const creditsEl = document.getElementById('pda-credits');
    const waterEl = document.getElementById('pda-water');
    if (creditsEl) creditsEl.innerText = this.credits.toLocaleString();
    if (waterEl) waterEl.innerText = Math.floor(this.totalWaterDelivered).toLocaleString();
  }

  private updatePdaContent() {
    this.updatePdaHeader();

    const buyStratoBtn = document.getElementById('buy-stratoreservoir-btn') as HTMLButtonElement | null;
    if (buyStratoBtn) {
      if (this.hasPurchasedSecondStratoreservoir) {
        buyStratoBtn.innerText = '> STRATORESERVOIR WEP-02 COMMISSIONED [DEMO COMPLETE]';
        buyStratoBtn.disabled = true;
        buyStratoBtn.style.color = '#4ade80';
        buyStratoBtn.style.borderColor = '#4ade80';
      } else {
        buyStratoBtn.innerText = '> COMMISSION STRATORESERVOIR';
        buyStratoBtn.disabled = false;
        buyStratoBtn.style.color = '';
        buyStratoBtn.style.borderColor = '';
      }
    }

    const rosterList = document.getElementById('pda-roster-list');
    if (!rosterList) return;

    let html = `
      <div style="border: 1px solid #333; padding: 6px; background: #0c0c0c;">
        <div style="color: #facc15; font-weight: bold; font-size: 10px;">[SLOT 1] STRATORESERVOIR WEP-01</div>
        <div style="font-size: 9px; color: #a3a3a3; margin-top: 2px;">
          HULL: ${Math.floor(this.player.hull)}/${this.player.maxHull} HP
        </div>
        <div style="font-size: 9px; color: #38bdf8;">
          WEP RESERVOIR: ${Math.floor(this.player.currentWater)} / ${this.player.maxWater} KG
        </div>
      </div>
    `;

    for (let i = 0; i < 8; i++) {
      const slotNum = i + 2;
      const group = this.fleet[i];
      const isSel = this.selectedSlot === slotNum;

      if (group.length === 0) {
        html += `
          <div data-drop-slot="${i}" style="border: 1px dashed #262626; padding: 6px; color: #555; font-size: 9px; min-height: 26px;">
            [SLOT ${slotNum}] -- OPEN BERTH (DRAG TO MERGE) --
          </div>
        `;
      } else {
        html += `
          <div data-drop-slot="${i}" style="border: 1px solid ${isSel ? '#facc15' : '#262626'}; padding: 6px; background: ${isSel ? 'rgba(250,204,21,0.06)' : '#0c0c0c'}; min-height: 26px;">
            <div style="color: ${isSel ? '#facc15' : '#ffffff'}; font-weight: bold; font-size: 10px;">[SLOT ${slotNum}] GROUP (${group.length}) ${isSel ? '◀' : ''}</div>
        `;
        for (let j = 0; j < group.length; j++) {
          html += this.renderUnitCard(group[j], i, j);
        }
        html += `</div>`;
      }
    }

    rosterList.innerHTML = html;
  }

  private renderUnitCard(unit: FleetUnit, slotIdx: number, unitIdx: number): string {
    const drag = `data-drag-unit data-slot-idx="${slotIdx}" data-unit-idx="${unitIdx}" draggable="true"`;

    if (unit.isDestroyed) {
      return `
        <div ${drag} style="border: 1px solid #ef4444; padding: 4px 6px; margin-top: 4px; background: #1a0505; cursor: grab;">
          <span style="color: #ef4444; font-size: 9px;">${unit.callsign} - DESTROYED (RESPAWN ${Math.ceil(unit.respawnTimer)}s)</span>
        </div>
      `;
    }

    if (unit instanceof EscortCarrier) {
      const readyDrones = unit.drones.filter(d => d.state === 'DOCKED' || d.state === 'COMBAT_ENGAGE' || d.state === 'TRANSIT_TO_WAYPOINT').length;
      const activeDrones = unit.drones.filter(d => d.state !== 'REBUILDING').length;
      return `
        <div ${drag} style="border: 1px solid #333; padding: 4px 6px; margin-top: 4px; cursor: grab;">
          <span style="color: #ffffff; font-size: 9px;">${unit.callsign} (AEGIS)</span>
          <span style="color: #aaa; font-size: 9px;">HULL ${Math.floor(unit.hull)}/${unit.maxHull} | DRONES ${readyDrones}/${activeDrones}</span>
        </div>
      `;
    }

    const activeCount = (unit.leadDestroyed ? 0 : 1) + (unit.wingmanDestroyed ? 0 : 1);
    const modeTag = unit.isSwitchingWeapon
      ? 'SWITCHING'
      : (unit.weaponMode === 'RAILGUN' ? 'RAILGUN' : 'RAPID');
    return `
      <div ${drag} style="border: 1px solid #333; padding: 4px 6px; margin-top: 4px; cursor: grab;">
        <span style="color: #ffffff; font-size: 9px;">${unit.callsign} (PAIR)</span>
        <span style="color: #aaa; font-size: 9px;">HULL ${Math.floor(unit.hull)}/${unit.maxHull} | SHIPS ${activeCount}/2 | ${modeTag}</span>
      </div>
    `;
  }

  private drawSector13TexturedMap(w: number, h: number) {
    const g = this.terrainGraphics;
    g.clear();

    g.fillStyle(0x020202, 1);
    g.fillRect(0, 0, w, h);

    // Procedural Continental Landmass Grain (East & North-East)
    for (let x = 2400; x < w; x += 36) {
      for (let y = 0; y < h; y += 36) {
        // Only generate grain on the land side of the coastline
        const coastThreshold = 2450 + (y * 0.48);
        if (x > coastThreshold - 100) {
          const noiseVal = Math.sin(x * 0.015) * Math.cos(y * 0.015);
          if (noiseVal > 0.08) {
            g.fillStyle(0xffffff, 0.025 + Math.abs(noiseVal) * 0.035);
            g.fillRect(x, y, 2, 2);
          }
        }
      }
    }

    // Inland Plateau Dune Striations (Far East Wasteland)
    g.lineStyle(1, 0xfacc15, 0.04);
    for (let y = 1100; y < 2300; y += 32) {
      g.beginPath();
      g.moveTo(3100, y);
      g.lineTo(3580, y + 40);
      g.strokePath();
    }

    // Sierra / Continental Ridge Elevation Cross-Hatching (East Ridge)
    g.lineStyle(1, 0xffffff, 0.06);
    for (let i = 0; i < 30; i++) {
      const sy = 120 + i * 36;
      const sx = 3150 + i * 14;
      g.beginPath();
      g.moveTo(sx - 40, sy);
      g.lineTo(sx + 80, sy - 20);
      g.strokePath();
    }

    // Pacific Bathymetric Depth Flow Lines (Covering Vast Western & Southern Pacific Ocean)
    g.lineStyle(1, 0xffffff, 0.025);
    for (let r = 200; r <= 2400; r += 180) {
      g.strokeCircle(900, 1300, r);
    }

    // Shifted Coastline Path (North-East continent border down to South-East)
    const coastline: [number, number][] = [
      [2450, 0], [2470, 120], [2520, 240], [2600, 360], [2700, 430],
      [2790, 460], [2830, 450], [2870, 440], [2910, 470], [2890, 520],
      [2840, 530], [2800, 510], [2780, 550], [2840, 650], [2940, 800],
      [3060, 1020], [3180, 1280], [3290, 1560], [3390, 1850], [3490, 2120],
      [3600, 2400]
    ];

    g.lineStyle(1.8, 0xffffff, 0.85);
    g.beginPath();
    coastline.forEach(([cx, cy], i) => {
      if (i === 0) g.moveTo(cx, cy);
      else g.lineTo(cx, cy);
    });
    g.strokePath();

    // Union Coastal Bay Inlet Outline (Sheltered natural deepwater harbor)
    const coastalBay: [number, number][] = [
      [2790, 460], [2830, 450], [2870, 440], [2910, 470], [2890, 520],
      [2840, 530], [2800, 510], [2780, 550]
    ];
    g.lineStyle(1.2, 0xffffff, 0.5);
    g.beginPath();
    coastalBay.forEach(([bx, by], i) => {
      if (i === 0) g.moveTo(bx, by);
      else g.lineTo(bx, by);
    });
    g.strokePath();

    // Pacific Offshore Islands & Atolls
    const islands: [number, number, number][] = [
      [1840, 1160, 28], [1920, 1550, 36], [1460, 840, 42],
      [1320, 1430, 32], [2200, 1920, 30], [1650, 1780, 22]
    ];
    islands.forEach(([ix, iy, rad]) => {
      g.lineStyle(1.2, 0xffffff, 0.6);
      g.strokeCircle(ix, iy, rad);
    });

    // Continental Ridge Elevation Lines (East Mountain Spine)
    const ridgeElevations = [
      { color: 0xffffff, alpha: 0.2, width: 50 },
      { color: 0xfacc15, alpha: 0.3, width: 30 },
      { color: 0xfacc15, alpha: 0.5, width: 15 },
    ];
    ridgeElevations.forEach(({ color, alpha, width }) => {
      g.lineStyle(1.2, color, alpha);
      g.beginPath();
      g.moveTo(3150 + width, 80);
      g.lineTo(3260 + width, 380);
      g.lineTo(3390 + width, 780);
      g.lineTo(3490 + width, 1220);
      g.lineTo(3560 + width, 1600);
      g.strokePath();
    });

    // ============================================================
    // UNION-13 COASTAL ARCOLOGY DOCK & BREAKWATER HARBOR (2850, 480)
    // ============================================================
    const bx = 2850;
    const by = 480;

    // Harbor Outer Seawalls & Breakwaters
    g.lineStyle(1.8, 0xfacc15, 0.65);
    g.beginPath();
    // North Breakwater Arm
    g.moveTo(bx - 100, by - 60);
    g.lineTo(bx - 145, by - 15);
    g.lineTo(bx - 140, by + 20);
    // South Breakwater Arm
    g.moveTo(bx - 90, by + 100);
    g.lineTo(bx - 135, by + 75);
    g.strokePath();

    // Breakwater Light Beacons
    g.lineStyle(1.2, 0xfacc15, 0.85);
    g.strokeCircle(bx - 140, by + 20, 5);
    g.strokeCircle(bx - 135, by + 75, 5);
    g.fillStyle(0xfacc15, 0.5);
    g.fillCircle(bx - 140, by + 20, 2);
    g.fillCircle(bx - 135, by + 75, 2);

    // Mooring Piers & Repair Slipways extending from shore
    g.lineStyle(2, 0xffffff, 0.55);
    g.beginPath();
    g.moveTo(bx, by - 30);
    g.lineTo(bx - 90, by - 30);
    g.moveTo(bx, by);
    g.lineTo(bx - 100, by);
    g.moveTo(bx, by + 40);
    g.lineTo(bx - 80, by + 40);
    g.strokePath();

    // Coastal Harbor Navigation Buoy Marks (Leading out to the Pacific)
    g.lineStyle(1, 0xfacc15, 0.5);
    for (let d = 160; d <= 420; d += 45) {
      const bX = bx - d;
      const bY = by + (d * 0.35);
      g.lineBetween(bX - 6, bY - 6, bX + 6, bY + 6);
      g.lineBetween(bX - 6, bY + 6, bX + 6, bY - 6);
    }

    // Trans-Pacific Expeditionary Corridor Line (Union 13 Coastal Dock -> Open Pacific Deep Storm Theater)
    g.lineStyle(1, 0xffffff, 0.2);
    g.beginPath();
    g.moveTo(bx - 120, by + 40);
    g.lineTo(2350, 720);
    g.lineTo(1750, 950);
    g.lineTo(1100, 1100);
    g.lineTo(550, 1250);
    g.strokePath();

    // Flight Corridor Vector Arrow Ticks
    const corridorPoints = [
      [2450, 680], [2050, 830], [1450, 1020], [850, 1180]
    ];
    corridorPoints.forEach(([cx, cy]) => {
      g.lineStyle(1.2, 0xffffff, 0.35);
      g.lineBetween(cx - 15, cy - 10, cx, cy);
      g.lineBetween(cx - 15, cy + 10, cx, cy);
    });

    // Union Airspace Defense Perimeter - Shrunk Medium Range (460px) with Faint Dashed Circle Line
    g.lineStyle(1.0, 0xfacc15, 0.22);
    const dashCount = 64;
    const dashAngle = (Math.PI * 2) / dashCount;
    for (let i = 0; i < dashCount; i++) {
      if (i % 2 === 0) {
        const startA = i * dashAngle;
        const endA = (i + 0.65) * dashAngle;
        g.beginPath();
        g.arc(bx, by, this.unionDefenseRange, startA, endA, false);
        g.strokePath();
      }
    }

    // Faint crosshair tick markers on perimeter
    for (let deg = 0; deg < 360; deg += 45) {
      const rad = Phaser.Math.DegToRad(deg);
      const innerX = bx + Math.cos(rad) * (this.unionDefenseRange - 5);
      const innerY = by + Math.sin(rad) * (this.unionDefenseRange - 5);
      const outerX = bx + Math.cos(rad) * (this.unionDefenseRange + 5);
      const outerY = by + Math.sin(rad) * (this.unionDefenseRange + 5);
      g.lineStyle(1.0, 0xfacc15, 0.35);
      g.lineBetween(innerX, innerY, outerX, outerY);
    }

    // Terminal Style Location Tags
    this.add.text(2850, 390, '▲ [UNION_13: DPC ARCOLOGY DOCK]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '11px',
      color: '#facc15',
    }).setOrigin(0.5).setDepth(1).setAlpha(0.95);

    this.add.text(2850, 408, 'DPC PACIFIC COMMAND // SLIPWAYS 01-08', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#a3a3a3',
    }).setOrigin(0.5).setDepth(1).setAlpha(0.7);

    this.add.text(2850 - 320, 480 + 320, '▲ [DPC DEFENSE PERIMETER // R:460PX // STRIKE LASER]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#facc15',
    }).setOrigin(0.5).setDepth(1).setAlpha(0.75);

    this.add.text(950, 1080, '▲ [PACIFIC CUMULONIMBUS THEATER]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '11px',
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(1).setAlpha(0.85);

    this.add.text(950, 1105, 'WESTERN BASIN // WEP EXTRACTION CORRIDOR', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#a3a3a3',
    }).setOrigin(0.5).setDepth(1).setAlpha(0.65);

    this.add.text(3020, 950, '[LOC: CONTINENTAL SHELF]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#737373',
    }).setDepth(1).setAlpha(0.6);

    this.add.text(3350, 1600, '[LOC: EASTERN WASTELAND]', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#737373',
    }).setDepth(1).setAlpha(0.6);

    this.add.text(1950, 720, '<< DPC EXPEDITION ROUTE 01 (WESTBOUND) <<', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '8px',
      color: '#a3a3a3',
    }).setOrigin(0.5).setDepth(1).setAlpha(0.45);
  }

  private createDimmedTacticalOverlay(w: number, h: number) {
    const grid = this.add.grid(w / 2, h / 2, w, h, 150, 150, 0x000000, 0, 0xffffff, 0.03);
    grid.setDepth(1);

    const majorGrid = this.add.grid(w / 2, h / 2, w, h, 600, 600, 0x000000, 0, 0xfacc15, 0.06);
    majorGrid.setDepth(1);

    for (let x = 600; x < w; x += 600) {
      for (let y = 600; y < h; y += 600) {
        this.add.text(x + 8, y + 8, `SEC_13:[${x / 100},${y / 100}]`, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '8px',
          color: 'rgba(255, 255, 255, 0.2)',
        }).setDepth(1);
      }
    }
  }

  private generateSector13Clouds() {
    this.cloudZones.forEach(c => c.destroy());
    this.cloudZones = [];

    const mapW = 3600;
    const mapH = 2400;
    const numClouds = 8;
    const sectorCodes = ['PAC-01', 'PAC-04', 'PAC-09', 'PAC-12', 'OCEAN-03', 'DEEP-07', 'COAST-11', 'WEST-05'];

    for (let i = 0; i < numClouds; i++) {
      let x = 0;
      let y = 0;
      let attempts = 0;

      // Ensure birth location is safely concentrated in Pacific Ocean / West basins (away from Union City top-right dock)
      while (attempts < 50) {
        if (i < 5) {
          // Deep Pacific Ocean storm corridor
          x = Phaser.Math.Between(350, 1500);
          y = Phaser.Math.Between(350, 2050);
        } else {
          // Coastline & Western desert transition zone
          x = Phaser.Math.Between(1200, 2100);
          y = Phaser.Math.Between(900, 2100);
        }
        const distToBeacon = Phaser.Math.Distance.Between(x, y, this.beacon.x, this.beacon.y);
        if (distToBeacon > 1350) break;
        attempts++;
      }

      // Random dynamic properties (halved growth and drift speeds)
      const minRadius = Phaser.Math.Between(130, 180);
      const maxRadius = Phaser.Math.Between(290, 420);
      const initialPhase = Math.random() * Math.PI * 2;
      const growthSpeed = Phaser.Math.FloatBetween(0.04, 0.10);

      // Random drift trajectory with a westward/Pacific bias
      const driftAngle = Math.random() * Math.PI * 2;
      const driftSpeed = Phaser.Math.FloatBetween(6, 14);
      const vx = Math.cos(driftAngle) * driftSpeed - 3; // slight westward drift
      const vy = Math.sin(driftAngle) * driftSpeed;

      // Only 2 of the 8 atmospheric cells are massive enough to overgrow into critical lightning hypercells
      const canOvergrow = (i === 2 || i === 5);

      const zone = new CloudZone(
        this,
        sectorCodes[i] || `SEC-${i + 1}`,
        x,
        y,
        minRadius,
        maxRadius,
        initialPhase,
        growthSpeed,
        vx,
        vy,
        canOvergrow
      );
      this.cloudZones.push(zone);
    }
  }

  private renderSensorsMap(dt: number) {
    this.sensorGraphics.clear();

    const selectedUnit = this.getSelectedUnit();
    const activeShip = (selectedUnit && selectedUnit.active && !('isDestroyed' in selectedUnit && selectedUnit.isDestroyed)) ? selectedUnit : this.player;
    const px = activeShip.x;
    const py = activeShip.y;

    const ranges = [300, 600, 900, 1200];
    ranges.forEach((r, idx) => {
      this.sensorGraphics.lineStyle(1, 0xfacc15, 0.22 - idx * 0.04);
      this.sensorGraphics.strokeCircle(px, py, r);
    });

    this.sensorSweepAngle += 1.2 * dt;
    const sweepLen = 1200;
    const sweepEndX = px + Math.cos(this.sensorSweepAngle) * sweepLen;
    const sweepEndY = py + Math.sin(this.sensorSweepAngle) * sweepLen;

    this.sensorGraphics.lineStyle(1.5, 0xfacc15, 0.4);
    this.sensorGraphics.lineBetween(px, py, sweepEndX, sweepEndY);

    const trailAngle = this.sensorSweepAngle - 0.25;
    const trailEndX = px + Math.cos(trailAngle) * sweepLen;
    const trailEndY = py + Math.sin(trailAngle) * sweepLen;

    this.sensorGraphics.fillStyle(0xfacc15, 0.03);
    this.sensorGraphics.beginPath();
    this.sensorGraphics.moveTo(px, py);
    this.sensorGraphics.lineTo(sweepEndX, sweepEndY);
    this.sensorGraphics.lineTo(trailEndX, trailEndY);
    this.sensorGraphics.closePath();
    this.sensorGraphics.fill();
  }

  private renderSpatialCursorHUD() {
    this.cursorHudGraphics.clear();

    const pointer = this.input.activePointer;
    if (!pointer) return;

    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const wx = worldPoint.x;
    const wy = worldPoint.y;

    const selectedUnit = this.getSelectedUnit() || this.player;
    const px = selectedUnit.x;
    const py = selectedUnit.y;

    const dist = Math.floor(Phaser.Math.Distance.Between(px, py, wx, wy));
    const angleRad = Phaser.Math.Angle.Between(px, py, wx, wy);
    const bearing = Math.floor(((Phaser.Math.RadToDeg(angleRad) + 360) % 360));

    // Terminal Leader Line
    this.cursorHudGraphics.lineStyle(1, 0xfacc15, 0.35);
    this.cursorHudGraphics.lineBetween(px, py, wx, wy);

    // Hard Angular Reticle
    const boxSize = 10;
    this.cursorHudGraphics.lineStyle(1, 0xffffff, 0.9);
    this.cursorHudGraphics.lineBetween(wx - boxSize, wy - boxSize, wx - boxSize + 4, wy - boxSize);
    this.cursorHudGraphics.lineBetween(wx - boxSize, wy - boxSize, wx - boxSize, wy - boxSize + 4);

    this.cursorHudGraphics.lineBetween(wx + boxSize, wy - boxSize, wx + boxSize - 4, wy - boxSize);
    this.cursorHudGraphics.lineBetween(wx + boxSize, wy - boxSize, wx + boxSize, wy - boxSize + 4);

    this.cursorHudGraphics.lineBetween(wx - boxSize, wy + boxSize, wx - boxSize + 4, wy + boxSize);
    this.cursorHudGraphics.lineBetween(wx - boxSize, wy + boxSize, wx - boxSize, wy + boxSize - 4);

    this.cursorHudGraphics.lineBetween(wx + boxSize, wy + boxSize, wx + boxSize - 4, wy + boxSize);
    this.cursorHudGraphics.lineBetween(wx + boxSize, wy + boxSize, wx + boxSize, wy + boxSize - 4);

    this.cursorHudGraphics.fillStyle(0xfacc15, 0.9);
    this.cursorHudGraphics.fillRect(wx - 1, wy - 1, 2, 2);

    let targetText = 'SECTOR CLEAR';
    let targetColor = '#737373';

    for (const missile of this.activeMissiles) {
      if (missile.active && Phaser.Math.Distance.Between(wx, wy, missile.x, missile.y) < 32) {
        targetText = `HOSTILE: MISSILE [HOMING // ${Math.floor(missile.health)} HP]`;
        targetColor = '#ef4444';
        break;
      }
    }

    if (targetText === 'SECTOR CLEAR') {
      for (const enemy of this.enemies) {
        if (enemy.active && Phaser.Math.Distance.Between(wx, wy, enemy.x, enemy.y) < 40) {
          const isEngaged = enemy.aiState === 'ENGAGING';
          targetText = `EXILE: ${enemy.raiderType} [${isEngaged ? 'ENGAGING' : 'PATROL'} // ${Math.floor(enemy.health)} HP]`;
          targetColor = isEngaged ? '#ef4444' : '#fb923c';
          break;
        }
      }
    }

    if (targetText === 'SECTOR CLEAR') {
      for (const cloud of this.cloudZones) {
        if (cloud.checkContainment(wx, wy)) {
          const prox = Math.round((1.0 - (Phaser.Math.Distance.Between(wx, wy, cloud.x, cloud.y) / cloud.radius)) * 100);
          if (cloud.isViolent) {
            targetText = `ATMOS: CELL-${cloud.id} (HYPERCELL) [EYE ${prox}% // YIELD MAX // ⚡]`;
            targetColor = '#ef4444';
          } else if (cloud.isCharged) {
            targetText = `ATMOS: CELL-${cloud.id} (SUPERCELL) [EYE ${prox}% // YIELD HIGH]`;
            targetColor = '#facc15';
          } else {
            targetText = `ATMOS: CELL-${cloud.id} (CUMULUS) [EYE ${prox}% // IMMATURE]`;
            targetColor = '#9ca3af';
          }
          break;
        }
      }
    }

    if (Phaser.Math.Distance.Between(wx, wy, this.beacon.x, this.beacon.y) < 110) {
      targetText = 'UNION_13: DPC ARCOLOGY DOCK';
      targetColor = '#facc15';
    } else if (targetText === 'SECTOR CLEAR') {
      const dToBeacon = Phaser.Math.Distance.Between(wx, wy, this.beacon.x, this.beacon.y);
      if (dToBeacon <= this.unionDefenseRange) {
        targetText = `UNION_13: DPC DEFENSE ZONE [STRIKE LASER ACTIVE]`;
        targetColor = '#facc15';
      }
    }

    // Build Unit Fleet Status Cards
    const pHull = Math.max(0, Math.floor((this.player.hull / this.player.maxHull) * 100));
    const pWater = Math.floor(this.player.currentWater);
    const pInDock = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.beacon.x, this.beacon.y) < 125;
    const pRepairing = pInDock && this.player.hull < this.player.maxHull;
    const pStateTag = pRepairing
      ? 'DRY DOCK REPAIR'
      : (this.player.isDeployed
        ? 'WEP CONDENSATION'
        : (this.player.deployState === 'DEPLOYING'
          ? 'FLIP 90°...'
          : (this.player.deployState === 'UNDEPLOYING'
            ? 'RESTORING TRIM...'
            : (this.player.isInMatureCloud
              ? 'STORM READY'
              : (this.player.isInCloud ? 'LOW VAPOR' : 'CRUISE MODE')))));
    const pStateColor = pRepairing
      ? '#4ade80'
      : (this.player.isDeployed
        ? '#facc15'
        : (this.player.isInMatureCloud ? '#facc15' : '#737373'));
    const pIsActive = this.selectedSlot === 1;

    const pWaterRatio = Math.min(100, Math.round((pWater / this.player.maxWater) * 100));
    const pWaterBlocks = '█'.repeat(Math.ceil((pWater / this.player.maxWater) * 10)) + '░'.repeat(10 - Math.ceil((pWater / this.player.maxWater) * 10));

    let fleetHtml = `
      <div style="margin-bottom: 4px;">
        <div style="display: flex; justify-content: space-between; font-weight: bold; color: ${pIsActive ? '#facc15' : '#ffffff'}; font-size: 10px;">
          <span>[1] STRATORESERVOIR WEP-01 ${pIsActive ? '◀' : ''}</span>
          <span style="font-size: 9px; color: ${pStateColor}; font-weight: normal;">[${pStateTag}]</span>
        </div>
        <!-- Special Glowing Blue H2O Reservoir Bar in Cursor Menu -->
        <div style="font-size: 9px; color: #38bdf8; font-weight: bold; font-family: 'Share Tech Mono', monospace; margin-top: 2px;">
          H2O  [${pWaterBlocks}] <span>${pWater} / ${this.player.maxWater} KG (${pWaterRatio}%)</span>
        </div>
      </div>
    `;

    let activeFleetCount = 0;
    for (let i = 0; i < 8; i++) {
      const slotNum = i + 2;
      const group = this.fleet[i];
      if (group.length === 0) continue;
      activeFleetCount++;

      const isSel = this.selectedSlot === slotNum;
      const alive = group.filter(u => !u.isDestroyed);
      const hullSum = alive.reduce((s, u) => s + u.hull, 0);
      const hullMax = alive.reduce((s, u) => s + u.maxHull, 0);
      const uHull = hullMax > 0 ? Math.floor((hullSum / hullMax) * 100) : 0;
      const shipLabel = alive.length === group.length
        ? `${group.length}`
        : `${alive.length}/${group.length}`;

      fleetHtml += `
        <div style="margin-bottom: 4px;">
          <div style="display: flex; justify-content: space-between; font-weight: bold; color: ${isSel ? '#facc15' : '#ffffff'}; font-size: 10px;">
            <span>[${slotNum}] GROUP ${isSel ? '◀' : ''}</span>
            <span style="font-size: 9px; color: #ffffff; font-weight: normal;">${shipLabel} SHIPS</span>
          </div>
          <div style="font-size: 9px; color: #737373;">
            HULL: <span style="color: ${uHull < 30 ? '#ef4444' : '#fff'};">${uHull}%</span>
          </div>
        </div>
      `;
    }

    if (activeFleetCount === 0) {
      fleetHtml += `
        <div style="font-size: 9px; color: #555;">
          [2-9] ESCORT BERTHS OPEN (TAB SHIPYARD)
        </div>
      `;
    }

    // Terminal Frame for Cursor Telemetry (Unified Non-Unit UI Window)
    const floatHud = document.getElementById('floating-cursor-hud');
    if (floatHud) {
      const hudW = floatHud.offsetWidth || 280;
      const hudH = floatHud.offsetHeight || 220;
      const margin = 12;

      let posX = pointer.x + 16;
      let posY = pointer.y + 16;

      if (posX + hudW > window.innerWidth - margin) {
        posX = pointer.x - hudW - 16;
      }
      if (posY + hudH > window.innerHeight - margin) {
        posY = pointer.y - hudH - 16;
      }

      posX = Math.max(margin, Math.min(posX, window.innerWidth - hudW - margin));
      posY = Math.max(margin, Math.min(posY, window.innerHeight - hudH - margin));

      floatHud.style.transform = `translate(${posX}px, ${posY}px)`;
      floatHud.innerHTML = `
        <!-- Section 1: Global Telemetry Header -->
        <div style="margin-bottom: 4px;">
          <span class="term-yellow font-bold">▲ UNION DPC // SECTOR 13 SENSORS</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 6px;">
          <span style="color: #4ade80;">CREDITS: ₳ ${this.credits.toLocaleString()} UC</span>
          <span style="color: #38bdf8;">WEP H2O: ${Math.floor(this.totalWaterDelivered).toLocaleString()} KG</span>
          <span style="color: #a3a3a3;">OPTICS: ${Math.round(this.cameras.main.zoom * 100)}%</span>
        </div>

        <!-- Section 2: Cursor & Spatial Reticle Telemetry -->
        <div style="margin-bottom: 5px; font-size: 10px;">
          <div class="term-yellow font-bold">> RNG: ${dist}M // BRG: ${bearing.toString().padStart(3, '0')}° // LOC: [${Math.floor(wx)}, ${Math.floor(wy)}]</div>
          <div style="color: ${targetColor}; font-size: 9px; margin-top: 1px;">> TGT: ${targetText}</div>
        </div>

        <!-- Section 3: Unit Fleet Cards -->
        <div>
          <div class="term-yellow" style="font-size: 9px; margin-bottom: 3px; font-weight: bold;">> ACTIVE DPC FLEET (SLOTS 1-9)</div>
          ${fleetHtml}
        </div>
      `;
    }
  }

  // Storm cells gently bounce apart so circles never overlap (prevents stacked effects & visual smearing)
  private separateCloudZones(dt: number) {
    const zones = this.cloudZones;
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const a = zones[i];
        const b = zones[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius + 12; // small buffer keeps cells visually distinct
        if (dist < minDist) {
          let nx: number;
          let ny: number;
          if (dist < 0.001) {
            const ang = Math.random() * Math.PI * 2;
            nx = Math.cos(ang);
            ny = Math.sin(ang);
          } else {
            nx = dx / dist;
            ny = dy / dist;
          }
          const overlap = minDist - dist;
          // Outward velocity bounce so cells keep drifting apart after separation
          const push = overlap * 3.2 * dt;
          a.vx -= nx * push;
          a.vy -= ny * push;
          b.vx += nx * push;
          b.vy += ny * push;
          // Hard positional separation guarantees zero overlap every frame
          const half = overlap * 0.5;
          a.x -= nx * half;
          a.y -= ny * half;
          b.x += nx * half;
          b.y += ny * half;
        }
      }
    }
  }

  // Nearest storm cell whose circle contains (x, y) — effects never stack, only the closest applies
  private nearestContainingCloud(x: number, y: number): CloudZone | null {
    let best: CloudZone | null = null;
    let bestProx = -1;
    for (const cloud of this.cloudZones) {
      if (cloud.checkContainment(x, y)) {
        const dist = Phaser.Math.Distance.Between(x, y, cloud.x, cloud.y);
        const prox = Math.max(0, 1.0 - (dist / cloud.radius));
        if (prox > bestProx) {
          bestProx = prox;
          best = cloud;
        }
      }
    }
    return best;
  }

  // Apply storm buffeting to any ship body (flagship, escort carrier, corvette squadron, raider)
  private applyStormTurbulence(unit: Phaser.Physics.Arcade.Sprite, dt: number) {
    const cloud = this.nearestContainingCloud(unit.x, unit.y);
    if (!cloud) return;

    const turbulence = this.getStormTurbulence(unit.x, unit.y, cloud);
    if (turbulence <= 0) return;

    // Lightning hypercells buffet noticeably without trapping ships; non-lightning storms sway subtly
    const maxForce = cloud.isViolent ? 5.2 : (cloud.isCharged ? 2.2 : 0.8);
    const jX = (Math.random() - 0.5) * 2 * maxForce * turbulence * dt * 60;
    const jY = (Math.random() - 0.5) * 2 * maxForce * turbulence * dt * 60;
    unit.body?.velocity.add(new Phaser.Math.Vector2(jX, jY));
  }

  // Atmospheric turbulence scaling: Zero jitter in eye circle (r <= 0.18), peak at eyewall, smoothly tapering to edge
  private getStormTurbulence(x: number, y: number, cloud: CloudZone): number {
    const distToCenter = Phaser.Math.Distance.Between(x, y, cloud.x, cloud.y);
    const normDist = distToCenter / cloud.radius;

    if (normDist > 1.0) return 0; // Outside cloud boundary

    // DETAIL: Zero jitter in the center-most circle (Eye of the storm: r <= 0.18)
    if (normDist <= 0.18) {
      return 0;
    }

    // Eyewall transition: smoothly ramps up from 0 at the eye perimeter (0.18) to peak turbulence at the eyewall (0.42)
    if (normDist <= 0.42) {
      return (normDist - 0.18) / 0.24;
    }

    // Outer spiral bands: gradually decreases from peak (1.0) down to 0.25 at the outer perimeter
    return 1.0 - 0.75 * ((normDist - 0.42) / 0.58);
  }

  private triggerLightningStrike(target: Stratoreservoir | EscortCarrier) {
    soundSynth.playDamageAlert();
    this.cameras.main.shake(180, 0.015);
    target.takeDamage(24);

    const tx = target.x;
    const ty = target.y;

    this.lightningGraphic.clear();

    // Jagged High-Voltage Red Arc
    this.lightningGraphic.lineStyle(2.5, 0xef4444, 0.95);
    const startX = tx + Phaser.Math.Between(-90, 90);
    const startY = ty - 280;
    const mid1X = tx + Phaser.Math.Between(-50, 50);
    const mid1Y = ty - 180;
    const mid2X = tx + Phaser.Math.Between(-25, 25);
    const mid2Y = ty - 80;
    
    this.lightningGraphic.beginPath();
    this.lightningGraphic.moveTo(startX, startY);
    this.lightningGraphic.lineTo(mid1X, mid1Y);
    this.lightningGraphic.lineTo(mid2X, mid2Y);
    this.lightningGraphic.lineTo(tx, ty);
    this.lightningGraphic.strokePath();

    // White-hot core beam
    this.lightningGraphic.lineStyle(1.2, 0xffffff, 1.0);
    this.lightningGraphic.beginPath();
    this.lightningGraphic.moveTo(startX, startY);
    this.lightningGraphic.lineTo(mid1X, mid1Y);
    this.lightningGraphic.lineTo(mid2X, mid2Y);
    this.lightningGraphic.lineTo(tx, ty);
    this.lightningGraphic.strokePath();

    // Branch arc
    this.lightningGraphic.lineStyle(1, 0xef4444, 0.7);
    this.lightningGraphic.beginPath();
    this.lightningGraphic.moveTo(mid1X, mid1Y);
    this.lightningGraphic.lineTo(mid1X + Phaser.Math.Between(30, 60), mid1Y + 40);
    this.lightningGraphic.strokePath();

    this.time.delayedCall(110, () => {
      if (this.lightningGraphic && this.lightningGraphic.active) {
        this.lightningGraphic.clear();
      }
    });
  }

  private triggerGameOver() {
    this.isGameOver = true;
    soundSynth.playRadarWarning();
    this.cameras.main.fade(1000, 45, 0, 0);

    const gameOverEl = document.getElementById('game-over-modal');
    if (gameOverEl) {
      gameOverEl.classList.remove('hidden');
    }
  }

  public setPowerMode(mode: PowerMode) {
    this.player.setPowerMode(mode);
  }

  public toggleSiphon() {
    this.player.toggleSiphon();
  }
}
