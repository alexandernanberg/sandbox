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
      Transform({x, y, z}),
      PreviousTransform({x, y, z}),
      RenderTransform({x, y, z}),
      RigidBodyConfig,
    )

    // Spawn collider as child entity
    world.spawn(IsColliderEntity, ChildOf(rbEntity), ballCollider(0.5, 1, 0.9))

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
        Transform({x, y, z}),
        PreviousTransform({x, y, z}),
        RenderTransform({x, y, z}),
        RigidBodyConfig,
      )

      // Spawn collider as child entity
      world.spawn(
        IsColliderEntity,
        ChildOf(rbEntity),
        ballCollider(0.5, 1, 0.9),
      )
    }
  },

  // Remove all balls
  clearBalls: () => {
    // Collect entities first to avoid mutating during iteration
    const balls = [...world.query(IsBall)]
    for (const entity of balls) {
      entity.destroy()
    }
  },
}))

// Re-export physics traits for convenience
export * from './physics'
