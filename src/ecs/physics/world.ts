import type {World, Entity} from 'koota'
import type {
  JoltModule,
  JoltPhysicsSystem,
  JoltTempAllocator,
  JoltBodyInterface,
  JoltBodyID,
  JoltBody,
  JoltInterface,
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
function setupCollisionFiltering(Jolt: JoltModule, settings: unknown): void {
  // Layer constants for collision filtering
  const OBJECT_LAYER_NON_MOVING = LAYER_NON_MOVING
  const OBJECT_LAYER_MOVING = LAYER_MOVING
  const BROAD_PHASE_LAYER_NON_MOVING = BP_LAYER_NON_MOVING
  const BROAD_PHASE_LAYER_MOVING = BP_LAYER_MOVING

  // Object layer pair filter - determines which object layers can collide
  const objectFilter = new Jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS)
  objectFilter.EnableCollision(OBJECT_LAYER_NON_MOVING, OBJECT_LAYER_MOVING)
  objectFilter.EnableCollision(OBJECT_LAYER_MOVING, OBJECT_LAYER_MOVING)

  // Broad phase layer interface - maps object layers to broad phase layers
  const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(
    NUM_OBJECT_LAYERS,
    NUM_BROAD_PHASE_LAYERS,
  )
  bpInterface.MapObjectToBroadPhaseLayer(
    OBJECT_LAYER_NON_MOVING,
    BROAD_PHASE_LAYER_NON_MOVING,
  )
  bpInterface.MapObjectToBroadPhaseLayer(
    OBJECT_LAYER_MOVING,
    BROAD_PHASE_LAYER_MOVING,
  )

  // Object vs broad phase layer filter
  const objectVsBPFilter = new Jolt.ObjectVsBroadPhaseLayerFilterTable(
    bpInterface,
    NUM_BROAD_PHASE_LAYERS,
    objectFilter,
    NUM_OBJECT_LAYERS,
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const joltSettings = settings as any
  joltSettings.mObjectLayerPairFilter = objectFilter
  joltSettings.mBroadPhaseLayerInterface = bpInterface
  joltSettings.mObjectVsBroadPhaseLayerFilter = objectVsBPFilter
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
    const Jolt = joltModule
    const bodyInterface = physicsWorld.bodyInterface
    if (!Jolt || !bodyInterface) return

    const bodyRef = entity.get(RigidBodyRef)
    if (bodyRef?.bodyId != null) {
      try {
        const bodyId = bodyRef.bodyId as JoltBodyID
        if (!bodyId.IsInvalid()) {
          // Remove from mapping
          physicsWorld.bodyIdToEntity.delete(bodyId.GetIndexAndSequenceNumber())
          // Remove and destroy body
          bodyInterface.RemoveBody(bodyId)
          bodyInterface.DestroyBody(bodyId)
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

export function getBodyById(bodyId: JoltBodyID): JoltBody | null {
  const Jolt = joltModule
  if (!Jolt || !physicsWorld.physicsSystem) return null

  const bodyLockInterface = physicsWorld.physicsSystem.GetBodyLockInterface()
  const lock = new Jolt.BodyLockRead(bodyLockInterface, bodyId)
  if (lock.Succeeded()) {
    const body = lock.GetBody()
    lock.ReleaseLock()
    return body
  }
  lock.ReleaseLock()
  return null
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
