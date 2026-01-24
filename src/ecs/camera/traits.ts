import {trait} from 'koota'
import type {Vec2} from '~/lib/math'

// ============================================
// Camera Orbit Traits
// ============================================

/**
 * Camera orbit state - controls the third person camera position.
 * Yaw/pitch define spherical coordinates around the target.
 */
export const CameraOrbit = trait({
  /** Horizontal rotation (radians) */
  yaw: 0,
  /** Vertical rotation (radians), clamped between minPitch and maxPitch */
  pitch: 0.3,
  /** Distance from target */
  distance: 5,
  /** Looking up limit (~-30 degrees) */
  minPitch: -0.5,
  /** Looking down limit (~70 degrees) */
  maxPitch: 1.2,
  /** Mouse sensitivity (radians per pixel) */
  sensitivity: 0.003,
})

/**
 * Raw mouse delta input for camera control.
 * Updated by InputManager when pointer is locked.
 */
export const CameraInput = trait(() => ({
  /** Mouse delta this frame */
  delta: {x: 0, y: 0} as Vec2,
  /** Whether pointer lock is active */
  locked: false,
}))

// ============================================
// Camera Target Traits
// ============================================

/** Tag for the entity the camera follows */
export const IsCameraTarget = trait()
