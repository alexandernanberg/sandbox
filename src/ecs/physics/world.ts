import type {World, Entity} from 'koota'
import type {
  JoltModule,
  JoltPhysicsSystem,
  JoltTempAllocator,
  JoltBodyInterface,
  JoltBodyID,
  JoltBody,
  JoltInterface,
  JoltObjectLayerPairFilter,
  JoltObjectVsBroadPhaseLayerFilter,
  JoltSettings,
} from './jolt-types'
import {destroyCharacterFilters} from './character'
import {
  LAYER_NON_MOVING,
  LAYER_MOVING,
  NUM_OBJECT_LAYERS,
  BP_LAYER_NON_MOVING,
  BP_LAYER_MOVING,
  NUM_BROAD_PHASE_LAYERS,
} from './jolt-types'
import {destroyRaycastObjects} from './queries'
import {RigidBodyRef, IsPhysicsEntity} from './traits'

// ============================================
// Jolt Module Singleton
// ============================================

let joltModule: JoltModule | null = null
let joltInterface: JoltInterface | null = null

export function getJolt(): JoltModule {
  if (!joltModule) {
    throw new Error('Jolt not initialized. Call initJolt() first.')
  }
  return joltModule
}

// Invalid body ID marker (0xFFFFFFFF indicates no body)
const INVALID_BODY_INDEX = 0xffffffff

/**
 * Check if a Jolt BodyID is valid (type guard).
 * Invalid body IDs have an index of 0xFFFFFFFF.
 */
export function isValidBodyID(
  bodyId: JoltBodyID | null | undefined,
): bodyId is JoltBodyID {
  if (!bodyId) return false
  return bodyId.GetIndex() !== INVALID_BODY_INDEX
}

export function getJoltInterface(): JoltInterface {
  if (!joltInterface) {
    throw new Error('Jolt not initialized. Call initJolt() first.')
  }
  return joltInterface
}

export function setJoltModule(module: JoltModule): void {
  joltModule = module
}

// ============================================
// Physics World Singleton
// ============================================

export interface PhysicsWorldState {
  physicsSystem: JoltPhysicsSystem | null
  bodyInterface: JoltBodyInterface | null
  tempAllocator: JoltTempAllocator | null
  accumulator: number
  initialized: boolean
  // Body ID to Entity mapping for collision events
  bodyIdToEntity: Map<number, Entity>
  // Cleanup subscriptions
  cleanupSubscriptions: (() => void)[]
  // Callbacks
  beforeStepCallbacks: Set<(delta: number) => void>
  afterStepCallbacks: Set<(delta: number) => void>
  // Contact listener
  contactListener: unknown
  // Collision filtering objects (stored for character controller use)
  objectLayerPairFilter: JoltObjectLayerPairFilter | null
  objectVsBroadPhaseLayerFilter: JoltObjectVsBroadPhaseLayerFilter | null
}

export const physicsWorld: PhysicsWorldState = {
  physicsSystem: null,
  bodyInterface: null,
  tempAllocator: null,
  accumulator: 0,
  initialized: false,
  bodyIdToEntity: new Map(),
  cleanupSubscriptions: [],
  beforeStepCallbacks: new Set(),
  afterStepCallbacks: new Set(),
  contactListener: null,
  objectLayerPairFilter: null,
  objectVsBroadPhaseLayerFilter: null,
}

export const FIXED_TIMESTEP = 1 / 60
export const MAX_DELTA = 0.25

export interface PhysicsConfig {
  gravity?: {x: number; y: number; z: number}
  maxBodies?: number
  maxBodyPairs?: number
  maxContactConstraints?: number
}

const DEFAULT_GRAVITY = {x: 0, y: -9.81, z: 0}
const DEFAULT_MAX_BODIES = 10240
const DEFAULT_MAX_BODY_PAIRS = 65536
const DEFAULT_MAX_CONTACT_CONSTRAINTS = 10240

// Custom collision filtering setup
function setupCollisionFiltering(
  Jolt: JoltModule,
  settings: JoltSettings,
): void {
  // Object layer pair filter - determines which object layers can collide
  const objectFilter = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS)
  objectFilter.EnableCollision(LAYER_NON_MOVING, LAYER_MOVING)
  objectFilter.EnableCollision(LAYER_MOVING, LAYER_MOVING)

  // Broad phase layer interface - maps object layers to broad phase layers
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(
    NUM_OBJECT_LAYERS,
    NUM_BROAD_PHASE_LAYERS,
  )

  // Create BroadPhaseLayer objects (required by Jolt TypeScript types)
  const bpLayerNonMoving = new Jolt.BroadPhaseLayer(BP_LAYER_NON_MOVING)
  const bpLayerMoving = new Jolt.BroadPhaseLayer(BP_LAYER_MOVING)

  bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, bpLayerNonMoving)
  bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, bpLayerMoving)

  // Clean up BroadPhaseLayer objects (values are copied internally)
  Jolt.destroy(bpLayerNonMoving)
  Jolt.destroy(bpLayerMoving)

  // Object vs broad phase layer filter
  const objectVsBPFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    bpInterface,
    NUM_BROAD_PHASE_LAYERS,
    objectFilter,
    NUM_OBJECT_LAYERS,
  )

  // Store filter objects for character controller use
  physicsWorld.objectLayerPairFilter = objectFilter
  physicsWorld.objectVsBroadPhaseLayerFilter = objectVsBPFilter

  // Configure JoltSettings with collision filtering
  settings.mObjectLayerPairFilter = objectFilter
  settings.mBroadPhaseLayerInterface = bpInterface
  settings.mObjectVsBroadPhaseLayerFilter = objectVsBPFilter
}

// Must be called after Jolt module is loaded
export function initPhysicsWorld(
  ecsWorld: World,
  config: PhysicsConfig = {},
): void {
  if (physicsWorld.initialized) {
    return
  }

  const Jolt = getJolt()
  const gravity = config.gravity ?? DEFAULT_GRAVITY
  const maxBodies = config.maxBodies ?? DEFAULT_MAX_BODIES
  const maxBodyPairs = config.maxBodyPairs ?? DEFAULT_MAX_BODY_PAIRS
  const maxContactConstraints =
    config.maxContactConstraints ?? DEFAULT_MAX_CONTACT_CONSTRAINTS

  // Create settings for JoltInterface
  const settings = new Jolt.JoltSettings()
  settings.mMaxBodies = maxBodies
  settings.mMaxBodyPairs = maxBodyPairs
  settings.mMaxContactConstraints = maxContactConstraints

  // Setup collision filtering
  setupCollisionFiltering(Jolt, settings)

  // Create Jolt interface (handles temp allocator, job system internally)
  const newJoltInterface = new Jolt.JoltInterface(settings)
  joltInterface = newJoltInterface
  Jolt.destroy(settings)

  // Get physics system from interface
  const physicsSystem = newJoltInterface.GetPhysicsSystem()
  physicsWorld.physicsSystem = physicsSystem
  physicsWorld.tempAllocator = newJoltInterface.GetTempAllocator()

  // Set gravity
  const gravityVec = new Jolt.Vec3(gravity.x, gravity.y, gravity.z)
  physicsSystem.SetGravity(gravityVec)
  Jolt.destroy(gravityVec)

  // Get body interface
  physicsWorld.bodyInterface = physicsSystem.GetBodyInterface()

  physicsWorld.accumulator = 0
  physicsWorld.initialized = true

  // Set up automatic cleanup when physics traits are removed
  const unsubRigidBody = ecsWorld.onRemove(RigidBodyRef, (entity) => {
    // Check Jolt module is available
    const bodyInterface = physicsWorld.bodyInterface
    if (!joltModule || !bodyInterface) return

    const bodyRef = entity.get(RigidBodyRef)
    if (bodyRef?.bodyId != null) {
      try {
        const bodyId = bodyRef.bodyId
        // Check if body is still in the physics system
        if (bodyInterface.IsAdded(bodyId)) {
          // Remove from mapping
          physicsWorld.bodyIdToEntity.delete(bodyId.GetIndexAndSequenceNumber())
          // Remove and destroy body
          bodyInterface.RemoveBody(bodyId)
          bodyInterface.DestroyBody(bodyId)
        }
        // Release shape reference (we called AddRef when creating)
        if (bodyRef.shape) {
          bodyRef.shape.Release()
        }
      } catch {
        // Body may already be removed
      }
    }
  })

  physicsWorld.cleanupSubscriptions.push(unsubRigidBody)
}

export function destroyPhysicsWorld(ecsWorld: World): void {
  const Jolt = joltModule
  if (!Jolt) return

  // Unsubscribe cleanup callbacks first to avoid triggering them during entity destruction
  for (const unsub of physicsWorld.cleanupSubscriptions) {
    unsub()
  }
  physicsWorld.cleanupSubscriptions = []

  // Destroy all physics entities
  const entities = [...ecsWorld.query(IsPhysicsEntity)]
  for (const entity of entities) {
    if (entity.isAlive()) {
      entity.destroy()
    }
  }

  // Clean up character filters
  destroyCharacterFilters()

  // Clean up raycast objects
  destroyRaycastObjects()

  // Clean up contact listener
  if (physicsWorld.contactListener) {
    Jolt.destroy(physicsWorld.contactListener)
    physicsWorld.contactListener = null
  }

  // Clean up Jolt interface (handles physicsSystem, tempAllocator, jobSystem internally)
  if (joltInterface) {
    Jolt.destroy(joltInterface)
    joltInterface = null
  }

  physicsWorld.physicsSystem = null
  physicsWorld.tempAllocator = null
  physicsWorld.bodyInterface = null
  physicsWorld.bodyIdToEntity.clear()
  physicsWorld.accumulator = 0
  physicsWorld.initialized = false
  physicsWorld.beforeStepCallbacks.clear()
  physicsWorld.afterStepCallbacks.clear()
  physicsWorld.objectLayerPairFilter = null
  physicsWorld.objectVsBroadPhaseLayerFilter = null
}

export function setGravity(gravity: {x: number; y: number; z: number}): void {
  const Jolt = joltModule
  if (!Jolt || !physicsWorld.physicsSystem) return

  const gravityVec = new Jolt.Vec3(gravity.x, gravity.y, gravity.z)
  physicsWorld.physicsSystem.SetGravity(gravityVec)
  Jolt.destroy(gravityVec)
}

export function getPhysicsSystem(): JoltPhysicsSystem | null {
  return physicsWorld.physicsSystem
}

export function getBodyInterface(): JoltBodyInterface | null {
  return physicsWorld.bodyInterface
}

export function getTempAllocator(): JoltTempAllocator | null {
  return physicsWorld.tempAllocator
}

// Map body ID to entity for collision lookups
export function registerBodyEntity(bodyId: JoltBodyID, entity: Entity): void {
  physicsWorld.bodyIdToEntity.set(bodyId.GetIndexAndSequenceNumber(), entity)
}

export function getEntityForBodyId(bodyId: JoltBodyID): Entity | undefined {
  return physicsWorld.bodyIdToEntity.get(bodyId.GetIndexAndSequenceNumber())
}

export function getEntityForBodyIndex(
  indexAndSequence: number,
): Entity | undefined {
  return physicsWorld.bodyIdToEntity.get(indexAndSequence)
}

export function getBodyById(bodyId: JoltBodyID): JoltBody | null {
  const Jolt = joltModule
  if (!Jolt || !physicsWorld.physicsSystem) return null

  // Use TryGetBody from BodyLockInterface (no-lock version for simple access)
  const bodyLockInterface =
    physicsWorld.physicsSystem.GetBodyLockInterfaceNoLock()
  return bodyLockInterface.TryGetBody(bodyId)
}

// Register callbacks
export function onBeforeStep(callback: (delta: number) => void): () => void {
  physicsWorld.beforeStepCallbacks.add(callback)
  return () => physicsWorld.beforeStepCallbacks.delete(callback)
}

export function onAfterStep(callback: (delta: number) => void): () => void {
  physicsWorld.afterStepCallbacks.add(callback)
  return () => physicsWorld.afterStepCallbacks.delete(callback)
}

// Legacy compatibility - renamed from getRapierWorld
export function getJoltWorld(): JoltPhysicsSystem | null {
  return physicsWorld.physicsSystem
}

// Kept for backwards compatibility during migration
export function getRapierWorld(): JoltPhysicsSystem | null {
  return physicsWorld.physicsSystem
}

export function getEventQueue(): null {
  // Jolt doesn't use an event queue like Rapier
  // Events are handled via contact listener
  return null
}
