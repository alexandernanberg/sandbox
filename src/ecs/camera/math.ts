// ============================================
// Camera Math Utilities
// Pure functions for camera calculations - easy to test
// ============================================

import type {Vec3} from '~/lib/math'

/**
 * Simple 2D noise function using layered sine waves.
 * No external dependencies, deterministic output.
 * Returns values roughly in range [-1, 1].
 */
export function noise2D(x: number, y: number): number {
  const n1 = Math.sin(x * 1.27 + y * 3.71) * 0.5
  const n2 = Math.sin(x * 2.31 + y * 1.43) * 0.3
  const n3 = Math.sin(x * 3.91 + y * 2.17) * 0.2
  return n1 + n2 + n3
}

/**
 * Compute camera position in spherical coordinates around target.
 *
 * @param target - Target position to orbit around
 * @param yaw - Horizontal rotation (radians), 0 = behind target (+Z)
 * @param pitch - Vertical rotation (radians), 0 = horizontal, positive = up
 * @param distance - Distance from target
 * @param heightOffset - Vertical offset from target position
 * @returns Camera world position
 */
export function computeCameraPosition(
  target: Vec3,
  yaw: number,
  pitch: number,
  distance: number,
  heightOffset: number,
): Vec3 {
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  return {
    x: target.x + distance * cosPitch * sinYaw,
    y: target.y + heightOffset + distance * sinPitch,
    z: target.z + distance * cosPitch * cosYaw,
  }
}

/**
 * Calculate exponential smoothing factor for frame-rate independent lerping.
 * Higher smoothing = faster response.
 *
 * @param smoothing - Smoothing factor (higher = faster, ~8 is moderate, ~20 is snappy)
 * @param delta - Frame delta time in seconds
 * @returns Interpolation factor t (0-1)
 */
export function exponentialSmoothing(smoothing: number, delta: number): number {
  return 1 - Math.exp(-smoothing * delta)
}

/**
 * Simulate smoothing over multiple frames to reach a target.
 * Useful for testing that asymmetric smoothing works correctly.
 *
 * @param start - Starting value
 * @param target - Target value
 * @param smoothing - Smoothing factor
 * @param delta - Frame delta time
 * @param threshold - How close to target before considered "arrived"
 * @param maxFrames - Safety limit to prevent infinite loops
 * @returns Number of frames to reach target
 */
export function simulateSmoothingFrames(
  start: number,
  target: number,
  smoothing: number,
  delta: number,
  threshold = 0.01,
  maxFrames = 1000,
): number {
  let current = start
  let frames = 0

  while (Math.abs(current - target) > threshold && frames < maxFrames) {
    const t = exponentialSmoothing(smoothing, delta)
    current += (target - current) * t
    frames++
  }

  return frames
}

/**
 * Calculate camera's right vector from yaw angle.
 * Used for whisker offset calculations.
 */
export function getCameraRight(yaw: number): {x: number; z: number} {
  return {
    x: Math.cos(yaw),
    z: -Math.sin(yaw),
  }
}

/**
 * Calculate camera's up vector from yaw and pitch.
 * Used for whisker offset calculations.
 */
export function getCameraUp(
  yaw: number,
  pitch: number,
): {x: number; y: number; z: number} {
  const sinPitch = Math.sin(pitch)
  const cosPitch = Math.cos(pitch)
  const sinYaw = Math.sin(yaw)
  const cosYaw = Math.cos(yaw)

  return {
    x: -sinPitch * sinYaw,
    y: cosPitch,
    z: -sinPitch * cosYaw,
  }
}

/**
 * Calculate distance between two 3D points.
 */
export function distance3D(a: Vec3, b: Vec3): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// ============================================
// 3-Rig Orbit System (Cinemachine-style)
// ============================================

export interface OrbitRig {
  distance: number
  height: number
}

/**
 * Interpolate between 3 orbit rigs based on pitch angle.
 *
 * The system works like Cinemachine's FreeLook camera:
 * - Top rig: when looking down (pitch > 0)
 * - Middle rig: horizontal view (pitch = 0)
 * - Bottom rig: when looking up (pitch < 0)
 *
 * @param pitch - Current pitch in radians
 * @param minPitch - Minimum pitch (looking up limit, negative)
 * @param maxPitch - Maximum pitch (looking down limit, positive)
 * @param top - Top orbit rig (high pitch, looking down)
 * @param middle - Middle orbit rig (horizontal)
 * @param bottom - Bottom orbit rig (low pitch, looking up)
 * @returns Interpolated distance and height
 */
export function interpolateOrbitRigs(
  pitch: number,
  minPitch: number,
  maxPitch: number,
  top: OrbitRig,
  middle: OrbitRig,
  bottom: OrbitRig,
): OrbitRig {
  // Normalize pitch to 0-1 range where:
  // 0 = minPitch (looking up, bottom rig)
  // 0.5 = 0 pitch (horizontal, middle rig)
  // 1 = maxPitch (looking down, top rig)

  // Calculate the "zero point" in the normalized range
  // This is where pitch = 0 falls between minPitch and maxPitch
  const range = maxPitch - minPitch
  const zeroPoint = -minPitch / range // Where pitch=0 is in 0-1 range

  // Normalize current pitch
  const normalizedPitch = (pitch - minPitch) / range

  let distance: number
  let height: number

  if (normalizedPitch <= zeroPoint) {
    // Between bottom and middle (looking up to horizontal)
    // t=0 at minPitch (bottom), t=1 at pitch=0 (middle)
    const t = normalizedPitch / zeroPoint
    // Use smoothstep for smoother blending
    const smooth = smoothstep(t)
    distance = bottom.distance + (middle.distance - bottom.distance) * smooth
    height = bottom.height + (middle.height - bottom.height) * smooth
  } else {
    // Between middle and top (horizontal to looking down)
    // t=0 at pitch=0 (middle), t=1 at maxPitch (top)
    const t = (normalizedPitch - zeroPoint) / (1 - zeroPoint)
    const smooth = smoothstep(t)
    distance = middle.distance + (top.distance - middle.distance) * smooth
    height = middle.height + (top.height - middle.height) * smooth
  }

  return {distance, height}
}

/**
 * Attempt to blend between 3 rigs by treating them as a smooth curve.
 * Variant: simple 3-point Catmull-Rom spline might give even nicer results in future.
 */
export function interpolateOrbitRigsSmooth(
  pitch: number,
  minPitch: number,
  maxPitch: number,
  top: OrbitRig,
  middle: OrbitRig,
  bottom: OrbitRig,
): OrbitRig {
  // Map pitch to -1 to 1 range where:
  // -1 = minPitch (looking up, bottom rig)
  //  0 = 0 pitch (horizontal, middle rig)
  //  1 = maxPitch (looking down, top rig)

  let t: number
  if (pitch >= 0) {
    // Looking down: 0 to 1
    t = maxPitch > 0 ? pitch / maxPitch : 0
  } else {
    // Looking up: -1 to 0
    t = minPitch < 0 ? pitch / -minPitch : 0
  }
  t = clamp(t, -1, 1)

  // Use quadratic blending for smooth transitions
  // At t=0, we want 100% middle
  // At t=1, we want 100% top
  // At t=-1, we want 100% bottom

  // Calculate blend weights using smooth curves
  const absT = Math.abs(t)
  const middleWeight = 1 - absT * absT // Peaks at t=0
  const topWeight = t > 0 ? t * t : 0 // Only positive t
  const bottomWeight = t < 0 ? absT * absT : 0 // Only negative t

  // Normalize weights (should already sum to ~1, but be safe)
  const totalWeight = middleWeight + topWeight + bottomWeight

  const distance =
    (middle.distance * middleWeight +
      top.distance * topWeight +
      bottom.distance * bottomWeight) /
    totalWeight

  const height =
    (middle.height * middleWeight +
      top.height * topWeight +
      bottom.height * bottomWeight) /
    totalWeight

  return {distance, height}
}

/**
 * Attempt to blend smoothly for cosine-like smoothstep, to ease in/out of the extremes.
 */
function smoothstep(t: number): number {
  // Hermite interpolation: 3t² - 2t³
  const clamped = clamp(t, 0, 1)
  return clamped * clamped * (3 - 2 * clamped)
}
