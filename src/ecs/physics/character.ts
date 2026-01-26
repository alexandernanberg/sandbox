import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import {setVec3} from '~/lib/math'
import type {
  JoltPhysicsSystem,
  JoltCharacterVirtual,
  JoltShape,
  JoltModule,
  JoltBodyID,
} from './jolt-types'
import {
  GROUND_STATE_ON_GROUND,
  GROUND_STATE_ON_STEEP_GROUND,
  LAYER_MOVING,
  BACK_FACE_MODE_COLLIDE,
} from './jolt-types'
import {
  RigidBodyRef,
  Transform,
  PhysicsInitialized,
  KinematicVelocity,
} from './traits'
import {getJolt, physicsWorld, getEntityForBodyId} from './world'

// ============================================
// Scratch objects for character movement
// ============================================

const _velocity = {x: 0, y: 0, z: 0}
const _platformVel = {x: 0, y: 0, z: 0}

// ============================================
// Cached filter objects (created once, reused)
// ============================================

interface CharacterFilters {
  broadPhaseFilter: unknown
  objectLayerFilter: unknown
  bodyFilter: unknown
  shapeFilter: unknown
  updateSettings: unknown
}

let cachedFilters: CharacterFilters | null = null

function getOrCreateFilters(
  Jolt: JoltModule,
  physicsSystem: JoltPhysicsSystem,
): CharacterFilters {
  if (cachedFilters) {
    return cachedFilters
  }

  // Create filters once and reuse them
  const broadPhaseFilter = new Jolt.DefaultBroadPhaseLayerFilter(
    physicsSystem.GetObjectVsBroadPhaseLayerFilter(),
    LAYER_MOVING,
  )
  const objectLayerFilter = new Jolt.DefaultObjectLayerFilter(
    physicsSystem.GetObjectLayerPairFilter(),
    LAYER_MOVING,
  )
  const bodyFilter = new Jolt.BodyFilter()
  const shapeFilter = new Jolt.ShapeFilter()
  const updateSettings = new Jolt.ExtendedUpdateSettings()

  cachedFilters = {
    broadPhaseFilter,
    objectLayerFilter,
    bodyFilter,
    shapeFilter,
    updateSettings,
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
  cachedFilters = null
}

// ============================================
// Constants
// ============================================

const EPSILON = 0.001

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
  if (groundBodyId.IsInvalid()) {
    return null
  }

  // Get entity for this body
  const platformEntity = getEntityForBodyId(groundBodyId)
  if (!platformEntity) {
    return null
  }

  // Check if it's kinematic with velocity
  const entity = platformEntity as Entity
  if (!entity.has(KinematicVelocity)) {
    return null
  }

  const vel = entity.get(KinematicVelocity)!

  target.x = vel.x
  target.y = vel.y
  target.z = vel.z

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
    let posX = transform.x
    let posY = transform.y
    let posZ = transform.z

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

    // Build velocity
    const inputVy = movement.vy

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

    // Add platform velocity if grounded
    if (isGrounded && onMovingPlatform) {
      _velocity.x += _platformVel.x
      _velocity.y += _platformVel.y
      _velocity.z += _platformVel.z
    }

    // Apply velocity to character
    const joltVel = new Jolt.Vec3(_velocity.x, _velocity.y, _velocity.z)
    character.SetLinearVelocity(joltVel)
    Jolt.destroy(joltVel)

    // Get or create cached filters
    const filters = getOrCreateFilters(Jolt, physicsSystem)

    // Get gravity for character update
    const gravity = physicsSystem.GetGravity()

    // Use simpler Update method (ExtendedUpdate may have issues with filter lifecycle)
    character.Update(
      delta,
      gravity,
      filters.broadPhaseFilter,
      filters.objectLayerFilter,
      filters.bodyFilter,
      filters.shapeFilter,
      physicsWorld.tempAllocator,
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

    // Create capsule shape
    const shapeSettings = new Jolt.CapsuleShapeSettings(
      config.capsuleHalfHeight,
      config.capsuleRadius,
    )
    const shape = shapeSettings.Create().Get()
    shape.AddRef()
    Jolt.destroy(shapeSettings)

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
      0, // userData
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
