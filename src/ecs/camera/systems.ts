import {createQuery} from 'koota'
import type {World} from 'koota'
import {CameraOrbit, CameraInput} from './traits'

// ============================================
// Cached Queries
// ============================================

const cameraOrbitQuery = createQuery(CameraOrbit)
const cameraInputQuery = createQuery(CameraInput)

// ============================================
// Camera Input System
// ============================================

/**
 * Updates camera orbit state from mouse input.
 * Call this before rendering but after input is captured.
 */
export function cameraInputSystem(world: World) {
  // Get camera input singleton
  let deltaX = 0
  let deltaY = 0
  let locked = false

  for (const entity of world.query(cameraInputQuery)) {
    const input = entity.get(CameraInput)!
    deltaX = input.delta.x
    deltaY = input.delta.y
    locked = input.locked
    // Clear delta after reading (consumed)
    entity.set(CameraInput, (i) => {
      i.delta.x = 0
      i.delta.y = 0
      return i
    })
    break
  }

  // Only update camera if pointer is locked
  if (!locked) return

  // Update camera orbit
  for (const entity of world.query(cameraOrbitQuery)) {
    const orbit = entity.get(CameraOrbit)!
    const sensitivity = orbit.sensitivity

    // Update yaw and pitch
    const newYaw = orbit.yaw - deltaX * sensitivity
    let newPitch = orbit.pitch + deltaY * sensitivity

    // Clamp pitch
    newPitch = Math.max(orbit.minPitch, Math.min(orbit.maxPitch, newPitch))

    entity.set(CameraOrbit, (o) => {
      o.yaw = newYaw
      o.pitch = newPitch
      return o
    })
    break // Only one camera
  }
}

/**
 * Smoothly interpolate an angle, handling wraparound.
 */
export function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * t
}
