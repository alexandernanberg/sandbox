import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import {setVec3} from '~/lib/math'
import type {
  JoltPhysicsSystem,
  JoltCharacterVirtual,
  JoltShape,
  JoltModule,
  JoltBroadPhaseLayerFilter,
  JoltObjectLayerFilter,
  JoltBodyFilter,
  JoltShapeFilter,
  JoltExtendedUpdateSettings,
  JoltVec3,
  JoltRVec3,
} from './jolt-types'
import {
  GROUND_STATE_ON_GROUND,
  GROUND_STATE_ON_STEEP_GROUND,
  LAYER_MOVING,
  BACK_FACE_MODE_COLLIDE,
  MOTION_TYPE_DYNAMIC,
} from './jolt-types'
import {
  RigidBodyRef,
  Transform,
  PhysicsInitialized,
  KinematicVelocity,
} from './traits'
import {getJolt, physicsWorld, getEntityForBodyId, isValidBodyID} from './world'

// ============================================
// Scratch objects for character movement
// ============================================

const _velocity = {x: 0, y: 0, z: 0}
const _platformVel = {x: 0, y: 0, z: 0}

// ============================================
// Cached filter objects (created once, reused)
// ============================================

interface CharacterFilters {
  broadPhaseFilter: JoltBroadPhaseLayerFilter
  objectLayerFilter: JoltObjectLayerFilter
  bodyFilter: JoltBodyFilter
  movementBodyFilter: JoltBodyFilter // Filter that ignores dynamic bodies for movement
  shapeFilter: JoltShapeFilter
  updateSettings: JoltExtendedUpdateSettings // Normal walking with floor sticking
  updateSettingsNoStick: JoltExtendedUpdateSettings // For jumping (no floor sticking)
  velocityVec: JoltVec3 // Cached Vec3 for velocity (avoids per-frame allocation)
  impulseVec: JoltVec3 // Cached Vec3 for push impulses (avoids per-contact allocation)
  contactPosRVec: JoltRVec3 // Cached RVec3 for contact position (for impulse at point)
}

let cachedFilters: CharacterFilters | null = null

function getOrCreateFilters(Jolt: JoltModule): CharacterFilters {
  if (cachedFilters) {
    return cachedFilters
  }

  // Use the stored filter objects from physics world initialization
  // These are the same objects used to configure JoltSettings
  const {objectVsBroadPhaseLayerFilter, objectLayerPairFilter} = physicsWorld

  if (!objectVsBroadPhaseLayerFilter || !objectLayerPairFilter) {
    throw new Error('Physics world not initialized - missing filter objects')
  }

  // Create filters using the stored filter objects (like the official Jolt examples)
  // Cast to proper types - the stored objects are already the correct Jolt types
  const broadPhaseFilter = new Jolt.DefaultBroadPhaseLayerFilter(
    objectVsBroadPhaseLayerFilter,
    LAYER_MOVING,
  ) as JoltBroadPhaseLayerFilter
  const objectLayerFilter = new Jolt.DefaultObjectLayerFilter(
    objectLayerPairFilter,
    LAYER_MOVING,
  ) as JoltObjectLayerFilter
  const bodyFilter = new Jolt.BodyFilter()
  const shapeFilter = new Jolt.ShapeFilter()

  // Create a body filter that ignores dynamic bodies for character movement
  // This allows the KCC to pass through dynamic objects instead of being pushed by them
  const movementBodyFilter = new Jolt.BodyFilterJS()
  movementBodyFilter.ShouldCollide = (inBodyID: number) => {
    const bi = physicsWorld.bodyInterface
    if (!bi) return true
    // Create BodyID from the number to use with GetMotionType
    const bodyId = new Jolt.BodyID(inBodyID)
    const motionType = bi.GetMotionType(bodyId)
    Jolt.destroy(bodyId)
    // Only collide with non-dynamic bodies (static and kinematic)
    return motionType !== MOTION_TYPE_DYNAMIC
  }
  movementBodyFilter.ShouldCollideLocked = (_inBody: number) => {
    // This is called with a Body pointer, but we can't easily check motion type here
    // Return true and let ShouldCollide handle the filtering
    return true
  }

  // Configure ExtendedUpdateSettings for floor sticking and stair walking
  const updateSettings = new Jolt.ExtendedUpdateSettings()
  // Step down to stick to floor (prevents floating after slopes)
  const stickToFloor = new Jolt.Vec3(0, -0.5, 0)
  updateSettings.mStickToFloorStepDown = stickToFloor
  // Step up for stairs
  const walkStairs = new Jolt.Vec3(0, 0.4, 0)
  updateSettings.mWalkStairsStepUp = walkStairs

  // Create second settings without floor sticking (for jumping)
  const updateSettingsNoStick = new Jolt.ExtendedUpdateSettings()
  const noStick = new Jolt.Vec3(0, 0, 0)
  updateSettingsNoStick.mStickToFloorStepDown = noStick
  updateSettingsNoStick.mWalkStairsStepUp = walkStairs // Keep stair walking

  // Clean up temp vectors (values are copied)
  Jolt.destroy(stickToFloor)
  Jolt.destroy(walkStairs)
  Jolt.destroy(noStick)

  // Create reusable Vec3 for velocity updates (avoids per-frame allocation)
  const velocityVec = new Jolt.Vec3(0, 0, 0)

  // Create reusable Vec3 for push impulses (avoids per-contact allocation)
  const impulseVec = new Jolt.Vec3(0, 0, 0)

  // Create reusable RVec3 for contact position (for impulse at point)
  const contactPosRVec = new Jolt.RVec3(0, 0, 0)

  cachedFilters = {
    broadPhaseFilter,
    objectLayerFilter,
    bodyFilter,
    movementBodyFilter,
    shapeFilter,
    updateSettings,
    updateSettingsNoStick,
    velocityVec,
    impulseVec,
    contactPosRVec,
  }

  return cachedFilters
}

export function destroyCharacterFilters(): void {
  if (!cachedFilters) return
  const Jolt = getJolt()
  Jolt.destroy(cachedFilters.broadPhaseFilter)
  Jolt.destroy(cachedFilters.objectLayerFilter)
  Jolt.destroy(cachedFilters.bodyFilter)
  Jolt.destroy(cachedFilters.movementBodyFilter)
  Jolt.destroy(cachedFilters.shapeFilter)
  Jolt.destroy(cachedFilters.updateSettings)
  Jolt.destroy(cachedFilters.updateSettingsNoStick)
  Jolt.destroy(cachedFilters.velocityVec)
  Jolt.destroy(cachedFilters.impulseVec)
  Jolt.destroy(cachedFilters.contactPosRVec)
  cachedFilters = null
}

// ============================================
// Constants
// ============================================

// Reserved for future use
const _EPSILON = 0.001

// ============================================
// Character Controller Traits
// ============================================

// Runtime reference to Jolt CharacterVirtual
export const CharacterShapeRef = trait(() => ({
  character: null as JoltCharacterVirtual | null,
  shape: null as JoltShape | null,
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
  groundedThreshold: 0.15,
  groundSnapDistance: 0.2,

  // Slope/step
  maxSlopeAngle: Math.PI / 4, // 45 degrees
  stepHeight: 0.35,
  stepMinWidth: 0.1,

  // Movement
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
  pushMultiplier: 0.15, // Multiplier for push impulse strength (higher = stronger push)
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
  pushMultiplier: number
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
  // Visual Y position for smooth step-up
  visualY: 0,
  visualYInitialized: false,
})

// Tag for character controllers
export const IsCharacterController = trait()

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
// Platform Velocity
// ============================================

function getPlatformVelocity(
  Jolt: JoltModule,
  character: JoltCharacterVirtual,
  charPos: {x: number; y: number; z: number},
  target: {x: number; y: number; z: number},
  lastPlatformEntity: Entity | null,
  maxVelocity: number,
): Entity | null {
  setVec3(target, 0, 0, 0)

  // Check if standing on ground
  const groundState = character.GetGroundState()
  if (groundState !== GROUND_STATE_ON_GROUND) {
    return null
  }

  // Get ground body
  const groundBodyId = character.GetGroundBodyID()
  if (!isValidBodyID(groundBodyId)) {
    return null
  }

  // Get entity for this body
  const platformEntity = getEntityForBodyId(groundBodyId)
  if (!platformEntity) {
    return null
  }

  // Check if it's kinematic with velocity
  const entity = platformEntity
  if (!entity.has(KinematicVelocity)) {
    return null
  }

  const vel = entity.get(KinematicVelocity)!

  // KinematicVelocity stores velocity per physics step (1/60s)
  // Character velocity is in m/s, so multiply by step rate to convert
  const PHYSICS_STEP_RATE = 60

  // Start with linear velocity (convert from per-step to per-second)
  target.x = vel.x * PHYSICS_STEP_RATE
  target.y = vel.y * PHYSICS_STEP_RATE
  target.z = vel.z * PHYSICS_STEP_RATE

  // Add tangential velocity from angular rotation
  // tangential = ω × r (cross product of angular velocity and relative position)
  const hasAngularVel =
    Math.abs(vel.ax) > 0.0001 ||
    Math.abs(vel.ay) > 0.0001 ||
    Math.abs(vel.az) > 0.0001

  if (hasAngularVel && entity.has(Transform)) {
    const platformTransform = entity.get(Transform)!
    // Calculate position relative to platform center
    const rx = charPos.x - platformTransform.x
    const ry = charPos.y - platformTransform.y
    const rz = charPos.z - platformTransform.z

    // Cross product: tangential = ω × r (convert from per-step to per-second)
    // tangentialX = ωy * rz - ωz * ry
    // tangentialY = ωz * rx - ωx * rz
    // tangentialZ = ωx * ry - ωy * rx
    target.x += (vel.ay * rz - vel.az * ry) * PHYSICS_STEP_RATE
    target.y += (vel.az * rx - vel.ax * rz) * PHYSICS_STEP_RATE
    target.z += (vel.ax * ry - vel.ay * rx) * PHYSICS_STEP_RATE
  }

  // Clamp to max velocity
  const speed = Math.sqrt(
    target.x * target.x + target.y * target.y + target.z * target.z,
  )
  if (speed > maxVelocity) {
    const scale = maxVelocity / speed
    target.x *= scale
    target.y *= scale
    target.z *= scale
  }

  return entity
}

// ============================================
// Character Controller System
// ============================================

export function characterControllerSystem(
  world: World,
  physicsSystem: JoltPhysicsSystem,
  delta: number = 1 / 60,
) {
  const Jolt = getJolt()
  const entities = world.query(characterSystemQuery)

  for (const entity of entities) {
    const shapeRef = entity.get(CharacterShapeRef)!
    const movement = entity.get(CharacterMovement)!
    const config = entity.get(CharacterControllerConfig)! as CharacterConfig
    const transform = entity.get(Transform)!

    const character = shapeRef.character
    if (!character) continue

    // Get current position
    const posX = transform.x
    const posY = transform.y
    const posZ = transform.z

    // Get platform velocity
    const platformEntity = getPlatformVelocity(
      Jolt,
      character,
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

    // Check ground state
    const groundState = character.GetGroundState()
    const isGrounded = groundState === GROUND_STATE_ON_GROUND
    const isSliding = groundState === GROUND_STATE_ON_STEEP_GROUND

    // Get ground normal
    let groundNormalX = 0
    let groundNormalY = 1
    let groundNormalZ = 0
    if (isGrounded || isSliding) {
      const normal = character.GetGroundNormal()
      groundNormalX = normal.GetX()
      groundNormalY = normal.GetY()
      groundNormalZ = normal.GetZ()
    }

    // Apply character weight to dynamic ground (makes crates sink under character)
    const groundBodyInterface = physicsWorld.bodyInterface
    if (isGrounded && groundBodyInterface) {
      const groundBodyId = character.GetGroundBodyID()
      if (
        isValidBodyID(groundBodyId) &&
        groundBodyInterface.GetMotionType(groundBodyId) === MOTION_TYPE_DYNAMIC
      ) {
        // Get or create cached filters for the impulse vec
        const filters = getOrCreateFilters(Jolt)
        // Apply weight as a force: F = m * g (gravity is negative, so weight pushes down)
        const gravity = physicsSystem.GetGravity()
        const weightForce = config.mass * gravity.GetY() // Negative value
        filters.impulseVec.Set(0, weightForce, 0)
        groundBodyInterface.AddForce(
          groundBodyId,
          filters.impulseVec,
          Jolt.EActivation_Activate,
        )
      }
    }

    // Coyote time and jump buffer
    let coyoteCounter = movement.coyoteCounter
    let jumpBufferCounter = movement.jumpBufferCounter
    const jumpRequested = movement.jumpRequested

    if (isGrounded) {
      coyoteCounter = config.coyoteFrames
    } else if (coyoteCounter > 0) {
      coyoteCounter--
    }

    if (jumpRequested) {
      jumpBufferCounter = config.jumpBufferFrames
    } else if (jumpBufferCounter > 0) {
      jumpBufferCounter--
    }

    const canJump = isGrounded || coyoteCounter > 0
    const shouldJump = canJump && (jumpRequested || jumpBufferCounter > 0)

    // Momentum transfer from platforms
    let inheritedVx = movement.inheritedVx
    let inheritedVy = movement.inheritedVy
    let inheritedVz = movement.inheritedVz

    const justLeftPlatform =
      movement.wasGroundedLastFrame && !isGrounded && onMovingPlatform
    if (justLeftPlatform) {
      inheritedVx = _platformVel.x * config.momentumTransferWeight
      inheritedVy = _platformVel.y * config.momentumTransferWeight
      inheritedVz = _platformVel.z * config.momentumTransferWeight
    }

    // Decay inherited momentum
    if (isGrounded) {
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

    // Get character's current velocity (includes accumulated velocity from previous frames)
    const currentVel = character.GetLinearVelocity()
    const charVx = currentVel.GetX()
    const charVy = currentVel.GetY()
    const charVz = currentVel.GetZ()

    // Get gravity from physics system
    const gravity = physicsSystem.GetGravity()
    const gravityY = gravity.GetY() // Usually negative (e.g., -9.81)

    // Build new velocity following Jolt's pattern:
    // 1. Start with ground velocity if grounded, else current velocity
    // 2. Apply gravity (delta * gravity)
    // 3. Add player input for horizontal movement
    // 4. Handle jumping

    let newVx: number
    let newVy: number
    let newVz: number

    if (isGrounded && !isSliding) {
      // When grounded: start fresh with ground velocity
      const groundVel = character.GetGroundVelocity()
      newVx = groundVel.GetX()
      newVy = groundVel.GetY()
      newVz = groundVel.GetZ()

      // Apply gravity to keep grounded (small downward force)
      newVy += gravityY * delta
    } else {
      // When airborne: preserve current velocity
      newVx = charVx
      newVy = charVy
      newVz = charVz

      // Apply gravity (this is how gravity accumulates!)
      newVy += gravityY * delta
    }

    // Apply player horizontal input (always - allows air control)
    newVx = movement.vx + inheritedVx
    newVz = movement.vz + inheritedVz

    // Add platform velocity if on moving platform
    if (isGrounded && onMovingPlatform) {
      newVx += _platformVel.x
      newVz += _platformVel.z
    }

    // Handle jumping - override vertical velocity
    let justJumped = false
    if (shouldJump && movement.vy > 0) {
      newVy = movement.vy
      coyoteCounter = 0
      jumpBufferCounter = 0
      justJumped = true
    }

    // Get or create cached filters (includes reusable Vec3)
    const filters = getOrCreateFilters(Jolt)

    // Apply velocity to character using cached Vec3 (avoids per-frame allocation)
    filters.velocityVec.Set(newVx, newVy, newVz)
    character.SetLinearVelocity(filters.velocityVec)

    // Get temp allocator (must exist if physics is initialized)
    const tempAllocator = physicsWorld.tempAllocator
    if (!tempAllocator) continue

    // Choose update settings based on whether we're jumping
    // When jumping or moving upward, disable floor sticking to prevent being pulled back down
    const isMovingUp = newVy > 0.1
    const useNoStickSettings = justJumped || isMovingUp

    // Use ExtendedUpdate for floor sticking and stair walking
    // NOTE: ExtendedUpdate does NOT apply gravity - we did that above!
    // It handles: collision response, floor sticking, stair walking
    // Use movementBodyFilter to ignore dynamic bodies - KCC should pass through them, not be pushed
    character.ExtendedUpdate(
      delta,
      gravity,
      useNoStickSettings
        ? filters.updateSettingsNoStick
        : filters.updateSettings,
      filters.broadPhaseFilter,
      filters.objectLayerFilter,
      filters.movementBodyFilter, // Ignore dynamic bodies during movement
      filters.shapeFilter,
      tempAllocator,
    )

    // Refresh contacts with normal filter to detect dynamic bodies for pushing
    character.RefreshContacts(
      filters.broadPhaseFilter,
      filters.objectLayerFilter,
      filters.bodyFilter, // Include dynamic bodies
      filters.shapeFilter,
      tempAllocator,
    )

    // Push dynamic bodies that the character contacts
    const bodyInterface = physicsWorld.bodyInterface
    if (bodyInterface) {
      const contacts = character.GetActiveContacts()
      const numContacts = contacts.size()
      const charVel = character.GetLinearVelocity()
      const charVelX = charVel.GetX()
      const charVelZ = charVel.GetZ()

      // Only compute push if character is moving horizontally
      const charSpeed = Math.sqrt(charVelX * charVelX + charVelZ * charVelZ)
      if (charSpeed > 0.1) {
        // Push strength: impulse = mass * velocity_change
        // We want to transfer a fraction of character's momentum to the body
        const pushStrength = config.mass * config.pushMultiplier

        for (let i = 0; i < numContacts; i++) {
          const contact = contacts.at(i)
          const contactBodyId = contact.mBodyB

          // Only push dynamic bodies
          if (
            bodyInterface.GetMotionType(contactBodyId) === MOTION_TYPE_DYNAMIC
          ) {
            // Get contact normal to check if we're pushing into the body
            const contactNormal = contact.mContactNormal
            const normalX = contactNormal.GetX()
            const normalZ = contactNormal.GetZ()

            // Dot product of velocity and contact normal (negative = pushing into body)
            const dot = charVelX * normalX + charVelZ * normalZ
            if (dot < -0.1) {
              // Calculate impulse - project velocity onto contact plane
              // This gives more realistic pushing at angles
              const impulseX = charVelX * pushStrength
              const impulseZ = charVelZ * pushStrength

              // Get contact position for realistic torque (objects tip when pushed off-center)
              const contactPos = contact.mPosition
              filters.contactPosRVec.Set(
                contactPos.GetX(),
                contactPos.GetY(),
                contactPos.GetZ(),
              )

              // Reuse cached Vec3 for impulse (no allocation)
              filters.impulseVec.Set(impulseX, 0, impulseZ)
              bodyInterface.AddImpulse(
                contactBodyId,
                filters.impulseVec,
                filters.contactPosRVec,
              )
            }
          }
        }
      }
    }

    // Get new position
    const newPos = character.GetPosition()
    const finalMoveX = newPos.GetX() - posX
    const finalMoveY = newPos.GetY() - posY
    const finalMoveZ = newPos.GetZ() - posZ

    // Initialize visual Y
    let visualY = movement.visualY
    let visualYInitialized = movement.visualYInitialized
    if (!visualYInitialized) {
      visualY = newPos.GetY()
      visualYInitialized = true
    }

    // Update movement state
    entity.set(CharacterMovement, (m) => {
      m.vx = movement.vx
      m.vy = movement.vy
      m.vz = movement.vz
      m.mx = finalMoveX
      m.my = finalMoveY
      m.mz = finalMoveZ
      m.wasGroundedLastFrame = isGrounded || isSliding
      m.grounded = isGrounded
      m.sliding = isSliding
      m.groundNormalX = groundNormalX
      m.groundNormalY = groundNormalY
      m.groundNormalZ = groundNormalZ
      m.groundDistance = 0
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

    // Update transform
    entity.set(Transform, (t) => {
      t.x = newPos.GetX()
      t.y = newPos.GetY()
      t.z = newPos.GetZ()
      return t
    })
  }
}

// ============================================
// Post-Step System
// ============================================

export function characterPostStepSystem(
  _world: World,
  _physicsSystem: JoltPhysicsSystem,
  _delta: number = 1 / 60,
) {
  // Jolt's CharacterVirtual handles depenetration internally
  // No additional post-step work needed
}

// ============================================
// Character Controller Creation
// ============================================

export function createCharacterController(
  world: World,
  physicsSystem: JoltPhysicsSystem,
  Jolt: JoltModule,
) {
  const entities = world.query(characterCreationQuery)

  for (const entity of entities) {
    // Skip if character already exists
    if (
      entity.has(CharacterShapeRef) &&
      entity.get(CharacterShapeRef)!.character
    ) {
      continue
    }

    const config = entity.get(CharacterControllerConfig)! as CharacterConfig
    const transform = entity.get(Transform)!

    // Create capsule shape using direct constructor
    // CapsuleShape(halfHeight, radius, material?)
    const shape = new Jolt.CapsuleShape(
      config.capsuleHalfHeight,
      config.capsuleRadius,
    )

    // Create character settings
    const settings = new Jolt.CharacterVirtualSettings()
    settings.mMass = config.mass
    settings.mMaxSlopeAngle = config.maxSlopeAngle
    settings.mShape = shape
    settings.mBackFaceMode = BACK_FACE_MODE_COLLIDE
    settings.mCharacterPadding = config.skinWidth
    settings.mPenetrationRecoverySpeed = 1.0
    settings.mPredictiveContactDistance = 0.1

    // Create character
    const position = new Jolt.RVec3(transform.x, transform.y, transform.z)
    const rotation = new Jolt.Quat(0, 0, 0, 1)

    const character = new Jolt.CharacterVirtual(
      settings,
      position,
      rotation,
      physicsSystem,
    )

    // Cleanup
    Jolt.destroy(settings)
    Jolt.destroy(position)
    Jolt.destroy(rotation)

    // Store reference
    const shapeData = {
      character,
      shape,
      halfHeight: config.capsuleHalfHeight,
      radius: config.capsuleRadius,
    }

    if (entity.has(CharacterShapeRef)) {
      entity.set(CharacterShapeRef, (ref) => {
        ref.character = shapeData.character
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
// Cleanup
// ============================================

export function cleanupCharacterController(entity: Entity) {
  if (!entity.has(CharacterShapeRef)) return

  const Jolt = getJolt()
  const shapeRef = entity.get(CharacterShapeRef)!

  if (shapeRef.character) {
    Jolt.destroy(shapeRef.character)
  }
  if (shapeRef.shape) {
    shapeRef.shape.Release()
  }

  entity.set(CharacterShapeRef, (ref) => {
    ref.character = null
    ref.shape = null
    return ref
  })
}
