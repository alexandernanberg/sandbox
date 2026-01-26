import type {World} from 'koota'
import {createActions, createWorld, trait} from 'koota'
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
} from './physics'

// ============================================
// WORLD
// ============================================
// The world holds all entities and their data
export const world = createWorld()

// ============================================
// TRAITS (like components in ECS)
// ============================================

// Velocity trait - not synced from physics by default.
// Add a sync system if you want to query entities by velocity.
export const Velocity = trait({x: 0, y: 0, z: 0})

// Tag traits - just markers, no data
// "Is this entity a ball?"
export const IsBall = trait()

// Visual appearance
export const BallColor = trait({color: 'red'})

// Helper for common collider configs
const ballCollider = (radius: number, restitution = 0, friction = 0.5) =>
  ColliderConfig({
    shape: {type: 'ball', radius},
    friction,
    restitution,
    density: 1,
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
  })

// ============================================
// ACTIONS
// ============================================

const BALL_COLORS = ['red', 'green', 'blue', 'yellow', 'purple'] as const

function randomColor(): string {
  return BALL_COLORS[Math.floor(Math.random() * BALL_COLORS.length)]!
}

function spawnBallAt(w: World, x: number, y: number, z: number) {
  const rbEntity = w.spawn(
    IsBall,
    IsPhysicsEntity,
    Object3DRef,
    BallColor({color: randomColor()}),
    Transform({x, y, z}),
    PreviousTransform({x, y, z}),
    RenderTransform({x, y, z}),
    RigidBodyConfig,
  )
  w.spawn(IsColliderEntity, ChildOf(rbEntity), ballCollider(0.5, 1, 0.9))
  return rbEntity
}

export const actions = createActions((w) => ({
  spawnBall: (x: number, y: number, z: number) => spawnBallAt(w, x, y, z),

  spawnBalls: (count: number) => {
    for (let i = 0; i < count; i++) {
      spawnBallAt(w, Math.random() * 2 - 1, 6, Math.random() * 2 - 1)
    }
  },

  clearBalls: () => {
    for (const entity of [...w.query(IsBall)]) {
      entity.destroy()
    }
  },
}))

// Re-export physics traits for convenience
export * from './physics'

// Re-export player traits
export * from './player'

// Re-export camera traits
export * from './camera'

// Re-export game state
export * from './game'

// Re-export state machine utilities
export * from './state-machine'
