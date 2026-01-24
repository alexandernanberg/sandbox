import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {trait} from 'koota'
import type {Entity, World} from 'koota'
import {ColliderRef} from './traits'

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
// Handle to Entity Mapping
// ============================================

export type HandleToEntityMap = Map<number, Entity>

export function createHandleToEntityMap(): HandleToEntityMap {
  return new Map()
}

// ============================================
// Collision Event Processing
// ============================================

export function processCollisionEvents(
  world: World,
  rapierWorld: RAPIER.World,
  eventQueue: RAPIER.EventQueue,
  handleToEntity: HandleToEntityMap,
) {
  eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    const entity1 = findEntityFromHandle(rapierWorld, handle1, handleToEntity)
    const entity2 = findEntityFromHandle(rapierWorld, handle2, handleToEntity)

    if (entity1 && entity2) {
      processCollisionPair(entity1, entity2, started)
    }
  })
}

function findEntityFromHandle(
  rapierWorld: RAPIER.World,
  colliderHandle: number,
  handleToEntity: HandleToEntityMap,
): Entity | null {
  // First check direct collider mapping
  const directEntity = handleToEntity.get(colliderHandle)
  if (directEntity) return directEntity

  // Fallback: find parent rigid body
  const collider = rapierWorld.getCollider(colliderHandle)
  if (!collider) return null

  const parent = collider.parent()
  if (!parent) return null

  // Search through all entities with colliders to find parent body
  // This is a fallback for entities that weren't properly registered
  return null
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
  } else {
    // Add collision exited event
    ensureCollisionExited(entity1).entities.push(entity2)
    ensureCollisionExited(entity2).entities.push(entity1)
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
