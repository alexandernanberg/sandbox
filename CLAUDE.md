# Project Overview

3D game development sandbox with physics simulation. Features a playground scene with character controller, physics objects, and interactive elements.

## Tech Stack

- **React 19** with React Compiler (babel-plugin-react-compiler)
- **Three.js** (0.182) with **React Three Fiber** (R3F 9.5) and **Drei**
- **Rapier** physics engine (SIMD-compat build)
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

Custom physics integration at `src/ecs/physics/`. Wraps Rapier with ECS traits.

### Key Traits

| Trait               | Purpose                                    |
| ------------------- | ------------------------------------------ |
| `Transform`         | Current physics position/rotation          |
| `PreviousTransform` | Last frame state (for interpolation)       |
| `RenderTransform`   | Interpolated state for rendering           |
| `RigidBodyConfig`   | Serializable body configuration            |
| `ColliderConfig`    | Serializable collider configuration        |
| `RigidBodyRef`      | Runtime Rapier body handle                 |
| `IsPhysicsEntity`   | Tag for physics entities                   |
| `ChildOf`           | Relation linking colliders to rigid bodies |

### Physics Step Pipeline

1. `initializeTransformFromObject3D` - Read initial transforms from Three.js
2. `createPhysicsBodies` - Create Rapier bodies from config traits
3. `createColliders` - Create Rapier colliders for child entities
4. `storePreviousTransforms` - Save current state before step
5. `rapierWorld.step()` - Run physics simulation
6. `syncTransformFromPhysics` - Copy Rapier state to traits
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

### Character Controller

```tsx
;<CharacterController ref={controllerRef} height={1.75} radius={0.5}>
  <mesh>...</mesh>
</CharacterController>

// In update loop
usePhysicsUpdate((delta) => {
  controller.setVelocity(vx, vy, vz)
})
```

## Key Conventions

- Path alias: `~/` maps to `src/`
- Physics entities use parent-child pattern: RigidBody entity + child Collider entities
- Use `entityRef` prop to get entity reference from React components
- Access Rapier body via `entity.get(RigidBodyRef)?.body`
- Fixed timestep: 60Hz with frame interpolation

## Important Files

- `src/ecs/index.ts` - World, actions, game-specific traits
- `src/ecs/physics/index.ts` - Physics public API
- `src/ecs/physics/traits.ts` - All physics traits
- `src/ecs/physics/systems.ts` - Physics ECS systems
- `src/ecs/physics/step.ts` - Main physics step function
- `src/ecs/physics/math.ts` - Lightweight vector/quaternion utilities (no Three.js overhead)
- `src/ecs/physics/components.tsx` - React components (RigidBody, colliders)

## Documentation

- [Koota ECS](https://github.com/pmndrs/koota/blob/main/README.md) - Entity Component System
- [React Three Fiber](https://r3f.docs.pmnd.rs/) - React renderer for Three.js
- [Drei](https://drei.docs.pmnd.rs/) - R3F helpers and abstractions
- [Rapier](https://rapier.rs/docs/) - Physics engine
- [Three.js](https://threejs.org/docs/) - 3D graphics library
