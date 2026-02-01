# Car Ball - Development Plan

## Project Setup

### New Repository Structure
```
car-ball/
├── src/
│   ├── ecs/                    # Copy from sandbox
│   │   ├── index.ts            # World, core traits
│   │   ├── physics/            # Rapier integration
│   │   ├── render/             # Three.js render system
│   │   └── scheduler.ts        # System scheduling
│   ├── game/
│   │   ├── vehicle/            # Car physics & control
│   │   ├── ball/               # Ball entity & physics
│   │   ├── arena/              # Arena, goals, boost pads
│   │   ├── match/              # Game rules, scoring, timer
│   │   ├── camera/             # Ball cam, car cam
│   │   └── input/              # Keyboard, gamepad
│   ├── ui/                     # React UI overlay
│   │   ├── hud/                # In-game HUD
│   │   ├── menus/              # Main menu, pause, etc.
│   │   └── components/         # Shared UI components
│   ├── audio/                  # Sound effects, music
│   ├── assets/                 # Models, textures
│   ├── multiplayer/            # Networking (Phase 3)
│   └── main.ts                 # Entry point
├── public/
│   ├── models/                 # GLB/GLTF files
│   ├── textures/               # Images
│   └── sounds/                 # Audio files
├── docs/
│   └── SPEC.md                 # Game spec (copy from here)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

### Tech Stack
```json
{
  "dependencies": {
    "koota": "^0.1.0",
    "@dimforge/rapier3d": "^0.14.0",
    "three": "^0.170.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zustand": "^5.0.0",
    "howler": "^2.2.0"
  },
  "devDependencies": {
    "vite": "^6.0.0",
    "typescript": "^5.6.0",
    "@anthropic-ai/claude-code": "latest"
  }
}
```

---

## Phase 1: Core Prototype (Week 1-2)

> Goal: Driveable car, ball, goals, scoring. Playable 1v1 free play.

### 1.1 Vehicle System
- [ ] **Vehicle traits**
  ```typescript
  VehicleInput      // throttle, steer, jump, boost, airRoll
  VehicleState      // speed, isGrounded, isFlipping, boostAmount
  VehicleConfig     // maxSpeed, boostAccel, turnRate, jumpForce
  IsVehicle         // Tag trait
  ```
- [ ] **Vehicle physics**
  - Arcade car model (not realistic simulation)
  - Speed-dependent turning
  - Instant acceleration response
  - Ground detection (floor, walls, ceiling)
- [ ] **Vehicle controller**
  - Keyboard input (WASD + Space + Shift)
  - Jump (single, double jump)
  - Boost (acceleration + trail effect)
- [ ] **Vehicle mesh**
  - Simple box/low-poly car placeholder
  - Wheels (visual only, no physics)
  - Team color material

### 1.2 Ball System
- [ ] **Ball traits**
  ```typescript
  IsBall            // Tag trait
  BallState         // lastTouchedBy, speed
  ```
- [ ] **Ball physics**
  - Sphere collider
  - High restitution (bouncy)
  - Responds to car hits
  - Max speed cap
- [ ] **Ball mesh**
  - Sphere with glow effect
  - Trail when moving fast

### 1.3 Arena System
- [ ] **Arena geometry**
  - Floor (100m x 70m)
  - Walls (driveable)
  - Ceiling (driveable)
  - Curved transitions (floor → wall)
  - Goals (2x, with back wall)
- [ ] **Boost pads**
  - Small pads (+12 boost, 4s respawn)
  - Large pads (+100 boost, 10s respawn)
  - Visual indicator (active/inactive)
- [ ] **Goal detection**
  - Trigger volume in goal
  - Ball enters → goal scored
  - Reset ball + cars to positions

### 1.4 Match System
- [ ] **Match state**
  ```typescript
  MatchState        // phase, timeRemaining, score
  MatchConfig       // duration, teamSize
  ```
- [ ] **Scoring**
  - Detect goal
  - Update score
  - Goal celebration (particles, sound)
  - Reset positions
- [ ] **Timer**
  - Countdown from 5:00
  - Overtime on tie

### 1.5 Camera System
- [ ] **Ball cam**
  - Always look at ball
  - Smooth follow behind car
  - Toggle on/off
- [ ] **Car cam**
  - Fixed behind car
  - Look direction = car direction

### 1.6 Basic HUD
- [ ] Score display (Blue vs Orange)
- [ ] Timer
- [ ] Boost meter
- [ ] Ball indicator (off-screen arrow)

### Phase 1 Deliverable
✅ Free play mode: drive around, hit ball, score goals

---

## Phase 2: Polish & Feel (Week 3-4)

> Goal: Make it feel like Rocket League. Add advanced mechanics.

### 2.1 Advanced Vehicle Mechanics
- [ ] **Dodge/flip**
  - Front flip (forward momentum)
  - Side flip (lateral dodge)
  - Back flip
  - Diagonal flip
  - Dodge into ball = power hit
- [ ] **Air control**
  - Pitch/yaw/roll in air
  - Air roll button
  - Boost in air (fly)
- [ ] **Wall/ceiling driving**
  - Seamless transition
  - Gravity relative to surface
  - Jump off wall
- [ ] **Powerslide/drift**
  - Handbrake button
  - Drift on sharp turns
  - Maintain momentum

### 2.2 Ball Mechanics
- [ ] **Hit detection**
  - Hit power based on car speed
  - Hit direction based on car orientation
  - Dodge hits = extra power
- [ ] **Ball prediction**
  - Show landing indicator
  - Trajectory preview (optional)

### 2.3 Visual Polish
- [ ] **Car model**
  - Low-poly car mesh
  - Animated wheels
  - Boost flame effect
  - Dodge animation
- [ ] **Arena visuals**
  - Stadium lighting
  - Goal glow
  - Floor texture (grid)
  - Crowd/stands (simple)
- [ ] **Effects**
  - Boost trail particles
  - Ball hit particles
  - Goal explosion
  - Speed lines at high velocity

### 2.4 Audio
- [ ] **Sound effects**
  - Engine sound (pitch = speed)
  - Boost sound
  - Jump/dodge sounds
  - Ball hit (varying intensity)
  - Goal horn
  - Countdown beeps
- [ ] **Music**
  - Menu theme
  - In-game music (subtle)

### 2.5 Menus & UI
- [ ] **Main menu**
  - Play button
  - Settings
  - Controls reference
- [ ] **Pause menu**
  - Resume
  - Restart
  - Quit to menu
- [ ] **Settings**
  - Camera settings
  - Controls rebinding
  - Audio volume
  - Graphics quality
- [ ] **Post-game screen**
  - Final score
  - Stats (goals, saves, shots)
  - Rematch button

### Phase 2 Deliverable
✅ Polished single-player experience with all core mechanics

---

## Phase 3: Multiplayer (Week 5-7)

> Goal: Play with friends online.

### 3.1 Networking Foundation
- [ ] **Choose stack**
  - Option A: Partykit (easiest)
  - Option B: WebRTC peer-to-peer
  - Option C: Custom WebSocket server
- [ ] **Connection flow**
  - Create room → get code
  - Join room with code
  - Handle disconnects

### 3.2 State Synchronization
- [ ] **Sync protocol**
  ```typescript
  // Server → Client (20-60 Hz)
  GameState {
    tick: number
    ball: { pos, vel, angVel }
    players: [{ id, pos, rot, vel, boost, state }]
    score: { blue, orange }
    time: number
  }

  // Client → Server (60 Hz)
  PlayerInput {
    tick: number
    throttle, steer, jump, boost, airRoll
  }
  ```
- [ ] **Authority model**
  - Host runs physics (P2P)
  - Or: Server authoritative (dedicated)
- [ ] **Interpolation**
  - Buffer 2-3 states
  - Smooth remote players
  - Extrapolate on packet loss

### 3.3 Lobby System
- [ ] **Create game**
  - Select mode (1v1, 2v2, 3v3)
  - Get shareable code
  - Wait for players
- [ ] **Join game**
  - Enter code
  - Connect to host
  - Select team
- [ ] **Ready up**
  - All players ready → start countdown
  - Handle player leaving

### 3.4 Gameplay Sync
- [ ] **Ball sync**
  - Server authoritative
  - Clients predict locally
  - Correct on mismatch
- [ ] **Goal sync**
  - Server detects goals
  - Broadcast to all clients
- [ ] **Boost pad sync**
  - Track pad states on server
  - Sync pickups

### 3.5 Teams
- [ ] **Team assignment**
  - Blue vs Orange
  - Auto-balance option
- [ ] **Spawn positions**
  - Team-based spawn points
  - Kickoff positions

### Phase 3 Deliverable
✅ Online multiplayer with friends (1v1, 2v2, 3v3)

---

## Phase 4: Features & Content (Week 8+)

> Goal: Replayability, progression, polish.

### 4.1 AI Opponent
- [ ] **Basic AI**
  - Chase ball
  - Hit toward goal
  - Return to defense
- [ ] **Difficulty levels**
  - Easy: slow reactions
  - Medium: decent hits
  - Hard: aerials, saves

### 4.2 Training Mode
- [ ] **Free play**
  - Unlimited time
  - Reset ball button
  - Spawn ball in air
- [ ] **Custom training**
  - Specific shot setups
  - Aerial practice
  - Goalie practice

### 4.3 Cosmetics
- [ ] **Car bodies**
  - Different shapes
  - Same hitbox
- [ ] **Decals/skins**
  - Team color variants
  - Patterns
- [ ] **Boost trails**
  - Different colors
  - Different effects
- [ ] **Goal explosions**
  - Custom celebrations

### 4.4 Stats & Progression
- [ ] **Match stats**
  - Goals, assists, saves
  - Shots, touches
  - Boost usage
- [ ] **Career stats**
  - Total goals
  - Win/loss record
  - Playtime
- [ ] **Achievements**
  - First goal
  - Aerial goal
  - Hat trick
  - etc.

### 4.5 Quality of Life
- [ ] **Replay system**
  - Save last goal
  - Watch from any angle
  - Slow motion
- [ ] **Spectator mode**
  - Watch matches
  - Free camera
- [ ] **Mobile support**
  - Touch controls
  - Lower graphics

---

## Milestones Summary

| Milestone | Deliverable | Timeline |
|-----------|-------------|----------|
| **M1** | Driveable car + ball + goals | Week 1 |
| **M2** | Complete free play mode | Week 2 |
| **M3** | All mechanics (dodge, aerial, wall drive) | Week 3 |
| **M4** | Polish (audio, effects, menus) | Week 4 |
| **M5** | Multiplayer lobby + sync | Week 5-6 |
| **M6** | Multiplayer polish | Week 7 |
| **M7** | AI + training mode | Week 8 |
| **M8** | Cosmetics + progression | Week 9+ |

---

## What to Copy from Sandbox

### Keep (copy to new repo)
```
src/ecs/
├── index.ts              # World setup, actions pattern
├── physics/
│   ├── world.ts          # Rapier initialization
│   ├── traits.ts         # Transform, RigidBody, Collider traits
│   ├── systems.ts        # Physics sync systems
│   ├── step.ts           # Fixed timestep loop
│   └── math.ts           # Vector/quaternion utilities
├── render/
│   ├── traits.ts         # Geometry, Material, Mesh traits
│   ├── systems.ts        # Render setup/sync
│   ├── prefabs.ts        # Entity spawning helpers
│   ├── environment.ts    # Lights, post-processing
│   └── game.ts           # Vanilla game runner
└── scheduler.ts          # System scheduling (directed)
```

### Don't need
```
src/ecs/
├── player/               # Character controller (not car)
├── camera/               # Third-person camera (replace with ball cam)
├── balls.tsx             # Old ball rendering
└── scenes/               # Playground scene
```

### Modify heavily
```
- Input system (car controls, not character)
- Camera system (ball cam)
```

---

## First Session Checklist

When starting the new repo:

1. [ ] Create GitHub repo `car-ball`
2. [ ] Initialize with Vite + TypeScript
3. [ ] Copy ECS core from sandbox
4. [ ] Set up physics (Rapier)
5. [ ] Create vehicle traits & spawner
6. [ ] Basic vehicle physics (drive forward/back, turn)
7. [ ] Keyboard input
8. [ ] Test arena (floor only)
9. [ ] First driveable car! 🚗

---

## Success Metrics

### Prototype (Phase 1)
- Can drive car around arena
- Can hit ball
- Can score goals
- Game resets after goal

### MVP (Phase 2)
- Feels like Rocket League
- All mechanics work (jump, dodge, boost, aerial)
- Looks good (low-poly aesthetic)
- Sounds good

### Launch (Phase 3)
- Can play with friends online
- Stable netcode
- No major bugs

### Growth (Phase 4)
- Returning players
- Community sharing
- Cosmetics engagement
