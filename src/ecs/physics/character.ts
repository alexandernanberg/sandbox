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
} from './jolt-types'
import {RigidBodyRef, Transform, PhysicsInitialized} from './traits'
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

  // OnContactSolve: Called during contact resolution
  // This is the key callback for preventing unwanted sliding and handling dynamic bodies
  contactListener.OnContactSolve = (
    _characterPtr: number,
    body2Ptr: number,
    _subShapeID2Ptr: number,
    _contactPositionPtr: number,
    contactNormalPtr: number,
    _contactVelocityPtr: number,
    _contactMaterialPtr: number,
    characterVelocityPtr: number,
    newCharacterVelocityPtr: number,
  ) => {
    // Wrap pointers to access values
    const body2 = Jolt.wrapPointer(body2Ptr, Jolt.Body)
    const contactNormal = Jolt.wrapPointer(contactNormalPtr, Jolt.Vec3)
    const characterVelocity = Jolt.wrapPointer(characterVelocityPtr, Jolt.Vec3)
    const newCharacterVelocity = Jolt.wrapPointer(
      newCharacterVelocityPtr,
      Jolt.Vec3,
    )

    if (body2.IsDynamic()) {
      // For dynamic bodies: don't let them push the character
      // Keep the character's original velocity (ignore the collision response)
      newCharacterVelocity.Set(
        characterVelocity.GetX(),
        characterVelocity.GetY(),
        characterVelocity.GetZ(),
      )
    } else if (body2.IsStatic()) {
      // For static bodies only: prevent sliding when not actively moving
      // (Don't apply to kinematic bodies like elevators - they need proper velocity handling)
      const charSpeed =
        characterVelocity.GetX() * characterVelocity.GetX() +
        characterVelocity.GetZ() * characterVelocity.GetZ()

      // Check if slope is walkable (normal.y > cos(maxSlopeAngle) ~ 0.7 for 45 deg)
      const normalY = contactNormal.GetY()

      // If barely moving horizontally and on a walkable slope, prevent sliding
      if (charSpeed < 0.01 && normalY > 0.7) {
        // Zero out velocity to lock character in place
        newCharacterVelocity.Set(0, 0, 0)
      }
    }
    // For kinematic bodies: use default Jolt behavior (proper platform support)
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

  // Physics
  mass: 75,
  pushMultiplier: 25.0, // Multiplier for push impulse strength (higher = stronger push)
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
// Platform Velocity Helper
// ============================================

/**
 * Check if standing on a moving platform and get its entity.
 * Uses Jolt's GetGroundVelocity() which already handles tangential velocity
 * from rotating platforms when MoveKinematic() is used.
 */
function getMovingPlatformEntity(
  character: JoltCharacterVirtual,
  target: {x: number; y: number; z: number},
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

  // Use Jolt's built-in ground velocity (handles rotation automatically)
  const groundVel = character.GetGroundVelocity()
  target.x = groundVel.GetX()
  target.y = groundVel.GetY()
  target.z = groundVel.GetZ()

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

  // Only return entity if there's actual movement
  if (speed < 0.0001) {
    return null
  }

  return platformEntity
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

    // Get platform velocity (uses Jolt's GetGroundVelocity which handles rotation)
    const platformEntity = getMovingPlatformEntity(
      character,
      _platformVel,
      config.maxLaunchVelocity,
    )

    const onMovingPlatform = platformEntity !== null

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

    // Get temp allocator (must exist if physics is initialized)
    const tempAllocator = physicsWorld.tempAllocator
    if (!tempAllocator) continue

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
    character.ExtendedUpdate(
      delta,
      gravity,
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
