import type {World, Entity} from 'koota'
import {
  Geometry,
  MaterialComponent,
  MeshComponent,
  LocalTransform,
  LightComponent,
  NeedsRenderSetup,
  type GeometryDescriptor,
  type MaterialType,
  type LightType,
} from './traits'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  ColliderConfig,
  IsPhysicsEntity,
  IsColliderEntity,
  ChildOf,
  type RigidBodyType,
  type ColliderShape,
} from '../physics/traits'

// ============================================
// Spawn options types
// ============================================

export interface TransformOptions {
  position?: [number, number, number]
  rotation?: [number, number, number] // Euler angles
  scale?: [number, number, number]
}

export interface PhysicsBodyOptions {
  type?: RigidBodyType
  gravityScale?: number
  linearDamping?: number
  angularDamping?: number
  ccd?: boolean
  linearVelocity?: [number, number, number]
  angularVelocity?: [number, number, number]
  restrictPosition?: [boolean, boolean, boolean]
  restrictRotation?: [boolean, boolean, boolean]
}

export interface ColliderOptions {
  shape: ColliderShape
  friction?: number
  restitution?: number
  density?: number
  sensor?: boolean
  offset?: [number, number, number]
}

export interface MeshOptions {
  geometry: GeometryDescriptor
  material?: {
    type?: MaterialType
    color?: number | string
    emissive?: number | string
    roughness?: number
    metalness?: number
  }
  castShadow?: boolean
  receiveShadow?: boolean
}

// ============================================
// Low-level spawn functions
// ============================================

/**
 * Spawn a renderable mesh entity (no physics).
 */
export function spawnMesh(
  world: World,
  mesh: MeshOptions,
  transform?: TransformOptions,
): Entity {
  const pos = transform?.position ?? [0, 0, 0]
  const rot = transform?.rotation ?? [0, 0, 0]
  const scale = transform?.scale ?? [1, 1, 1]

  return world.spawn(
    NeedsRenderSetup,
    Geometry({descriptor: mesh.geometry}),
    MaterialComponent({
      type: mesh.material?.type ?? 'phong',
      color: mesh.material?.color ?? 0xffffff,
      emissive: mesh.material?.emissive ?? 0x000000,
      roughness: mesh.material?.roughness ?? 0.5,
      metalness: mesh.material?.metalness ?? 0,
    }),
    MeshComponent({
      castShadow: mesh.castShadow ?? true,
      receiveShadow: mesh.receiveShadow ?? true,
    }),
    LocalTransform({
      x: pos[0],
      y: pos[1],
      z: pos[2],
      rx: rot[0],
      ry: rot[1],
      rz: rot[2],
      sx: scale[0],
      sy: scale[1],
      sz: scale[2],
    }),
  )
}

/**
 * Spawn a physics rigid body entity with mesh.
 */
export function spawnRigidBody(
  world: World,
  options: {
    mesh: MeshOptions
    body?: PhysicsBodyOptions
    collider: ColliderOptions
    transform?: TransformOptions
  },
): Entity {
  const pos = options.transform?.position ?? [0, 0, 0]
  const scale = options.transform?.scale ?? [1, 1, 1]

  // Create rigid body entity
  const bodyEntity = world.spawn(
    IsPhysicsEntity,
    NeedsRenderSetup,
    Transform({x: pos[0], y: pos[1], z: pos[2]}),
    PreviousTransform({x: pos[0], y: pos[1], z: pos[2]}),
    RenderTransform({x: pos[0], y: pos[1], z: pos[2]}),
    RigidBodyConfig({
      type: options.body?.type ?? 'dynamic',
      gravityScale: options.body?.gravityScale ?? 1,
      linearDamping: options.body?.linearDamping ?? 0,
      angularDamping: options.body?.angularDamping ?? 0,
      ccd: options.body?.ccd ?? false,
      linearVelocityX: options.body?.linearVelocity?.[0] ?? 0,
      linearVelocityY: options.body?.linearVelocity?.[1] ?? 0,
      linearVelocityZ: options.body?.linearVelocity?.[2] ?? 0,
      angularVelocityX: options.body?.angularVelocity?.[0] ?? 0,
      angularVelocityY: options.body?.angularVelocity?.[1] ?? 0,
      angularVelocityZ: options.body?.angularVelocity?.[2] ?? 0,
      restrictPosition: options.body?.restrictPosition ?? null,
      restrictRotation: options.body?.restrictRotation ?? null,
    }),
    Geometry({descriptor: options.mesh.geometry}),
    MaterialComponent({
      type: options.mesh.material?.type ?? 'phong',
      color: options.mesh.material?.color ?? 0xffffff,
      emissive: options.mesh.material?.emissive ?? 0x000000,
      roughness: options.mesh.material?.roughness ?? 0.5,
      metalness: options.mesh.material?.metalness ?? 0,
    }),
    MeshComponent({
      castShadow: options.mesh.castShadow ?? true,
      receiveShadow: options.mesh.receiveShadow ?? true,
    }),
  )

  // Create collider as child entity
  const offset = options.collider.offset ?? [0, 0, 0]
  world.spawn(
    IsColliderEntity,
    ChildOf(bodyEntity),
    ColliderConfig({
      shape: options.collider.shape,
      friction: options.collider.friction ?? 0.5,
      restitution: options.collider.restitution ?? 0,
      density: options.collider.density ?? 1,
      sensor: options.collider.sensor ?? false,
      offsetX: offset[0],
      offsetY: offset[1],
      offsetZ: offset[2],
      scaleX: scale[0],
      scaleY: scale[1],
      scaleZ: scale[2],
    }),
  )

  return bodyEntity
}

/**
 * Spawn a fixed (static) physics body.
 */
export function spawnStaticBody(
  world: World,
  options: {
    mesh?: MeshOptions
    collider: ColliderOptions
    transform?: TransformOptions
  },
): Entity {
  const pos = options.transform?.position ?? [0, 0, 0]
  const scale = options.transform?.scale ?? [1, 1, 1]

  // Build traits array
  const traits: Parameters<World['spawn']> = [
    IsPhysicsEntity,
    Transform({x: pos[0], y: pos[1], z: pos[2]}),
    PreviousTransform({x: pos[0], y: pos[1], z: pos[2]}),
    RenderTransform({x: pos[0], y: pos[1], z: pos[2]}),
    RigidBodyConfig({type: 'fixed'}),
  ]

  // Add mesh traits if provided
  if (options.mesh) {
    traits.push(
      NeedsRenderSetup,
      Geometry({descriptor: options.mesh.geometry}),
      MaterialComponent({
        type: options.mesh.material?.type ?? 'phong',
        color: options.mesh.material?.color ?? 0xffffff,
      }),
      MeshComponent({
        castShadow: options.mesh.castShadow ?? true,
        receiveShadow: options.mesh.receiveShadow ?? true,
      }),
    )
  }

  const bodyEntity = world.spawn(...traits)

  // Create collider
  const offset = options.collider.offset ?? [0, 0, 0]
  world.spawn(
    IsColliderEntity,
    ChildOf(bodyEntity),
    ColliderConfig({
      shape: options.collider.shape,
      friction: options.collider.friction ?? 0.5,
      restitution: options.collider.restitution ?? 0,
      density: options.collider.density ?? 1,
      sensor: options.collider.sensor ?? false,
      offsetX: offset[0],
      offsetY: offset[1],
      offsetZ: offset[2],
      scaleX: scale[0],
      scaleY: scale[1],
      scaleZ: scale[2],
    }),
  )

  return bodyEntity
}

/**
 * Spawn a kinematic body (moved by code, not physics).
 */
export function spawnKinematicBody(
  world: World,
  options: {
    mesh?: MeshOptions
    collider: ColliderOptions
    transform?: TransformOptions
    positionBased?: boolean
  },
): Entity {
  const pos = options.transform?.position ?? [0, 0, 0]
  const scale = options.transform?.scale ?? [1, 1, 1]

  const traits: Parameters<World['spawn']> = [
    IsPhysicsEntity,
    Transform({x: pos[0], y: pos[1], z: pos[2]}),
    PreviousTransform({x: pos[0], y: pos[1], z: pos[2]}),
    RenderTransform({x: pos[0], y: pos[1], z: pos[2]}),
    RigidBodyConfig({
      type: options.positionBased
        ? 'kinematic-position-based'
        : 'kinematic-velocity-based',
    }),
  ]

  if (options.mesh) {
    traits.push(
      NeedsRenderSetup,
      Geometry({descriptor: options.mesh.geometry}),
      MaterialComponent({
        type: options.mesh.material?.type ?? 'standard',
        color: options.mesh.material?.color ?? 0xffffff,
      }),
      MeshComponent({
        castShadow: options.mesh.castShadow ?? true,
        receiveShadow: options.mesh.receiveShadow ?? true,
      }),
    )
  }

  const bodyEntity = world.spawn(...traits)

  const offset = options.collider.offset ?? [0, 0, 0]
  world.spawn(
    IsColliderEntity,
    ChildOf(bodyEntity),
    ColliderConfig({
      shape: options.collider.shape,
      friction: options.collider.friction ?? 0.5,
      restitution: options.collider.restitution ?? 0,
      offsetX: offset[0],
      offsetY: offset[1],
      offsetZ: offset[2],
      scaleX: scale[0],
      scaleY: scale[1],
      scaleZ: scale[2],
    }),
  )

  return bodyEntity
}

/**
 * Spawn a light entity.
 */
export function spawnLight(
  world: World,
  options: {
    type: LightType
    color?: number
    intensity?: number
    castShadow?: boolean
    position?: [number, number, number]
  },
): Entity {
  const pos = options.position ?? [0, 0, 0]

  return world.spawn(
    NeedsRenderSetup,
    LightComponent({
      type: options.type,
      color: options.color ?? 0xffffff,
      intensity: options.intensity ?? 1,
      castShadow: options.castShadow ?? false,
    }),
    LocalTransform({x: pos[0], y: pos[1], z: pos[2]}),
  )
}

// ============================================
// Prefab helpers (common game objects)
// ============================================

export const prefab = {
  /**
   * Spawn a simple box with physics.
   */
  box(
    world: World,
    size: [number, number, number],
    options?: {
      position?: [number, number, number]
      color?: number
      bodyType?: RigidBodyType
      restitution?: number
      friction?: number
    },
  ): Entity {
    return spawnRigidBody(world, {
      mesh: {
        geometry: {type: 'box', width: size[0], height: size[1], depth: size[2]},
        material: {color: options?.color ?? 0xff0000},
      },
      body: {type: options?.bodyType ?? 'dynamic'},
      collider: {
        shape: {type: 'cuboid', hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2},
        restitution: options?.restitution ?? 0,
        friction: options?.friction ?? 0.5,
      },
      transform: {position: options?.position ?? [0, 0, 0]},
    })
  },

  /**
   * Spawn a ball with physics.
   */
  ball(
    world: World,
    radius: number,
    options?: {
      position?: [number, number, number]
      color?: number
      restitution?: number
      friction?: number
    },
  ): Entity {
    return spawnRigidBody(world, {
      mesh: {
        geometry: {type: 'sphere', radius},
        material: {color: options?.color ?? 0x00ff00},
      },
      body: {type: 'dynamic'},
      collider: {
        shape: {type: 'ball', radius},
        restitution: options?.restitution ?? 0.5,
        friction: options?.friction ?? 0.5,
      },
      transform: {position: options?.position ?? [0, 0, 0]},
    })
  },

  /**
   * Spawn a static floor.
   */
  floor(
    world: World,
    size: number,
    options?: {
      position?: [number, number, number]
      color?: number
    },
  ): Entity {
    return spawnStaticBody(world, {
      mesh: {
        geometry: {type: 'plane', width: size, height: size},
        material: {type: 'standard', color: options?.color ?? 0x808080},
      },
      collider: {
        shape: {type: 'cuboid', hx: size / 2, hy: 0.01, hz: size / 2},
      },
      transform: {
        position: options?.position ?? [0, 0, 0],
        rotation: [-Math.PI / 2, 0, 0], // Face up
      },
    })
  },

  /**
   * Spawn an invisible wall.
   */
  wall(
    world: World,
    size: [number, number, number],
    position: [number, number, number],
  ): Entity {
    return spawnStaticBody(world, {
      collider: {
        shape: {type: 'cuboid', hx: size[0] / 2, hy: size[1] / 2, hz: size[2] / 2},
      },
      transform: {position},
    })
  },
}
