// ============================================
// Physics Query Functions (Raycasting, etc.)
// ============================================

import type {JoltBody, JoltBodyID} from './jolt-types'
import {physicsWorld, getJolt, isValidBodyID} from './world'

// ============================================
// Raycast Types
// ============================================

export interface RaycastHit {
  /** Fraction along the ray (0 = origin, 1 = full length) */
  fraction: number
  /** World position of the hit */
  point: {x: number; y: number; z: number}
  /** Body ID that was hit */
  bodyId: JoltBodyID
  /** The body that was hit */
  body: JoltBody | null
}

export interface RaycastOptions {
  /** Maximum distance to check (ray length) */
  maxDistance?: number
  /** Body ID to exclude from hits (e.g., the player) */
  excludeBodyId?: JoltBodyID | null
  /** Exclude bodies by their Body object */
  excludeBody?: JoltBody | null
}

// ============================================
// Scratch Objects (reused to avoid allocations)
// ============================================

// Ray origin and direction vectors (allocated once)
let _rayOrigin: ReturnType<typeof getJolt>['RVec3']['prototype'] | null = null
let _rayDirection: ReturnType<typeof getJolt>['Vec3']['prototype'] | null = null
let _ray: ReturnType<typeof getJolt>['RRayCast']['prototype'] | null = null
let _raySettings:
  | ReturnType<typeof getJolt>['RayCastSettings']['prototype']
  | null = null
let _collector:
  | ReturnType<
      typeof getJolt
    >['CastRayClosestHitCollisionCollector']['prototype']
  | null = null
let _bodyFilter: ReturnType<typeof getJolt>['BodyFilter']['prototype'] | null =
  null
let _broadPhaseLayerFilter:
  | ReturnType<typeof getJolt>['BroadPhaseLayerFilter']['prototype']
  | null = null
let _objectLayerFilter:
  | ReturnType<typeof getJolt>['ObjectLayerFilter']['prototype']
  | null = null
let _shapeFilter:
  | ReturnType<typeof getJolt>['ShapeFilter']['prototype']
  | null = null

// Track excluded body for custom filter
let _excludeBodyIndex: number | null = null

/**
 * Initialize raycast scratch objects (call once after Jolt is loaded)
 */
export function initRaycastObjects(): void {
  const Jolt = getJolt()

  // Create scratch vectors
  _rayOrigin = new Jolt.RVec3(0, 0, 0)
  _rayDirection = new Jolt.Vec3(0, 0, 0)

  // Create ray (will set origin/direction before each cast)
  _ray = new Jolt.RRayCast()

  // Create ray settings
  _raySettings = new Jolt.RayCastSettings()

  // Create collector for closest hit
  _collector = new Jolt.CastRayClosestHitCollisionCollector()

  // Create default filters (pass-through)
  _broadPhaseLayerFilter = new Jolt.BroadPhaseLayerFilter()
  _objectLayerFilter = new Jolt.ObjectLayerFilter()
  _shapeFilter = new Jolt.ShapeFilter()

  // Create custom body filter that can exclude a specific body
  // Note: The JS binding passes numbers (index+sequence) to callbacks, not actual Jolt objects
  const bodyFilterJS = new Jolt.BodyFilterJS()
  bodyFilterJS.ShouldCollide = (bodyIdIndexAndSequence: number): boolean => {
    if (_excludeBodyIndex !== null) {
      return bodyIdIndexAndSequence !== _excludeBodyIndex
    }
    return true
  }
  bodyFilterJS.ShouldCollideLocked = (): boolean => {
    return true
  }
  _bodyFilter = bodyFilterJS
}

/**
 * Clean up raycast scratch objects
 */
export function destroyRaycastObjects(): void {
  const Jolt = getJolt()

  if (_rayOrigin) Jolt.destroy(_rayOrigin)
  if (_rayDirection) Jolt.destroy(_rayDirection)
  if (_ray) Jolt.destroy(_ray)
  if (_raySettings) Jolt.destroy(_raySettings)
  if (_collector) Jolt.destroy(_collector)
  if (_bodyFilter) Jolt.destroy(_bodyFilter)
  if (_broadPhaseLayerFilter) Jolt.destroy(_broadPhaseLayerFilter)
  if (_objectLayerFilter) Jolt.destroy(_objectLayerFilter)
  if (_shapeFilter) Jolt.destroy(_shapeFilter)

  _rayOrigin = null
  _rayDirection = null
  _ray = null
  _raySettings = null
  _collector = null
  _bodyFilter = null
  _broadPhaseLayerFilter = null
  _objectLayerFilter = null
  _shapeFilter = null
  _excludeBodyIndex = null
}

/**
 * Cast a ray and return the closest hit
 *
 * @param originX - Ray origin X
 * @param originY - Ray origin Y
 * @param originZ - Ray origin Z
 * @param dirX - Ray direction X (will be normalized then scaled by maxDistance)
 * @param dirY - Ray direction Y
 * @param dirZ - Ray direction Z
 * @param options - Raycast options
 * @returns RaycastHit if something was hit, null otherwise
 */
export function castRay(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  options: RaycastOptions = {},
): RaycastHit | null {
  const {maxDistance = 100, excludeBodyId, excludeBody} = options

  // Ensure objects are initialized
  if (
    !_ray ||
    !_raySettings ||
    !_collector ||
    !_bodyFilter ||
    !_broadPhaseLayerFilter ||
    !_objectLayerFilter ||
    !_shapeFilter
  ) {
    initRaycastObjects()
  }

  // Early exit if objects still not initialized
  if (
    !_ray ||
    !_raySettings ||
    !_collector ||
    !_bodyFilter ||
    !_broadPhaseLayerFilter ||
    !_objectLayerFilter ||
    !_shapeFilter
  ) {
    return null
  }

  const {physicsSystem} = physicsWorld
  if (!physicsSystem) return null

  // Set up excluded body
  _excludeBodyIndex = null
  if (excludeBodyId && isValidBodyID(excludeBodyId)) {
    _excludeBodyIndex = excludeBodyId.GetIndexAndSequenceNumber()
  } else if (excludeBody) {
    const bodyId = excludeBody.GetID()
    if (isValidBodyID(bodyId)) {
      _excludeBodyIndex = bodyId.GetIndexAndSequenceNumber()
    }
  }

  // Set ray origin
  _ray.mOrigin.Set(originX, originY, originZ)

  // Set ray direction (direction * maxDistance = ray endpoint)
  // Jolt uses direction as the ray length, not just direction
  _ray.mDirection.Set(
    dirX * maxDistance,
    dirY * maxDistance,
    dirZ * maxDistance,
  )

  // Reset collector for new cast
  _collector.Reset()

  // Cast the ray
  const narrowPhaseQuery = physicsSystem.GetNarrowPhaseQuery()
  narrowPhaseQuery.CastRay(
    _ray,
    _raySettings,
    _collector,
    _broadPhaseLayerFilter,
    _objectLayerFilter,
    _bodyFilter,
    _shapeFilter,
  )

  // Check for hit
  if (!_collector.HadHit()) {
    return null
  }

  // Get hit result
  const hit = _collector.mHit
  const fraction = hit.mFraction

  // Calculate hit point
  const pointX = originX + dirX * maxDistance * fraction
  const pointY = originY + dirY * maxDistance * fraction
  const pointZ = originZ + dirZ * maxDistance * fraction

  // Get the body that was hit
  const bodyId = hit.mBodyID
  let body: JoltBody | null = null

  if (isValidBodyID(bodyId)) {
    const bodyLockInterface = physicsSystem.GetBodyLockInterfaceNoLock()
    body = bodyLockInterface.TryGetBody(bodyId)
  }

  return {
    fraction,
    point: {x: pointX, y: pointY, z: pointZ},
    bodyId,
    body,
  }
}

/**
 * Cast a ray between two points and return the closest hit
 *
 * @param fromX - Start point X
 * @param fromY - Start point Y
 * @param fromZ - Start point Z
 * @param toX - End point X
 * @param toY - End point Y
 * @param toZ - End point Z
 * @param options - Raycast options (maxDistance is ignored, uses distance between points)
 * @returns RaycastHit if something was hit, null otherwise
 */
export function castRayBetween(
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  options: Omit<RaycastOptions, 'maxDistance'> = {},
): RaycastHit | null {
  // Calculate direction and distance
  const dx = toX - fromX
  const dy = toY - fromY
  const dz = toZ - fromZ
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)

  if (distance < 0.0001) {
    return null // Points are too close
  }

  // Normalize direction
  const invDist = 1 / distance
  const dirX = dx * invDist
  const dirY = dy * invDist
  const dirZ = dz * invDist

  return castRay(fromX, fromY, fromZ, dirX, dirY, dirZ, {
    ...options,
    maxDistance: distance,
  })
}
