import type * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import {setVec3} from '~/lib/math'
import {
  RigidBodyRef,
  Transform,
  PhysicsInitialized,
  KinematicVelocity,
} from './traits'

// ============================================
// Scratch objects for character movement
// ============================================

const _velocity = {x: 0, y: 0, z: 0}
const _platformVel = {x: 0, y: 0, z: 0}
const _castPos = {x: 0, y: 0, z: 0}
const _moveDir = {x: 0, y: 0, z: 0}
const _slideVel = {x: 0, y: 0, z: 0}
const _stepPos = {x: 0, y: 0, z: 0}
const _depenetratePos = {x: 0, y: 0, z: 0}
const _prevMoveDir = {x: 0, y: 0, z: 0}

// Identity rotation quaternion
const _identityRot = {x: 0, y: 0, z: 0, w: 1}

// ============================================
// OpenKCC-aligned Constants
// ============================================

/** Minimum significant value for float comparisons */
const EPSILON = 0.001
/** Maximum speed for ground snapping (units/second) */
const MAX_SNAP_DOWN_SPEED = 5.0
/** Maximum speed for push out corrections (units/second) */
const MAX_PUSH_OUT_SPEED = 100.0
/**
 * Rapier: Small push along contact normal to prevent getting stuck in perpetual penetration.
 * Helps shape-casting not getting stuck during sliding calculation.
 */
const NORMAL_NUDGE_FACTOR = 0.0001
/**
 * Rapier: Scale factor for surface correction to prevent floating-point accumulation
 * from leaving a tiny velocity component into the surface.
 */
const CORRECTION_SCALE = 1.0 + 1e-5

// ============================================
// Character Controller Traits
// ============================================

// Runtime reference to capsule shape for shapecast
export const CharacterShapeRef = trait(() => ({
  shape: null as RAPIER.Capsule | null,
  halfHeight: 0,
  radius: 0,
}))

// Configuration for character controller
export const CharacterControllerConfig = trait({
  // Capsule dimensions
  capsuleHalfHeight: 0.5,
  capsuleRadius: 0.5,

  // Ground detection
  skinWidth: 0.02,
  groundCheckDistance: 0.5,
  groundedThreshold: 0.15, // Increased to handle fast-moving platforms
  groundSnapDistance: 0.2,

  // Slope/step
  maxSlopeAngle: Math.PI / 4, // 45 degrees
  stepHeight: 0.35,
  stepMinWidth: 0.1,

  // Movement
  maxBounces: 12,
  anglePower: 2.0, // Angular damping power (higher = more damping on angled hits)

  // Jump
  jumpAngleWeight: 0.4, // 0 = straight up, 1 = along surface normal (OpenKCC default: 0)

  // Platform
  maxLaunchVelocity: 10.0, // Max platform velocity to inherit
  momentumTransferWeight: 0.8, // How much platform velocity to keep when leaving (0-1)

  // Timing (in physics frames at 60fps)
  coyoteFrames: 6, // ~100ms grace period after leaving ground
  jumpBufferFrames: 6, // ~100ms to queue jump before landing

  // Physics
  mass: 75,
})

// Type alias for config data
interface CharacterConfig {
  capsuleHalfHeight: number
  capsuleRadius: number
  skinWidth: number
  groundCheckDistance: number
  groundedThreshold: number
  groundSnapDistance: number
  maxSlopeAngle: number
  stepHeight: number
  stepMinWidth: number
  maxBounces: number
  anglePower: number
  jumpAngleWeight: number
  maxLaunchVelocity: number
  momentumTransferWeight: number
  coyoteFrames: number
  jumpBufferFrames: number
  mass: number
}

// Movement state for character
export const CharacterMovement = trait({
  // Desired velocity (input)
  vx: 0,
  vy: 0,
  vz: 0,
  // Computed movement (output)
  mx: 0,
  my: 0,
  mz: 0,
  // Ground state
  grounded: false,
  wasGroundedLastFrame: false,
  sliding: false, // On steep slope
  groundNormalX: 0,
  groundNormalY: 1,
  groundNormalZ: 0,
  groundDistance: 0,
  // Platform tracking
  platformVx: 0,
  platformVy: 0,
  platformVz: 0,
  lastPlatformEntity: null as Entity | null,
  // Inherited momentum (from leaving platform)
  inheritedVx: 0,
  inheritedVy: 0,
  inheritedVz: 0,
  // Timing
  coyoteCounter: 0, // Frames since leaving ground
  jumpBufferCounter: 0, // Frames since jump was pressed
  jumpRequested: false, // Jump input this frame
  // Visual Y position for smooth step-up animation
  // Smoothly interpolates toward physics Y instead of snapping
  visualY: 0,
  visualYInitialized: false,
})

// Tag for entities that are character controllers
export const IsCharacterController = trait()

// ============================================
// Ground Detection Result
// ============================================

interface GroundInfo {
  grounded: boolean
  sliding: boolean
  distance: number
  normalX: number
  normalY: number
  normalZ: number
  collider: RAPIER.Collider | null
  hitPoint: {x: number; y: number; z: number}
}

const _groundInfo: GroundInfo = {
  grounded: false,
  sliding: false,
  distance: 0,
  normalX: 0,
  normalY: 1,
  normalZ: 0,
  collider: null,
  hitPoint: {x: 0, y: 0, z: 0},
}

// ============================================
// Cached Queries
// ============================================

const characterSystemQuery = createQuery(
  CharacterShapeRef,
  CharacterMovement,
  CharacterControllerConfig,
  RigidBodyRef,
  Transform,
  PhysicsInitialized,
)

const characterCreationQuery = createQuery(
  CharacterControllerConfig,
  IsCharacterController,
  RigidBodyRef,
  PhysicsInitialized,
)

// ============================================
// Ground Detection via Shapecast
// ============================================

// Cached static filter state (avoids closure allocation per call)
let _filterSelfCollider: RAPIER.Collider | null = null

// Static filter callback - filters out dynamic bodies and the character's own collider
function staticFilterCallback(collider: RAPIER.Collider): boolean {
  if (collider === _filterSelfCollider) return false
  const body = collider.parent()
  // Only collide with fixed/kinematic bodies, not dynamic
  return body ? !body.isDynamic() : true
}

// Set the collider to exclude from static filter queries
function setStaticFilterCollider(selfCollider: RAPIER.Collider): void {
  _filterSelfCollider = selfCollider
}

// Scratch objects for edge verification
const _edgeVerifyPos = {x: 0, y: 0, z: 0}
const _verifiedNormal = {x: 0, y: 0, z: 0}

// Scratch objects for impulse application (reused to avoid allocations)
const _impulse = {x: 0, y: 0, z: 0}
const _contactPoint = {x: 0, y: 0, z: 0}

// Scratch objects for moveAndSlide and character controller
const _horizVel = {x: 0, y: 0, z: 0}
const _finalPos = {x: 0, y: 0, z: 0}
const _charPos = {x: 0, y: 0, z: 0}

/**
 * Detects if a normal is an "edge normal" - interpolated between two faces.
 * Edge normals are diagonal: neither mostly horizontal nor mostly vertical.
 */
function isEdgeNormalForGround(nx: number, ny: number, nz: number): boolean {
  const horizontalLen = Math.sqrt(nx * nx + nz * nz)
  // Edge if has significant horizontal AND vertical component, but vertical isn't dominant
  return horizontalLen > 0.3 && ny > 0.3 && ny < 0.85
}

/**
 * Secondary shapecast to verify ground normal when initial shapecast hits an edge.
 * Casts down from a position offset toward the edge normal's horizontal component
 * to find the actual ground surface face normal rather than the interpolated edge normal.
 */
function verifyGroundNormalWithShapecast(
  rapierWorld: RAPIER.World,
  position: {x: number; y: number; z: number},
  edgeNormal: {x: number; y: number; z: number},
  shape: RAPIER.Capsule,
  maxDistance: number,
  selfCollider: RAPIER.Collider,
  target: {x: number; y: number; z: number},
): boolean {
  // Offset position slightly in the horizontal direction of the edge normal
  // This moves us away from the edge toward the face
  const offsetMagnitude = 0.15
  setVec3(
    _edgeVerifyPos,
    position.x + edgeNormal.x * offsetMagnitude,
    position.y,
    position.z + edgeNormal.z * offsetMagnitude,
  )

  // Cast down from offset position
  const hit = rapierWorld.castShape(
    _edgeVerifyPos,
    _identityRot,
    {x: 0, y: -1, z: 0},
    shape,
    0,
    maxDistance,
    true,
    undefined, // filterFlags
    undefined, // filterGroups
    selfCollider, // excludeCollider
  )

  if (hit) {
    // Only use this normal if it's more "upward" than the edge normal
    // This indicates we found actual ground rather than another edge
    if (hit.normal1.y > edgeNormal.y + 0.1) {
      target.x = hit.normal1.x
      target.y = hit.normal1.y
      target.z = hit.normal1.z
      return true
    }
  }

  return false
}

function detectGround(
  rapierWorld: RAPIER.World,
  position: {x: number; y: number; z: number},
  shape: RAPIER.Capsule,
  config: CharacterConfig,
  selfCollider: RAPIER.Collider,
  wasGroundedLastFrame: boolean = false,
): GroundInfo {
  _groundInfo.grounded = false
  _groundInfo.sliding = false
  _groundInfo.distance = Infinity
  _groundInfo.normalX = 0
  _groundInfo.normalY = 1
  _groundInfo.normalZ = 0
  _groundInfo.collider = null
  _groundInfo.hitPoint.x = position.x
  _groundInfo.hitPoint.y = position.y
  _groundInfo.hitPoint.z = position.z

  setVec3(_castPos, position.x, position.y, position.z)

  // Allow all bodies as ground (including dynamic like rocking boards)
  // Dynamic bodies won't give platform velocity since they're not kinematic
  const hit = rapierWorld.castShape(
    _castPos,
    _identityRot,
    {x: 0, y: -1, z: 0},
    shape,
    0,
    config.groundCheckDistance,
    true,
    undefined, // filterFlags
    undefined, // filterGroups
    selfCollider, // excludeCollider
  )

  if (hit) {
    _groundInfo.distance = hit.time_of_impact
    _groundInfo.normalX = hit.normal1.x
    _groundInfo.normalY = hit.normal1.y
    _groundInfo.normalZ = hit.normal1.z
    _groundInfo.collider = hit.collider

    _groundInfo.hitPoint.x = position.x
    _groundInfo.hitPoint.y = position.y - hit.time_of_impact
    _groundInfo.hitPoint.z = position.z

    // Secondary edge shapecast verification
    // When shapecast contacts a collider edge (not face), the returned normal is
    // interpolated between the two face normals. This causes incorrect slope angle
    // calculation and unexpected sliding. Use a secondary shapecast to verify.
    if (isEdgeNormalForGround(hit.normal1.x, hit.normal1.y, hit.normal1.z)) {
      // Reuse scratch object to avoid allocation
      _verifiedNormal.x = 0
      _verifiedNormal.y = 0
      _verifiedNormal.z = 0
      const verified = verifyGroundNormalWithShapecast(
        rapierWorld,
        position,
        hit.normal1,
        shape,
        config.groundCheckDistance * 1.5,
        selfCollider,
        _verifiedNormal,
      )
      if (verified) {
        _groundInfo.normalX = _verifiedNormal.x
        _groundInfo.normalY = _verifiedNormal.y
        _groundInfo.normalZ = _verifiedNormal.z
      }
    }

    // Hysteresis: if grounded last frame, use a more lenient threshold (5 degrees extra)
    // This prevents flickering when walking near edges with interpolated normals
    const hysteresisAngle = wasGroundedLastFrame ? 5 * (Math.PI / 180) : 0
    const effectiveSlopeCos = Math.cos(config.maxSlopeAngle + hysteresisAngle)

    if (hit.time_of_impact <= config.groundedThreshold) {
      if (_groundInfo.normalY >= effectiveSlopeCos) {
        // Walkable slope - grounded
        _groundInfo.grounded = true
      } else if (_groundInfo.normalY > 0.1) {
        // Too steep but touching - sliding
        _groundInfo.sliding = true
      }
    }
  }

  return _groundInfo
}

// ============================================
// Platform Velocity
// ============================================

function getPlatformVelocity(
  groundCollider: RAPIER.Collider | null,
  charPos: {x: number; y: number; z: number},
  target: {x: number; y: number; z: number},
  lastPlatformEntity: Entity | null,
  maxVelocity: number,
): Entity | null {
  setVec3(target, 0, 0, 0)

  let platformEntity: Entity | null = null
  let platformBody: RAPIER.RigidBody | null = null

  if (groundCollider) {
    const body = groundCollider.parent()
    if (body?.isKinematic()) {
      platformEntity = (body.userData as Entity | undefined) ?? null
      platformBody = body
    }
  }

  // Fall back to last platform ONLY if airborne (no ground collider at all)
  // This prevents using old platform velocity when landed on regular ground
  if (!groundCollider && !platformEntity && lastPlatformEntity?.isAlive()) {
    if (lastPlatformEntity.has(KinematicVelocity)) {
      platformEntity = lastPlatformEntity
      const bodyRef = lastPlatformEntity.get(RigidBodyRef)
      platformBody = bodyRef?.body ?? null
    }
  }

  if (!platformEntity?.has(KinematicVelocity)) {
    return null
  }

  const vel = platformEntity.get(KinematicVelocity)!

  target.x = vel.x
  target.y = vel.y
  target.z = vel.z

  // Add tangential velocity from angular velocity
  if (platformBody && (vel.ax !== 0 || vel.ay !== 0 || vel.az !== 0)) {
    const platformPos = platformBody.translation()
    const rx = charPos.x - platformPos.x
    const ry = charPos.y - platformPos.y
    const rz = charPos.z - platformPos.z
    target.x += vel.ay * rz - vel.az * ry
    target.y += vel.az * rx - vel.ax * rz
    target.z += vel.ax * ry - vel.ay * rx
  }

  // Clamp to max launch velocity
  const speed = Math.sqrt(
    target.x * target.x + target.y * target.y + target.z * target.z,
  )
  if (speed > maxVelocity) {
    const scale = maxVelocity / speed
    target.x *= scale
    target.y *= scale
    target.z *= scale
  }

  return platformEntity
}

// ============================================
// Depenetration using Overlap Query
// ============================================

// Temporary storage for overlap results
interface OverlapInfo {
  collider: RAPIER.Collider
  isDynamic: boolean
}
const _overlapResults: OverlapInfo[] = []

function depenetrate(
  rapierWorld: RAPIER.World,
  position: {x: number; y: number; z: number},
  shape: RAPIER.Capsule,
  selfCollider: RAPIER.Collider,
  target: {x: number; y: number; z: number},
  mass: number,
  delta: number,
  maxIterations: number = 8,
): void {
  setVec3(target, 0, 0, 0)

  // OpenKCC: Frame-rate independent max push out
  const maxPushThisFrame = MAX_PUSH_OUT_SPEED * delta

  for (let iter = 0; iter < maxIterations; iter++) {
    setVec3(
      _castPos,
      position.x + target.x,
      position.y + target.y,
      position.z + target.z,
    )

    // Find all overlapping colliders using intersectionsWithShape
    _overlapResults.length = 0
    rapierWorld.intersectionsWithShape(
      _castPos,
      _identityRot,
      shape,
      (collider) => {
        if (collider === selfCollider) return true // Skip self, continue
        const body = collider.parent()
        _overlapResults.push({
          collider,
          isDynamic: body?.isDynamic() ?? false,
        })
        return true // Continue searching
      },
      undefined, // filterFlags
      undefined, // filterGroups
      selfCollider, // excludeCollider
    )

    if (_overlapResults.length === 0) break

    // Accumulate push directions from static/kinematic colliders only
    // Dynamic bodies push us, we don't get pushed by them
    let totalPushX = 0
    let totalPushY = 0
    let totalPushZ = 0
    let staticHitCount = 0

    for (const overlap of _overlapResults) {
      // Use contactPair to get penetration info
      // This gives us accurate contact normals and depths
      let foundContact = false

      rapierWorld.contactPair(
        selfCollider,
        overlap.collider,
        (manifold, flipped) => {
          const numContacts = manifold.numContacts()
          if (numContacts === 0) return

          // Get the contact normal (pointing from collider1 to collider2)
          // If flipped, the normal points opposite direction
          const normal = manifold.normal()
          const nx = flipped ? -normal.x : normal.x
          const ny = flipped ? -normal.y : normal.y
          const nz = flipped ? -normal.z : normal.z

          // Accumulate depths from all contact points
          let totalDepth = 0
          for (let i = 0; i < numContacts; i++) {
            const depth = manifold.contactDist(i)
            if (depth < 0) {
              // Negative depth means penetration
              totalDepth += -depth
            }
          }

          if (totalDepth > 0.0001) {
            foundContact = true

            if (overlap.isDynamic) {
              // Push dynamic bodies away (gentle impulse, not launch)
              // KCC should NOT be pushed by dynamic bodies - only push them away
              const body = overlap.collider.parent()
              if (body) {
                // Scale impulse by penetration depth for proportional response
                const pushScale = Math.min(totalDepth * 2, 1) * mass * 0.01
                // Reuse scratch impulse object
                _impulse.x = -nx * pushScale
                _impulse.y = -ny * pushScale * 0.5 // Less vertical push
                _impulse.z = -nz * pushScale
                body.applyImpulse(_impulse, true)
              }
              // Don't accumulate push for KCC - dynamic bodies can't push us
            } else {
              // Static/kinematic - full push
              staticHitCount++
              totalPushX += nx * totalDepth
              totalPushY += ny * totalDepth
              totalPushZ += nz * totalDepth
            }
          }
        },
      )

      // Fallback if contactPair didn't give results (common for kinematic-kinematic pairs)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- callback may not be invoked
      if (!foundContact) {
        // Use shapecast to find accurate push direction
        // Cast from character toward collider center, the hit normal is our push direction
        const overlapPos = overlap.collider.translation()
        let dx = overlapPos.x - _castPos.x
        let dy = overlapPos.y - _castPos.y
        let dz = overlapPos.z - _castPos.z
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        if (dist > 0.0001) {
          dx /= dist
          dy /= dist
          dz /= dist

          // Cast toward the collider to get the surface normal
          const hit = rapierWorld.castShape(
            _castPos,
            _identityRot,
            {x: dx, y: dy, z: dz},
            shape,
            0,
            dist + 1, // Cast far enough to hit
            true,
            undefined,
            undefined,
            selfCollider,
          )

          // Use hit normal if found, otherwise fall back to center direction
          let pushX = -dx
          let pushY = -dy
          let pushZ = -dz
          let depth = 0.1 // Default depth estimate

          if (hit && hit.collider === overlap.collider) {
            // Use the actual surface normal
            pushX = hit.normal1.x
            pushY = hit.normal1.y
            pushZ = hit.normal1.z
            // Estimate depth based on how far we cast vs where we hit
            depth = Math.max(0.01, dist - hit.time_of_impact)
          }

          if (overlap.isDynamic) {
            // Push dynamic bodies away - KCC should NOT be pushed by them
            const body = overlap.collider.parent()
            if (body) {
              const pushScale = mass * 0.01
              // Reuse scratch impulse object
              _impulse.x = -pushX * pushScale
              _impulse.y = 0
              _impulse.z = -pushZ * pushScale
              body.applyImpulse(_impulse, true)
            }
          } else {
            staticHitCount++
            totalPushX += pushX * depth
            totalPushY += pushY * depth
            totalPushZ += pushZ * depth
          }
        }
      }
    }

    if (staticHitCount === 0) break

    // Add upward bias when stuck in corners (helps escape wedges)
    if (staticHitCount >= 2) {
      totalPushY += 0.5
    }

    // Normalize and apply push
    const pushLen = Math.sqrt(
      totalPushX * totalPushX +
        totalPushY * totalPushY +
        totalPushZ * totalPushZ,
    )
    if (pushLen < EPSILON) break

    // Calculate current total push magnitude
    const currentTotal = Math.sqrt(
      target.x * target.x + target.y * target.y + target.z * target.z,
    )

    // Check if we've already reached the max push for this frame
    if (currentTotal >= maxPushThisFrame) break

    // Stronger push when in corners
    const basePush = staticHitCount >= 2 ? 0.04 : 0.02
    // Limit push increment to not exceed frame max
    const remainingPush = maxPushThisFrame - currentTotal
    const pushIncrement = Math.min(basePush, remainingPush)
    const pushScale = pushIncrement / pushLen

    target.x += totalPushX * pushScale
    target.y += totalPushY * pushScale
    target.z += totalPushZ * pushScale
  }
}

// ============================================
// Angular Damping (OpenKCC approach)
// ============================================

/** Buffer angle - collisions under this angle get no damping (degrees) */
const BUFFER_ANGLE_SHOVE = 120.0
/** Maximum angle range for damping calculation (degrees) */
const MAX_ANGLE_SHOVE_DEGREES = 180.0 - BUFFER_ANGLE_SHOVE

function calculateAngularDamping(
  normal: {x: number; y: number; z: number},
  moveDir: {x: number; y: number; z: number},
  anglePower: number,
): number {
  // Calculate angle between normal and movement direction (OpenKCC approach)
  // Dot product gives cosine of angle
  const dot = normal.x * moveDir.x + normal.y * moveDir.y + normal.z * moveDir.z
  // Convert to angle in degrees (0-180)
  const angleBetween =
    Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI)

  // OpenKCC: Only apply damping for angles > 120° (near head-on collisions)
  // Angles < 120° (glancing hits, slopes) get NO damping
  const normalizedAngle =
    Math.max(angleBetween - BUFFER_ANGLE_SHOVE, 0) / MAX_ANGLE_SHOVE_DEGREES

  // Damping: 1 = no damping (angle < 120°), 0 = full stop (180° head-on)
  return Math.pow(Math.abs(1 - normalizedAngle), anglePower)
}

// ============================================
// Unified Move and Slide with Step-Up
// ============================================

const MIN_MOVE_DISTANCE = 0.001
// OpenKCC uses ForceMode.Force (continuous), we use impulse (instantaneous)
// Impulse = Force / fps, so for pushPower=4 at 60fps: 4/60 ≈ 0.067
// We use a lower value since our speed is already per-frame
const PUSH_FORCE_MULTIPLIER = 0.02

interface MoveResult {
  x: number
  y: number
  z: number
  hitWall: boolean
  hitCeiling: boolean
  hitFloor: boolean
  steppedUp: boolean
  stepUpAmount: number // Actual Y distance stepped up
}

const _moveResult: MoveResult = {
  x: 0,
  y: 0,
  z: 0,
  hitWall: false,
  hitCeiling: false,
  hitFloor: false,
  steppedUp: false,
  stepUpAmount: 0,
}

function moveAndSlide(
  rapierWorld: RAPIER.World,
  startPos: {x: number; y: number; z: number},
  velocity: {x: number; y: number; z: number},
  shape: RAPIER.Capsule,
  selfCollider: RAPIER.Collider,
  config: CharacterConfig,
  grounded: boolean,
  isJumping: boolean = false,
): MoveResult {
  _moveResult.x = 0
  _moveResult.y = 0
  _moveResult.z = 0
  _moveResult.hitWall = false
  _moveResult.hitCeiling = false
  _moveResult.hitFloor = false
  _moveResult.steppedUp = false
  _moveResult.stepUpAmount = 0

  // Set filter collider once for all casts in this function
  setStaticFilterCollider(selfCollider)

  setVec3(_slideVel, velocity.x, velocity.y, velocity.z)
  setVec3(_prevMoveDir, 0, 0, 0)

  // Store original velocity direction for reversal check (OpenKCC approach)
  const origSpeed = Math.sqrt(
    velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z,
  )
  const origDirX = origSpeed > EPSILON ? velocity.x / origSpeed : 0
  const origDirY = origSpeed > EPSILON ? velocity.y / origSpeed : 0
  const origDirZ = origSpeed > EPSILON ? velocity.z / origSpeed : 0

  for (let bounce = 0; bounce < config.maxBounces; bounce++) {
    const speed = Math.sqrt(
      _slideVel.x * _slideVel.x +
        _slideVel.y * _slideVel.y +
        _slideVel.z * _slideVel.z,
    )

    if (speed < MIN_MOVE_DISTANCE) break

    const invSpeed = 1 / speed
    setVec3(
      _moveDir,
      _slideVel.x * invSpeed,
      _slideVel.y * invSpeed,
      _slideVel.z * invSpeed,
    )

    // Direction reversal checks (OpenKCC approach)
    if (bounce > 0) {
      // Check against previous direction
      const dotWithPrev =
        _moveDir.x * _prevMoveDir.x +
        _moveDir.y * _prevMoveDir.y +
        _moveDir.z * _prevMoveDir.z
      if (dotWithPrev < -0.1) {
        break
      }

      // Check against original intended direction (OpenKCC: prevents oscillation)
      const dotWithOrig =
        _moveDir.x * origDirX + _moveDir.y * origDirY + _moveDir.z * origDirZ
      if (dotWithOrig < 0) {
        break
      }
    }
    setVec3(_prevMoveDir, _moveDir.x, _moveDir.y, _moveDir.z)

    setVec3(
      _castPos,
      startPos.x + _moveResult.x,
      startPos.y + _moveResult.y,
      startPos.z + _moveResult.z,
    )

    // First, check for dynamic bodies to push (but not block movement)
    const dynamicHit = rapierWorld.castShape(
      _castPos,
      _identityRot,
      _moveDir,
      shape,
      0,
      speed,
      true,
      undefined,
      undefined,
      selfCollider,
    )

    if (dynamicHit) {
      const dynamicBody = dynamicHit.collider.parent()
      if (dynamicBody?.isDynamic()) {
        // Push the dynamic body aside (horizontal only)
        const horizSpeed = Math.sqrt(
          _moveDir.x * _moveDir.x + _moveDir.z * _moveDir.z,
        )
        if (horizSpeed > 0.001) {
          const pushStrength = config.mass * speed * PUSH_FORCE_MULTIPLIER
          // Reuse scratch objects to avoid allocations
          _impulse.x = (_moveDir.x / horizSpeed) * pushStrength * horizSpeed
          _impulse.y = 0
          _impulse.z = (_moveDir.z / horizSpeed) * pushStrength * horizSpeed
          _contactPoint.x = _castPos.x + _moveDir.x * dynamicHit.time_of_impact
          _contactPoint.y = _castPos.y + _moveDir.y * dynamicHit.time_of_impact
          _contactPoint.z = _castPos.z + _moveDir.z * dynamicHit.time_of_impact
          dynamicBody.applyImpulseAtPoint(_impulse, _contactPoint, true)
        }
      }
    }

    // Now check for static/kinematic bodies that actually block movement
    const hit = rapierWorld.castShape(
      _castPos,
      _identityRot,
      _moveDir,
      shape,
      0,
      speed,
      true,
      undefined, // filterFlags
      undefined, // filterGroups
      undefined, // excludeCollider (handled by filter)
      undefined, // excludeRigidBody
      staticFilterCallback, // filterPredicate
    )

    if (!hit || hit.time_of_impact >= speed - MIN_MOVE_DISTANCE) {
      _moveResult.x += _slideVel.x
      _moveResult.y += _slideVel.y
      _moveResult.z += _slideVel.z
      break
    }

    const nx = hit.normal1.x
    const ny = hit.normal1.y
    const nz = hit.normal1.z

    // When jumping, skip floor collisions if we're moving away from the surface
    // This prevents the jump from being immediately bounced off the ground we're standing on
    if (isJumping && bounce === 0 && ny > 0.7) {
      // Check if velocity is moving away from the surface (dot > 0 means same direction as normal)
      const dotWithNormal = _moveDir.x * nx + _moveDir.y * ny + _moveDir.z * nz
      if (dotWithNormal > 0.1) {
        // Moving away from floor - complete the move without collision
        _moveResult.x += _slideVel.x
        _moveResult.y += _slideVel.y
        _moveResult.z += _slideVel.z
        break
      }
    }

    // Categorize hit
    if (ny > 0.7) {
      _moveResult.hitFloor = true
    } else if (ny < -0.7) {
      _moveResult.hitCeiling = true
    } else {
      _moveResult.hitWall = true
    }

    // Try step-up if we hit a wall while grounded
    if (_moveResult.hitWall && grounded && bounce === 0) {
      const hitPointY = _castPos.y + _moveDir.y * hit.time_of_impact
      const feetY = startPos.y - config.capsuleHalfHeight - config.capsuleRadius
      const hitHeight = hitPointY - feetY

      if (hitHeight <= config.stepHeight) {
        const stepped = attemptStepUp(
          rapierWorld,
          {
            x: startPos.x + _moveResult.x,
            y: startPos.y + _moveResult.y,
            z: startPos.z + _moveResult.z,
          },
          {x: _slideVel.x, y: 0, z: _slideVel.z},
          shape,
          config,
          selfCollider,
          _stepPos,
        )
        if (stepped) {
          _moveResult.x += _stepPos.x
          _moveResult.y += _stepPos.y
          _moveResult.z += _stepPos.z
          _moveResult.steppedUp = true
          _moveResult.stepUpAmount = _stepPos.y
          // Continue with remaining velocity after step
          const remainingSpeed = speed - hit.time_of_impact
          if (remainingSpeed > MIN_MOVE_DISTANCE) {
            _slideVel.x = _moveDir.x * remainingSpeed * 0.5
            _slideVel.y = 0
            _slideVel.z = _moveDir.z * remainingSpeed * 0.5
            continue
          }
          break
        }
      }
    }

    // Move to contact
    const safeDist = Math.max(0, hit.time_of_impact - config.skinWidth)
    _moveResult.x += _moveDir.x * safeDist
    _moveResult.y += _moveDir.y * safeDist
    _moveResult.z += _moveDir.z * safeDist

    const remaining = speed - safeDist
    if (remaining < MIN_MOVE_DISTANCE) break

    _slideVel.x = _moveDir.x * remaining
    _slideVel.y = _moveDir.y * remaining
    _slideVel.z = _moveDir.z * remaining

    // OpenKCC order: apply angular damping FIRST, then project with magnitude preservation

    // Angular damping (OpenKCC: only damps angles > 120°)
    const damping = calculateAngularDamping(
      {x: nx, y: ny, z: nz},
      _moveDir,
      config.anglePower,
    )

    // Apply angular damping first (before projection)
    _slideVel.x *= damping
    _slideVel.y *= damping
    _slideVel.z *= damping

    // Save magnitude after damping for preservation
    const dampedMagnitude = Math.sqrt(
      _slideVel.x * _slideVel.x +
        _slideVel.y * _slideVel.y +
        _slideVel.z * _slideVel.z,
    )

    // Project onto plane (OpenKCC: GetBouncedMomentumSafe)
    // Rapier: Scale correction by (1 + 1e-5) to prevent floating-point accumulation
    const dot = _slideVel.x * nx + _slideVel.y * ny + _slideVel.z * nz
    const scaledDot = dot * CORRECTION_SCALE
    _slideVel.x = _slideVel.x - nx * scaledDot
    _slideVel.y = _slideVel.y - ny * scaledDot
    _slideVel.z = _slideVel.z - nz * scaledDot

    // Rapier: Apply normal nudge to prevent getting stuck in perpetual penetration
    _slideVel.x += nx * NORMAL_NUDGE_FACTOR
    _slideVel.y += ny * NORMAL_NUDGE_FACTOR
    _slideVel.z += nz * NORMAL_NUDGE_FACTOR

    // Restore magnitude after projection (OpenKCC momentum preservation)
    // OpenKCC: projected.normalized * originalMagnitude
    const projectedMagnitude = Math.sqrt(
      _slideVel.x * _slideVel.x +
        _slideVel.y * _slideVel.y +
        _slideVel.z * _slideVel.z,
    )

    if (projectedMagnitude > EPSILON) {
      // Normalize and restore the damped magnitude
      const scale = dampedMagnitude / projectedMagnitude
      _slideVel.x *= scale
      _slideVel.y *= scale
      _slideVel.z *= scale
    }
    // If projectedMagnitude <= EPSILON, projection resulted in near-zero vector
    // (head-on collision), leave velocity near-zero
  }

  return _moveResult
}

// ============================================
// Step Climbing
// ============================================

function attemptStepUp(
  rapierWorld: RAPIER.World,
  position: {x: number; y: number; z: number},
  velocity: {x: number; y: number; z: number},
  shape: RAPIER.Capsule,
  config: CharacterConfig,
  _selfCollider: RAPIER.Collider,
  target: {x: number; y: number; z: number},
): boolean {
  const hSpeed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z)
  if (hSpeed < MIN_MOVE_DISTANCE) return false

  // Note: staticFilterCallback already set by caller (moveAndSlide)

  // Check room above
  const upHit = rapierWorld.castShape(
    position,
    _identityRot,
    {x: 0, y: 1, z: 0},
    shape,
    0,
    config.stepHeight,
    true,
    undefined, // filterFlags
    undefined, // filterGroups
    undefined, // excludeCollider (handled by filter)
    undefined, // excludeRigidBody
    staticFilterCallback, // filterPredicate
  )

  if (upHit && upHit.time_of_impact < config.stepHeight - 0.01) {
    return false
  }

  // Cast horizontally at step height
  setVec3(_stepPos, position.x, position.y + config.stepHeight, position.z)

  const invSpeed = 1 / hSpeed
  setVec3(_moveDir, velocity.x * invSpeed, 0, velocity.z * invSpeed)

  const horizHit = rapierWorld.castShape(
    _stepPos,
    _identityRot,
    _moveDir,
    shape,
    0,
    hSpeed + config.stepMinWidth,
    true,
    undefined, // filterFlags
    undefined, // filterGroups
    undefined, // excludeCollider (handled by filter)
    undefined, // excludeRigidBody
    staticFilterCallback, // filterPredicate
  )

  if (horizHit && horizHit.time_of_impact < hSpeed) {
    return false
  }

  // Cast down to find step
  setVec3(
    _stepPos,
    position.x + velocity.x,
    position.y + config.stepHeight,
    position.z + velocity.z,
  )

  const downHit = rapierWorld.castShape(
    _stepPos,
    _identityRot,
    {x: 0, y: -1, z: 0},
    shape,
    0,
    config.stepHeight + config.skinWidth,
    true,
    undefined, // filterFlags
    undefined, // filterGroups
    undefined, // excludeCollider (handled by filter)
    undefined, // excludeRigidBody
    staticFilterCallback, // filterPredicate
  )

  if (!downHit) return false

  const slopeCos = Math.cos(config.maxSlopeAngle)
  if (downHit.normal1.y < slopeCos) return false

  // Position character just above step surface (minimal gap to avoid z-fighting)
  const stepUpAmount = config.stepHeight - downHit.time_of_impact + 0.001
  if (stepUpAmount < 0.01) return false

  target.x = velocity.x
  target.y = stepUpAmount
  target.z = velocity.z
  return true
}

// ============================================
// Ground Snapping
// ============================================

function snapToGround(
  rapierWorld: RAPIER.World,
  position: {x: number; y: number; z: number},
  shape: RAPIER.Capsule,
  config: CharacterConfig,
  _selfCollider: RAPIER.Collider,
  delta: number,
): number {
  // Note: staticFilterCallback already set by caller (characterControllerSystem)

  // OpenKCC: Snap distance = stepHeight * 2.0
  const snapDistance = config.stepHeight * 2.0

  const hit = rapierWorld.castShape(
    position,
    _identityRot,
    {x: 0, y: -1, z: 0},
    shape,
    0,
    snapDistance,
    true,
    undefined, // filterFlags
    undefined, // filterGroups
    undefined, // excludeCollider (handled by filter)
    undefined, // excludeRigidBody
    staticFilterCallback, // filterPredicate
  )

  if (!hit) return 0

  const slopeCos = Math.cos(config.maxSlopeAngle)
  if (hit.normal1.y < slopeCos) return 0

  const rawSnapDist = hit.time_of_impact - config.skinWidth
  if (rawSnapDist > EPSILON) {
    // OpenKCC: Limit snap speed to prevent jarring teleportation
    const maxSnapThisFrame = MAX_SNAP_DOWN_SPEED * delta
    const snapDist = Math.min(rawSnapDist, maxSnapThisFrame)
    return -snapDist
  }

  return 0
}

// ============================================
// Slope Velocity Projection
// ============================================

function projectOnSlope(
  velocity: {x: number; y: number; z: number},
  normal: {x: number; y: number; z: number},
  target: {x: number; y: number; z: number},
): void {
  // Save original values first (in case velocity === target)
  const vx = velocity.x
  const vy = velocity.y
  const vz = velocity.z

  const dot = vx * normal.x + vy * normal.y + vz * normal.z
  target.x = vx - normal.x * dot
  target.y = vy - normal.y * dot
  target.z = vz - normal.z * dot

  const origHorizSpeed = Math.sqrt(vx * vx + vz * vz)
  const newHorizSpeed = Math.sqrt(target.x * target.x + target.z * target.z)

  if (newHorizSpeed > 0.0001 && origHorizSpeed > 0.0001) {
    const scale = origHorizSpeed / newHorizSpeed
    target.x *= scale
    target.z *= scale
    target.y =
      -(target.x * normal.x + target.z * normal.z) / (normal.y + 0.0001)
  }
}

// ============================================
// Character Controller System
// ============================================

export function characterControllerSystem(
  world: World,
  rapierWorld: RAPIER.World,
  delta: number = 1 / 60,
) {
  const entities = world.query(characterSystemQuery)

  for (const entity of entities) {
    const shapeRef = entity.get(CharacterShapeRef)!
    const movement = entity.get(CharacterMovement)!
    const config = entity.get(CharacterControllerConfig)! as CharacterConfig
    const bodyRef = entity.get(RigidBodyRef)!
    const transform = entity.get(Transform)!

    const shape = shapeRef.shape
    const body = bodyRef.body

    if (!shape || !body) continue

    const collider = body.collider(0)

    // Set filter collider for all shape casts in this iteration
    setStaticFilterCollider(collider)

    let posX = transform.x
    let posY = transform.y
    let posZ = transform.z

    // ========================================
    // 1. GROUND DETECTION (first, to know if on platform)
    // ========================================
    let groundInfo = detectGround(
      rapierWorld,
      {x: posX, y: posY, z: posZ},
      shape,
      config,
      collider,
      movement.wasGroundedLastFrame,
    )

    // ========================================
    // 2. PLATFORM VELOCITY (detect before depenetration)
    // ========================================
    const platformEntity = getPlatformVelocity(
      groundInfo.collider,
      {x: posX, y: posY, z: posZ},
      _platformVel,
      movement.lastPlatformEntity,
      config.maxLaunchVelocity,
    )

    const onMovingPlatform =
      Math.abs(_platformVel.x) +
        Math.abs(_platformVel.y) +
        Math.abs(_platformVel.z) >
      0.0001

    // ========================================
    // 3. DEPENETRATION (skip on moving platforms and steep slopes)
    // ========================================
    // When standing on a moving platform, depenetration can incorrectly push
    // the character off platform edges as the platform moves.
    // When sliding on steep slopes, depenetration fights against slide velocity.
    const shouldDepenetrate = !onMovingPlatform && !groundInfo.sliding
    if (shouldDepenetrate) {
      depenetrate(
        rapierWorld,
        {x: posX, y: posY, z: posZ},
        shape,
        collider,
        _depenetratePos,
        config.mass,
        delta,
      )

      // If we moved during depenetration, update position and re-detect ground
      if (
        _depenetratePos.x !== 0 ||
        _depenetratePos.y !== 0 ||
        _depenetratePos.z !== 0
      ) {
        posX += _depenetratePos.x
        posY += _depenetratePos.y
        posZ += _depenetratePos.z

        // Re-detect ground after depenetration moved us
        groundInfo = detectGround(
          rapierWorld,
          {x: posX, y: posY, z: posZ},
          shape,
          config,
          collider,
          movement.wasGroundedLastFrame,
        )
      }
    }

    // ========================================
    // 4. COYOTE TIME & JUMP BUFFER
    // ========================================
    let coyoteCounter = movement.coyoteCounter
    let jumpBufferCounter = movement.jumpBufferCounter
    const jumpRequested = movement.jumpRequested

    // Update coyote counter
    if (groundInfo.grounded) {
      coyoteCounter = config.coyoteFrames
    } else if (coyoteCounter > 0) {
      coyoteCounter--
    }

    // Update jump buffer
    if (jumpRequested) {
      jumpBufferCounter = config.jumpBufferFrames
    } else if (jumpBufferCounter > 0) {
      jumpBufferCounter--
    }

    // Can jump if grounded OR within coyote time
    const canJump = groundInfo.grounded || coyoteCounter > 0
    // Should jump if can jump AND (jump requested OR buffered)
    const shouldJump = canJump && (jumpRequested || jumpBufferCounter > 0)

    // ========================================
    // 5. MOMENTUM TRANSFER (leaving platform)
    // ========================================
    let inheritedVx = movement.inheritedVx
    let inheritedVy = movement.inheritedVy
    let inheritedVz = movement.inheritedVz

    // If we just left a moving platform, inherit momentum
    const justLeftPlatform =
      movement.wasGroundedLastFrame && !groundInfo.grounded && onMovingPlatform
    if (justLeftPlatform) {
      inheritedVx = _platformVel.x * config.momentumTransferWeight
      inheritedVy = _platformVel.y * config.momentumTransferWeight
      inheritedVz = _platformVel.z * config.momentumTransferWeight
    }

    // Decay inherited momentum
    if (groundInfo.grounded) {
      // Fast decay when grounded
      inheritedVx *= 0.9
      inheritedVy = 0
      inheritedVz *= 0.9
    } else {
      // Slow decay when airborne (prevents infinite drift)
      inheritedVx *= 0.98
      inheritedVy *= 0.98
      inheritedVz *= 0.98
    }
    // Clear small values to prevent micro-drift
    if (Math.abs(inheritedVx) < 0.001) inheritedVx = 0
    if (Math.abs(inheritedVy) < 0.001) inheritedVy = 0
    if (Math.abs(inheritedVz) < 0.001) inheritedVz = 0

    // ========================================
    // 6. APPLY WEIGHT TO DYNAMIC GROUND
    // ========================================
    if (groundInfo.grounded && groundInfo.collider) {
      const groundBody = groundInfo.collider.parent()
      if (groundBody?.isDynamic()) {
        const gravity = 9.81
        _impulse.x = 0
        _impulse.y = (-config.mass * gravity) / 60
        _impulse.z = 0
        groundBody.applyImpulseAtPoint(_impulse, groundInfo.hitPoint, true)
      }
    }

    // ========================================
    // 7. BUILD TOTAL VELOCITY
    // ========================================
    // Start with input velocity
    const inputVy = movement.vy

    // Handle jump with buffer
    if (shouldJump && inputVy > 0) {
      // Jumping - consume coyote time and buffer
      coyoteCounter = 0
      jumpBufferCounter = 0
    }

    setVec3(
      _velocity,
      movement.vx + inheritedVx,
      inputVy + inheritedVy,
      movement.vz + inheritedVz,
    )

    // Add platform velocity if grounded on platform
    if (groundInfo.grounded && onMovingPlatform) {
      _velocity.x += _platformVel.x
      _velocity.y += _platformVel.y
      _velocity.z += _platformVel.z
    }

    // ========================================
    // 8. JUMP DIRECTION & MOMENTUM (OpenKCC approach)
    // ========================================
    // OpenKCC: jumpDirection = (surfaceNormal * weight) + (up * (1 - weight))
    // Also add half of current movement as horizontal momentum
    if (inputVy > 0.001 && (groundInfo.grounded || groundInfo.sliding)) {
      const weight = config.jumpAngleWeight

      // Use CURRENT frame ground info, not previous frame
      if (weight > 0 && groundInfo.normalY < 0.99 && groundInfo.normalY > 0.1) {
        // Blend between straight up (0,1,0) and surface normal
        const jumpDirX = groundInfo.normalX * weight
        const jumpDirY = groundInfo.normalY * weight + (1 - weight)
        const jumpDirZ = groundInfo.normalZ * weight

        // Normalize the blended direction
        const len = Math.sqrt(
          jumpDirX * jumpDirX + jumpDirY * jumpDirY + jumpDirZ * jumpDirZ,
        )
        if (len > EPSILON) {
          // Apply jump velocity in the blended direction
          // Preserve existing horizontal velocity, replace vertical with angled jump
          const jumpSpeed = inputVy
          _velocity.x += (jumpDirX / len) * jumpSpeed
          _velocity.y = (jumpDirY / len) * jumpSpeed
          _velocity.z += (jumpDirZ / len) * jumpSpeed
        }
      }
      // Always add horizontal momentum from current movement
      _velocity.x += movement.vx * 0.5
      _velocity.z += movement.vz * 0.5
    }

    // ========================================
    // 9. SLOPE PROJECTION
    // ========================================
    // Project velocity onto slope plane for smooth movement on slopes.
    // This applies to both grounded (walking) and sliding (steep slopes).
    // Don't project when jumping (preserve upward velocity).
    const isJumping = _velocity.y > 0.001
    if (
      (groundInfo.grounded || groundInfo.sliding) &&
      groundInfo.normalY < 0.99 &&
      groundInfo.normalY > 0.01 &&
      !isJumping
    ) {
      projectOnSlope(
        _velocity,
        {
          x: groundInfo.normalX,
          y: groundInfo.normalY,
          z: groundInfo.normalZ,
        },
        _velocity,
      )
    }

    // ========================================
    // 10. MOVE AND SLIDE
    // ========================================
    let finalMoveX = 0
    let finalMoveY = 0
    let finalMoveZ = 0
    let steppedUp = false

    if (onMovingPlatform && groundInfo.grounded && !isJumping) {
      // On platform - horizontal with collision, vertical follows platform
      setVec3(_horizVel, _velocity.x, 0, _velocity.z)
      setVec3(_charPos, posX, posY, posZ)
      const horizResult = moveAndSlide(
        rapierWorld,
        _charPos,
        _horizVel,
        shape,
        collider,
        config,
        groundInfo.grounded,
        false, // not jumping on platform
      )

      finalMoveX = horizResult.x
      finalMoveY = horizResult.y
      finalMoveZ = horizResult.z
      steppedUp = horizResult.steppedUp

      // Follow platform vertically
      finalMoveY += _platformVel.y
    } else {
      // Process full velocity through moveAndSlide
      setVec3(_charPos, posX, posY, posZ)
      const moveResult = moveAndSlide(
        rapierWorld,
        _charPos,
        _velocity,
        shape,
        collider,
        config,
        groundInfo.grounded,
        isJumping,
      )

      finalMoveX = moveResult.x
      finalMoveY = moveResult.y
      finalMoveZ = moveResult.z
      steppedUp = moveResult.steppedUp
    }

    // ========================================
    // 11. GROUND SNAPPING (OpenKCC conditions)
    // ========================================
    // Don't snap if:
    // - Stepped up this frame (avoid fighting with step-up)
    // - Jumping
    // - On moving platform (handled separately)
    // - Currently sliding on steep slope
    // - Was sliding last frame (avoid stutter when transitioning)
    // - Moved upward this frame
    const shouldSnapToGround =
      movement.wasGroundedLastFrame &&
      !steppedUp &&
      !isJumping &&
      !onMovingPlatform &&
      !groundInfo.sliding &&
      !movement.sliding && // was sliding last frame
      finalMoveY >= -EPSILON

    if (shouldSnapToGround) {
      const snapAmount = snapToGround(
        rapierWorld,
        {x: posX + finalMoveX, y: posY + finalMoveY, z: posZ + finalMoveZ},
        shape,
        config,
        collider,
        delta,
      )
      finalMoveY += snapAmount
    }

    // ========================================
    // 12. UPDATE MOVEMENT STATE
    // ========================================
    // Track visual Y for smooth step-up animation
    // On first frame, initialize to current physics Y
    // After that, visualY is updated by the smoothing system
    let visualY = movement.visualY
    let visualYInitialized = movement.visualYInitialized
    if (!visualYInitialized) {
      visualY = posY + finalMoveY
      visualYInitialized = true
    }

    entity.set(CharacterMovement, (m) => {
      m.vx = movement.vx
      m.vy = movement.vy
      m.vz = movement.vz
      m.mx = finalMoveX
      m.my = finalMoveY
      m.mz = finalMoveZ
      m.wasGroundedLastFrame = groundInfo.grounded || groundInfo.sliding
      m.grounded = groundInfo.grounded
      m.sliding = groundInfo.sliding
      m.groundNormalX = groundInfo.normalX
      m.groundNormalY = groundInfo.normalY
      m.groundNormalZ = groundInfo.normalZ
      m.groundDistance = groundInfo.distance
      m.platformVx = _platformVel.x
      m.platformVy = _platformVel.y
      m.platformVz = _platformVel.z
      m.lastPlatformEntity = platformEntity
      m.inheritedVx = inheritedVx
      m.inheritedVy = inheritedVy
      m.inheritedVz = inheritedVz
      m.coyoteCounter = coyoteCounter
      m.jumpBufferCounter = jumpBufferCounter
      m.jumpRequested = false // Clear after processing
      m.visualY = visualY
      m.visualYInitialized = visualYInitialized
      return m
    })

    // ========================================
    // 13. APPLY FINAL POSITION
    // ========================================
    setVec3(_finalPos, posX + finalMoveX, posY + finalMoveY, posZ + finalMoveZ)
    body.setNextKinematicTranslation(_finalPos)
  }
}

// ============================================
// Post-Step Depenetration
// ============================================

/**
 * Run after rapier.step() to push characters out of kinematic bodies
 * that moved into them during the physics step.
 */
export function characterPostStepSystem(
  world: World,
  rapierWorld: RAPIER.World,
  delta: number = 1 / 60,
) {
  const entities = world.query(characterSystemQuery)

  for (const entity of entities) {
    const shapeRef = entity.get(CharacterShapeRef)!
    const movement = entity.get(CharacterMovement)!
    const config = entity.get(CharacterControllerConfig)! as CharacterConfig
    const bodyRef = entity.get(RigidBodyRef)!

    const shape = shapeRef.shape
    const body = bodyRef.body

    if (!shape || !body) continue

    // Skip post-step depenetration when on a moving platform
    // The platform moved during step(), and depenetration would fight against
    // the intended platform-following behavior, causing jitter
    const onMovingPlatform =
      Math.abs(movement.platformVx) +
        Math.abs(movement.platformVy) +
        Math.abs(movement.platformVz) >
      0.0001

    if (onMovingPlatform && movement.grounded) continue

    const collider = body.collider(0)
    const pos = body.translation()

    // Set up position scratch object
    setVec3(_charPos, pos.x, pos.y, pos.z)

    // Push character out of any overlapping kinematic bodies
    depenetrate(
      rapierWorld,
      _charPos,
      shape,
      collider,
      _depenetratePos,
      config.mass,
      delta,
    )

    // Apply depenetration if needed
    if (
      Math.abs(_depenetratePos.x) > EPSILON ||
      Math.abs(_depenetratePos.y) > EPSILON ||
      Math.abs(_depenetratePos.z) > EPSILON
    ) {
      setVec3(
        _finalPos,
        pos.x + _depenetratePos.x,
        pos.y + _depenetratePos.y,
        pos.z + _depenetratePos.z,
      )
      body.setTranslation(_finalPos, true)

      // Also update the Transform trait
      entity.set(Transform, (t) => {
        t.x = _finalPos.x
        t.y = _finalPos.y
        t.z = _finalPos.z
        return t
      })
    }
  }
}

// ============================================
// Character Controller Creation
// ============================================

export function createCharacterController(
  world: World,
  _rapierWorld: RAPIER.World,
  RapierModule: {Capsule: typeof RAPIER.Capsule},
) {
  const entities = world.query(characterCreationQuery)

  for (const entity of entities) {
    // Skip if shape already exists
    if (entity.has(CharacterShapeRef) && entity.get(CharacterShapeRef)!.shape) {
      continue
    }

    const config = entity.get(CharacterControllerConfig)! as CharacterConfig

    const shape = new RapierModule.Capsule(
      config.capsuleHalfHeight,
      config.capsuleRadius,
    )

    const shapeData = {
      shape,
      halfHeight: config.capsuleHalfHeight,
      radius: config.capsuleRadius,
    }

    if (entity.has(CharacterShapeRef)) {
      entity.set(CharacterShapeRef, (ref) => {
        ref.shape = shapeData.shape
        ref.halfHeight = shapeData.halfHeight
        ref.radius = shapeData.radius
        return ref
      })
    } else {
      entity.add(CharacterShapeRef(shapeData))
    }
  }
}

// ============================================
// Character Controller Cleanup
// ============================================

export function cleanupCharacterController(entity: Entity) {
  if (!entity.has(CharacterShapeRef)) return

  entity.set(CharacterShapeRef, (ref) => {
    ref.shape = null
    return ref
  })
}
