// Industrial Avionics & Flight Control Room Audio Engine

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private ambientAudio: HTMLAudioElement | null = null;
  private thunderAudio: HTMLAudioElement | null = null;

  // Siphon / Engine Nodes
  private siphonGain: GainNode | null = null;
  private siphonNoise: AudioBufferSourceNode | null = null;
  private siphonSpoolOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;

  constructor() {
    this.initAmbientTrack();
  }

  private initAmbientTrack() {
    try {
      this.ambientAudio = new Audio('ambient-control-room.wav');
      this.ambientAudio.loop = true;
      this.ambientAudio.volume = 0.45;
    } catch {
      // Audio element fallback
    }

    try {
      this.thunderAudio = new Audio('ambient-thunder.wav');
      this.thunderAudio.loop = true;
      this.thunderAudio.volume = 0.42;
    } catch {
      // Audio element fallback
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public startControlRoomAtmosphere() {
    this.initCtx();
    if (this.ambientAudio && !this.isMuted) {
      this.ambientAudio.play().catch(() => {
        // Will retry on next interaction
      });
    }
    if (this.thunderAudio && !this.isMuted) {
      this.thunderAudio.play().catch(() => {
        // Will retry on next interaction
      });
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.ambientAudio) {
      this.ambientAudio.muted = this.isMuted;
      if (!this.isMuted) {
        this.ambientAudio.play().catch(() => {});
      }
    }
    if (this.thunderAudio) {
      this.thunderAudio.muted = this.isMuted;
      if (!this.isMuted) {
        this.thunderAudio.play().catch(() => {});
      }
    }
    if (this.siphonGain && this.ctx && this.isMuted) {
      this.siphonGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    if (this.engineGain && this.ctx && this.isMuted) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
    return this.isMuted;
  }

  // --- Industrial Flight Simulation SFX ---

  // Waypoint confirmation chime (FMC dual avionics entry tone)
  public playWaypointOrder() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(1320, now);
    osc2.frequency.setValueAtTime(1760, now + 0.04);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.04);
    osc1.stop(now + 0.06);
    osc2.stop(now + 0.16);
  }

  // Waypoint Cancel / Abort Tone (Descending avionics de-authorization blip)
  public playWaypointCancel() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(1580, now);
    osc2.frequency.setValueAtTime(880, now + 0.04);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.04);
    osc1.stop(now + 0.05);
    osc2.stop(now + 0.14);
  }

  // Damage / Impact (Aviation Master Caution Tone + Metallic Shockwave)
  public playDamageAlert() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    const alertOsc = this.ctx.createOscillator();
    const alertGain = this.ctx.createGain();
    alertOsc.type = 'sine';
    alertOsc.frequency.setValueAtTime(987.77, now);
    alertOsc.frequency.setValueAtTime(783.99, now + 0.08);

    alertGain.gain.setValueAtTime(0.14, now);
    alertGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    alertOsc.connect(alertGain);
    alertGain.connect(this.ctx.destination);
    alertOsc.start(now);
    alertOsc.stop(now + 0.32);

    const thudOsc = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thudOsc.type = 'triangle';
    thudOsc.frequency.setValueAtTime(140, now);
    thudOsc.frequency.exponentialRampToValueAtTime(35, now + 0.22);

    thudGain.gain.setValueAtTime(0.2, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);

    thudOsc.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thudOsc.start(now);
    thudOsc.stop(now + 0.28);
  }

  // Laser Pulse (Avionics capacitor telemetry discharge)
  public playLaserPulse() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.07);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1600, now);
    filter.Q.setValueAtTime(4.0, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Corvette Twin Heavy Pulse Volley (Tactical dual rapid discharge)
  public playCorvetteVolley() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const t = now + i * 0.055;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(2600, t);
      osc.frequency.exponentialRampToValueAtTime(380, t + 0.06);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1750, t);
      filter.Q.setValueAtTime(4.5, t);

      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 0.07);
    }
  }

  // Missile Launch (High pressure pneumatic silo ejection + rocket burn)
  public playMissileLaunch() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.15);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.18);
    filter.Q.setValueAtTime(3.0, now);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.24);
  }

  // Flak Burst (Sub-bass compression wave)
  public playFlakBurst() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.28);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  // Radar Warning (Transponder contact alert)
  public playRadarWarning() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.setValueAtTime(1760, now + 0.07);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  // Siphon Active: High pressure air condenser hiss + turbine spool
  public setSiphonActive(active: boolean) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    if (active) {
      if (!this.siphonGain) {
        const bufferSize = this.ctx.sampleRate * 2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        this.siphonNoise = this.ctx.createBufferSource();
        this.siphonNoise.buffer = buffer;
        this.siphonNoise.loop = true;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 680;
        filter.Q.value = 2.8;

        this.siphonGain = this.ctx.createGain();
        this.siphonGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

        this.siphonNoise.connect(filter);
        filter.connect(this.siphonGain);
        this.siphonGain.connect(this.ctx.destination);

        this.siphonNoise.start();

        this.siphonSpoolOsc = this.ctx.createOscillator();
        this.siphonSpoolOsc.type = 'sine';
        this.siphonSpoolOsc.frequency.setValueAtTime(2200, this.ctx.currentTime);
        const spoolGain = this.ctx.createGain();
        spoolGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
        this.siphonSpoolOsc.connect(spoolGain);
        spoolGain.connect(this.siphonGain);
        this.siphonSpoolOsc.start();
      } else {
        this.siphonGain.gain.setTargetAtTime(0.08, this.ctx.currentTime, 0.1);
      }
    } else if (this.siphonGain) {
      this.siphonGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    }
  }

  // Engine Throttle: Deep turbine turbofan vibration
  public setEngineThrottle(throttle: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'triangle';
      this.engineOsc.frequency.setValueAtTime(42, this.ctx.currentTime);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(90, this.ctx.currentTime);

      this.engineGain.gain.setValueAtTime(0.02, this.ctx.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    }

    const targetFreq = 42 + throttle * 28;
    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.ctx.currentTime, 0.1);
    this.engineGain?.gain.setTargetAtTime(0.015 + throttle * 0.035, this.ctx.currentTime, 0.1);
  }

  // Docking Transfer Success: Soft harmonic digital sync chime
  public playUnloadSuccess() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const chords = [523.25, 659.25, 783.99, 1046.50];
    chords.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = this.ctx.currentTime + idx * 0.07;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.06, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.3);
    });
  }

  public playRadarPing() {
    this.playWaypointOrder();
  }

  // Unit Selection Chime (High-tech tactical click)
  public playUnitSelectSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1320, now + 0.03);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Shipyard Purchase Chime (Avionics requisition authorization tone)
  public playPurchaseSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const freqs = [659.25, 880, 1174.66]; // E5, A5, D6
    freqs.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + idx * 0.05;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.07, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.16);
    });
  }

  // Major Expedition Objective Complete Fanfare (Stratoreservoir WEP-02 Commissioned)
  public playDemoCompleteSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    // Ascending celebratory fanfare chime: C5, E5, G5, C6, E6, G6
    const melody = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    melody.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const start = now + idx * 0.11;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.09, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.65);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + 0.67);
    });

    // Sustained celebratory root chord underneath
    [261.63, 329.63, 392.00, 523.25].forEach(freq => {
      if (!this.ctx) return;
      const subOsc = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      const chordStart = now + 0.45;

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(freq, chordStart);

      subGain.gain.setValueAtTime(0.06, chordStart);
      subGain.gain.exponentialRampToValueAtTime(0.0005, chordStart + 1.8);

      subOsc.connect(subGain);
      subGain.connect(this.ctx.destination);

      subOsc.start(chordStart);
      subOsc.stop(chordStart + 1.85);
    });
  }

  // Unit Respawn Chime (Spool-up tone from Arcology Dock)
  public playRespawnSound() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 0.25);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.32);
  }

  // Heavy Kinetic Flak / Railgun Blast
  public playHeavyCannon() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  }

  // Arcology High-Energy Defense Strike Laser (Massive one-shot beam)
  public playArcologyStrikeLaser() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // High energy pre-ignition ionization whine
    const whineOsc = this.ctx.createOscillator();
    const whineGain = this.ctx.createGain();
    whineOsc.type = 'sawtooth';
    whineOsc.frequency.setValueAtTime(500, now);
    whineOsc.frequency.exponentialRampToValueAtTime(3400, now + 0.07);

    whineGain.gain.setValueAtTime(0.15, now);
    whineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    whineOsc.connect(whineGain);
    whineGain.connect(this.ctx.destination);
    whineOsc.start(now);
    whineOsc.stop(now + 0.12);

    // Deep sub-bass plasma discharge cannon
    const blastOsc = this.ctx.createOscillator();
    const blastGain = this.ctx.createGain();
    blastOsc.type = 'triangle';
    blastOsc.frequency.setValueAtTime(380, now + 0.03);
    blastOsc.frequency.exponentialRampToValueAtTime(30, now + 0.45);

    blastGain.gain.setValueAtTime(0.35, now + 0.03);
    blastGain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);

    blastOsc.connect(blastGain);
    blastGain.connect(this.ctx.destination);
    blastOsc.start(now + 0.03);
    blastOsc.stop(now + 0.5);
  }
}

export const soundSynth = new SoundSynthesizer();
