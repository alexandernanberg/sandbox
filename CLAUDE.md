# Project Overview

3D game development sandbox with physics simulation. Features a playground scene with character controller, physics objects, and interactive elements.

## Tech Stack

- **React 19** with React Compiler (babel-plugin-react-compiler)
- **Three.js** (0.182) with **React Three Fiber** (R3F 9.5) and **Drei**
- **Jolt Physics** engine (WASM build)
- **Koota** ECS (Entity Component System)
- **Vite 7** with WASM support
- **TypeScript** with strict mode

## Commands

```bash
pnpm run dev           # Start dev server on port 3001
pnpm run build         # Production build
pnpm run lint          # ESLint
pnpm run lint:fix      # ESLint with auto-fix
pnpm run typecheck     # TypeScript type checking
pnpm run format        # Format with oxfmt
pnpm run format:check  # Check formatting
```

## Commit Convention

Use semantic commit messages:

- `feat:` - New features
- `fix:` - Bug fixes
- `refactor:` - Code changes that neither fix bugs nor add features
- `perf:` - Performance improvements
- `docs:` - Documentation only changes
- `chore:` - Build process, dependencies, or tooling changes
- `test:` - Adding or updating tests

## Project Structure

```
src/
├── app.tsx              # Root component, Canvas, providers
├── index.tsx            # Entry point
├── ecs/                 # ECS world, traits, actions
│   ├── index.ts         # World creation, actions, re-exports
│   └── physics/         # Custom ECS physics system
├── components/          # React components (cameras, lights, input)
├── scenes/              # Scene compositions (playground)
├── models/              # 3D model components (stone, ramp, slope)
├── lib/                 # Utility hooks
└── utils.ts             # Helper functions
```

## ECS Architecture (Koota)

### Core Concepts

- **World**: Single global world at `src/ecs/index.ts`
- **Traits**: Components attached to entities (data containers)
- **Actions**: Safe world mutations from React via `createActions()`
- **Queries**: `world.query(Trait1, Trait2)` returns matching entities

### Pattern: Creating Entities

```tsx
// Define traits
const IsBall = trait() // Tag trait (no data)
const BallColor = trait({color: 'red'}) // Data trait

// Spawn with actions
const actions = createActions((world) => ({
  spawnBall: (x, y, z) => {
    world.spawn(IsBall, BallColor({color: 'blue'}), Transform({x, y, z}))
  },
}))

// Use in React
const {spawnBall} = useActions(actions)
```

### Pattern: React Integration

```tsx
<WorldProvider world={world}>
  <Canvas>
    <PhysicsProvider>
      <Scene />
    </PhysicsProvider>
  </Canvas>
</WorldProvider>
```

## Physics System (ECS-based)

Custom physics integration at `src/ecs/physics/`. Wraps Jolt Physics with ECS traits.

### Key Traits

| Trait               | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `Transform`         | Current physics position/rotation          |
| `PreviousTransform` | Last frame state (for interpolation)       |
| `RenderTransform`   | Interpolated state for rendering           |
| `RigidBodyConfig`   | Serializable body configuration            |
| `ColliderConfig`    | Serializable collider configuration        |
| `RigidBodyRef`      | Runtime Jolt body handle                   |
| `IsPhysicsEntity`   | Tag for physics entities                   |
| `ChildOf`           | Relation linking colliders to rigid bodies |

### Physics Step Pipeline

1. `initializeTransformFromObject3D` - Read initial transforms from Three.js
2. `createPhysicsBodies` - Create Jolt bodies from config traits
3. `createColliders` - Create Jolt colliders for child entities
4. `storePreviousTransforms` - Save current state before step
5. `joltWorld.Step()` - Run physics simulation
6. `syncTransformFromPhysics` - Copy Jolt state to traits
7. `interpolateTransforms` - Lerp between previous/current
8. `syncToObject3D` - Apply to Three.js objects

### React Components

```tsx
<RigidBody position={[0, 5, 0]} type="dynamic">
  <CuboidCollider args={[1, 1, 1]} restitution={0.5}>
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshPhongMaterial color="red" />
    </mesh>
  </CuboidCollider>
</RigidBody>
```

Collider types: `BallCollider`, `CuboidCollider`, `CapsuleCollider`, `CylinderCollider`, `ConeCollider`, `ConvexHullCollider`

### Dynamic Body Mass

For dynamic bodies to have correct mass, use `mOverrideMassProperties`:

```typescript
bodySettings.mOverrideMassProperties = OVERRIDE_MASS_PROPERTIES_CALC_INERTIA
bodySettings.mMassPropertiesOverride.mMass = density * volume
```

## Jolt CharacterVirtual (KCC)

The character controller uses Jolt's `CharacterVirtual` class - a kinematic character controller that performs collision detection without being a rigid body in the simulation.

### Key Settings

| Setting                      | Value | Description                              |
| ---------------------------- | ----- | ---------------------------------------- |
| `mMass`                      | 1000  | Character mass for pushing calculations  |
| `mMaxStrength`               | 100   | Max force (N) for pushing dynamic bodies |
| `mMaxSlopeAngle`             | 50°   | Maximum walkable slope angle             |
| `mCharacterPadding`          | 0.02  | Skin width / collision padding           |
| `mPenetrationRecoverySpeed`  | 1.0   | How fast penetration is resolved         |
| `mPredictiveContactDistance` | 0.1   | Range for predictive contacts            |
| `mSupportingVolume`          | Plane | Defines what counts as "ground"          |

### Velocity Calculation Pattern (Official)

```typescript
// 1. Call UpdateGroundVelocity() FIRST
character.UpdateGroundVelocity()

// 2. Get velocities and up vector
const characterUp = character.GetUp()
const linearVelocity = character.GetLinearVelocity()
const groundVel = character.GetGroundVelocity()

// 3. Calculate vertical speed using dot product
const verticalSpeed =
  linearVelocity.GetX() * characterUp.GetX() +
  linearVelocity.GetY() * characterUp.GetY() +
  linearVelocity.GetZ() * characterUp.GetZ()

// 4. Check if moving towards ground (threshold: 0.1)
const movingTowardsGround = verticalSpeed - groundVerticalSpeed < 0.1

// 5. Build velocity
if (isGrounded && movingTowardsGround) {
  newVelocity = groundVelocity // Start with ground velocity
} else {
  newVelocity = verticalSpeed * characterUp // Preserve vertical only
}

// 6. Apply gravity (full vector, not just Y)
newVelocity += gravity * delta

// 7. Add horizontal movement
newVelocity.x += playerInput.x
newVelocity.z += playerInput.z
```

### Contact Listener Callbacks

```typescript
const contactListener = new Jolt.CharacterContactListenerJS()

// Validate contacts (return false to ignore)
contactListener.OnContactValidate = (character, bodyID2, ...) => true

// Modify contact settings
contactListener.OnContactAdded = (character, bodyID2, ..., settings) => {
  // settings.mCanPushCharacter - can body push character?
  // settings.mCanReceiveImpulses - can character push body?
}

// Control sliding behavior (critical for ground movement!)
contactListener.OnContactSolve = (character, ..., contactVelocity,
                                   contactNormal, newCharacterVelocity) => {
  // IMPORTANT: Use allowSliding flag based on player input
  if (!allowSliding && contactVelocity.IsNearZero() &&
      !character.IsSlopeTooSteep(contactNormal)) {
    newCharacterVelocity.Set(0, 0, 0)  // Prevent sliding when idle
  }
}

character.SetListener(contactListener)
```

### allowSliding Flag

**Critical for ground movement!** Without this, `OnContactSolve` zeros velocity on ALL static surfaces.

```typescript
// Set BEFORE ExtendedUpdate
const hasInput = movementLength > 1.0e-12
const isAirborne = !(isGrounded || isSliding)
allowSliding = hasInput || isAirborne // Allow movement or air physics
```

### ExtendedUpdate

Use `ExtendedUpdate` instead of `Update` for floor sticking and stair walking:

```typescript
character.ExtendedUpdate(
  delta,
  character.GetUp(), // NOT gravity! Pass up vector
  updateSettings, // ExtendedUpdateSettings
  broadPhaseFilter,
  objectLayerFilter,
  bodyFilter,
  shapeFilter,
  tempAllocator,
)
```

### ExtendedUpdateSettings

```typescript
const settings = new Jolt.ExtendedUpdateSettings()

// Floor sticking (prevents floating after slopes)
settings.mStickToFloorStepDown = new Jolt.Vec3(0, -0.5, 0)

// Stair walking
settings.mWalkStairsStepUp = new Jolt.Vec3(0, 0.4, 0)

// Disable floor sticking when jumping
const noStickSettings = new Jolt.ExtendedUpdateSettings()
noStickSettings.mStickToFloorStepDown = new Jolt.Vec3(0, 0, 0)
```

### Momentum Transfer (Platforms Only)

Only transfer momentum from **kinematic** platforms, not dynamic bodies:

```typescript
if (wasGroundedLastFrame && !isGrounded) {
  const groundBodyId = character.GetGroundBodyID()
  const motionType = bodyInterface.GetMotionType(groundBodyId)

  // Only kinematic platforms, not dynamic bodies (balls, crates)
  if (motionType === MOTION_TYPE_KINEMATIC) {
    inheritedVelocity = groundVel * momentumWeight
  }
}
```

### Ground State

```typescript
const groundState = character.GetGroundState()

// States:
GROUND_STATE_ON_GROUND // Can move freely
GROUND_STATE_ON_STEEP_GROUND // On slope too steep to climb (sliding)
GROUND_STATE_NOT_SUPPORTED // Touching but should fall
GROUND_STATE_IN_AIR // Not touching anything

// Helpers
character.IsSupported() // On ground or steep ground
character.IsSlopeTooSteep(normal) // Check if slope is walkable
character.GetGroundNormal() // Surface normal
character.GetGroundVelocity() // Platform velocity (includes rotation!)
```

### Common Pitfalls

1. **Forgetting `UpdateGroundVelocity()`** - Call before `GetGroundVelocity()`
2. **Missing `allowSliding` flag** - Character can't walk on static ground
3. **Wrong ExtendedUpdate param** - Pass `GetUp()`, not gravity
4. **Velocity accumulation** - Don't add input to current velocity when airborne
5. **Dynamic body momentum** - Only transfer from kinematic platforms
6. **Missing mass override** - Dynamic bodies need explicit mass setting
7. **Ground velocity from dynamic bodies** - Don't use `GetGroundVelocity()` as base velocity when standing on dynamic bodies (causes feedback loop)

## Key Conventions

- Path alias: `~/` maps to `src/`
- Physics entities use parent-child pattern: RigidBody entity + child Collider entities
- Use `entityRef` prop to get entity reference from React components
- Access Jolt body via `entity.get(RigidBodyRef)?.body`
- Fixed timestep: 60Hz with frame interpolation

## Important Files

- `src/ecs/index.ts` - World, actions, game-specific traits
- `src/ecs/physics/index.ts` - Physics public API
- `src/ecs/physics/traits.ts` - All physics traits
- `src/ecs/physics/systems.ts` - Physics ECS systems
- `src/ecs/physics/step.ts` - Main physics step function
- `src/ecs/physics/character.ts` - CharacterVirtual KCC implementation
- `src/ecs/physics/world.ts` - Jolt world initialization and management
- `src/ecs/physics/jolt-types.ts` - Jolt type definitions and constants
- `src/ecs/physics/math.ts` - Lightweight vector/quaternion utilities (no Three.js overhead)
- `src/ecs/physics/components.tsx` - React components (RigidBody, colliders, CharacterController)

## Documentation

- [Koota ECS](https://github.com/pmndrs/koota/blob/main/README.md) - Entity Component System
- [React Three Fiber](https://r3f.docs.pmnd.rs/) - React renderer for Three.js
- [Drei](https://drei.docs.pmnd.rs/) - R3F helpers and abstractions
- [Jolt Physics](https://jrouwe.github.io/JoltPhysics/) - Physics engine documentation
- [Jolt Physics.js](https://github.com/jrouwe/JoltPhysics.js) - JavaScript/WASM bindings
- [Jolt Examples](https://github.com/jrouwe/JoltPhysics.js/tree/main/Examples) - Official examples (character_virtual.html)
- [Three.js](https://threejs.org/docs/) - 3D graphics library
