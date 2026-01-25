import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
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
const _movement = {x: 0, y: 0, z: 0}

// ============================================
// Rapier KCC Traits
// ============================================

// Runtime reference to Rapier's built-in character controller
export const RapierKCCRef = trait(() => ({
  controller: null as RAPIER.KinematicCharacterController | null,
}))

// Configuration for character controller
export const CharacterControllerConfig = trait({
  // Capsule dimensions
  capsuleHalfHeight: 0.5,
  capsuleRadius: 0.5,

  // Ground detection
  skinWidth: 0.02,
  groundCheckDistance: 0.5,
  groundedThreshold: 0.15,
  groundSnapDistance: 0.2,

  // Slope/step
  maxSlopeAngle: Math.PI / 4, // 45 degrees
  stepHeight: 0.35,
  stepMinWidth: 0.1,

  // Movement - not used by Rapier KCC but kept for compatibility
  maxBounces: 12,
  anglePower: 2.0,

  // Jump
  jumpAngleWeight: 0.4,

  // Platform
  maxLaunchVelocity: 10.0,
  momentumTransferWeight: 0.8,

  // Timing (in physics frames at 60fps)
  coyoteFrames: 6,
  jumpBufferFrames: 6,

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

// Movement state for character - same interface as custom KCC
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
  sliding: false,
  groundNormalX: 0,
  groundNormalY: 1,
  groundNormalZ: 0,
  groundDistance: 0,
  // Platform tracking
  platformVx: 0,
  platformVy: 0,
  platformVz: 0,
  lastPlatformEntity: null as Entity | null,
  // Inherited momentum
  inheritedVx: 0,
  inheritedVy: 0,
  inheritedVz: 0,
  // Timing
  coyoteCounter: 0,
  jumpBufferCounter: 0,
  jumpRequested: false,
  // Visual Y for smooth step-up animation
  visualY: 0,
  visualYInitialized: false,
})

// Tag for entities that are character controllers
export const IsCharacterController = trait()

// ============================================
// Cached Queries
// ============================================

const characterSystemQuery = createQuery(
  RapierKCCRef,
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

  // Fall back to last platform ONLY if airborne
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
// Character Controller System (Rapier Built-in KCC)
// ============================================

export function characterControllerSystem(
  world: World,
  rapierWorld: RAPIER.World,
  _delta: number = 1 / 60,
) {
  const entities = world.query(characterSystemQuery)

  for (const entity of entities) {
    const kccRef = entity.get(RapierKCCRef)!
    const movement = entity.get(CharacterMovement)!
    const config = entity.get(CharacterControllerConfig)! as CharacterConfig
    const bodyRef = entity.get(RigidBodyRef)!
    const transform = entity.get(Transform)!

    const controller = kccRef.controller
    const body = bodyRef.body

    if (!controller || !body) continue

    const collider = body.collider(0)

    const posX = transform.x
    const posY = transform.y
    const posZ = transform.z

    // ========================================
    // 1. COYOTE TIME & JUMP BUFFER
    // ========================================
    let coyoteCounter = movement.coyoteCounter
    let jumpBufferCounter = movement.jumpBufferCounter
    const jumpRequested = movement.jumpRequested

    // Update coyote counter
    if (movement.grounded) {
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
    const canJump = movement.grounded || coyoteCounter > 0
    // Should jump if can jump AND (jump requested OR buffered)
    const shouldJump = canJump && (jumpRequested || jumpBufferCounter > 0)

    // ========================================
    // 2. MOMENTUM TRANSFER (leaving platform)
    // ========================================
    let inheritedVx = movement.inheritedVx
    let inheritedVy = movement.inheritedVy
    let inheritedVz = movement.inheritedVz

    // Get platform velocity from previous frame
    const onMovingPlatform =
      Math.abs(movement.platformVx) +
        Math.abs(movement.platformVy) +
        Math.abs(movement.platformVz) >
      0.0001

    // If we just left a moving platform, inherit momentum
    const justLeftPlatform =
      movement.wasGroundedLastFrame && !movement.grounded && onMovingPlatform
    if (justLeftPlatform) {
      inheritedVx = movement.platformVx * config.momentumTransferWeight
      inheritedVy = movement.platformVy * config.momentumTransferWeight
      inheritedVz = movement.platformVz * config.momentumTransferWeight
    }

    // Decay inherited momentum
    if (movement.grounded) {
      inheritedVx *= 0.9
      inheritedVy = 0
      inheritedVz *= 0.9
    } else {
      inheritedVx *= 0.98
      inheritedVy *= 0.98
      inheritedVz *= 0.98
    }
    if (Math.abs(inheritedVx) < 0.001) inheritedVx = 0
    if (Math.abs(inheritedVy) < 0.001) inheritedVy = 0
    if (Math.abs(inheritedVz) < 0.001) inheritedVz = 0

    // ========================================
    // 3. BUILD TOTAL VELOCITY
    // ========================================
    const inputVy = movement.vy

    // Handle jump with buffer
    if (shouldJump && inputVy > 0) {
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
    if (movement.grounded && onMovingPlatform) {
      _velocity.x += movement.platformVx
      _velocity.y += movement.platformVy
      _velocity.z += movement.platformVz
    }

    // ========================================
    // 4. COMPUTE MOVEMENT WITH RAPIER KCC
    // ========================================
    const isJumping = _velocity.y > 0.001

    // Configure controller based on state
    controller.enableAutostep(
      config.stepHeight,
      config.stepMinWidth,
      true, // Include dynamic bodies
    )
    controller.enableSnapToGround(
      movement.grounded && !isJumping ? config.stepHeight * 2 : 0,
    )

    // Compute the desired movement
    const desiredTranslation = {
      x: _velocity.x,
      y: _velocity.y,
      z: _velocity.z,
    }

    controller.computeColliderMovement(
      collider,
      desiredTranslation,
      undefined, // filterFlags
      undefined, // filterGroups
      (otherCollider) => {
        // Filter out sensors
        return !otherCollider.isSensor()
      },
    )

    // Get the corrected movement from Rapier
    const correctedMovement = controller.computedMovement()
    setVec3(
      _movement,
      correctedMovement.x,
      correctedMovement.y,
      correctedMovement.z,
    )

    // ========================================
    // 5. GROUND DETECTION (after computing movement)
    // ========================================
    const grounded = controller.computedGrounded()

    // Detect sliding based on movement vs desired
    // If we're grounded but moving significantly different than input, we might be on a slope
    let sliding = false
    let groundNormalX = 0
    let groundNormalY = 1
    let groundNormalZ = 0

    // Check collisions for ground normal
    const numCollisions = controller.numComputedCollisions()
    for (let i = 0; i < numCollisions; i++) {
      const collision = controller.computedCollision(i)
      if (collision) {
        const normal = collision.normal1
        // Floor collision (normal pointing up)
        if (normal.y > 0.1) {
          groundNormalX = normal.x
          groundNormalY = normal.y
          groundNormalZ = normal.z

          // Check if too steep (sliding)
          const slopeCos = Math.cos(config.maxSlopeAngle)
          if (normal.y < slopeCos && normal.y > 0.1) {
            sliding = true
          }
        }
      }
    }

    // ========================================
    // 6. PLATFORM VELOCITY (for next frame)
    // ========================================
    // Find ground collider from collisions
    let groundCollider: RAPIER.Collider | null = null
    for (let i = 0; i < numCollisions; i++) {
      const collision = controller.computedCollision(i)
      if (collision && collision.normal1.y > 0.5) {
        groundCollider = collision.collider
        break
      }
    }

    const platformEntity = getPlatformVelocity(
      groundCollider,
      {x: posX, y: posY, z: posZ},
      _platformVel,
      movement.lastPlatformEntity,
      config.maxLaunchVelocity,
    )

    // ========================================
    // 7. UPDATE MOVEMENT STATE
    // ========================================
    let visualY = movement.visualY
    let visualYInitialized = movement.visualYInitialized
    if (!visualYInitialized) {
      visualY = posY + _movement.y
      visualYInitialized = true
    }

    entity.set(CharacterMovement, (m) => {
      m.vx = movement.vx
      m.vy = movement.vy
      m.vz = movement.vz
      m.mx = _movement.x
      m.my = _movement.y
      m.mz = _movement.z
      m.wasGroundedLastFrame = grounded || sliding
      m.grounded = grounded && !sliding
      m.sliding = sliding
      m.groundNormalX = groundNormalX
      m.groundNormalY = groundNormalY
      m.groundNormalZ = groundNormalZ
      m.groundDistance = 0 // Rapier KCC doesn't expose this directly
      m.platformVx = _platformVel.x
      m.platformVy = _platformVel.y
      m.platformVz = _platformVel.z
      m.lastPlatformEntity = platformEntity
      m.inheritedVx = inheritedVx
      m.inheritedVy = inheritedVy
      m.inheritedVz = inheritedVz
      m.coyoteCounter = coyoteCounter
      m.jumpBufferCounter = jumpBufferCounter
      m.jumpRequested = false
      m.visualY = visualY
      m.visualYInitialized = visualYInitialized
      return m
    })

    // ========================================
    // 8. APPLY FINAL POSITION
    // ========================================
    const finalPos = {
      x: posX + _movement.x,
      y: posY + _movement.y,
      z: posZ + _movement.z,
    }
    body.setNextKinematicTranslation(finalPos)
  }
}

// ============================================
// Post-Step System (minimal for Rapier KCC)
// ============================================

export function characterPostStepSystem(
  _world: World,
  _rapierWorld: RAPIER.World,
  _delta: number = 1 / 60,
) {
  // Rapier's built-in KCC handles depenetration internally
  // No additional post-step processing needed
}

// ============================================
// Character Controller Creation
// ============================================

export function createCharacterController(
  world: World,
  rapierWorld: RAPIER.World,
  _RapierModule: {Capsule: unknown},
) {
  const entities = world.query(characterCreationQuery)

  for (const entity of entities) {
    // Skip if controller already exists
    if (entity.has(RapierKCCRef) && entity.get(RapierKCCRef)!.controller) {
      continue
    }

    const config = entity.get(CharacterControllerConfig)! as CharacterConfig

    // Create Rapier's built-in character controller
    const controller = rapierWorld.createCharacterController(config.skinWidth)

    // Configure the controller
    controller.setMaxSlopeClimbAngle(config.maxSlopeAngle)
    controller.setMinSlopeSlideAngle(config.maxSlopeAngle)
    controller.enableAutostep(config.stepHeight, config.stepMinWidth, true)
    controller.enableSnapToGround(config.stepHeight * 2)
    controller.setApplyImpulsesToDynamicBodies(true)
    controller.setCharacterMass(config.mass)

    // Add or update the KCC ref
    if (entity.has(RapierKCCRef)) {
      entity.set(RapierKCCRef, (ref) => {
        ref.controller = controller
        return ref
      })
    } else {
      entity.add(RapierKCCRef({controller}))
    }
  }
}

// ============================================
// Character Controller Cleanup
// ============================================

export function cleanupCharacterController(
  entity: Entity,
  rapierWorld: RAPIER.World,
) {
  if (!entity.has(RapierKCCRef)) return

  const kccRef = entity.get(RapierKCCRef)!
  if (kccRef.controller) {
    rapierWorld.removeCharacterController(kccRef.controller)
    entity.set(RapierKCCRef, (ref) => {
      ref.controller = null
      return ref
    })
  }
}
