import * as RAPIER from '@dimforge/rapier3d-simd-compat'
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
  /**
   * Number of solver iterations (default: 4).
   * Higher values = more rigid/realistic simulation but more CPU intensive.
   * Recommended: 4 for games, 8+ for more realistic simulations.
   */
  numSolverIterations?: number
  /**
   * Number of internal PGS iterations per solver step (default: 1).
   * Increasing this improves stability with less CPU cost than numSolverIterations.
   */
  numInternalPgsIterations?: number
  /**
   * Maximum CCD substeps for fast-moving objects (default: 1).
   * Higher values provide smoother trajectories at increased cost.
   */
  maxCcdSubsteps?: number
}

const DEFAULT_GRAVITY = {x: 0, y: -9.81, z: 0}
const DEFAULT_SOLVER_ITERATIONS = 4
const DEFAULT_INTERNAL_PGS_ITERATIONS = 1
const DEFAULT_MAX_CCD_SUBSTEPS = 1

// Must be called after RAPIER.init() completes
export function initPhysicsWorld(
  ecsWorld: World,
  config: PhysicsConfig = {},
): void {
  if (physicsWorld.initialized) {
    return
  }

  const gravity = config.gravity ?? DEFAULT_GRAVITY
  const numSolverIterations =
    config.numSolverIterations ?? DEFAULT_SOLVER_ITERATIONS
  const numInternalPgsIterations =
    config.numInternalPgsIterations ?? DEFAULT_INTERNAL_PGS_ITERATIONS
  const maxCcdSubsteps = config.maxCcdSubsteps ?? DEFAULT_MAX_CCD_SUBSTEPS

  physicsWorld.rapier = new RAPIER.World(gravity)
  physicsWorld.rapier.timestep = FIXED_TIMESTEP

  // Configure solver iterations for rigidity/stability
  physicsWorld.rapier.numSolverIterations = numSolverIterations
  physicsWorld.rapier.numInternalPgsIterations = numInternalPgsIterations
  physicsWorld.rapier.maxCcdSubsteps = maxCcdSubsteps

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

// ============================================
// Runtime Configuration
// ============================================

/**
 * Set the number of solver iterations at runtime.
 * Higher values = more rigid/realistic simulation but more CPU intensive.
 */
export function setSolverIterations(iterations: number): void {
  if (physicsWorld.rapier) {
    physicsWorld.rapier.numSolverIterations = iterations
  }
}

/**
 * Set the number of internal PGS iterations at runtime.
 * Increasing this improves stability with less CPU cost than solver iterations.
 */
export function setInternalPgsIterations(iterations: number): void {
  if (physicsWorld.rapier) {
    physicsWorld.rapier.numInternalPgsIterations = iterations
  }
}

/**
 * Set the maximum CCD substeps at runtime.
 * Higher values provide smoother trajectories for fast-moving objects.
 */
export function setMaxCcdSubsteps(substeps: number): void {
  if (physicsWorld.rapier) {
    physicsWorld.rapier.maxCcdSubsteps = substeps
  }
}

// ============================================
// Profiling (debug only)
// ============================================

export interface PhysicsTimings {
  step: number
  collisionDetection: number
  solver: number
  ccdSolver: number
  queryPipeline: number
}

/**
 * Enable or disable the built-in profiler.
 * When enabled, timing data can be retrieved via getPhysicsTimings().
 */
export function setProfilerEnabled(enabled: boolean): void {
  if (physicsWorld.rapier) {
    physicsWorld.rapier.profilerEnabled = enabled
  }
}

/**
 * Get physics timing data (requires profiler to be enabled).
 * Returns null if profiler is disabled or world not initialized.
 */
export function getPhysicsTimings(): PhysicsTimings | null {
  if (!physicsWorld.rapier || !physicsWorld.rapier.profilerEnabled) {
    return null
  }

  return {
    step: physicsWorld.rapier.timingStep,
    collisionDetection: physicsWorld.rapier.timingCollisionDetection,
    solver: physicsWorld.rapier.timingSolver,
    ccdSolver: physicsWorld.rapier.timingCcdSolver,
    queryPipeline: physicsWorld.rapier.timingQueryPipeline,
  }
}
