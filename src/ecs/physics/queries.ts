import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {getRapierWorld} from './world'

// ============================================
// Public Raycast & Shape Query Utilities
// ============================================

// Re-export QueryFilterFlags for user convenience
export const QueryFilterFlags = RAPIER.QueryFilterFlags

// Cached Ray object to avoid allocations
const _rayOrigin = {x: 0, y: 0, z: 0}
const _rayDir = {x: 0, y: 0, z: 0}
let _cachedRay: RAPIER.Ray | null = null

export interface RaycastHit {
  /** Distance from ray origin to hit point (time of impact) */
  distance: number
  /** The collider that was hit */
  collider: RAPIER.Collider
  /** Hit point in world space */
  point: {x: number; y: number; z: number}
  /** Surface normal at hit point (only if castRayAndGetNormal was used) */
  normal?: {x: number; y: number; z: number}
}

export interface RaycastOptions {
  /** Maximum ray distance (default: Infinity) */
  maxDistance?: number
  /**
   * If true, the ray will hit the inside of shapes when starting inside them.
   * If false, the ray will pass through and hit the exit point. (default: true)
   */
  solid?: boolean
  /** Filter flags to exclude certain body types (e.g., QueryFilterFlags.EXCLUDE_DYNAMIC) */
  filterFlags?: number
  /** Collision groups filter */
  filterGroups?: number
  /** Specific collider to exclude */
  excludeCollider?: RAPIER.Collider
  /** Specific rigid body to exclude (and all its colliders) */
  excludeRigidBody?: RAPIER.RigidBody
  /** Custom filter predicate */
  filterPredicate?: (collider: RAPIER.Collider) => boolean
}

/**
 * Cast a ray and return the first hit.
 *
 * @example
 * ```ts
 * const hit = castRay(
 *   {x: 0, y: 5, z: 0},  // origin
 *   {x: 0, y: -1, z: 0}, // direction (normalized)
 *   { maxDistance: 100 }
 * )
 * if (hit) {
 *   console.log(`Hit at distance ${hit.distance}`)
 * }
 * ```
 */
export function castRay(
  origin: {x: number; y: number; z: number},
  direction: {x: number; y: number; z: number},
  options: RaycastOptions = {},
): RaycastHit | null {
  const rapier = getRapierWorld()
  if (!rapier) return null

  const {
    maxDistance = Infinity,
    solid = true,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  } = options

  // Update cached ray
  _rayOrigin.x = origin.x
  _rayOrigin.y = origin.y
  _rayOrigin.z = origin.z
  _rayDir.x = direction.x
  _rayDir.y = direction.y
  _rayDir.z = direction.z

  if (!_cachedRay) {
    _cachedRay = new RAPIER.Ray(_rayOrigin, _rayDir)
  } else {
    _cachedRay.origin = _rayOrigin
    _cachedRay.dir = _rayDir
  }

  const hit = rapier.castRay(
    _cachedRay,
    maxDistance,
    solid,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  )

  if (!hit) return null

  return {
    distance: hit.timeOfImpact,
    collider: hit.collider,
    point: {
      x: origin.x + direction.x * hit.timeOfImpact,
      y: origin.y + direction.y * hit.timeOfImpact,
      z: origin.z + direction.z * hit.timeOfImpact,
    },
  }
}

/**
 * Cast a ray and return the first hit with surface normal.
 *
 * @example
 * ```ts
 * const hit = castRayAndGetNormal(
 *   {x: 0, y: 5, z: 0},
 *   {x: 0, y: -1, z: 0},
 *   { filterFlags: QueryFilterFlags.EXCLUDE_SENSORS }
 * )
 * if (hit) {
 *   console.log(`Surface normal: ${hit.normal.x}, ${hit.normal.y}, ${hit.normal.z}`)
 * }
 * ```
 */
export function castRayAndGetNormal(
  origin: {x: number; y: number; z: number},
  direction: {x: number; y: number; z: number},
  options: RaycastOptions = {},
): RaycastHit | null {
  const rapier = getRapierWorld()
  if (!rapier) return null

  const {
    maxDistance = Infinity,
    solid = true,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  } = options

  // Update cached ray
  _rayOrigin.x = origin.x
  _rayOrigin.y = origin.y
  _rayOrigin.z = origin.z
  _rayDir.x = direction.x
  _rayDir.y = direction.y
  _rayDir.z = direction.z

  if (!_cachedRay) {
    _cachedRay = new RAPIER.Ray(_rayOrigin, _rayDir)
  } else {
    _cachedRay.origin = _rayOrigin
    _cachedRay.dir = _rayDir
  }

  const hit = rapier.castRayAndGetNormal(
    _cachedRay,
    maxDistance,
    solid,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  )

  if (!hit) return null

  return {
    distance: hit.timeOfImpact,
    collider: hit.collider,
    point: {
      x: origin.x + direction.x * hit.timeOfImpact,
      y: origin.y + direction.y * hit.timeOfImpact,
      z: origin.z + direction.z * hit.timeOfImpact,
    },
    normal: {
      x: hit.normal.x,
      y: hit.normal.y,
      z: hit.normal.z,
    },
  }
}

export interface ShapeCastHit {
  /** Distance traveled before impact (time of impact) */
  distance: number
  /** The collider that was hit */
  collider: RAPIER.Collider
  /** Contact normal in local space of the cast shape */
  normal: {x: number; y: number; z: number}
  /** Witness point on the cast shape */
  witness1: {x: number; y: number; z: number}
  /** Witness point on the hit collider */
  witness2: {x: number; y: number; z: number}
}

export interface ShapeCastOptions extends RaycastOptions {
  /**
   * If true, stop at penetration. If false, continue to find exit point.
   * (default: true)
   */
  stopAtPenetration?: boolean
  /**
   * Minimum distance before reporting a hit. Useful to avoid self-intersection.
   * (default: 0)
   */
  targetDistance?: number
}

/**
 * Cast a shape (sweep test) and return the first hit.
 * Useful for character controllers, projectiles, etc.
 *
 * @example
 * ```ts
 * const capsule = new RAPIER.Capsule(0.5, 1.0)
 * const hit = castShape(
 *   capsule,
 *   {x: 0, y: 5, z: 0},           // position
 *   {x: 0, y: 0, z: 0, w: 1},     // rotation (quaternion)
 *   {x: 0, y: -1, z: 0},          // direction
 *   { maxDistance: 10 }
 * )
 * ```
 */
export function castShape(
  shape: RAPIER.Shape,
  position: {x: number; y: number; z: number},
  rotation: {x: number; y: number; z: number; w: number},
  direction: {x: number; y: number; z: number},
  options: ShapeCastOptions = {},
): ShapeCastHit | null {
  const rapier = getRapierWorld()
  if (!rapier) return null

  const {
    maxDistance = Infinity,
    stopAtPenetration = true,
    targetDistance = 0,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  } = options

  const hit = rapier.castShape(
    position,
    rotation,
    direction,
    shape,
    targetDistance,
    maxDistance,
    stopAtPenetration,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  )

  if (!hit) return null

  return {
    distance: hit.time_of_impact,
    collider: hit.collider,
    normal: {
      x: hit.normal1.x,
      y: hit.normal1.y,
      z: hit.normal1.z,
    },
    witness1: {
      x: hit.witness1.x,
      y: hit.witness1.y,
      z: hit.witness1.z,
    },
    witness2: {
      x: hit.witness2.x,
      y: hit.witness2.y,
      z: hit.witness2.z,
    },
  }
}

/**
 * Check if a point is inside any collider.
 *
 * @example
 * ```ts
 * const collider = pointIntersection({x: 0, y: 0, z: 0})
 * if (collider) {
 *   console.log('Point is inside a collider')
 * }
 * ```
 */
export function pointIntersection(
  point: {x: number; y: number; z: number},
  options: Omit<RaycastOptions, 'maxDistance' | 'solid'> = {},
): RAPIER.Collider | null {
  const rapier = getRapierWorld()
  if (!rapier) return null

  const {filterFlags, filterGroups, excludeCollider, excludeRigidBody, filterPredicate} = options

  return rapier.intersectionWithShape(
    point,
    {x: 0, y: 0, z: 0, w: 1},
    new RAPIER.Ball(0.001), // Tiny sphere for point test
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  )
}

/**
 * Project a point onto the nearest collider surface.
 *
 * @example
 * ```ts
 * const result = projectPoint({x: 0, y: 5, z: 0})
 * if (result) {
 *   console.log(`Nearest surface at ${result.point.x}, ${result.point.y}, ${result.point.z}`)
 * }
 * ```
 */
export function projectPoint(
  point: {x: number; y: number; z: number},
  solid: boolean = true,
  options: Omit<RaycastOptions, 'maxDistance' | 'solid'> = {},
): {point: {x: number; y: number; z: number}; isInside: boolean; collider: RAPIER.Collider} | null {
  const rapier = getRapierWorld()
  if (!rapier) return null

  const {filterFlags, filterGroups, excludeCollider, excludeRigidBody, filterPredicate} = options

  const result = rapier.projectPoint(
    point,
    solid,
    filterFlags,
    filterGroups,
    excludeCollider,
    excludeRigidBody,
    filterPredicate,
  )

  if (!result) return null

  return {
    point: {
      x: result.point.x,
      y: result.point.y,
      z: result.point.z,
    },
    isInside: result.isInside,
    collider: result.collider,
  }
}
