import {createActions, createWorld, trait} from 'koota'
import type {ColliderShape} from './physics'
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

// For Vector3, we use a schema-style trait with primitives
// This is more ECS-idiomatic and works better with koota
export const Position = trait({x: 0, y: 0, z: 0})

// Velocity trait - for physics movement
export const Velocity = trait({x: 0, y: 0, z: 0})

// Tag traits - just markers, no data
// "Is this entity a ball?"
export const IsBall = trait()

// Visual appearance
export const BallColor = trait({color: 'red'})

// ============================================
// ACTIONS
// ============================================
// Actions are safe ways to modify the world from React

export const actions = createActions((world) => ({
  // Spawn a single ball at a position with ECS physics
  spawnBall: (x: number, y: number, z: number) => {
    const colors = ['red', 'green', 'blue', 'yellow', 'purple']
    const color = colors[Math.floor(Math.random() * colors.length)]

    // Spawn rigid body entity
    const rbEntity = world.spawn(
      IsBall,
      IsPhysicsEntity,
      Object3DRef,
      BallColor({color}),
      [Transform, {x, y, z, qx: 0, qy: 0, qz: 0, qw: 1}],
      [PreviousTransform, {x, y, z, qx: 0, qy: 0, qz: 0, qw: 1}],
      [RenderTransform, {x, y, z, qx: 0, qy: 0, qz: 0, qw: 1}],
      RigidBodyConfig,
    )

    // Spawn collider as child entity
    world.spawn(IsColliderEntity, ChildOf(rbEntity), [
      ColliderConfig,
      {
        shape: {type: 'ball', radius: 0.5} as const,
        restitution: 1,
        friction: 0.9,
        density: 1,
        sensor: false,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        offsetQx: 0,
        offsetQy: 0,
        offsetQz: 0,
        offsetQw: 1,
      },
    ])

    return rbEntity
  },

  // Spawn multiple balls at random positions
  spawnBalls: (count: number) => {
    const colors = ['red', 'green', 'blue', 'yellow', 'purple']

    for (let i = 0; i < count; i++) {
      const x = Math.random() * 2 - 1 // -1 to 1
      const z = Math.random() * 2 - 1 // -1 to 1
      const y = 6
      const color = colors[Math.floor(Math.random() * colors.length)]

      // Spawn rigid body entity
      const rbEntity = world.spawn(
        IsBall,
        IsPhysicsEntity,
        Object3DRef,
        BallColor({color}),
        [Transform, {x, y, z, qx: 0, qy: 0, qz: 0, qw: 1}],
        [PreviousTransform, {x, y, z, qx: 0, qy: 0, qz: 0, qw: 1}],
        [RenderTransform, {x, y, z, qx: 0, qy: 0, qz: 0, qw: 1}],
        RigidBodyConfig,
      )

      // Spawn collider as child entity
      world.spawn(IsColliderEntity, ChildOf(rbEntity), [
        ColliderConfig,
        {
          shape: {type: 'ball', radius: 0.5} as const,
          restitution: 1,
          friction: 0.9,
          density: 1,
          sensor: false,
          offsetX: 0,
          offsetY: 0,
          offsetZ: 0,
          offsetQx: 0,
          offsetQy: 0,
          offsetQz: 0,
          offsetQw: 1,
        },
      ])
    }
  },

  // Remove all balls
  clearBalls: () => {
    // Query all entities with the IsBall trait and destroy them
    world.query(IsBall).forEach((entity) => {
      entity.destroy()
    })
  },
}))

// Re-export physics traits for convenience
export * from './physics'
