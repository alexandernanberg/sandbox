import type {World, Entity} from 'koota'
import {createActions} from 'koota'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  ColliderConfig,
  Object3DRef,
  IsPhysicsEntity,
  IsColliderEntity,
  ChildOf,
} from '~/ecs/physics'
import {
  IsSpawnedObject,
  ObjectVisual,
  IsSelected,
  type SpawnConfig,
  type SpawnableType,
} from './traits'

// ============================================
// Colors
// ============================================

const SPAWN_COLORS = [
  '#ff6b6b', // red
  '#4ecdc4', // teal
  '#45b7d1', // blue
  '#96ceb4', // green
  '#ffeaa7', // yellow
  '#dfe6e9', // gray
  '#a29bfe', // purple
  '#fd79a8', // pink
  '#00b894', // mint
  '#e17055', // orange
] as const

function randomColor(): string {
  return SPAWN_COLORS[Math.floor(Math.random() * SPAWN_COLORS.length)]!
}

// ============================================
// Shape Helpers
// ============================================

function getColliderShape(type: SpawnableType, scale: number) {
  switch (type) {
    case 'ball':
      return {type: 'ball' as const, radius: 0.5 * scale}
    case 'box':
      return {
        type: 'cuboid' as const,
        hx: 0.5 * scale,
        hy: 0.5 * scale,
        hz: 0.5 * scale,
      }
    case 'capsule':
      return {
        type: 'capsule' as const,
        halfHeight: 0.5 * scale,
        radius: 0.25 * scale,
      }
    case 'cylinder':
      return {
        type: 'cylinder' as const,
        halfHeight: 0.5 * scale,
        radius: 0.35 * scale,
      }
    case 'cone':
      return {
        type: 'cone' as const,
        halfHeight: 0.5 * scale,
        radius: 0.4 * scale,
      }
  }
}

// ============================================
// Spawn Functions
// ============================================

function spawnObjectAt(
  w: World,
  x: number,
  y: number,
  z: number,
  config: SpawnConfig,
): Entity {
  const shape = getColliderShape(config.type, config.scale)
  const color = config.color === 'random' ? randomColor() : config.color

  // Create rigid body entity
  const rbEntity = w.spawn(
    IsSpawnedObject,
    IsPhysicsEntity,
    Object3DRef,
    ObjectVisual({color, type: config.type}),
    Transform({x, y, z}),
    PreviousTransform({x, y, z}),
    RenderTransform({x, y, z}),
    RigidBodyConfig({
      type: 'dynamic',
      gravityScale: 1,
      linearDamping: config.linearDamping,
      angularDamping: config.angularDamping,
      ccd: false,
      canSleep: true,
      dominanceGroup: 0,
      lockPosition: false,
      lockRotation: false,
      restrictPosition: null,
      restrictRotation: null,
      linearVelocityX: 0,
      linearVelocityY: 0,
      linearVelocityZ: 0,
      angularVelocityX: 0,
      angularVelocityY: 0,
      angularVelocityZ: 0,
    }),
  )

  // Create collider entity as child
  w.spawn(
    IsColliderEntity,
    ChildOf(rbEntity),
    ColliderConfig({
      shape,
      friction: config.friction,
      restitution: config.restitution,
      density: config.mass,
      sensor: false,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      offsetQx: 0,
      offsetQy: 0,
      offsetQz: 0,
      offsetQw: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    }),
  )

  return rbEntity
}

function spawnWithVelocity(
  w: World,
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  config: SpawnConfig,
): Entity {
  const shape = getColliderShape(config.type, config.scale)
  const color = config.color === 'random' ? randomColor() : config.color

  const rbEntity = w.spawn(
    IsSpawnedObject,
    IsPhysicsEntity,
    Object3DRef,
    ObjectVisual({color, type: config.type}),
    Transform({x, y, z}),
    PreviousTransform({x, y, z}),
    RenderTransform({x, y, z}),
    RigidBodyConfig({
      type: 'dynamic',
      gravityScale: 1,
      linearDamping: config.linearDamping,
      angularDamping: config.angularDamping,
      ccd: false,
      canSleep: true,
      dominanceGroup: 0,
      lockPosition: false,
      lockRotation: false,
      restrictPosition: null,
      restrictRotation: null,
      linearVelocityX: vx,
      linearVelocityY: vy,
      linearVelocityZ: vz,
      angularVelocityX: 0,
      angularVelocityY: 0,
      angularVelocityZ: 0,
    }),
  )

  w.spawn(
    IsColliderEntity,
    ChildOf(rbEntity),
    ColliderConfig({
      shape,
      friction: config.friction,
      restitution: config.restitution,
      density: config.mass,
      sensor: false,
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      offsetQx: 0,
      offsetQy: 0,
      offsetQz: 0,
      offsetQw: 1,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
    }),
  )

  return rbEntity
}

// ============================================
// Actions
// ============================================

export const sandboxActions = createActions((w) => ({
  // Spawn single object at position
  spawnObject: (x: number, y: number, z: number, config: SpawnConfig) => {
    return spawnObjectAt(w, x, y, z, config)
  },

  // Spawn object with velocity
  spawnObjectWithVelocity: (
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    config: SpawnConfig,
  ) => {
    return spawnWithVelocity(w, x, y, z, vx, vy, vz, config)
  },

  // Spawn burst of objects
  spawnBurst: (
    x: number,
    y: number,
    z: number,
    count: number,
    config: SpawnConfig,
  ) => {
    const entities: Entity[] = []
    for (let i = 0; i < count; i++) {
      const offsetX = (Math.random() - 0.5) * 3
      const offsetY = Math.random() * 2
      const offsetZ = (Math.random() - 0.5) * 3
      entities.push(
        spawnObjectAt(w, x + offsetX, y + offsetY, z + offsetZ, config),
      )
    }
    return entities
  },

  // Spawn rain drop (from above with random x/z)
  spawnRainDrop: (config: SpawnConfig, areaSize = 20) => {
    const x = (Math.random() - 0.5) * areaSize
    const z = (Math.random() - 0.5) * areaSize
    const y = 15 + Math.random() * 5
    return spawnObjectAt(w, x, y, z, config)
  },

  // Clear all spawned objects
  clearSpawnedObjects: () => {
    for (const entity of [...w.query(IsSpawnedObject)]) {
      entity.destroy()
    }
  },

  // Delete selected objects
  deleteSelected: () => {
    for (const entity of [...w.query(IsSelected)]) {
      entity.destroy()
    }
  },

  // Select entity
  selectEntity: (entity: Entity) => {
    // Clear previous selection
    for (const e of w.query(IsSelected)) {
      e.remove(IsSelected)
    }
    entity.add(IsSelected)
  },

  // Clear selection
  clearSelection: () => {
    for (const entity of w.query(IsSelected)) {
      entity.remove(IsSelected)
    }
  },

  // Get spawned object count
  getSpawnedCount: () => {
    return [...w.query(IsSpawnedObject)].length
  },
}))
