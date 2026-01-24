import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {trait} from 'koota'
import type {Entity, World} from 'koota'
import {CollisionCallbacks} from './traits'

// ============================================
// Collision Event Traits
// ============================================

// Stores entities that started colliding this frame
export const CollisionEntered = trait(() => ({
  entities: [] as Entity[],
}))

// Stores entities that stopped colliding this frame
export const CollisionExited = trait(() => ({
  entities: [] as Entity[],
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

function processCollisionPair(
  entity1: Entity,
  entity2: Entity,
  started: boolean,
) {
  if (started) {
    // Add collision entered event
    ensureCollisionEntered(entity1).entities.push(entity2)
    ensureCollisionEntered(entity2).entities.push(entity1)

    // Fire callbacks
    if (entity1.has(CollisionCallbacks)) {
      entity1.get(CollisionCallbacks)!.onEnter?.({other: entity2})
    }
    if (entity2.has(CollisionCallbacks)) {
      entity2.get(CollisionCallbacks)!.onEnter?.({other: entity1})
    }
  } else {
    // Add collision exited event
    ensureCollisionExited(entity1).entities.push(entity2)
    ensureCollisionExited(entity2).entities.push(entity1)

    // Fire callbacks
    if (entity1.has(CollisionCallbacks)) {
      entity1.get(CollisionCallbacks)!.onExit?.({other: entity2})
    }
    if (entity2.has(CollisionCallbacks)) {
      entity2.get(CollisionCallbacks)!.onExit?.({other: entity1})
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

export function clearCollisionEvents(world: World) {
  const enteredEntities = world.query(CollisionEntered)
  for (const entity of enteredEntities) {
    const entered = entity.get(CollisionEntered)!
    entered.entities.length = 0
  }

  const exitedEntities = world.query(CollisionExited)
  for (const entity of exitedEntities) {
    const exited = entity.get(CollisionExited)!
    exited.entities.length = 0
  }
}

// ============================================
// Collision Query Helpers
// ============================================

export function getCollisionsEntered(entity: Entity): readonly Entity[] {
  if (!entity.has(CollisionEntered)) return []
  return entity.get(CollisionEntered)!.entities
}

export function getCollisionsExited(entity: Entity): readonly Entity[] {
  if (!entity.has(CollisionExited)) return []
  return entity.get(CollisionExited)!.entities
}

export function isCollidingWith(entity: Entity, other: Entity): boolean {
  const entered = getCollisionsEntered(entity)
  return entered.includes(other)
}
