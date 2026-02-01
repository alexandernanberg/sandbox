# Car Ball - Game Spec

## Overview

A browser-based car soccer game inspired by Rocket League. Players control rocket-powered cars to hit a ball into the opponent's goal. Built with the ECS architecture, Rapier physics, and Three.js rendering.

**Name:** Car Ball

**Art Style:** Arcade / Low-poly
- Clean, readable visuals
- Stylized but not too cartoony
- Similar vibe to Rocket League but simpler geometry
- Neon/glow accents for boost trails, goal explosions
- Vibrant team colors (blue vs orange)

---

## Core Gameplay

### The Pitch
> Drive rocket-powered cars, hit a giant ball, score goals. Simple to learn, hard to master.

### Core Loop
1. Spawn in arena
2. Drive toward ball
3. Hit ball toward opponent's goal
4. Use boost for speed/aerials
5. Defend your goal
6. Score more goals than opponent
7. Win match

### Match Structure
- **Match duration:** 5 minutes (configurable)
- **Overtime:** Sudden death if tied (first goal wins)
- **Team sizes:** 1v1, 2v2, 3v3
- **Respawn:** 3 seconds after demolition or goal

---

## Vehicles

### Physics Model
```
Mass: ~150 units
Max speed (no boost): 23 m/s
Max speed (boosting): 34 m/s
Boost acceleration: 20 m/s²
Ground acceleration: 16 m/s²
Brake deceleration: 35 m/s²
Turn radius: Variable based on speed

Hitbox: Oriented bounding box (simplified)
- Length: 1.8m
- Width: 1.2m
- Height: 0.5m
```

### Controls
| Input | Action |
|-------|--------|
| W / Up | Accelerate |
| S / Down | Reverse / Brake |
| A / Left | Steer left |
| D / Right | Steer right |
| Space | Jump (tap) / Dodge (double-tap with direction) |
| Shift / RMB | Boost |
| Q / E | Air roll left/right |
| Mouse | Camera control (optional) |

### Movement Mechanics

#### Ground Movement
- Arcade-style car physics (not simulation)
- Drifting on sharp turns
- Powerslide with handbrake
- Can drive on walls and ceiling (magnetic grip)

#### Jumping
- **Single jump:** Instant upward impulse
- **Double jump:** Second impulse (must be within 1.5s of first)
- **Dodge:** Directional flip with ball hit power
  - Front flip: Forward momentum + ball hit
  - Side flip: Lateral movement
  - Back flip: Backward momentum
  - Diagonal: Combined

#### Boost
- **Capacity:** 100 units
- **Usage:** 33 units/second while boosting
- **Small pads:** +12 boost, respawn in 4s
- **Large pads (corners):** +100 boost (full), respawn in 10s
- **Start of match:** 33 boost

#### Aerials
- Use boost in air to fly
- Air roll for orientation
- Most advanced mechanic - skill ceiling

---

## Ball

### Physics
```
Radius: 1.0m (92 units in RL)
Mass: ~30 units
Restitution: 0.6 (bouncy)
Max speed: 60 m/s
Friction: Low

Gravity: Same as cars (simpler) or slightly less
```

### Ball-Car Interaction
- Ball hit force based on:
  - Car velocity at impact
  - Car orientation (nose hits harder)
  - Dodge state (dodging = power hit)
- Ball cam: Camera always faces ball (toggle)

---

## Arena

### Dimensions
```
Length: 100m (goal to goal)
Width: 70m
Height: 20m (ceiling)

Goal width: 8m
Goal height: 4m
Goal depth: 3m
```

### Layout
```
+--------------------------------------------------+
|                                                  |
|   [B]                                    [B]     |  B = Big boost pad
|        * * * * * * * * * * * * * *               |  * = Small boost pad
|                                                  |
| [B]              (BALL)                   [B]    |
|                                                  |
|        * * * * * * * * * * * * * *               |
|   [B]                                    [B]     |
|                                                  |
+--[====GOAL====]----------------[====GOAL====]---+
     Blue Team                     Orange Team
```

### Surfaces
- **Floor:** Standard friction
- **Walls:** Driveable (curved transition from floor)
- **Ceiling:** Driveable
- **Goals:** Ball enters = goal scored
- **Back wall:** Behind goals, ball bounces off

### Visual Style
**Arcade / Low-Poly** with neon accents:
- Simple geometry (low-poly cars, smooth arena)
- Bright, readable colors
- Glow effects on boost trails, ball, goals
- Clean floor with subtle grid texture
- Stadium lights for atmosphere
- Team colors: Blue (#3B82F6) vs Orange (#F97316)

---

## Game Modes

### MVP (Phase 1)
- **1v1 Local:** You vs AI or split screen
- **Free Play:** Practice mode, no timer

### Phase 2
- **1v1 Online:** Multiplayer
- **2v2 / 3v3:** Team modes

### Phase 3 (Stretch)
- **Ranked:** Matchmaking with skill rating
- **Custom Games:** Private lobbies
- **Training:** Specific mechanic drills

---

## Multiplayer Architecture

### Networking Model
```
Option A: Client-Server (Authoritative)
- Server runs physics
- Clients send inputs
- Server broadcasts state
- Pros: Anti-cheat, consistency
- Cons: Requires server, latency

Option B: Peer-to-Peer with Host
- One player is host (runs physics)
- Others send inputs to host
- Host broadcasts state
- Pros: Free, lower latency for host
- Cons: Host advantage, no host = game ends

Option C: Rollback Netcode
- Each client predicts locally
- Rollback on mismatch
- Pros: Feels responsive
- Cons: Complex, physics rollback is hard
```

**Recommendation:** Start with Option B (P2P with host) using WebRTC or Partykit. Upgrade to Option A if game gets popular.

### State Sync
```typescript
// Sync these every tick (60Hz ideal, 20Hz minimum)
interface GameState {
  tick: number
  ball: { position, velocity, angularVelocity }
  players: [{
    id: string
    position, rotation
    velocity, angularVelocity
    boost: number
    isJumping, isBoosting, isDodging
  }]
  score: { blue: number, orange: number }
  timeRemaining: number
}

// Send these from clients
interface PlayerInput {
  tick: number
  throttle: -1 | 0 | 1
  steer: -1 to 1
  jump: boolean
  boost: boolean
  airRoll: -1 | 0 | 1
}
```

### Latency Handling
- Input delay: 0-2 frames acceptable
- Interpolate remote players (buffer 2-3 states)
- Extrapolate on packet loss
- Ball prediction for local feel

---

## Technical Requirements

### Performance Targets
- **FPS:** 60 (target), 30 (minimum)
- **Physics tick:** 60Hz fixed timestep
- **Network tick:** 20-60Hz (configurable)
- **Load time:** <5 seconds
- **Bundle size:** <5MB (compressed)

### Browser Support
- Chrome, Firefox, Edge, Safari
- WebGL 2.0
- WebRTC for P2P
- Gamepad API

### Mobile (Stretch)
- Touch controls
- Lower quality settings
- Landscape only

---

## UI/UX

### HUD
```
+--------------------------------------------------+
|  [0]  BLUE           3:42           ORANGE  [2]  |
|                                                  |
|                                                  |
|                                                  |
|                                                  |
|                                                  |
|                                                  |
|                        [BALL INDICATOR]          |
|  [BOOST: ████████░░]                            |
+--------------------------------------------------+
```

- Score display
- Timer
- Boost meter
- Ball indicator (arrow when off-screen)
- Speed indicator (optional)

### Menus
1. **Main Menu:** Play, Training, Settings
2. **Mode Select:** 1v1, 2v2, 3v3
3. **Match Found:** Countdown to start
4. **Post-Game:** Stats, rematch option
5. **Settings:** Controls, graphics, audio

### Celebrations
- Goal explosion effect
- Slow-mo replay (stretch)
- Confetti/particles

---

## Audio

### Sound Effects
- Engine sound (pitch = speed)
- Boost sound
- Ball hit (varies by power)
- Goal horn
- Countdown beeps
- Jump/dodge sounds

### Music
- Menu music
- In-game music (optional, low volume)
- Goal celebration sting

---

## Progression (Post-MVP)

### Cosmetics
- Car bodies
- Decals/skins
- Boost trails
- Goal explosions
- Wheel types

### Stats
- Goals, assists, saves, shots
- Win/loss record
- Aerial goals
- Playtime

---

## Development Phases

### Phase 1: Core Prototype (1-2 weeks)
- [ ] Vehicle controller (drive, jump, boost)
- [ ] Ball physics
- [ ] Arena with goals
- [ ] Goal detection + scoring
- [ ] Boost pads
- [ ] Basic UI (score, timer, boost meter)
- [ ] Ball cam

### Phase 2: Polish (1-2 weeks)
- [ ] Dodge mechanics
- [ ] Wall/ceiling driving
- [ ] Aerials
- [ ] Sound effects
- [ ] Better visuals
- [ ] Menus

### Phase 3: Multiplayer (2-3 weeks)
- [ ] Lobby system
- [ ] P2P connection
- [ ] State sync
- [ ] Latency handling
- [ ] Teams

### Phase 4: Features (Ongoing)
- [ ] AI opponent
- [ ] Ranked mode
- [ ] Cosmetics
- [ ] Mobile support
- [ ] Replay system

---

## Technical Stack

```
ECS:        Koota
Physics:    Rapier3D
Rendering:  Three.js (pure ECS, no r3f)
Networking: Partykit / WebRTC
Audio:      Howler.js or Web Audio API
UI:         React (overlay) or pure DOM
Build:      Vite
```

---

## Open Questions

1. **Car variety?** Start with one car type or multiple?
2. **AI difficulty?** Simple chase or proper prediction?
3. ~~**Physics fidelity?**~~ → Match RL feel (wall driving, aerials, dodges)
4. ~~**Art style?**~~ → Arcade / Low-poly with neon accents
5. **Monetization?** Free, ads, cosmetic purchases?

---

## References

- [Rocket League Wiki - Physics](https://rocketleague.fandom.com/wiki/Physics)
- [RLBot - Open source RL bots](https://rlbot.org/)
- [Rocket Science - RL mechanics explained](https://www.youtube.com/c/RocketScience)
- [How Rocket League Uses UE3 Physics](https://www.gdcvault.com/play/1024972/)
