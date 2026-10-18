# Precipitation Engine — Tactical Weather Simulation & Fleet Operations

A deterministic browser-based tactical simulation engine built in TypeScript and Phaser 3. Simulates atmospheric moisture extraction, 10 Hz cellular automata weather fields, and multi-agent boid flocking under harsh wasteland storm regimes.

Developed as a systems architecture prototype exploring emergent environmental dynamics, micro-climate warfare, and resource logistics in extreme atmospheric conditions.

---

## Overview

In an arid post-collapse biosphere, atmospheric moisture is the paramount strategic resource. The **Precipitation Engine** models the mechanical operation of the **Stratoreservoir**—a massive heavy-atmospheric harvesting station—alongside defensive escorts and predatory airship raiders navigating dynamic storm corridors.

Key simulation systems:
- **Atmospheric Cellular Automata**: Continuous 10 Hz moisture diffusion, condensation gradient modeling, dynamic cloud field advection, and precipitation cycles.
- **Hierarchical Autonomous Agents**: Carrier-borne drone swarms guided by Reynolds flocking algorithms (separation, cohesion, alignment) coupled with target-prioritization state machines.
- **Tactical Fleet Engagement**: Multi-tier weapon ballistics, point-defense interceptors, radar tracking arrays, and structural damage modeling.
- **Zero-Dependency Procedural Audio**: Fully synthetic Web Audio pipeline generating control-room drones, turbine hums, radio telemetry, and thunderclaps without external audio middleware.

---

## Core Architecture

```
src/
├── audio/
│   └── SoundSynth.ts          # Procedural Web Audio API sound synthesizer
├── entities/
│   ├── CarrierDrone.ts        # Carrier-based interceptor drone with boid steering
│   ├── CloudField.ts          # 10 Hz Cellular Automata atmospheric moisture grid
│   ├── CorvetteSquadron.ts    # Coordinated naval escort formation manager
│   ├── EscortCarrier.ts       # Auxiliary carrier platform & launch bays
│   ├── EscortDrone.ts         # Automated perimeter defense craft
│   ├── RaiderAirship.ts       # Hostile capital raider assault state machine
│   ├── RaiderMissile.ts       # Guided ballistic ordinance with interception physics
│   ├── Stratoreservoir.ts     # Primary harvest station: condenser rig & water capacitor
│   └── UnionCorvette.ts       # Kinetic flak & point-defense escort vessel
├── scenes/
│   ├── BootScene.ts           # Asset preloading & audio bus initialization
│   ├── GameScene.ts           # Core simulation loop, physics world & camera control
│   └── MainMenuScene.ts       # Mission briefing & operational status display
└── main.ts                    # Phaser 3 game configuration & lifecycle wiring
```

### 1. Atmospheric Cellular Automata (`src/entities/CloudField.ts`)
The weather field operates on a decoupled 10 Hz discrete update tick to ensure deterministic moisture diffusion independent of the 60 FPS graphics render pipeline:
- **Diffusion & Advection**: Moisture values diffuse across adjacent cells based on prevailing wind vectors and altitude thermal layers.
- **Harvesting Interaction**: Stratoreservoir suction arrays deplete local cell density, requiring tactical repositioning into high-density vapor bands.

### 2. Autonomous Multi-Agent Flocking (`src/entities/CarrierDrone.ts`, `src/entities/EscortDrone.ts`)
Drones execute autonomous flocking behaviors using weighted steering forces:
- **Cohesion & Alignment**: Form tight escort wedges when cruising.
- **Separation & Evasion**: Prevent collisions during high-velocity dogfights and evade incoming missile vectors.
- **State Evaluation**: Automatic transitions between `PATROL`, `INTERCEPT`, `ENGAGE`, and `RETURN_TO_BAY` for re-arming.

### 3. Procedural Audio Synthesis (`src/audio/SoundSynth.ts`)
Built directly on top of the browser's native `AudioContext`:
- Low-frequency oscillators (LFO) creating industrial drone resonance.
- White and pink noise generators filtered via dynamic `BiquadFilterNode` bands to simulate howling storm winds, thruster bursts, and distant thunder.

---

## Performance & Technical Specifications

- **Display Pipeline**: Phaser 3 Canvas / WebGL accelerated renderer running at a fixed 60 FPS target.
- **Simulation Clock**: Deterministic update clock separating physical/environmental logic from frame rendering.
- **Memory Footprint**: Strict object pooling for missiles, flak particulates, and kinetic projectiles to avoid garbage collection spikes.
- **Zero Framework Overhead**: Vanilla TypeScript architecture packaged cleanly with Vite, requiring no external UI libraries.

---

## Installation & Local Run

### Prerequisites
- Node.js (v18.0.0 or higher recommended)
- npm (v9.0.0 or higher)

### Setup
Clone the repository and install dependencies:

```bash
# Clone repository
git clone https://github.com/aidelank/precipitation-engine.git
cd precipitation-engine

# Install dependencies
npm install
```

### Development Server
Launch the local development server with hot-module replacement (HMR):

```bash
npm run dev
```
Open your browser to the URL displayed in the terminal (typically `http://localhost:5173/`).

### Production Build
Type-check and compile the bundle for deployment:

```bash
npm run build
```
The optimized static build will be generated in the `dist/` directory.

### Preview Build
Locally test the compiled production artifacts:

```bash
npm run preview
```

---

## Controls & Tactical Interface

| Control | Action |
|---|---|
| `W`, `A`, `S`, `D` / Arrow Keys | Pan Tactical Camera across Storm Grid |
| `Mouse Left Click` | Select unit / Assign waypoint |
| `Mouse Right Click` | Assign aggressive intercept / Attack vector |
| `Space` | Toggle condensation array / Harvest mode |
| `1`, `2`, `3` | Drone squadron command groups |

---

## License & Authorship

Developed by **Aidelank (Lucas Yang)**.

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
