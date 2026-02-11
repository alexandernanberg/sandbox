import type * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {trait, relation} from 'koota'
import type {Entity} from 'koota'
import type {Object3D} from 'three'

// ============================================
// Collision callback type
// ============================================

export interface CollisionEvent {
  other: Entity
}

export type CollisionCallback = (event: CollisionEvent) => void

// ============================================
// Kinematic body velocity (for moving platforms)
// ============================================

/** Velocity of kinematic bodies - set manually when moving platforms */
export const KinematicVelocity = trait({
  // Linear velocity (per physics step)
  x: 0,
  y: 0,
  z: 0,
  // Angular velocity (radians per physics step, around each axis)
  ax: 0,
  ay: 0,
  az: 0,
})

// ============================================
// Transform traits (for interpolation)
// ============================================

// Current physics state (synced from Rapier after step)
export const Transform = trait({
  x: 0,
  y: 0,
  z: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
})

// Previous frame state (for lerp/slerp)
export const PreviousTransform = trait({
  x: 0,
  y: 0,
  z: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
})

// Interpolated state (for rendering)
export const RenderTransform = trait({
  x: 0,
  y: 0,
  z: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
})

// ============================================
// Physics configuration traits (serializable)
// ============================================

export type RigidBodyType =
  | 'dynamic'
  | 'fixed'
  | 'kinematic-velocity-based'
  | 'kinematic-position-based'

// Use factory function pattern to get proper type inference
export const RigidBodyConfig = trait(() => ({
  type: 'dynamic' as RigidBodyType,
  gravityScale: 1,
  linearDamping: 0,
  angularDamping: 0,
  ccd: false,
  canSleep: true,
  dominanceGroup: 0,
  lockPosition: false,
  lockRotation: false,
  restrictPosition: null as [boolean, boolean, boolean] | null,
  restrictRotation: null as [boolean, boolean, boolean] | null,
  // Initial velocities (applied on body creation)
  linearVelocityX: 0,
  linearVelocityY: 0,
  linearVelocityZ: 0,
  angularVelocityX: 0,
  angularVelocityY: 0,
  angularVelocityZ: 0,
}))

export type ColliderShape =
  | {type: 'ball'; radius: number}
  | {type: 'cuboid'; hx: number; hy: number; hz: number}
  | {type: 'capsule'; halfHeight: number; radius: number}
  | {type: 'cylinder'; halfHeight: number; radius: number}
  | {type: 'cone'; halfHeight: number; radius: number}
  | {type: 'convexHull'; points: Float32Array}
  | {type: 'trimesh'; vertices: Float32Array; indices: Uint32Array}
  | {
      type: 'heightfield'
      nrows: number
      ncols: number
      heights: Float32Array
      scale: RAPIER.Vector
    }

// Use factory function pattern to get proper type inference
export const ColliderConfig = trait(() => ({
  shape: null as ColliderShape | null,
  friction: 0.5,
  restitution: 0,
  density: 1,
  sensor: false,
  // Offset from rigid body
  offsetX: 0,
  offsetY: 0,
  offsetZ: 0,
  offsetQx: 0,
  offsetQy: 0,
  offsetQz: 0,
  offsetQw: 1,
  // World scale (computed from Object3D on mount)
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
}))

// ============================================
// Runtime handles (non-serializable)
// ============================================

// Holds reference to Rapier rigid body
export const RigidBodyRef = trait(() => ({
  handle: null as number | null,
  body: null as RAPIER.RigidBody | null,
}))

// Holds reference to Rapier collider
export const ColliderRef = trait(() => ({
  handle: null as number | null,
  collider: null as RAPIER.Collider | null,
}))

// ============================================
// Rendering bridge
// ============================================

// Links ECS entity to Three.js Object3D for rendering
export const Object3DRef = trait(() => ({
  object: null as Object3D | null,
}))

// Stores parent's inverse world matrix for nested rigid bodies
// Used to convert physics world coords back to local coords for rendering
export const ParentInverseMatrix = trait(() => ({
  elements: null as Float32Array | null,
}))

// ============================================
// Relations
// ============================================

// Links a collider entity to its parent rigid body entity
// When the parent is destroyed, child colliders are automatically destroyed
export const ChildOf = relation({autoDestroy: 'orphan'})

// ============================================
// Tag traits
// ============================================

// Marks an entity as having physics
export const IsPhysicsEntity = trait()

// Marks an entity as a collider entity
export const IsColliderEntity = trait()

// Marks an entity as initialized (body created)
export const PhysicsInitialized = trait()

// Marks a collider as initialized
export const ColliderInitialized = trait()

// ============================================
// Collision callbacks
// ============================================

// Stores collision callbacks for an entity
export const CollisionCallbacks = trait(() => ({
  onEnter: null as CollisionCallback | null,
  onExit: null as CollisionCallback | null,
}))
