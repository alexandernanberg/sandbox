import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import {
  CollisionCallbacks,
  RigidBodyRef,
  SleepState,
  type ContactForceEvent,
} from './traits'

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
// Contact Force Event Traits
// ============================================

/** Stores contact force events received this frame */
export const ContactForceReceived = trait(() => ({
  events: [] as ContactForceEvent[],
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
// Contact Force Event Processing
// ============================================

// Reusable contact force event object to avoid allocations
const _contactForceEvent: ContactForceEvent = {
  other: null! as Entity,
  totalForce: {x: 0, y: 0, z: 0},
  totalForceMagnitude: 0,
  maxForceDirection: {x: 0, y: 0, z: 0},
  maxForceMagnitude: 0,
}

export function processContactForceEvents(
  rapierWorld: RAPIER.World,
  eventQueue: RAPIER.EventQueue,
) {
  eventQueue.drainContactForceEvents((event) => {
    // O(1) lookup via userData stored on parent rigid bodies
    const collider1 = rapierWorld.getCollider(event.collider1()) as
      | RAPIER.Collider
      | undefined
    const collider2 = rapierWorld.getCollider(event.collider2()) as
      | RAPIER.Collider
      | undefined

    const parent1 = collider1?.parent()
    const parent2 = collider2?.parent()

    const entity1 = parent1?.userData as Entity | undefined
    const entity2 = parent2?.userData as Entity | undefined

    if (!entity1 || !entity2) return

    // Get force data from Rapier event
    const totalForce = event.totalForce()
    const maxForceDir = event.maxForceDirection()

    // Process for entity1 (force applied TO entity1 FROM entity2)
    processContactForcePair(
      entity1,
      entity2,
      totalForce,
      event.totalForceMagnitude(),
      maxForceDir,
      event.maxForceMagnitude(),
    )

    // Process for entity2 (force applied TO entity2 FROM entity1, opposite direction)
    processContactForcePair(
      entity2,
      entity1,
      {x: -totalForce.x, y: -totalForce.y, z: -totalForce.z},
      event.totalForceMagnitude(),
      {x: -maxForceDir.x, y: -maxForceDir.y, z: -maxForceDir.z},
      event.maxForceMagnitude(),
    )
  })
}

function processContactForcePair(
  entity: Entity,
  other: Entity,
  totalForce: {x: number; y: number; z: number},
  totalForceMagnitude: number,
  maxForceDirection: {x: number; y: number; z: number},
  maxForceMagnitude: number,
) {
  // Store in ContactForceReceived trait for ECS querying
  const forceData = ensureContactForceReceived(entity)
  forceData.events.push({
    other,
    totalForce: {...totalForce},
    totalForceMagnitude,
    maxForceDirection: {...maxForceDirection},
    maxForceMagnitude,
  })

  // Fire callback if registered
  if (entity.has(CollisionCallbacks)) {
    const callback = entity.get(CollisionCallbacks)!.onContactForce
    if (callback) {
      _contactForceEvent.other = other
      _contactForceEvent.totalForce.x = totalForce.x
      _contactForceEvent.totalForce.y = totalForce.y
      _contactForceEvent.totalForce.z = totalForce.z
      _contactForceEvent.totalForceMagnitude = totalForceMagnitude
      _contactForceEvent.maxForceDirection.x = maxForceDirection.x
      _contactForceEvent.maxForceDirection.y = maxForceDirection.y
      _contactForceEvent.maxForceDirection.z = maxForceDirection.z
      _contactForceEvent.maxForceMagnitude = maxForceMagnitude
      callback(_contactForceEvent)
    }
  }
}

function ensureContactForceReceived(entity: Entity) {
  if (!entity.has(ContactForceReceived)) {
    entity.add(ContactForceReceived)
  }
  return entity.get(ContactForceReceived)!
}

// ============================================
// Event Cleanup
// ============================================

const collisionEnteredQuery = createQuery(CollisionEntered)
const collisionExitedQuery = createQuery(CollisionExited)
const contactForceQuery = createQuery(ContactForceReceived)

export function clearCollisionEvents(world: World) {
  // Use updateEach for batched trait access
  world.query(collisionEnteredQuery).updateEach(([collision]) => {
    collision.entities.clear()
  })

  world.query(collisionExitedQuery).updateEach(([collision]) => {
    collision.entities.clear()
  })

  // Clear contact force events
  world.query(contactForceQuery).updateEach(([force]) => {
    force.events.length = 0
  })
}

// ============================================
// Collision Query Helpers
// ============================================

const _emptySet = new Set<Entity>()
const _emptyArray: readonly ContactForceEvent[] = []

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

// ============================================
// Contact Force Query Helpers
// ============================================

/**
 * Get all contact force events received by an entity this frame.
 * Returns an empty array if no contact forces were received.
 */
export function getContactForces(entity: Entity): readonly ContactForceEvent[] {
  if (!entity.has(ContactForceReceived)) return _emptyArray
  return entity.get(ContactForceReceived)!.events
}

/**
 * Get the total force magnitude received by an entity this frame.
 * Sums all contact force magnitudes from all contacts.
 */
export function getTotalContactForceMagnitude(entity: Entity): number {
  if (!entity.has(ContactForceReceived)) return 0
  const events = entity.get(ContactForceReceived)!.events
  let total = 0
  for (const event of events) {
    total += event.totalForceMagnitude
  }
  return total
}

/**
 * Get the maximum force magnitude received in any single contact this frame.
 */
export function getMaxContactForceMagnitude(entity: Entity): number {
  if (!entity.has(ContactForceReceived)) return 0
  const events = entity.get(ContactForceReceived)!.events
  let max = 0
  for (const event of events) {
    if (event.maxForceMagnitude > max) {
      max = event.maxForceMagnitude
    }
  }
  return max
}

// ============================================
// Sleep State Helpers
// ============================================

/**
 * Check if an entity's rigid body is currently sleeping.
 */
export function isSleeping(entity: Entity): boolean {
  if (!entity.has(SleepState)) return false
  return entity.get(SleepState)!.sleeping
}

/**
 * Check if an entity's rigid body just fell asleep this frame.
 */
export function justSlept(entity: Entity): boolean {
  if (!entity.has(SleepState)) return false
  return entity.get(SleepState)!.justSlept
}

/**
 * Check if an entity's rigid body just woke up this frame.
 */
export function justWoke(entity: Entity): boolean {
  if (!entity.has(SleepState)) return false
  return entity.get(SleepState)!.justWoke
}

/**
 * Force a rigid body to sleep.
 * The body will wake up automatically if touched by another body.
 */
export function putToSleep(entity: Entity): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.sleep()
  }
}

/**
 * Force a rigid body to wake up.
 */
export function wakeUp(entity: Entity): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.wakeUp()
  }
}
