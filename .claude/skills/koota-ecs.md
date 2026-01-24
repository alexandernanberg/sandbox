# Koota ECS (Entity Component System)

Koota is a performant ECS library with first-class React integration, used for managing game state and systems.

## Core Concepts

### World

The central data container where all entities and their data are stored:

```typescript
import {createWorld} from 'koota'

const world = createWorld()
```

### Entity

Individual game objects encoded as numbers. Entities have no data themselves—they're just IDs that traits are attached to.

```typescript
// Spawn entity with traits
const entity = world.spawn(Position, Velocity, IsPlayer)

// Check if entity is alive
entity.isAlive() // true/false
world.has(entity) // also works

// Get entity ID
entity.id()

// Destroy entity
entity.destroy()
```

### Trait (Component)

Reusable data containers attached to entities. Two patterns:

**Schema-based** (better performance via Structure of Arrays):

```typescript
import {trait} from 'koota'

// Define with default values
const Position = trait({x: 0, y: 0, z: 0})
const Velocity = trait({vx: 0, vy: 0, vz: 0})
const Health = trait({current: 100, max: 100})

// Tag trait (no data)
const IsPlayer = trait()
const IsDead = trait()
```

**Callback-based** (for complex objects like Three.js):

```typescript
import {trait} from 'koota'
import * as THREE from 'three'

const Mesh = trait(() => new THREE.Mesh())
const Transform = trait(() => ({
  position: new THREE.Vector3(),
  rotation: new THREE.Quaternion(),
}))
```

### Working with Traits

```typescript
// Spawn with initial values
const entity = world.spawn(
  Position({x: 10, y: 0, z: 5}),
  Velocity({vx: 1, vy: 0, vz: 0}),
  IsPlayer,
)

// Add trait to existing entity
entity.add(Health({current: 50, max: 100}))

// Check if entity has trait
entity.has(Position) // true

// Get trait data (returns reference)
const pos = entity.get(Position)
pos.x = 20 // Modifies the entity's data

// Set trait data
entity.set(Position, {x: 30, y: 0, z: 0})

// Remove trait
entity.remove(Velocity)
```

## Queries

Filter entities by trait combinations:

```typescript
// Get all entities with Position and Velocity
const movingEntities = world.query(Position, Velocity)

// Iterate with forEach
movingEntities.forEach((entity) => {
  const pos = entity.get(Position)
  const vel = entity.get(Velocity)
  pos.x += vel.vx
})

// Iterate with updateEach (direct trait access, marks as changed)
movingEntities.updateEach(([pos, vel]) => {
  pos.x += vel.vx
  pos.y += vel.vy
  pos.z += vel.vz
})

// Select specific traits from query
world
  .query(Position, Velocity, Mass)
  .select(Mass)
  .updateEach(([mass]) => {
    mass.value += 1
  })

// Get first matching entity
const player = world.queryFirst(IsPlayer, Position)
```

### Query Modifiers

```typescript
import {Not, Or, createAdded, createRemoved, createChanged} from 'koota'

// Exclude entities with certain traits
world.query(Position, Not(IsDead))

// Match entities with either trait
world.query(Position, Or(IsPlayer, IsEnemy))

// Track trait changes - create modifier instances first
const Added = createAdded()
const Removed = createRemoved()
const Changed = createChanged()

world.query(Added(Position)) // Just added Position
world.query(Removed(Health)) // Just had Health removed
world.query(Changed(Position)) // Position was modified
```

### Pre-cached Queries (Performance)

```typescript
import {createQuery} from 'koota'

// Create once at module level
const movingQuery = createQuery(Position, Velocity)

// Use in systems - pass query to world.query()
function movementSystem(world) {
  world.query(movingQuery).updateEach(([pos, vel]) => {
    pos.x += vel.vx
  })
}
```

## Relations

Link entities together:

```typescript
import {relation} from 'koota'

// Basic relation
const ChildOf = relation()

// Relation with data
const Contains = relation({store: {amount: 0}})

// Exclusive relation (entity can only have one target)
const Targeting = relation({exclusive: true})

// Auto-destroy when parent destroyed
const ChildOf = relation({autoDestroy: 'orphan'})

// Create parent-child relationship
const parent = world.spawn(Position)
const child = world.spawn(Position, ChildOf(parent))

// Entity relation operations
entity.add(ChildOf(parent))
entity.remove(ChildOf(parent))
entity.remove(ChildOf('*')) // Remove all ChildOf relations
entity.has(ChildOf(parent))
entity.get(ChildOf(parent)) // Get relation data
entity.set(ChildOf(parent), {amount: 20})
entity.targetFor(Contains) // Get first target entity
entity.targetsFor(Contains) // Get all target entities

// Query by relation
world.query(ChildOf(parent)) // All children of parent
world.query(ChildOf('*')) // All entities with any ChildOf
```

### Relation Options

| Option        | Value            | Description                          |
| ------------- | ---------------- | ------------------------------------ |
| `store`       | `{ key: value }` | Attach data to the relation          |
| `exclusive`   | `true`           | Entity can only target one entity    |
| `autoDestroy` | `'orphan'`       | Destroy source when target destroyed |
| `autoDestroy` | `'target'`       | Destroy target when source destroyed |

## React Integration

### WorldProvider

Make world available to components:

```tsx
import {WorldProvider} from 'koota/react'
;<WorldProvider world={world}>
  <Game />
</WorldProvider>
```

### useWorld

Access the world in components:

```tsx
import {useWorld} from 'koota/react'

function GameComponent() {
  const world = useWorld()
  // Use world for spawning, queries, etc.
}
```

### useQuery

Reactive query that re-renders on changes:

```tsx
import {useQuery} from 'koota/react'

function PlayerList() {
  const players = useQuery(IsPlayer, Position)

  return (
    <ul>
      {players.map((entity) => (
        <PlayerItem key={entity} entity={entity} />
      ))}
    </ul>
  )
}
```

### useTrait

Observe a single entity's trait (re-renders on change):

```tsx
import {useTrait} from 'koota/react'

function HealthBar({entity}) {
  const health = useTrait(entity, Health) // undefined if absent

  if (!health) return null

  return <div style={{width: `${(health.current / health.max) * 100}%`}} />
}
```

### useQueryFirst

Get first matching entity:

```tsx
import {useQueryFirst} from 'koota/react'

function PlayerHUD() {
  const player = useQueryFirst(IsPlayer, Position)
  if (!player) return null
  // ...
}
```

### useTag / useHas

Check trait presence (returns boolean):

```tsx
import {useTag, useHas} from 'koota/react'

function EntityStatus({entity}) {
  const isActive = useTag(entity, IsActive) // true/false
  const hasHealth = useHas(entity, Health) // true/false
  // ...
}
```

### useTarget / useTargets

Observe relation targets:

```tsx
import {useTarget, useTargets} from 'koota/react'

function InventoryUI({entity}) {
  const parent = useTarget(entity, ChildOf) // Entity | undefined
  const items = useTargets(entity, Contains) // Entity[]
  // ...
}
```

### useTraitEffect

Subscribe to trait changes without re-rendering:

```tsx
import {useTraitEffect} from 'koota/react'

function SyncMeshPosition({entity, meshRef}) {
  useTraitEffect(entity, Position, (position) => {
    if (!position) return
    meshRef.current.position.set(position.x, position.y, position.z)
  })
  return null
}
```

### createActions

Safe way to modify world state from React:

```typescript
import {createActions} from 'koota'

export const actions = createActions((world) => ({
  spawnPlayer: (x: number, z: number) => {
    return world.spawn(
      IsPlayer,
      Position({x, y: 0, z}),
      Health({current: 100, max: 100}),
    )
  },

  damageEntity: (entity, amount: number) => {
    if (!entity.has(Health)) return
    const health = entity.get(Health)
    health.current = Math.max(0, health.current - amount)
    if (health.current <= 0) {
      entity.add(IsDead)
    }
  },
}))
```

### useActions

Use actions in components:

```tsx
import {useActions} from 'koota/react'
import {actions} from './actions'

function SpawnButton() {
  const {spawnPlayer} = useActions(actions)

  return <button onClick={() => spawnPlayer(0, 0)}>Spawn Player</button>
}
```

## Systems Pattern

Systems are functions that process entities:

```typescript
// Define systems
function movementSystem(world, delta: number) {
  world.query(Position, Velocity).updateEach(([pos, vel]) => {
    pos.x += vel.vx * delta
    pos.y += vel.vy * delta
    pos.z += vel.vz * delta
  })
}

function gravitySystem(world, delta: number) {
  world.query(Velocity, Not(IsGrounded)).updateEach(([vel]) => {
    vel.vy -= 9.81 * delta
  })
}

// Run in game loop
function gameLoop(delta: number) {
  gravitySystem(world, delta)
  movementSystem(world, delta)
}
```

## Performance Tips

1. **Use schema traits** for primitive data (numbers, booleans)
2. **Pre-cache queries** with `createQuery()` for hot paths
3. **Use `updateEach`** instead of `forEach` + `get()` for bulk updates
4. **Avoid allocations** in update loops
5. **Batch operations** when spawning many entities

```typescript
// Good - no per-entity allocation
const moveQuery = createQuery(Position, Velocity)

function moveSystem(world, dt) {
  world.query(moveQuery).updateEach(([pos, vel]) => {
    pos.x += vel.vx * dt
  })
}

// Avoid - allocates function each call
function moveSystemBad(world, dt) {
  world.query(Position, Velocity).forEach((entity) => {
    const pos = entity.get(Position) // Extra call
    const vel = entity.get(Velocity) // Extra call
    pos.x += vel.vx * dt
  })
}
```

## Documentation

- Koota GitHub: https://github.com/pmndrs/koota
