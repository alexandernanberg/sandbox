import type * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import {CollisionCallbacks} from './traits'

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
// Collision Event Processing
// ============================================

export function processCollisionEvents(
  rapierWorld: RAPIER.World,
  eventQueue: RAPIER.EventQueue,
) {
  eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    // O(1) lookup via userData stored on parent rigid bodies
    const collider1 = rapierWorld.getCollider(handle1) as
      | RAPIER.Collider
      | undefined
    const collider2 = rapierWorld.getCollider(handle2) as
      | RAPIER.Collider
      | undefined

    const parent1 = collider1?.parent()
    const parent2 = collider2?.parent()

    const entity1 = parent1?.userData as Entity | undefined
    const entity2 = parent2?.userData as Entity | undefined

    if (entity1 && entity2) {
      processCollisionPair(entity1, entity2, started)
    }
  })
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
