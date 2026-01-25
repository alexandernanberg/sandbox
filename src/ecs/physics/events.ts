import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import type {JoltPhysicsSystem, JoltBodyID} from './jolt-types'
import {CollisionCallbacks} from './traits'
import {getEntityForBodyId, physicsWorld, getJolt} from './world'

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

// Set up contact listener for Jolt
export function setupContactListener(physicsSystem: JoltPhysicsSystem): void {
  const Jolt = getJolt()

  // Create contact listener
  const listener = new Jolt.ContactListenerJS()

  // Called when contact is first detected
  listener.OnContactAdded = (
    body1: JoltBodyID,
    body2: JoltBodyID,
    _manifold: unknown,
    _settings: unknown,
  ) => {
    pendingCollisions.push({
      bodyId1: body1,
      bodyId2: body2,
      started: true,
    })
  }

  // Called when contact is removed
  listener.OnContactRemoved = (_subShapePair: unknown) => {
    // Jolt's OnContactRemoved doesn't give us body IDs directly
    // We'll handle contact exit differently if needed
  }

  // Required callbacks (can be empty)
  listener.OnContactValidate = () => {
    return Jolt.ValidateResult_AcceptAllContactsForThisBodyPair
  }

  listener.OnContactPersisted = () => {
    // Contact still active
  }

  physicsSystem.SetContactListener(listener)
  physicsWorld.contactListener = listener
}

// ============================================
// Collision Event Processing
// ============================================

export function processCollisionEvents(_physicsSystem: JoltPhysicsSystem) {
  // Process all pending collisions from contact listener
  for (const collision of pendingCollisions) {
    const entity1 = getEntityForBodyId(collision.bodyId1)
    const entity2 = getEntityForBodyId(collision.bodyId2)

    if (entity1 && entity2) {
      processCollisionPair(
        entity1 as Entity,
        entity2 as Entity,
        collision.started,
      )
    }
  }

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
