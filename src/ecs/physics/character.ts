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
  JoltCharacterContactListener,
} from './jolt-types'
import {
  GROUND_STATE_ON_GROUND,
  GROUND_STATE_ON_STEEP_GROUND,
  LAYER_MOVING,
  BACK_FACE_MODE_COLLIDE,
  MOTION_TYPE_DYNAMIC,
  MOTION_TYPE_KINEMATIC,
} from './jolt-types'
import {RigidBodyRef, Transform, PhysicsInitialized} from './traits'
import {
  getJolt,
  physicsWorld,
  getEntityForBodyId,
  isValidBodyID,
  getJoltInterface,
} from './world'

// ============================================
// Scratch objects for character movement
// ============================================

const _velocity = {x: 0, y: 0, z: 0}

// Flag to allow sliding when player is actively moving (prevents OnContactSolve from zeroing velocity)
let _allowSliding = false

// ============================================
// Cached filter objects (created once, reused)
// ============================================

interface CharacterFilters {
  broadPhaseFilter: JoltBroadPhaseLayerFilter
  objectLayerFilter: JoltObjectLayerFilter
  bodyFilter: JoltBodyFilter
  shapeFilter: JoltShapeFilter
  updateSettings: JoltExtendedUpdateSettings // Normal walking with floor sticking
  updateSettingsNoStick: JoltExtendedUpdateSettings // For jumping (no floor sticking)
  velocityVec: JoltVec3 // Cached Vec3 for velocity (avoids per-frame allocation)
  impulseVec: JoltVec3 // Cached Vec3 for push impulses (avoids per-contact allocation)
  contactPosRVec: JoltRVec3 // Cached RVec3 for contact position (for impulse at point)
  contactListener: JoltCharacterContactListener // Contact callbacks (slide prevention, dynamic body handling)
}

let cachedFilters: CharacterFilters | null = null

function getOrCreateFilters(Jolt: JoltModule): CharacterFilters {
  if (cachedFilters) {
    return cachedFilters
  }

  // Get filter objects from JoltInterface (exactly like official Jolt examples)
  const joltInterface = getJoltInterface()
  const objectVsBroadPhaseLayerFilter =
    joltInterface.GetObjectVsBroadPhaseLayerFilter()
  const objectLayerPairFilter = joltInterface.GetObjectLayerPairFilter()

  // Create filters using the filter objects from JoltInterface
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

  // Create contact listener for contact handling callbacks (like official Jolt example)
  // This prevents unwanted sliding on slopes and enables conveyor belt effects
  const contactListener = new Jolt.CharacterContactListenerJS()

  // OnAdjustBodyVelocity: Modify body velocity before character uses it
  // Used for conveyor belts - add velocity to bodies the character stands on
  contactListener.OnAdjustBodyVelocity = (
    _characterPtr: number,
    _body2Ptr: number,
    _linearVelocityPtr: number,
    _angularVelocityPtr: number,
  ) => {
    // Currently no conveyor belt logic - bodies provide their natural velocity
    // Could add: linearVelocity.SetX(linearVelocity.GetX() + conveyorSpeed)
  }

  // OnContactValidate: Validate if character should collide with body
  contactListener.OnContactValidate = (
    _characterPtr: number,
    _body2Ptr: number,
    _subShapeID2Ptr: number,
  ) => {
    // Accept all contacts - we handle dynamic bodies in OnContactSolve
    return true
  }

  // OnContactAdded: Called when a new contact is detected
  contactListener.OnContactAdded = (
    _characterPtr: number,
    _body2Ptr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    _contactNormalPtr: number,
    _settingsPtr: number,
  ) => {
    // No special handling needed for added contacts
  }

  // OnContactPersisted: Called when contact persists between frames
  contactListener.OnContactPersisted = (
    _characterPtr: number,
    _body2Ptr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    _contactNormalPtr: number,
    _settingsPtr: number,
  ) => {
    // No special handling needed for persisted contacts
  }

  // OnContactRemoved: Called when contact is removed
  contactListener.OnContactRemoved = (
    _characterPtr: number,
    _body2Ptr: number,
    _subShapeID2Ptr: number,
  ) => {
    // No special handling needed for removed contacts
  }

  // OnContactSolve: Called during contact resolution (matching official Jolt example)
  contactListener.OnContactSolve = (
    characterPtr: number,
    _body2Ptr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    contactNormalPtr: number,
    contactVelocityPtr: number,
    _contactMaterialPtr: number,
    _characterVelocityPtr: number,
    newCharacterVelocityPtr: number,
  ) => {
    // Match official example: check contactVelocity and slope, not body type
    const character = Jolt.wrapPointer(characterPtr, Jolt.CharacterVirtual)
    const contactVelocity = Jolt.wrapPointer(contactVelocityPtr, Jolt.Vec3)
    const contactNormal = Jolt.wrapPointer(contactNormalPtr, Jolt.Vec3)
    const newCharacterVelocity = Jolt.wrapPointer(
      newCharacterVelocityPtr,
      Jolt.Vec3,
    )

    // Don't allow sliding on static surfaces when idle (not actively moving)
    // This matches the official Jolt example: only zero velocity when !allowSliding
    if (
      !_allowSliding &&
      contactVelocity.IsNearZero() &&
      !character.IsSlopeTooSteep(contactNormal)
    ) {
      newCharacterVelocity.Set(0, 0, 0)
    }
  }

  // Character-to-character callbacks (required by CharacterContactListenerJS)
  contactListener.OnCharacterContactValidate = (
    _characterPtr: number,
    _otherCharacterPtr: number,
    _subShapeID2Ptr: number,
  ) => {
    return true
  }

  contactListener.OnCharacterContactAdded = (
    _characterPtr: number,
    _otherCharacterPtr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    _contactNormalPtr: number,
    _settingsPtr: number,
  ) => {
    // No special handling
  }

  contactListener.OnCharacterContactPersisted = (
    _characterPtr: number,
    _otherCharacterPtr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    _contactNormalPtr: number,
    _settingsPtr: number,
  ) => {
    // No special handling
  }

  contactListener.OnCharacterContactRemoved = (
    _characterPtr: number,
    _otherCharacterIDPtr: number,
    _subShapeID2Ptr: number,
  ) => {
    // No special handling
  }

  contactListener.OnCharacterContactSolve = (
    _characterPtr: number,
    _otherCharacterPtr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    _contactNormalPtr: number,
    _contactVelocityPtr: number,
    _contactMaterialPtr: number,
    _characterVelocityPtr: number,
    _newCharacterVelocityPtr: number,
  ) => {
    // No special handling for character-to-character
  }

  cachedFilters = {
    broadPhaseFilter,
    objectLayerFilter,
    bodyFilter,
    shapeFilter,
    updateSettings,
    updateSettingsNoStick,
    velocityVec,
    impulseVec,
    contactPosRVec,
    contactListener,
  }

  return cachedFilters
}

export function destroyCharacterFilters(): void {
  if (!cachedFilters) return
  const Jolt = getJolt()
  Jolt.destroy(cachedFilters.broadPhaseFilter)
  Jolt.destroy(cachedFilters.objectLayerFilter)
  Jolt.destroy(cachedFilters.bodyFilter)
  Jolt.destroy(cachedFilters.shapeFilter)
  Jolt.destroy(cachedFilters.updateSettings)
  Jolt.destroy(cachedFilters.updateSettingsNoStick)
  Jolt.destroy(cachedFilters.velocityVec)
  Jolt.destroy(cachedFilters.impulseVec)
  Jolt.destroy(cachedFilters.contactPosRVec)
  Jolt.destroy(cachedFilters.contactListener)
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

  // Physics (match official Jolt example for proper dynamic body pushing)
  mass: 1000, // Official example uses 1000
  maxStrength: 100, // Official example uses 100 (Jolt default)
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
  maxStrength: number
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

    // Update ground velocity BEFORE reading it (critical - matches official example)
    character.UpdateGroundVelocity()

    // Check ground state
    const groundState = character.GetGroundState()
    const isGrounded = groundState === GROUND_STATE_ON_GROUND
    const isSliding = groundState === GROUND_STATE_ON_STEEP_GROUND

    // Get ground normal (used for movement state tracking)
    const groundNormal = character.GetGroundNormal()
    const groundNormalX = groundNormal.GetX()
    const groundNormalY = groundNormal.GetY()
    const groundNormalZ = groundNormal.GetZ()

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

    // Get character's current velocity and up vector (matches official example)
    const characterUp = character.GetUp()
    const linearVelocity = character.GetLinearVelocity()
    const groundVel = character.GetGroundVelocity()

    // Calculate current vertical velocity using dot product (official pattern)
    const verticalSpeed =
      linearVelocity.GetX() * characterUp.GetX() +
      linearVelocity.GetY() * characterUp.GetY() +
      linearVelocity.GetZ() * characterUp.GetZ()

    // Momentum transfer from kinematic platforms only (not dynamic bodies)
    let inheritedVx = movement.inheritedVx
    let inheritedVy = movement.inheritedVy
    let inheritedVz = movement.inheritedVz

    // Check if just left a kinematic platform (for momentum transfer)
    // Don't transfer momentum from dynamic bodies (balls, crates) - only from kinematic platforms
    const hasGroundVelocity =
      Math.abs(groundVel.GetX()) > 0.01 ||
      Math.abs(groundVel.GetY()) > 0.01 ||
      Math.abs(groundVel.GetZ()) > 0.01

    let isKinematicGround = false
    if (hasGroundVelocity) {
      const groundBodyId = character.GetGroundBodyID()
      if (isValidBodyID(groundBodyId)) {
        const bodyInterface = physicsWorld.bodyInterface
        if (bodyInterface) {
          const motionType = bodyInterface.GetMotionType(groundBodyId)
          isKinematicGround = motionType === MOTION_TYPE_KINEMATIC
        }
      }
    }

    const justLeftPlatform =
      movement.wasGroundedLastFrame && !isGrounded && isKinematicGround
    if (justLeftPlatform) {
      inheritedVx = groundVel.GetX() * config.momentumTransferWeight
      inheritedVy = groundVel.GetY() * config.momentumTransferWeight
      inheritedVz = groundVel.GetZ() * config.momentumTransferWeight
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
    const groundVerticalSpeed =
      groundVel.GetX() * characterUp.GetX() +
      groundVel.GetY() * characterUp.GetY() +
      groundVel.GetZ() * characterUp.GetZ()

    // Check if moving towards ground (official example threshold: 0.1)
    const movingTowardsGround = verticalSpeed - groundVerticalSpeed < 0.1

    // Get gravity from physics system
    const gravity = physicsSystem.GetGravity()
    const gravityX = gravity.GetX()
    const gravityY = gravity.GetY()
    const gravityZ = gravity.GetZ()

    // Build new velocity following official Jolt pattern:
    // 1. If grounded AND moving towards ground: start with ground velocity
    // 2. Else: preserve current vertical velocity only
    // 3. Apply gravity
    // 4. Add horizontal movement

    let newVx: number
    let newVy: number
    let newVz: number

    if (isGrounded && movingTowardsGround) {
      // When grounded and moving towards ground: start with ground velocity
      newVx = groundVel.GetX()
      newVy = groundVel.GetY()
      newVz = groundVel.GetZ()
    } else {
      // Airborne or moving away from ground: preserve vertical velocity only
      // Current vertical velocity = verticalSpeed * characterUp
      newVx = verticalSpeed * characterUp.GetX() + inheritedVx
      newVy = verticalSpeed * characterUp.GetY()
      newVz = verticalSpeed * characterUp.GetZ() + inheritedVz
    }

    // Apply gravity (full vector, not just Y - supports tilted gravity)
    newVx += gravityX * delta
    newVy += gravityY * delta
    newVz += gravityZ * delta

    // Add horizontal movement (player input)
    newVx += movement.vx
    newVz += movement.vz

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

    // Get temp allocator (must exist if physics is initialized)
    const tempAllocator = physicsWorld.tempAllocator
    if (!tempAllocator) continue

    // Set allowSliding flag based on player input (prevents OnContactSolve from zeroing velocity)
    // Match official example: allow sliding when moving OR when airborne
    // Official uses movementDirection.length() < 1.0e-12
    const movementLengthSq =
      movement.vx * movement.vx + movement.vz * movement.vz
    const hasHorizontalInput = movementLengthSq > 1.0e-24 // 1.0e-12 squared
    const isAirborne = !(isGrounded || isSliding)
    _allowSliding = hasHorizontalInput || isAirborne

    // Apply velocity to character using cached Vec3 (avoids per-frame allocation)
    filters.velocityVec.Set(newVx, newVy, newVz)
    character.SetLinearVelocity(filters.velocityVec)

    // Choose update settings based on whether we're jumping
    // When jumping or moving upward, disable floor sticking to prevent being pulled back down
    const isMovingUp = newVy > 0.1
    const useNoStickSettings = justJumped || isMovingUp

    // Use ExtendedUpdate for floor sticking and stair walking
    // NOTE: ExtendedUpdate does NOT apply gravity - we did that above!
    // It handles: collision response, floor sticking, stair walking
    // Pass character.GetUp() like official example
    character.ExtendedUpdate(
      delta,
      character.GetUp(),
      useNoStickSettings
        ? filters.updateSettingsNoStick
        : filters.updateSettings,
      filters.broadPhaseFilter,
      filters.objectLayerFilter,
      filters.bodyFilter,
      filters.shapeFilter,
      tempAllocator,
    )

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
      m.platformVx = 0
      m.platformVy = 0
      m.platformVz = 0
      m.lastPlatformEntity = null
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

    // Create character settings (matching official Jolt example)
    const settings = new Jolt.CharacterVirtualSettings()
    settings.mMass = config.mass
    settings.mMaxSlopeAngle = config.maxSlopeAngle
    settings.mMaxStrength = config.maxStrength // How hard character can push dynamic bodies
    settings.mShape = shape
    settings.mBackFaceMode = BACK_FACE_MODE_COLLIDE
    settings.mCharacterPadding = config.skinWidth
    settings.mPenetrationRecoverySpeed = 1.0
    settings.mPredictiveContactDistance = 0.1
    // Supporting volume - plane below character that defines "supported" region
    const supportingVolume = new Jolt.Plane(
      Jolt.Vec3.prototype.sAxisY(),
      -config.capsuleRadius,
    )
    settings.mSupportingVolume = supportingVolume

    // Create character
    const position = new Jolt.RVec3(transform.x, transform.y, transform.z)
    const rotation = new Jolt.Quat(0, 0, 0, 1)

    const character = new Jolt.CharacterVirtual(
      settings,
      position,
      rotation,
      physicsSystem,
    )

    // Attach contact listener for slide prevention and contact callbacks
    const filters = getOrCreateFilters(Jolt)
    character.SetListener(filters.contactListener)

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
