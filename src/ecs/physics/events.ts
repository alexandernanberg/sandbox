import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import type {JoltPhysicsSystem, JoltBodyID} from './jolt-types'
import {CollisionCallbacks} from './traits'
import {
  getEntityForBodyId,
  getEntityForBodyIndex,
  physicsWorld,
  getJolt,
} from './world'

// ============================================
// Collision Event Traits
// ============================================

// Stores entities that started colliding this frame (Set for O(1) lookup)
export const CollisionEntered = trait(() => ({
  entities: new Set<Entity>(),
}))

// Stores entities that stopped colliding this frame (Set for O(1) lookup)
export const CollisionExited = trait(() => ({
  entities: new Set<Entity>(),
}))

// ============================================
// Contact Listener Storage
// ============================================

// Pending collision events to process (filled by contact listener)
interface PendingCollision {
  bodyId1: JoltBodyID
  bodyId2: JoltBodyID
  started: boolean
}

const pendingCollisions: PendingCollision[] = []

// Track active contacts for exit detection
// Key format: "bodyIndex1:bodyIndex2" (sorted so a:b === b:a)
const activeContacts = new Set<string>()
const currentFrameContacts = new Set<string>()

function makeContactKey(body1: JoltBodyID, body2: JoltBodyID): string {
  const idx1 = body1.GetIndexAndSequenceNumber()
  const idx2 = body2.GetIndexAndSequenceNumber()
  // Sort to ensure consistent key regardless of order
  return idx1 < idx2 ? `${idx1}:${idx2}` : `${idx2}:${idx1}`
}

// Set up contact listener for Jolt
export function setupContactListener(physicsSystem: JoltPhysicsSystem): void {
  const Jolt = getJolt()

  // Create contact listener
  const listener = new Jolt.ContactListenerJS()

  // Called when contact is first detected
  // Note: ContactListenerJS callbacks receive raw WASM pointers (numbers), not typed objects
  listener.OnContactAdded = (
    body1Ptr: number,
    body2Ptr: number,
    _manifold: number,
    _settings: number,
  ) => {
    // Wrap pointers to get typed BodyID objects
    const body1 = Jolt.wrapPointer(body1Ptr, Jolt.BodyID)
    const body2 = Jolt.wrapPointer(body2Ptr, Jolt.BodyID)

    // Track this contact
    const key = makeContactKey(body1, body2)
    currentFrameContacts.add(key)

    // If this is a new contact, queue enter event
    if (!activeContacts.has(key)) {
      pendingCollisions.push({
        bodyId1: body1,
        bodyId2: body2,
        started: true,
      })
    }
  }

  // Called when contact persists between frames
  listener.OnContactPersisted = (
    body1Ptr: number,
    body2Ptr: number,
    _manifoldPtr: number,
    _settingsPtr: number,
  ) => {
    // Track that this contact is still active
    const body1 = Jolt.wrapPointer(body1Ptr, Jolt.BodyID)
    const body2 = Jolt.wrapPointer(body2Ptr, Jolt.BodyID)
    const key = makeContactKey(body1, body2)
    currentFrameContacts.add(key)
  }

  // Called when contact is removed
  listener.OnContactRemoved = (_subShapePairPtr: number) => {
    // OnContactRemoved doesn't give us body IDs directly in JS binding
    // Exit detection is handled in processCollisionEvents by comparing frames
  }

  // Required callbacks
  listener.OnContactValidate = (
    _body1Ptr: number,
    _body2Ptr: number,
    _baseOffsetPtr: number,
    _collisionResultPtr: number,
  ) => {
    return Jolt.ValidateResult_AcceptAllContactsForThisBodyPair
  }

  physicsSystem.SetContactListener(listener)
  physicsWorld.contactListener = listener
}

// ============================================
// Collision Event Processing
// ============================================

export function processCollisionEvents(_physicsSystem: JoltPhysicsSystem) {
  // Process all pending collision enter events
  for (const collision of pendingCollisions) {
    const entity1 = getEntityForBodyId(collision.bodyId1)
    const entity2 = getEntityForBodyId(collision.bodyId2)

    if (entity1 && entity2) {
      processCollisionPair(entity1, entity2, collision.started)
    }
  }

  // Detect contact exits: contacts that were active last frame but not this frame
  for (const key of activeContacts) {
    if (!currentFrameContacts.has(key)) {
      // Contact ended - parse key to get body indices
      const [idx1Str, idx2Str] = key.split(':')
      const idx1 = parseInt(idx1Str!, 10)
      const idx2 = parseInt(idx2Str!, 10)

      // Find entities for these body indices
      const entity1 = getEntityForBodyIndex(idx1)
      const entity2 = getEntityForBodyIndex(idx2)

      if (entity1 && entity2) {
        processCollisionPair(entity1, entity2, false)
      }
    }
  }

  // Update active contacts for next frame
  activeContacts.clear()
  for (const key of currentFrameContacts) {
    activeContacts.add(key)
  }
  currentFrameContacts.clear()

  // Clear pending collisions
  pendingCollisions.length = 0
}

// Reusable collision event object to avoid allocations per collision
// Using 'as' since we always set 'other' before passing to callbacks
const _collisionEvent = {other: null! as Entity}

function processCollisionPair(
  entity1: Entity,
  entity2: Entity,
  started: boolean,
) {
  if (started) {
    // Add collision entered event
    ensureCollisionEntered(entity1).entities.add(entity2)
    ensureCollisionEntered(entity2).entities.add(entity1)

    // Fire callbacks (reuse event object)
    if (entity1.has(CollisionCallbacks)) {
      _collisionEvent.other = entity2
      entity1.get(CollisionCallbacks)!.onEnter?.(_collisionEvent)
    }
    if (entity2.has(CollisionCallbacks)) {
      _collisionEvent.other = entity1
      entity2.get(CollisionCallbacks)!.onEnter?.(_collisionEvent)
    }
  } else {
    // Add collision exited event
    ensureCollisionExited(entity1).entities.add(entity2)
    ensureCollisionExited(entity2).entities.add(entity1)

    // Fire callbacks (reuse event object)
    if (entity1.has(CollisionCallbacks)) {
      _collisionEvent.other = entity2
      entity1.get(CollisionCallbacks)!.onExit?.(_collisionEvent)
    }
    if (entity2.has(CollisionCallbacks)) {
      _collisionEvent.other = entity1
      entity2.get(CollisionCallbacks)!.onExit?.(_collisionEvent)
    }
  }
}

function ensureCollisionEntered(entity: Entity) {
  if (!entity.has(CollisionEntered)) {
    entity.add(CollisionEntered)
  }
  return entity.get(CollisionEntered)!
}

function ensureCollisionExited(entity: Entity) {
  if (!entity.has(CollisionExited)) {
    entity.add(CollisionExited)
  }
  return entity.get(CollisionExited)!
}

// ============================================
// Collision Event Cleanup
// ============================================

const collisionEnteredQuery = createQuery(CollisionEntered)
const collisionExitedQuery = createQuery(CollisionExited)

export function clearCollisionEvents(world: World) {
  // Use updateEach for batched trait access
  world.query(collisionEnteredQuery).updateEach(([collision]) => {
    collision.entities.clear()
  })

  world.query(collisionExitedQuery).updateEach(([collision]) => {
    collision.entities.clear()
  })
}

// ============================================
// Collision Query Helpers
// ============================================

const _emptySet = new Set<Entity>()

export function getCollisionsEntered(entity: Entity): ReadonlySet<Entity> {
  if (!entity.has(CollisionEntered)) return _emptySet
  return entity.get(CollisionEntered)!.entities
}

export function getCollisionsExited(entity: Entity): ReadonlySet<Entity> {
  if (!entity.has(CollisionExited)) return _emptySet
  return entity.get(CollisionExited)!.entities
}

export function isCollidingWith(entity: Entity, other: Entity): boolean {
  if (!entity.has(CollisionEntered)) return false
  return entity.get(CollisionEntered)!.entities.has(other)
}
