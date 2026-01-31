import * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {createQuery} from 'koota'
import type {World} from 'koota'
import {cameraInputSystem, cameraUpdateSystem} from '../camera/systems'
import {isPaused} from '../game'
import {
  playerMovementSystem,
  playerFacingSystem,
  playerStateMachineSystem,
} from '../player/systems'
import {Input} from '../player/traits'
import {
  createCharacterController,
  characterControllerSystem,
  characterPostStepSystem,
} from './character'
import {processCollisionEvents, clearCollisionEvents} from './events'
import {
  initializeTransformFromObject3D,
  createPhysicsBodies,
  createColliders,
  storePreviousTransforms,
  syncTransformFromPhysics,
  interpolateTransforms,
  smoothCharacterVisuals,
  syncToObject3D,
} from './systems'
import {physicsWorld, FIXED_TIMESTEP, MAX_DELTA} from './world'

// Cached query for input singleton
const inputQuery = createQuery(Input)

// Default input (reused to avoid per-frame allocation)
const _defaultInput = {movement: {x: 0, y: 0}, jump: false, sprint: false}

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

  // Check if game is paused - still update camera but skip physics
  const paused = isPaused(ecsWorld)

  // Clamp delta to prevent spiral of death
  if (delta > MAX_DELTA) {
    delta = MAX_DELTA
  }

  // Update camera orbit from mouse/gamepad input (always, even when paused)
  cameraInputSystem(ecsWorld)

  // If paused, skip physics simulation but still sync visuals
  if (paused) {
    // Still sync Object3Ds for any queued visual updates
    syncToObject3D(ecsWorld)
    return {stepped: false, alpha: physicsWorld.accumulator / FIXED_TIMESTEP}
  }

  // Initialize transforms from Object3D world matrices
  initializeTransformFromObject3D(ecsWorld)

  // Create any new physics bodies/colliders
  createPhysicsBodies(ecsWorld, rapier)
  createColliders(ecsWorld, rapier)
  createCharacterController(ecsWorld, rapier, RAPIER)

  physicsWorld.accumulator += delta

  let stepped = false

  // Get input singleton for state machine
  let input = _defaultInput
  const inputEntities = ecsWorld.query(inputQuery)
  for (const entity of inputEntities) {
    input = entity.get(Input)!
    break
  }

  // Fixed timestep loop
  while (physicsWorld.accumulator >= FIXED_TIMESTEP) {
    stepped = true

    // Run before-step callbacks
    for (const cb of beforeStepCallbacks) {
      cb(FIXED_TIMESTEP)
    }

    // Store previous transforms for interpolation
    storePreviousTransforms(ecsWorld)

    // Run player movement system (reads input, sets character velocity)
    playerMovementSystem(ecsWorld, FIXED_TIMESTEP)

    // Run character controller system (sets kinematic positions)
    characterControllerSystem(ecsWorld, rapier, FIXED_TIMESTEP)

    // Step the physics simulation
    rapier.step(eventQueue)

    // Sync physics state back to ECS
    syncTransformFromPhysics(ecsWorld)

    // Post-step: push characters out of kinematic bodies that moved into them
    characterPostStepSystem(ecsWorld, rapier, FIXED_TIMESTEP)

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

  // Smooth character visual Y offset (for step-up animation)
  smoothCharacterVisuals(ecsWorld, delta)

  // Sync to Three.js Object3Ds
  syncToObject3D(ecsWorld)

  // Update player facing direction (visual mesh rotation)
  playerFacingSystem(ecsWorld, delta)

  // Update player state machine (after physics, reflects actual state)
  playerStateMachineSystem(ecsWorld, delta, input)

  // Update camera system (follow, collision, noise, shake)
  cameraUpdateSystem(ecsWorld, delta)

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
