import Phaser from 'phaser';
import { soundSynth } from '../audio/SoundSynth';

type MenuAction = 'START' | 'HOW_TO_PLAY' | 'EXIT';

interface MenuItem {
  action: MenuAction;
  label: string;
  text: Phaser.GameObjects.Text;
}

/**
 * CRT-terminal main menu shown after BootScene glyph generation and before GameScene.
 * Options: START EXPEDITION / HOW TO PLAY / EXIT TERMINAL.
 * Navigate with ▲/▼ + ENTER/SPACE or mouse (hover + click).
 */
export class MainMenuScene extends Phaser.Scene {
  private items: MenuItem[] = [];
  private selectedIndex: number = 0;

  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private dividerGraphic!: Phaser.GameObjects.Graphics;
  private footerText!: Phaser.GameObjects.Text;
  private blinkCursor!: Phaser.GameObjects.Text;

  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private enterKey!: Phaser.Input.Keyboard.Key;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  private isExiting: boolean = false;
  private isHowToPlayOpen: boolean = false;
  private blinkTimer: number = 0;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  create() {
    this.isExiting = false;
    this.isHowToPlayOpen = false;
    this.items = [];
    this.selectedIndex = 0;
    this.blinkTimer = 0;

    // Hide any leftover modal state from a previous session
    document.getElementById('how-to-play-modal')?.classList.add('hidden');
    document.getElementById('exit-screen')?.classList.add('hidden');

    this.titleText = this.add.text(0, 0, 'STRATORESERVOIR', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '64px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(0, 0, 'UNION DPC // STRATORESERVOIR WEP SIMULATOR', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '18px',
      color: '#facc15',
    }).setOrigin(0.5);

    this.dividerGraphic = this.add.graphics();

    const menuDefs: { action: MenuAction; label: string }[] = [
      { action: 'START', label: 'START EXPEDITION' },
      { action: 'HOW_TO_PLAY', label: 'OPERATIONS MANUAL' },
      { action: 'EXIT', label: 'EXIT TERMINAL' },
    ];

    menuDefs.forEach((def, i) => {
      const text = this.add.text(0, 0, def.label, {
        fontFamily: 'Share Tech Mono, monospace',
        fontSize: '24px',
        color: '#ffffff',
      })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      text.on('pointerover', () => this.select(i));
      text.on('pointerdown', () => this.activate(i));

      this.items.push({ action: def.action, label: def.label, text });
    });

    this.blinkCursor = this.add.text(0, 0, '▶', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '24px',
      color: '#facc15',
    }).setOrigin(0.5);

    this.footerText = this.add.text(0, 0, '[▲/▼] SELECT    [ENTER / CLICK] CONFIRM', {
      fontFamily: 'Share Tech Mono, monospace',
      fontSize: '13px',
      color: '#737373',
    }).setOrigin(0.5);

    // Keyboard input
    if (this.input.keyboard) {
      this.cursorKeys = this.input.keyboard.createCursorKeys();
      this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
      this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }

    // DOM: how-to-play back button + global ESC/ENTER/SPACE close
    const backBtn = document.getElementById('how-to-play-back-btn');
    if (backBtn) backBtn.onclick = () => this.hideHowToPlay();
    window.addEventListener('keydown', this.onGlobalKeyDown);

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      window.removeEventListener('keydown', this.onGlobalKeyDown);
    });

    this.layout();
    this.select(0);
  }

  private onGlobalKeyDown = (e: KeyboardEvent) => {
    if (!this.isHowToPlayOpen) return;
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.hideHowToPlay();
    }
  };

  private layout = () => {
    const w = this.scale.width;
    const h = this.scale.height;
    const cx = w / 2;
    const titleY = h * 0.30;

    this.titleText.setFontSize(Math.min(64, Math.max(28, w * 0.06)));
    this.subtitleText.setFontSize(Math.min(18, Math.max(11, w * 0.017)));

    this.titleText.setPosition(cx, titleY - 62);
    this.subtitleText.setPosition(cx, titleY - 14);

    this.dividerGraphic.clear();
    this.dividerGraphic.lineStyle(1, 0xfacc15, 0.5);
    this.dividerGraphic.lineBetween(cx - 280, titleY + 22, cx + 280, titleY + 22);

    const startY = h * 0.52;
    this.items.forEach((item, i) => {
      item.text.setPosition(cx, startY + i * 58);
    });

    const sel = this.items[this.selectedIndex];
    this.blinkCursor.setPosition(cx - 200, sel ? sel.text.y : startY);
    this.footerText.setPosition(cx, h * 0.85);
  };

  private select(index: number) {
    if (this.isExiting || this.isHowToPlayOpen) return;
    this.selectedIndex = index;
    soundSynth.playUnitSelectSound();
    this.applySelectionVisuals();
  }

  private applySelectionVisuals() {
    this.items.forEach((item, i) => {
      item.text.setColor(i === this.selectedIndex ? '#facc15' : '#ffffff');
    });
    const sel = this.items[this.selectedIndex];
    if (sel) this.blinkCursor.setY(sel.text.y);
  }

  private activate(index: number) {
    if (this.isExiting || this.isHowToPlayOpen) return;
    const item = this.items[index];
    if (!item) return;

    switch (item.action) {
      case 'START':
        soundSynth.playWaypointOrder();
        this.scene.start('GameScene');
        break;
      case 'HOW_TO_PLAY':
        soundSynth.playUnitSelectSound();
        this.showHowToPlay();
        break;
      case 'EXIT':
        soundSynth.playWaypointCancel();
        this.exitTerminal();
        break;
    }
  }

  private showHowToPlay() {
    this.isHowToPlayOpen = true;
    const modal = document.getElementById('how-to-play-modal');
    if (modal) modal.classList.remove('hidden');
  }

  private hideHowToPlay() {
    this.isHowToPlayOpen = false;
    const modal = document.getElementById('how-to-play-modal');
    if (modal) modal.classList.add('hidden');
    soundSynth.playWaypointCancel();
  }

  private exitTerminal() {
    if (this.isExiting) return;
    this.isExiting = true;

    this.cameras.main.fadeOut(700, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const el = document.getElementById('exit-screen');
      if (el) el.classList.remove('hidden');
      // Browsers only honor window.close() for script-opened windows; this is best-effort.
      window.close();
    });
  }

  update(_time: number, delta: number) {
    if (this.isExiting || this.isHowToPlayOpen) return;

    if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.up)) {
      this.select((this.selectedIndex - 1 + this.items.length) % this.items.length);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursorKeys.down)) {
      this.select((this.selectedIndex + 1) % this.items.length);
    }

    if (Phaser.Input.Keyboard.JustDown(this.enterKey) || Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
      this.activate(this.selectedIndex);
    }

    this.blinkTimer += delta;
    this.blinkCursor.setAlpha(this.blinkTimer % 500 < 300 ? 1 : 0.15);
  }
}
