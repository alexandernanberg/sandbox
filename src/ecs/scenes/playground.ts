/**
 * Playground scene - Pure ECS version
 *
 * This file shows how the playground scene would be defined
 * without React components - just ECS spawning.
 */

import type {World, Entity} from 'koota'
import {createActions} from 'koota'
import {
  spawnStaticBody,
  spawnRigidBody,
  spawnKinematicBody,
  spawnLight,
  prefab,
} from '../render'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  ColliderConfig,
  IsPhysicsEntity,
  IsColliderEntity,
  ChildOf,
  RigidBodyRef,
  KinematicVelocity,
  CharacterControllerConfig,
  CharacterMovement,
} from '../physics'
import {
  Geometry,
  MaterialComponent,
  MeshComponent,
  NeedsRenderSetup,
} from '../render/traits'
import {
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  FacingDirection,
} from '../player'
import {IsCameraTarget} from '../camera'

// ============================================
// Scene spawning actions
// ============================================

export const playgroundActions = createActions((world) => ({
  /**
   * Spawn the complete playground scene.
   */
  loadPlayground(): Entity[] {
    const entities: Entity[] = []

    // Lighting
    entities.push(
      spawnLight(world, {
        type: 'ambient',
        color: 0xffffff,
        intensity: 0.4,
      }),
    )
    entities.push(
      spawnLight(world, {
        type: 'directional',
        color: 0xffffff,
        intensity: 1,
        castShadow: true,
        position: [10, 20, 10],
      }),
    )

    // Floor
    entities.push(spawnFloor(world, 50))

    // Walls (invisible)
    entities.push(...spawnWalls(world, 50, 10))

    // Player
    entities.push(spawnPlayer(world, [0, 2, 0]))

    // Physics boxes
    entities.push(
      prefab.box(world, [1, 1, 1], {position: [0, 3, 12.5], color: 0xff0000}),
    )
    entities.push(
      prefab.box(world, [1, 1, 1], {position: [1, 3, 12.5], color: 0xff0000}),
    )
    entities.push(
      prefab.box(world, [1, 1, 1], {position: [2, 3, 12.5], color: 0xff0000}),
    )

    // Tower structure
    entities.push(...spawnTower(world, [-6, 0, 0]))

    // Elevator
    entities.push(spawnElevator(world, [-6, 0.5, 6]))

    // Spinning platforms
    entities.push(spawnSpinningPlatform(world, [-12, 0.5, 8], 1.5))
    entities.push(
      spawnSpinningPlatform(world, [-12, 0.5, -8], 0.8, [10, 0.25, 2], 0xd94a90),
    )

    // Trampoline
    entities.push(...spawnTrampoline(world, [12, 0, 8]))

    // Stairs
    entities.push(spawnStairs(world, [0, 0, -10], 8, 0.25, 0.4))
    entities.push(spawnStairs(world, [4, 0, -10], 8, 0.15, 0.5))

    // Ball
    entities.push(
      prefab.ball(world, 0.5, {position: [2, 4, 0], color: 0x00ff00}),
    )

    return entities
  },

  /**
   * Spawn N balls at random positions.
   */
  spawnBalls(count: number): Entity[] {
    const entities: Entity[] = []
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff]

    for (let i = 0; i < count; i++) {
      const x = Math.random() * 4 - 2
      const z = Math.random() * 4 - 2
      const color = colors[Math.floor(Math.random() * colors.length)]
      entities.push(
        prefab.ball(world, 0.5, {
          position: [x, 6, z],
          color,
          restitution: 1,
          friction: 0.9,
        }),
      )
    }
    return entities
  },
}))

// ============================================
// Complex entity spawners
// ============================================

function spawnFloor(world: World, size: number): Entity {
  return spawnStaticBody(world, {
    mesh: {
      geometry: {type: 'plane', width: size, height: size},
      material: {type: 'standard', color: 0xcccccc},
    },
    collider: {
      shape: {type: 'cuboid', hx: size / 2, hy: 0.01, hz: size / 2},
    },
    transform: {
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
  })
}

function spawnWalls(world: World, area: number, height: number): Entity[] {
  const thickness = 1
  const pos = area / 2 + thickness / 2
  const y = height / 2

  return [
    prefab.wall(world, [thickness, height, area], [pos, y, 0]),
    prefab.wall(world, [thickness, height, area], [-pos, y, 0]),
    prefab.wall(world, [area, height, thickness], [0, y, pos]),
    prefab.wall(world, [area, height, thickness], [0, y, -pos]),
  ]
}

function spawnPlayer(world: World, position: [number, number, number]): Entity {
  const height = 1.75
  const radius = 0.5
  const halfHeight = height / 2 - radius

  // Create character controller entity
  const entity = world.spawn(
    IsPhysicsEntity,
    IsPlayer,
    NeedsRenderSetup,
    Transform({x: position[0], y: position[1], z: position[2]}),
    PreviousTransform({x: position[0], y: position[1], z: position[2]}),
    RenderTransform({x: position[0], y: position[1], z: position[2]}),
    CharacterControllerConfig({
      capsuleRadius: radius,
      capsuleHalfHeight: halfHeight,
    }),
    CharacterMovement,
    PlayerMovementConfig,
    PlayerVelocity,
    FacingDirection,
    IsCameraTarget,
    Geometry({
      descriptor: {type: 'capsule', radius, length: height, capSegments: 4, radialSegments: 8},
    }),
    MaterialComponent({type: 'phong', color: 0xf0f0f0}),
    MeshComponent({castShadow: true, receiveShadow: true}),
  )

  // Create capsule collider as child
  world.spawn(
    IsColliderEntity,
    ChildOf(entity),
    ColliderConfig({
      shape: {type: 'capsule', radius, halfHeight},
    }),
  )

  return entity
}

function spawnElevator(world: World, position: [number, number, number]): Entity {
  const entity = spawnKinematicBody(world, {
    mesh: {
      geometry: {type: 'box', width: 2, height: 0.5, depth: 2},
      material: {type: 'standard', color: 0xed7200},
    },
    collider: {
      shape: {type: 'cuboid', hx: 1, hy: 0.25, hz: 1},
    },
    transform: {position},
    positionBased: true,
  })

  // Add kinematic velocity trait for character momentum
  entity.add(KinematicVelocity)

  // Store state for animation (would be done via ECS trait in full impl)
  ;(entity as Entity & {_elevatorTime?: number})._elevatorTime = 0

  return entity
}

function spawnSpinningPlatform(
  world: World,
  position: [number, number, number],
  speed: number,
  size: [number, number, number] = [4, 0.25, 4],
  color: number = 0x4a90d9,
): Entity {
  const entity = spawnKinematicBody(world, {
    mesh: {
      geometry: {type: 'box', width: size[0], height: size[1], depth: size[2]},
      material: {type: 'standard', color},
    },
    collider: {
      shape: {type: 'cuboid', hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2},
    },
    transform: {position},
    positionBased: true,
  })

  entity.add(KinematicVelocity)
  // Would store spin speed in a custom trait
  ;(entity as Entity & {_spinSpeed?: number})._spinSpeed = speed
  ;(entity as Entity & {_spinAngle?: number})._spinAngle = 0

  return entity
}

function spawnTrampoline(
  world: World,
  position: [number, number, number],
): Entity[] {
  // Frame
  const frame = spawnStaticBody(world, {
    mesh: {
      geometry: {type: 'box', width: 3, height: 0.2, depth: 3},
      material: {type: 'standard', color: 0x333333},
    },
    collider: {
      shape: {type: 'cuboid', hx: 1.5, hy: 0.1, hz: 1.5},
    },
    transform: {position: [position[0], position[1] - 0.1, position[2]]},
  })

  // Bouncy surface
  const surface = spawnStaticBody(world, {
    mesh: {
      geometry: {type: 'box', width: 2.5, height: 0.1, depth: 2.5},
      material: {type: 'standard', color: 0xff4444},
    },
    collider: {
      shape: {type: 'cuboid', hx: 1.25, hy: 0.05, hz: 1.25},
      restitution: 2,
      friction: 0.8,
    },
    transform: {position: [position[0], position[1] + 0.1, position[2]]},
  })

  return [frame, surface]
}

function spawnStairs(
  world: World,
  position: [number, number, number],
  stepCount: number,
  stepHeight: number,
  stepDepth: number,
): Entity {
  const stepWidth = 3

  // Single rigid body for all stairs
  const stairsEntity = world.spawn(
    IsPhysicsEntity,
    Transform({x: position[0], y: position[1], z: position[2]}),
    PreviousTransform({x: position[0], y: position[1], z: position[2]}),
    RenderTransform({x: position[0], y: position[1], z: position[2]}),
    RigidBodyConfig({type: 'fixed'}),
  )

  // Create collider for each step
  for (let i = 0; i < stepCount; i++) {
    const y = stepHeight / 2 + i * stepHeight
    const z = -i * stepDepth

    world.spawn(
      IsColliderEntity,
      ChildOf(stairsEntity),
      NeedsRenderSetup,
      ColliderConfig({
        shape: {
          type: 'cuboid',
          hx: stepWidth / 2,
          hy: stepHeight / 2,
          hz: stepDepth / 2,
        },
        offsetX: 0,
        offsetY: y,
        offsetZ: z,
      }),
      Geometry({
        descriptor: {type: 'box', width: stepWidth, height: stepHeight, depth: stepDepth},
      }),
      MaterialComponent({type: 'standard', color: 0x808080}),
      MeshComponent({castShadow: true, receiveShadow: true}),
    )
  }

  return stairsEntity
}

function spawnTower(world: World, position: [number, number, number]): Entity[] {
  const entities: Entity[] = []

  // Tower pillars
  const pillarPositions: [number, number, number][] = [
    [0.5, 3.5, 0.5],
    [0.5, 3.5, -2.5],
    [-2.5, 3.5, 0.5],
    [-2.5, 3.5, -2.5],
  ]

  // Single fixed body for the whole tower
  const towerEntity = world.spawn(
    IsPhysicsEntity,
    Transform({x: position[0], y: position[1], z: position[2]}),
    PreviousTransform({x: position[0], y: position[1], z: position[2]}),
    RenderTransform({x: position[0], y: position[1], z: position[2]}),
    RigidBodyConfig({type: 'fixed'}),
  )
  entities.push(towerEntity)

  // Add pillar colliders
  for (const [px, py, pz] of pillarPositions) {
    world.spawn(
      IsColliderEntity,
      ChildOf(towerEntity),
      NeedsRenderSetup,
      ColliderConfig({
        shape: {type: 'cuboid', hx: 0.5, hy: 3.5, hz: 0.5},
        offsetX: px,
        offsetY: py,
        offsetZ: pz,
      }),
      Geometry({descriptor: {type: 'box', width: 1, height: 7, depth: 1}}),
      MaterialComponent({type: 'phong', color: 0x9f9f9f}),
      MeshComponent({castShadow: true, receiveShadow: true}),
    )
  }

  // Platform boxes
  const platforms: Array<{
    size: [number, number, number]
    pos: [number, number, number]
  }> = [
    {size: [2, 0.5, 2], pos: [-4, 1.75, 2]},
    {size: [2, 0.5, 2], pos: [-4, 3.75, -4]},
    {size: [2, 0.5, 2], pos: [2, 5.75, -4]},
    {size: [2, 0.5, 4], pos: [2, 7.75, 3]},
    {size: [6, 1, 8], pos: [-2, 7.5, 1]},
  ]

  for (const {size, pos} of platforms) {
    world.spawn(
      IsColliderEntity,
      ChildOf(towerEntity),
      NeedsRenderSetup,
      ColliderConfig({
        shape: {type: 'cuboid', hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2},
        offsetX: pos[0],
        offsetY: pos[1],
        offsetZ: pos[2],
      }),
      Geometry({descriptor: {type: 'box', width: size[0], height: size[1], depth: size[2]}}),
      MaterialComponent({type: 'phong', color: 0xfffff0}),
      MeshComponent({castShadow: true, receiveShadow: true}),
    )
  }

  // Note: Ramps would need a custom geometry or convex hull collider
  // For now, skipping the ramps - would add as separate entities

  return entities
}

// ============================================
// Kinematic animation systems
// ============================================

/**
 * Update elevator position - would be called from physics loop.
 */
export function updateElevator(entity: Entity, physicsTime: number): void {
  const bodyRef = entity.get(RigidBodyRef)
  if (!bodyRef?.body) return

  const newY = clamp(3.875 + Math.sin(physicsTime) * 5, 0.25, 7.75)
  const pos = bodyRef.body.translation()

  // Calculate velocity for character momentum
  const prevY = pos.y
  entity.set(KinematicVelocity, (v) => {
    v.y = newY - prevY
    return v
  })

  pos.y = newY
  bodyRef.body.setNextKinematicTranslation(pos)
}

/**
 * Update spinning platform rotation.
 */
export function updateSpinningPlatform(
  entity: Entity & {_spinSpeed?: number; _spinAngle?: number},
  delta: number,
): void {
  const bodyRef = entity.get(RigidBodyRef)
  if (!bodyRef?.body) return

  const speed = entity._spinSpeed ?? 1
  const angularVelocity = speed * delta
  entity._spinAngle = (entity._spinAngle ?? 0) + angularVelocity

  // Set angular velocity for character momentum
  entity.set(KinematicVelocity, (v) => {
    v.ay = angularVelocity
    return v
  })

  const halfAngle = entity._spinAngle / 2
  const pos = bodyRef.body.translation()

  bodyRef.body.setNextKinematicRotation({
    x: 0,
    y: Math.sin(halfAngle),
    z: 0,
    w: Math.cos(halfAngle),
  })
  bodyRef.body.setNextKinematicTranslation(pos)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
