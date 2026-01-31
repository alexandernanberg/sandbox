import * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterEach,
} from 'bun:test'
import {createWorld} from 'koota'
import type {World} from 'koota'
import {
  CollisionEntered,
  CollisionExited,
  getCollisionsEntered,
  getCollisionsExited,
  isCollidingWith,
  clearCollisionEvents,
} from './events'
import {
  createPhysicsBodies,
  createColliders,
  storePreviousTransforms,
  syncTransformFromPhysics,
  interpolateTransforms,
} from './systems'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  ColliderConfig,
  CollisionCallbacks,
  IsPhysicsEntity,
  IsColliderEntity,
  PhysicsInitialized,
  ColliderInitialized,
  RigidBodyRef,
  ColliderRef,
  ChildOf,
} from './traits'

// Initialize Rapier once before all tests
beforeAll(async () => {
  await RAPIER.init()
})

describe('Traits', () => {
  let world: World

  beforeEach(() => {
    world = createWorld()
  })

  afterEach(() => {
    world.destroy()
  })

  test('Transform has correct defaults', () => {
    const entity = world.spawn(Transform)
    const t = entity.get(Transform)!

    expect(t.x).toBe(0)
    expect(t.y).toBe(0)
    expect(t.z).toBe(0)
    expect(t.qx).toBe(0)
    expect(t.qy).toBe(0)
    expect(t.qz).toBe(0)
    expect(t.qw).toBe(1)
  })

  test('RigidBodyConfig has correct defaults', () => {
    const entity = world.spawn(RigidBodyConfig)
    const config = entity.get(RigidBodyConfig)!

    expect(config.type).toBe('dynamic')
    expect(config.gravityScale).toBe(1)
    expect(config.linearDamping).toBe(0)
    expect(config.ccd).toBe(false)
    expect(config.canSleep).toBe(true)
  })

  test('ColliderConfig has correct defaults', () => {
    const entity = world.spawn(ColliderConfig)
    const config = entity.get(ColliderConfig)!

    expect(config.shape).toBe(null)
    expect(config.friction).toBe(0.5)
    expect(config.restitution).toBe(0)
    expect(config.density).toBe(1)
    expect(config.sensor).toBe(false)
  })

  test('Transform can be initialized with values', () => {
    const entity = world.spawn(Transform({x: 1, y: 2, z: 3}))
    const t = entity.get(Transform)!

    expect(t.x).toBe(1)
    expect(t.y).toBe(2)
    expect(t.z).toBe(3)
  })
})

describe('Collision Events', () => {
  let world: World

  beforeEach(() => {
    world = createWorld()
  })

  afterEach(() => {
    world.destroy()
  })

  test('getCollisionsEntered returns empty set for entity without trait', () => {
    const entity = world.spawn()

    const collisions = getCollisionsEntered(entity)
    expect(collisions.size).toBe(0)
  })

  test('getCollisionsExited returns empty set for entity without trait', () => {
    const entity = world.spawn()

    const collisions = getCollisionsExited(entity)
    expect(collisions.size).toBe(0)
  })

  test('isCollidingWith returns false for entity without trait', () => {
    const entity1 = world.spawn()
    const entity2 = world.spawn()

    expect(isCollidingWith(entity1, entity2)).toBe(false)
  })

  test('isCollidingWith returns true when collision exists', () => {
    const entity1 = world.spawn(CollisionEntered)
    const entity2 = world.spawn()

    // Manually add collision
    entity1.get(CollisionEntered)!.entities.add(entity2)

    expect(isCollidingWith(entity1, entity2)).toBe(true)
    expect(isCollidingWith(entity2, entity1)).toBe(false) // Not symmetric unless both have trait
  })

  test('clearCollisionEvents clears all collision sets', () => {
    const entity1 = world.spawn(CollisionEntered, CollisionExited)
    const entity2 = world.spawn()

    entity1.get(CollisionEntered)!.entities.add(entity2)
    entity1.get(CollisionExited)!.entities.add(entity2)

    clearCollisionEvents(world)

    expect(entity1.get(CollisionEntered)!.entities.size).toBe(0)
    expect(entity1.get(CollisionExited)!.entities.size).toBe(0)
  })
})

describe('Physics Systems', () => {
  let world: World
  let rapierWorld: RAPIER.World

  beforeEach(() => {
    world = createWorld()
    rapierWorld = new RAPIER.World({x: 0, y: -9.81, z: 0})
  })

  afterEach(() => {
    rapierWorld.free()
    world.destroy()
  })

  test('createPhysicsBodies creates a dynamic rigid body', () => {
    const entity = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 5, z: 0}),
      RigidBodyConfig, // Use defaults
    )

    createPhysicsBodies(world, rapierWorld)

    expect(entity.has(PhysicsInitialized)).toBe(true)
    expect(entity.has(RigidBodyRef)).toBe(true)

    const ref = entity.get(RigidBodyRef)!
    expect(ref.body).not.toBe(null)
    expect(ref.body!.isFixed()).toBe(false)
    expect(ref.body!.isDynamic()).toBe(true)
  })

  test('createPhysicsBodies creates a fixed rigid body', () => {
    const entity = world.spawn(IsPhysicsEntity, Transform, RigidBodyConfig)
    // Set type after spawn
    entity.set(RigidBodyConfig, (c) => {
      c.type = 'fixed'
      return c
    })

    createPhysicsBodies(world, rapierWorld)

    const ref = entity.get(RigidBodyRef)!
    expect(ref.body!.isFixed()).toBe(true)
  })

  test('createPhysicsBodies sets initial position', () => {
    const entity = world.spawn(
      IsPhysicsEntity,
      Transform({x: 10, y: 20, z: 30}),
      RigidBodyConfig,
    )

    createPhysicsBodies(world, rapierWorld)

    const ref = entity.get(RigidBodyRef)!
    const translation = ref.body!.translation()
    expect(translation.x).toBe(10)
    expect(translation.y).toBe(20)
    expect(translation.z).toBe(30)
  })

  test('createColliders creates ball collider', () => {
    // Create parent rigid body
    const rbEntity = world.spawn(IsPhysicsEntity, Transform, RigidBodyConfig)
    createPhysicsBodies(world, rapierWorld)

    // Create child collider with full config
    const colliderEntity = world.spawn(
      IsColliderEntity,
      ChildOf(rbEntity),
      ColliderConfig,
    )
    colliderEntity.set(ColliderConfig, (c) => {
      c.shape = {type: 'ball', radius: 0.5}
      return c
    })

    createColliders(world, rapierWorld)

    expect(colliderEntity.has(ColliderInitialized)).toBe(true)
    expect(colliderEntity.has(ColliderRef)).toBe(true)

    const ref = colliderEntity.get(ColliderRef)!
    expect(ref.collider).not.toBe(null)
  })

  test('createColliders creates cuboid collider', () => {
    const rbEntity = world.spawn(IsPhysicsEntity, Transform, RigidBodyConfig)
    createPhysicsBodies(world, rapierWorld)

    const colliderEntity = world.spawn(
      IsColliderEntity,
      ChildOf(rbEntity),
      ColliderConfig,
    )
    colliderEntity.set(ColliderConfig, (c) => {
      c.shape = {type: 'cuboid', hx: 1, hy: 2, hz: 3}
      return c
    })

    createColliders(world, rapierWorld)

    expect(colliderEntity.has(ColliderInitialized)).toBe(true)
    const ref = colliderEntity.get(ColliderRef)!
    expect(ref.collider).not.toBe(null)
  })

  test('storePreviousTransforms copies current to previous', () => {
    const entity = world.spawn(
      Transform({x: 10, y: 20, z: 30, qx: 0.1, qy: 0.2, qz: 0.3, qw: 0.9}),
      PreviousTransform({x: 0, y: 0, z: 0}),
      PhysicsInitialized,
    )

    storePreviousTransforms(world)

    const prev = entity.get(PreviousTransform)!
    expect(prev.x).toBe(10)
    expect(prev.y).toBe(20)
    expect(prev.z).toBe(30)
    expect(prev.qx).toBe(0.1)
    expect(prev.qy).toBe(0.2)
    expect(prev.qz).toBe(0.3)
    expect(prev.qw).toBe(0.9)
  })

  test('interpolateTransforms lerps position at alpha=0.5', () => {
    const entity = world.spawn(
      Transform({x: 10, y: 20, z: 30}),
      PreviousTransform({x: 0, y: 0, z: 0}),
      RenderTransform({x: 0, y: 0, z: 0}),
      PhysicsInitialized,
    )

    interpolateTransforms(world, 0.5)

    const render = entity.get(RenderTransform)!
    expect(render.x).toBe(5)
    expect(render.y).toBe(10)
    expect(render.z).toBe(15)
  })

  test('interpolateTransforms at alpha=0 returns previous', () => {
    const entity = world.spawn(
      Transform({x: 10, y: 20, z: 30}),
      PreviousTransform({x: 0, y: 0, z: 0}),
      RenderTransform,
      PhysicsInitialized,
    )

    interpolateTransforms(world, 0)

    const render = entity.get(RenderTransform)!
    expect(render.x).toBe(0)
    expect(render.y).toBe(0)
    expect(render.z).toBe(0)
  })

  test('interpolateTransforms at alpha=1 returns current', () => {
    const entity = world.spawn(
      Transform({x: 10, y: 20, z: 30}),
      PreviousTransform({x: 0, y: 0, z: 0}),
      RenderTransform,
      PhysicsInitialized,
    )

    interpolateTransforms(world, 1)

    const render = entity.get(RenderTransform)!
    expect(render.x).toBe(10)
    expect(render.y).toBe(20)
    expect(render.z).toBe(30)
  })

  test('syncTransformFromPhysics updates transform from body', () => {
    const entity = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 0, z: 0}),
      RigidBodyConfig,
    )

    createPhysicsBodies(world, rapierWorld)

    // Move the body manually
    const body = entity.get(RigidBodyRef)!.body!
    body.setTranslation({x: 5, y: 10, z: 15}, true)

    syncTransformFromPhysics(world)

    const t = entity.get(Transform)!
    expect(t.x).toBe(5)
    expect(t.y).toBe(10)
    expect(t.z).toBe(15)
  })

  test('physics simulation moves dynamic body', () => {
    const entity = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 10, z: 0}),
      PreviousTransform,
      RenderTransform,
      RigidBodyConfig,
    )

    // Create body and collider
    createPhysicsBodies(world, rapierWorld)

    const rbEntity = entity
    const colliderEntity = world.spawn(
      IsColliderEntity,
      ChildOf(rbEntity),
      ColliderConfig,
    )
    colliderEntity.set(ColliderConfig, (c) => {
      c.shape = {type: 'ball', radius: 0.5}
      return c
    })
    createColliders(world, rapierWorld)

    // Store initial position
    const initialY = entity.get(Transform)!.y

    // Step physics multiple times
    for (let i = 0; i < 60; i++) {
      rapierWorld.step()
    }

    syncTransformFromPhysics(world)

    // Body should have fallen due to gravity
    const finalY = entity.get(Transform)!.y
    expect(finalY).toBeLessThan(initialY)
  })
})

describe('Parent-Child Relations', () => {
  let world: World

  beforeEach(() => {
    world = createWorld()
  })

  afterEach(() => {
    world.destroy()
  })

  test('destroying parent destroys child colliders', () => {
    const rbEntity = world.spawn(IsPhysicsEntity)
    const colliderEntity = world.spawn(IsColliderEntity, ChildOf(rbEntity))

    expect(colliderEntity.isAlive()).toBe(true)

    rbEntity.destroy()

    expect(colliderEntity.isAlive()).toBe(false)
  })
})

describe('Rotation Interpolation', () => {
  let world: World

  beforeEach(() => {
    world = createWorld()
  })

  afterEach(() => {
    world.destroy()
  })

  test('interpolateTransforms slerps rotation at alpha=0.5', () => {
    // Identity quaternion to 90 degree Y rotation
    const entity = world.spawn(
      Transform({x: 0, y: 0, z: 0, qx: 0, qy: 0.7071, qz: 0, qw: 0.7071}),
      PreviousTransform({x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1}),
      RenderTransform,
      PhysicsInitialized,
    )

    interpolateTransforms(world, 0.5)

    const render = entity.get(RenderTransform)!
    // At t=0.5 between identity and 90deg Y, we get ~45deg Y
    expect(render.qx).toBeCloseTo(0, 4)
    expect(render.qy).toBeCloseTo(0.3827, 3)
    expect(render.qz).toBeCloseTo(0, 4)
    expect(render.qw).toBeCloseTo(0.9239, 3)
  })

  test('interpolateTransforms preserves rotation at alpha=0', () => {
    const entity = world.spawn(
      Transform({qx: 0.5, qy: 0.5, qz: 0.5, qw: 0.5}),
      PreviousTransform({qx: 0, qy: 0, qz: 0, qw: 1}),
      RenderTransform,
      PhysicsInitialized,
    )

    interpolateTransforms(world, 0)

    const render = entity.get(RenderTransform)!
    expect(render.qx).toBeCloseTo(0, 4)
    expect(render.qy).toBeCloseTo(0, 4)
    expect(render.qz).toBeCloseTo(0, 4)
    expect(render.qw).toBeCloseTo(1, 4)
  })
})

describe('Kinematic Bodies', () => {
  let world: World
  let rapierWorld: RAPIER.World

  beforeEach(() => {
    world = createWorld()
    rapierWorld = new RAPIER.World({x: 0, y: -9.81, z: 0})
  })

  afterEach(() => {
    rapierWorld.free()
    world.destroy()
  })

  test('kinematic-position-based body can be moved', () => {
    const entity = world.spawn(IsPhysicsEntity, Transform, RigidBodyConfig)
    entity.set(RigidBodyConfig, (c) => {
      c.type = 'kinematic-position-based'
      return c
    })

    createPhysicsBodies(world, rapierWorld)

    const body = entity.get(RigidBodyRef)!.body!
    expect(body.isKinematic()).toBe(true)

    // Set next kinematic position
    body.setNextKinematicTranslation({x: 5, y: 10, z: 15})
    rapierWorld.step()

    const pos = body.translation()
    expect(pos.x).toBe(5)
    expect(pos.y).toBe(10)
    expect(pos.z).toBe(15)
  })

  test('kinematic body ignores gravity', () => {
    const entity = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 10, z: 0}),
      RigidBodyConfig,
    )
    entity.set(RigidBodyConfig, (c) => {
      c.type = 'kinematic-position-based'
      return c
    })

    createPhysicsBodies(world, rapierWorld)

    // Add collider
    const colliderEntity = world.spawn(
      IsColliderEntity,
      ChildOf(entity),
      ColliderConfig,
    )
    colliderEntity.set(ColliderConfig, (c) => {
      c.shape = {type: 'ball', radius: 0.5}
      return c
    })
    createColliders(world, rapierWorld)

    const initialY = entity.get(RigidBodyRef)!.body!.translation().y

    // Step physics
    for (let i = 0; i < 60; i++) {
      rapierWorld.step()
    }

    // Kinematic body should NOT have fallen
    const finalY = entity.get(RigidBodyRef)!.body!.translation().y
    expect(finalY).toBe(initialY)
  })
})

describe('Collider Offset', () => {
  let world: World
  let rapierWorld: RAPIER.World

  beforeEach(() => {
    world = createWorld()
    rapierWorld = new RAPIER.World({x: 0, y: -9.81, z: 0})
  })

  afterEach(() => {
    rapierWorld.free()
    world.destroy()
  })

  test('collider respects offset from rigid body', () => {
    const rbEntity = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 0, z: 0}),
      RigidBodyConfig,
    )
    createPhysicsBodies(world, rapierWorld)

    // Create collider with offset
    const colliderEntity = world.spawn(
      IsColliderEntity,
      ChildOf(rbEntity),
      ColliderConfig,
    )
    colliderEntity.set(ColliderConfig, (c) => {
      c.shape = {type: 'ball', radius: 0.5}
      c.offsetX = 2
      c.offsetY = 3
      c.offsetZ = 4
      return c
    })

    createColliders(world, rapierWorld)

    const collider = colliderEntity.get(ColliderRef)!.collider!
    const translation = collider.translation()

    // Collider world position = body position + offset
    expect(translation.x).toBe(2)
    expect(translation.y).toBe(3)
    expect(translation.z).toBe(4)
  })
})

describe('Collision Callbacks', () => {
  let world: World
  let rapierWorld: RAPIER.World

  beforeEach(() => {
    world = createWorld()
    rapierWorld = new RAPIER.World({x: 0, y: -9.81, z: 0})
  })

  afterEach(() => {
    rapierWorld.free()
    world.destroy()
  })

  test('collision callback receives other entity', () => {
    let collisionDetected = false
    let otherEntity: unknown = null

    // Create floor (fixed)
    const floor = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 0, z: 0}),
      RigidBodyConfig,
      CollisionCallbacks,
    )
    floor.set(RigidBodyConfig, (c) => {
      c.type = 'fixed'
      return c
    })
    floor.set(CollisionCallbacks, (c) => {
      c.onEnter = (event) => {
        collisionDetected = true
        otherEntity = event.other
      }
      return c
    })

    createPhysicsBodies(world, rapierWorld)

    // Add floor collider
    const floorCollider = world.spawn(
      IsColliderEntity,
      ChildOf(floor),
      ColliderConfig,
    )
    floorCollider.set(ColliderConfig, (c) => {
      c.shape = {type: 'cuboid', hx: 10, hy: 0.1, hz: 10}
      return c
    })

    // Create falling ball
    const ball = world.spawn(
      IsPhysicsEntity,
      Transform({x: 0, y: 1, z: 0}),
      RigidBodyConfig,
    )

    createPhysicsBodies(world, rapierWorld)

    const ballCollider = world.spawn(
      IsColliderEntity,
      ChildOf(ball),
      ColliderConfig,
    )
    ballCollider.set(ColliderConfig, (c) => {
      c.shape = {type: 'ball', radius: 0.5}
      return c
    })

    createColliders(world, rapierWorld)

    // Create event queue and step until collision
    const eventQueue = new RAPIER.EventQueue(true)
    for (let i = 0; i < 120; i++) {
      rapierWorld.step(eventQueue)

      // Process events manually (simulating processCollisionEvents)
      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        if (!started) return
        const c1 = rapierWorld.getCollider(handle1)
        const c2 = rapierWorld.getCollider(handle2)
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive check for edge cases
        if (!c1 || !c2) return
        const e1 = c1.parent()?.userData as typeof floor | undefined
        const e2 = c2.parent()?.userData as typeof ball | undefined

        if (e1 && e1.has(CollisionCallbacks)) {
          const cb = e1.get(CollisionCallbacks)!.onEnter
          if (cb && e2) cb({other: e2})
        }
        if (e2 && e2.has(CollisionCallbacks)) {
          const cb = e2.get(CollisionCallbacks)!.onEnter
          if (cb && e1) cb({other: e1})
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- set in callback
      if (collisionDetected) break
    }
    eventQueue.free()

    expect(collisionDetected).toBe(true)
    expect(otherEntity).toBe(ball)
  })
})
