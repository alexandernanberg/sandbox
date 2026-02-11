import * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import type {World} from 'koota'
import {RigidBodyRef, ColliderRef, IsPhysicsEntity} from './traits'

// ============================================
// Physics World Singleton
// ============================================

export interface PhysicsWorldState {
  rapier: RAPIER.World | null
  eventQueue: RAPIER.EventQueue | null
  accumulator: number
  initialized: boolean
  // Cleanup subscriptions
  cleanupSubscriptions: (() => void)[]
  // Callbacks
  beforeStepCallbacks: Set<(delta: number) => void>
  afterStepCallbacks: Set<(delta: number) => void>
}

export const physicsWorld: PhysicsWorldState = {
  rapier: null,
  eventQueue: null,
  accumulator: 0,
  initialized: false,
  cleanupSubscriptions: [],
  beforeStepCallbacks: new Set(),
  afterStepCallbacks: new Set(),
}

export const FIXED_TIMESTEP = 1 / 60
export const MAX_DELTA = 0.25

export interface PhysicsConfig {
  gravity?: {x: number; y: number; z: number}
}

const DEFAULT_GRAVITY = {x: 0, y: -9.81, z: 0}

// Must be called after RAPIER.init() completes
export function initPhysicsWorld(
  ecsWorld: World,
  config: PhysicsConfig = {},
): void {
  if (physicsWorld.initialized) {
    return
  }

  const gravity = config.gravity ?? DEFAULT_GRAVITY

  physicsWorld.rapier = new RAPIER.World(gravity)
  physicsWorld.rapier.timestep = FIXED_TIMESTEP
  physicsWorld.eventQueue = new RAPIER.EventQueue(true)
  physicsWorld.accumulator = 0
  physicsWorld.initialized = true

  // Set up automatic cleanup when physics traits are removed
  const unsubCollider = ecsWorld.onRemove(ColliderRef, (entity) => {
    const rapier = physicsWorld.rapier
    if (!rapier) return

    const colliderRef = entity.get(ColliderRef)
    if (colliderRef?.collider != null && colliderRef.handle != null) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (rapier.getCollider(colliderRef.handle)) {
          rapier.removeCollider(colliderRef.collider, true)
        }
      } catch {
        // Collider may already be removed
      }
    }
  })

  const unsubRigidBody = ecsWorld.onRemove(RigidBodyRef, (entity) => {
    const rapier = physicsWorld.rapier
    if (!rapier) return

    const bodyRef = entity.get(RigidBodyRef)
    if (bodyRef?.body != null && bodyRef.handle != null) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (rapier.getRigidBody(bodyRef.handle)) {
          rapier.removeRigidBody(bodyRef.body)
        }
      } catch {
        // Body may already be removed
      }
    }
  })

  physicsWorld.cleanupSubscriptions.push(unsubCollider, unsubRigidBody)
}

export function destroyPhysicsWorld(ecsWorld: World): void {
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

  // Free Rapier resources
  if (physicsWorld.eventQueue) {
    physicsWorld.eventQueue.free()
    physicsWorld.eventQueue = null
  }

  if (physicsWorld.rapier) {
    physicsWorld.rapier.free()
    physicsWorld.rapier = null
  }

  physicsWorld.accumulator = 0
  physicsWorld.initialized = false
  physicsWorld.beforeStepCallbacks.clear()
  physicsWorld.afterStepCallbacks.clear()
}

export function setGravity(gravity: {x: number; y: number; z: number}): void {
  if (physicsWorld.rapier) {
    physicsWorld.rapier.gravity = gravity
  }
}

export function getRapierWorld(): RAPIER.World | null {
  return physicsWorld.rapier
}

export function getEventQueue(): RAPIER.EventQueue | null {
  return physicsWorld.eventQueue
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
