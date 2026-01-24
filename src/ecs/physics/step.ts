import type {World} from 'koota'
import {createCharacterController, characterControllerSystem} from './character'
import {processCollisionEvents, clearCollisionEvents} from './events'
import {
  initializeTransformFromObject3D,
  createPhysicsBodies,
  createColliders,
  storePreviousTransforms,
  syncTransformFromPhysics,
  interpolateTransforms,
  syncToObject3D,
} from './systems'
import {physicsWorld, FIXED_TIMESTEP, MAX_DELTA} from './world'

export interface StepResult {
  stepped: boolean
  alpha: number
}

/**
 * Step the physics simulation.
 * Call this once per frame with the frame delta time.
 * Returns the interpolation alpha for rendering.
 */
export function stepPhysics(ecsWorld: World, delta: number): StepResult {
  const {rapier, eventQueue, beforeStepCallbacks, afterStepCallbacks} =
    physicsWorld

  if (!rapier || !eventQueue) {
    return {stepped: false, alpha: 0}
  }

  // Clamp delta to prevent spiral of death
  if (delta > MAX_DELTA) {
    delta = MAX_DELTA
  }

  // Initialize transforms from Object3D world matrices
  initializeTransformFromObject3D(ecsWorld)

  // Create any new physics bodies/colliders
  createPhysicsBodies(ecsWorld, rapier)
  createColliders(ecsWorld, rapier)
  createCharacterController(ecsWorld, rapier)

  physicsWorld.accumulator += delta

  let stepped = false

  // Fixed timestep loop
  while (physicsWorld.accumulator >= FIXED_TIMESTEP) {
    stepped = true

    // Run before-step callbacks
    for (const cb of beforeStepCallbacks) {
      cb(FIXED_TIMESTEP)
    }

    // Store previous transforms for interpolation
    storePreviousTransforms(ecsWorld)

    // Run character controller system (sets kinematic positions)
    characterControllerSystem(ecsWorld, rapier)

    // Step the physics simulation
    rapier.step(eventQueue)

    // Sync physics state back to ECS
    syncTransformFromPhysics(ecsWorld)

    // Process collision events
    processCollisionEvents(rapier, eventQueue)

    // Run after-step callbacks
    for (const cb of afterStepCallbacks) {
      cb(FIXED_TIMESTEP)
    }

    physicsWorld.accumulator -= FIXED_TIMESTEP
  }

  // Calculate interpolation alpha
  const alpha = physicsWorld.accumulator / FIXED_TIMESTEP

  // Interpolate transforms for smooth rendering
  interpolateTransforms(ecsWorld, alpha)

  // Sync to Three.js Object3Ds
  syncToObject3D(ecsWorld)

  // Clear collision events at end of frame
  clearCollisionEvents(ecsWorld)

  return {stepped, alpha}
}

/**
 * Get the current interpolation alpha.
 * Useful for custom rendering that needs to match physics interpolation.
 */
export function getInterpolationAlpha(): number {
  return physicsWorld.accumulator / FIXED_TIMESTEP
}
