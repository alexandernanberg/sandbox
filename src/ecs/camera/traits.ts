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
  /** Base distance from target */
  distance: 5,
  /** Current effective distance after collision */
  currentDistance: 5,
  /** Looking up limit (~-30 degrees) */
  minPitch: -0.5,
  /** Looking down limit (~70 degrees) */
  maxPitch: 1.2,
  /** Mouse sensitivity (radians per pixel) */
  sensitivity: 0.003,

  // Collision settings
  /** Minimum distance camera can be from target */
  minDistance: 1.5,
  /** Padding from collision surface */
  collisionPadding: 0.2,

  // Asymmetric collision smoothing (rotation is instant, only distance is smoothed)
  /** Smoothing when pulling camera in (collision) - higher = faster */
  pullInSmoothing: 25.0,
  /** Smoothing when easing camera out (recovery) - higher = faster */
  easeOutSmoothing: 5.0,

  // Look-ahead framing
  /** How far ahead to offset based on velocity */
  lookAheadDistance: 1.5,
  /** How fast look-ahead responds to velocity changes */
  lookAheadSmoothing: 3.0,
  /** Current look-ahead offset (smoothed) */
  lookAheadX: 0,
  lookAheadZ: 0,

  // Aim offset (shifts player in frame)
  /** Horizontal offset - positive moves player left of center */
  aimOffsetX: 0.3,
})

// ============================================
// Camera Noise Trait
// ============================================

/**
 * Perlin noise settings for subtle natural camera movement.
 * Inspired by Cinemachine's noise profiles.
 */
export const CameraNoise = trait({
  /** Position noise amplitude (units) */
  positionAmplitude: 0.015,
  /** Position noise frequency */
  positionFrequency: 0.4,
  /** Rotation noise amplitude (radians) */
  rotationAmplitude: 0.002,
  /** Rotation noise frequency */
  rotationFrequency: 0.3,
  /** Whether noise is enabled */
  enabled: true,
})

// ============================================
// Camera Shake Trait
// ============================================

/**
 * Trauma-based camera shake system.
 * Trauma accumulates from impacts and decays over time.
 * Shake intensity = trauma^2 for snappier feel.
 */
export const CameraShake = trait({
  /** Current trauma level (0-1) */
  trauma: 0,
  /** How fast trauma decays per second */
  traumaDecay: 1.5,
  /** Maximum position offset (units) */
  maxOffset: 0.3,
  /** Maximum rotation offset (radians, ~5 degrees) */
  maxRotation: 0.08,
  /** Shake frequency */
  frequency: 25,
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
