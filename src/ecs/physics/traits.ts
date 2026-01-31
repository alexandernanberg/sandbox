import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
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

// ============================================
// Collision Group Helpers
// ============================================

/**
 * Creates a collision groups bitmask from membership and filter groups.
 *
 * Collision groups are a 32-bit value where:
 * - Lower 16 bits: membership groups (what groups this collider belongs to)
 * - Upper 16 bits: filter groups (what groups this collider collides with)
 *
 * Two colliders A and B collide if:
 * - A's membership has at least one bit in common with B's filter, AND
 * - B's membership has at least one bit in common with A's filter
 *
 * @example
 * ```ts
 * // Player (group 0) collides with environment (group 1) and enemies (group 2)
 * const PLAYER = 1 << 0
 * const ENVIRONMENT = 1 << 1
 * const ENEMY = 1 << 2
 *
 * // Player: belongs to PLAYER, collides with ENVIRONMENT and ENEMY
 * const playerGroups = createCollisionGroups(PLAYER, ENVIRONMENT | ENEMY)
 *
 * // Enemy: belongs to ENEMY, collides with PLAYER and ENVIRONMENT
 * const enemyGroups = createCollisionGroups(ENEMY, PLAYER | ENVIRONMENT)
 * ```
 */
export function createCollisionGroups(membership: number, filter: number): number {
  return ((filter & 0xffff) << 16) | (membership & 0xffff)
}

/**
 * Common collision group presets.
 * Combine with bitwise OR for custom setups.
 */
export const CollisionGroup = {
  /** Default group - all colliders belong here by default */
  DEFAULT: 1 << 0,
  /** Player character */
  PLAYER: 1 << 1,
  /** Enemy characters */
  ENEMY: 1 << 2,
  /** Static environment (floors, walls) */
  ENVIRONMENT: 1 << 3,
  /** Projectiles */
  PROJECTILE: 1 << 4,
  /** Pickups and collectibles */
  PICKUP: 1 << 5,
  /** Triggers and sensors */
  TRIGGER: 1 << 6,
  /** All groups */
  ALL: 0xffff,
} as const

// Use factory function pattern to get proper type inference
export const RigidBodyConfig = trait(() => ({
  type: 'dynamic' as RigidBodyType,
  gravityScale: 1,
  linearDamping: 0,
  angularDamping: 0,
  ccd: false,
  /**
   * Soft CCD prediction threshold (in seconds).
   * When > 0, enables "soft" CCD that predicts tunneling within this time window.
   * Unlike binary CCD, this avoids false positives for slow-moving objects.
   * Recommended: 1/60 (one physics frame) for character controllers.
   * Set to 0 to disable soft CCD (uses binary CCD if `ccd: true`).
   */
  softCcdPrediction: 0,
  canSleep: true,
  dominanceGroup: 0,
  lockPosition: false,
  lockRotation: false,
  restrictPosition: null as [boolean, boolean, boolean] | null,
  restrictRotation: null as [boolean, boolean, boolean] | null,
  /**
   * Additional solver iterations for this body only.
   * Useful for high-precision constraints/joints on specific bodies.
   * 0 uses the global solver iterations setting.
   */
  additionalSolverIterations: 0,
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

/**
 * Combine rule for friction/restitution between two colliders.
 * - 'average': (a + b) / 2 (default)
 * - 'min': Math.min(a, b)
 * - 'max': Math.max(a, b)
 * - 'multiply': a * b
 */
export type CoefficientCombineRule = 'average' | 'min' | 'max' | 'multiply'

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
  // Collision groups: 32-bit bitmask with membership (lower 16 bits) and filter (upper 16 bits)
  // Use createCollisionGroups() helper to construct this value.
  // Default: all groups, collides with all groups
  collisionGroups: 0xffff_ffff,
  // Solver groups: same format as collisionGroups but for contact force computation
  // Default: all groups
  solverGroups: 0xffff_ffff,
  // Combine rules for friction/restitution
  frictionCombineRule: 'average' as CoefficientCombineRule,
  restitutionCombineRule: 'average' as CoefficientCombineRule,
  // Enable contact force events (for onContactForce callbacks)
  contactForceEvents: false,
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
