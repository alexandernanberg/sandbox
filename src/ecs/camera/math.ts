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
