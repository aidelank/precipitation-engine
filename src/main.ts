import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { GameScene } from './scenes/GameScene';
import { soundSynth } from './audio/SoundSynth';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-viewport',
  width: window.innerWidth || 1280,
  height: window.innerHeight || 720,
  backgroundColor: '#000000',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, MainMenuScene, GameScene],
};

export const game = new Phaser.Game(config);

// Prevent browser context menu on right click
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Prevent browser scrolling and tab traversal for game keys
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow')) {
    e.preventDefault();
  }
});

// Ensure audio context & looping control room audio unlock on very first user gesture
const unlockAudio = () => {
  soundSynth.startControlRoomAtmosphere();
};
window.addEventListener('pointerdown', unlockAudio);
window.addEventListener('keydown', unlockAudio);

function setupRestartButton() {
  const btn = document.getElementById('restart-btn');
  const modal = document.getElementById('game-over-modal');
  const restart = () => {
    if (modal) modal.classList.add('hidden');
    game.scene.start('GameScene');
  };

  btn?.addEventListener('click', restart);
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && modal && !modal.classList.contains('hidden')) {
      restart();
    }
  });
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', setupRestartButton);
} else {
  setupRestartButton();
}

