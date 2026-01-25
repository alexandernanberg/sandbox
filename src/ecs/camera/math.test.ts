import {describe, expect, test} from 'bun:test'
import type {OrbitRig} from './math'
import {
  noise2D,
  computeCameraPosition,
  exponentialSmoothing,
  simulateSmoothingFrames,
  getCameraRight,
  getCameraUp,
  distance3D,
  clamp,
  interpolateOrbitRigs,
  interpolateOrbitRigsSmooth,
} from './math'

// ============================================
// noise2D Tests
// ============================================

describe('noise2D', () => {
  test('returns values in expected range [-1, 1]', () => {
    // Sample many points to check range
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37 // Non-repeating pattern
      const y = i * 0.53
      const val = noise2D(x, y)

      expect(val).toBeGreaterThanOrEqual(-1)
      expect(val).toBeLessThanOrEqual(1)
    }
  })

  test('is deterministic - same inputs produce same outputs', () => {
    expect(noise2D(1.5, 2.3)).toBe(noise2D(1.5, 2.3))
    expect(noise2D(0, 0)).toBe(noise2D(0, 0))
    expect(noise2D(-5, 10)).toBe(noise2D(-5, 10))
  })

  test('varies with input - different inputs produce different outputs', () => {
    expect(noise2D(0, 0)).not.toBe(noise2D(1, 0))
    expect(noise2D(0, 0)).not.toBe(noise2D(0, 1))
    expect(noise2D(1, 2)).not.toBe(noise2D(2, 1))
  })

  test('produces continuous values - small changes produce small differences', () => {
    const base = noise2D(5, 5)
    const nearby = noise2D(5.001, 5.001)
    const diff = Math.abs(base - nearby)

    // Small input change should produce small output change
    expect(diff).toBeLessThan(0.1)
  })
})

// ============================================
// computeCameraPosition Tests
// ============================================

describe('computeCameraPosition', () => {
  const origin = {x: 0, y: 0, z: 0}

  test('places camera behind target at distance when yaw=0, pitch=0', () => {
    const pos = computeCameraPosition(origin, 0, 0, 5, 1.5)

    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.y).toBeCloseTo(1.5, 5) // heightOffset only
    expect(pos.z).toBeCloseTo(5, 5) // behind target on +Z
  })

  test('rotates camera around target with yaw (90 degrees)', () => {
    const pos = computeCameraPosition(origin, Math.PI / 2, 0, 5, 1.5)

    expect(pos.x).toBeCloseTo(5, 5) // now to the right
    expect(pos.y).toBeCloseTo(1.5, 5)
    expect(pos.z).toBeCloseTo(0, 5)
  })

  test('rotates camera around target with yaw (180 degrees)', () => {
    const pos = computeCameraPosition(origin, Math.PI, 0, 5, 1.5)

    expect(pos.x).toBeCloseTo(0, 5)
    expect(pos.y).toBeCloseTo(1.5, 5)
    expect(pos.z).toBeCloseTo(-5, 5) // in front of target
  })

  test('elevates camera with positive pitch', () => {
    const pos = computeCameraPosition(origin, 0, Math.PI / 4, 5, 1.5)

    // At 45 degrees pitch, camera should be elevated
    expect(pos.y).toBeGreaterThan(1.5)
    // Distance in XZ plane should be less than full distance
    const horizDist = Math.sqrt(pos.x * pos.x + pos.z * pos.z)
    expect(horizDist).toBeLessThan(5)
  })

  test('lowers camera with negative pitch', () => {
    const pos = computeCameraPosition(origin, 0, -Math.PI / 6, 5, 1.5)

    // Camera should be below heightOffset
    expect(pos.y).toBeLessThan(1.5)
  })

  test('maintains correct distance from target + heightOffset point', () => {
    const yaw = 0.7
    const pitch = 0.3
    const distance = 7
    const heightOffset = 2

    const pos = computeCameraPosition(
      origin,
      yaw,
      pitch,
      distance,
      heightOffset,
    )

    // Calculate actual distance from orbit center (target + heightOffset)
    const orbitCenter = {x: origin.x, y: origin.y + heightOffset, z: origin.z}
    const actualDist = distance3D(pos, orbitCenter)

    expect(actualDist).toBeCloseTo(distance, 4)
  })

  test('works with non-zero target position', () => {
    const target = {x: 10, y: 5, z: -3}
    const pos = computeCameraPosition(target, 0, 0, 5, 1.5)

    expect(pos.x).toBeCloseTo(10, 5)
    expect(pos.y).toBeCloseTo(5 + 1.5, 5)
    expect(pos.z).toBeCloseTo(-3 + 5, 5)
  })
})

// ============================================
// Smoothing Tests
// ============================================

describe('exponentialSmoothing', () => {
  test('returns value between 0 and 1', () => {
    const t = exponentialSmoothing(8, 1 / 60)
    expect(t).toBeGreaterThan(0)
    expect(t).toBeLessThan(1)
  })

  test('higher smoothing gives higher t (faster response)', () => {
    const delta = 1 / 60
    const slow = exponentialSmoothing(4, delta)
    const fast = exponentialSmoothing(20, delta)

    expect(fast).toBeGreaterThan(slow)
  })

  test('approaches 1 with very high smoothing', () => {
    const t = exponentialSmoothing(1000, 1 / 60)
    expect(t).toBeGreaterThan(0.9)
  })

  test('is frame-rate independent (similar results for different dt)', () => {
    // Simulate 2 frames at 60fps vs 1 frame at 30fps
    const smoothing = 8

    // Two 60fps frames
    let value60 = 0
    const target = 1
    const t60 = exponentialSmoothing(smoothing, 1 / 60)
    value60 += (target - value60) * t60
    value60 += (target - value60) * t60

    // One 30fps frame
    let value30 = 0
    const t30 = exponentialSmoothing(smoothing, 2 / 60)
    value30 += (target - value30) * t30

    // Should be approximately equal (within 10%)
    expect(Math.abs(value60 - value30)).toBeLessThan(0.1)
  })
})

describe('simulateSmoothingFrames', () => {
  const delta = 1 / 60

  test('returns 0 frames when already at target', () => {
    const frames = simulateSmoothingFrames(5, 5, 8, delta)
    expect(frames).toBe(0)
  })

  test('higher smoothing reaches target in fewer frames', () => {
    const slowFrames = simulateSmoothingFrames(0, 5, 4, delta)
    const fastFrames = simulateSmoothingFrames(0, 5, 20, delta)

    expect(fastFrames).toBeLessThan(slowFrames)
  })

  test('asymmetric smoothing: pull-in faster than ease-out', () => {
    // This is the key test for camera collision feel
    const pullInSmoothing = 20
    const easeOutSmoothing = 4

    // Pull in: 5 -> 2 (collision detected)
    const pullInFrames = simulateSmoothingFrames(5, 2, pullInSmoothing, delta)

    // Ease out: 2 -> 5 (collision cleared)
    const easeOutFrames = simulateSmoothingFrames(2, 5, easeOutSmoothing, delta)

    expect(pullInFrames).toBeLessThan(easeOutFrames)
    // Pull-in should be significantly faster (at least 2x)
    expect(pullInFrames * 2).toBeLessThan(easeOutFrames)
  })

  test('reaches target within reasonable frame count', () => {
    const frames = simulateSmoothingFrames(0, 10, 8, delta)

    // At 60fps, should reach target within ~2 seconds
    expect(frames).toBeLessThan(120)
  })
})

// ============================================
// Camera Vector Tests
// ============================================

describe('getCameraRight', () => {
  test('returns +X at yaw=0', () => {
    const right = getCameraRight(0)
    expect(right.x).toBeCloseTo(1, 5)
    expect(right.z).toBeCloseTo(0, 5)
  })

  test('returns +Z at yaw=90deg', () => {
    const right = getCameraRight(Math.PI / 2)
    expect(right.x).toBeCloseTo(0, 5)
    expect(right.z).toBeCloseTo(-1, 5)
  })

  test('is perpendicular to view direction', () => {
    const yaw = 0.7
    const right = getCameraRight(yaw)

    // Forward direction at yaw (in XZ plane)
    const forwardX = Math.sin(yaw)
    const forwardZ = Math.cos(yaw)

    // Dot product should be 0 (perpendicular)
    const dot = right.x * forwardX + right.z * forwardZ
    expect(dot).toBeCloseTo(0, 5)
  })
})

describe('getCameraUp', () => {
  test('returns +Y when pitch=0', () => {
    const up = getCameraUp(0, 0)
    expect(up.x).toBeCloseTo(0, 5)
    expect(up.y).toBeCloseTo(1, 5)
    expect(up.z).toBeCloseTo(0, 5)
  })

  test('tilts with pitch', () => {
    const up = getCameraUp(0, Math.PI / 4) // 45 degrees
    expect(up.y).toBeLessThan(1) // No longer straight up
    expect(up.y).toBeGreaterThan(0) // But still pointing upward
  })
})

// ============================================
// Utility Tests
// ============================================

describe('distance3D', () => {
  test('returns 0 for same point', () => {
    const p = {x: 5, y: 3, z: -2}
    expect(distance3D(p, p)).toBe(0)
  })

  test('calculates correct distance along single axis', () => {
    const a = {x: 0, y: 0, z: 0}
    const b = {x: 5, y: 0, z: 0}
    expect(distance3D(a, b)).toBe(5)
  })

  test('calculates correct diagonal distance', () => {
    const a = {x: 0, y: 0, z: 0}
    const b = {x: 3, y: 4, z: 0} // 3-4-5 triangle
    expect(distance3D(a, b)).toBe(5)
  })

  test('is symmetric', () => {
    const a = {x: 1, y: 2, z: 3}
    const b = {x: 4, y: 5, z: 6}
    expect(distance3D(a, b)).toBe(distance3D(b, a))
  })
})

describe('clamp', () => {
  test('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  test('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
  })

  test('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10)
  })

  test('handles equal min/max', () => {
    expect(clamp(5, 3, 3)).toBe(3)
  })
})

// ============================================
// Camera Behavior Tests
// ============================================

describe('Camera behavior invariants', () => {
  test('camera distance never exceeds configured distance', () => {
    // Test with many random configurations
    for (let i = 0; i < 50; i++) {
      const yaw = (Math.random() - 0.5) * Math.PI * 2
      const pitch = (Math.random() - 0.5) * 1.5 // -0.75 to 0.75
      const distance = 3 + Math.random() * 10
      const heightOffset = 1 + Math.random() * 2
      const target = {
        x: (Math.random() - 0.5) * 20,
        y: (Math.random() - 0.5) * 5,
        z: (Math.random() - 0.5) * 20,
      }

      const pos = computeCameraPosition(
        target,
        yaw,
        pitch,
        distance,
        heightOffset,
      )
      const orbitCenter = {x: target.x, y: target.y + heightOffset, z: target.z}
      const actualDist = distance3D(pos, orbitCenter)

      expect(actualDist).toBeCloseTo(distance, 3)
    }
  })

  test('camera position changes continuously with yaw (no jumps)', () => {
    const target = {x: 0, y: 0, z: 0}
    let prevPos = computeCameraPosition(target, 0, 0.3, 5, 1.5)

    // Rotate through full circle in small steps
    for (let yaw = 0.1; yaw < Math.PI * 2; yaw += 0.1) {
      const pos = computeCameraPosition(target, yaw, 0.3, 5, 1.5)
      const movement = distance3D(prevPos, pos)

      // Movement per step should be small (no teleporting)
      expect(movement).toBeLessThan(1)
      prevPos = pos
    }
  })
})

// ============================================
// 3-Rig Orbit Interpolation Tests
// ============================================

describe('interpolateOrbitRigs', () => {
  const minPitch = -0.5 // Looking up limit
  const maxPitch = 1.2 // Looking down limit

  const top: OrbitRig = {distance: 4.5, height: 2.5}
  const middle: OrbitRig = {distance: 5.5, height: 1.5}
  const bottom: OrbitRig = {distance: 3.0, height: 0.5}

  test('returns middle rig at pitch=0', () => {
    const result = interpolateOrbitRigs(
      0,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(result.distance).toBeCloseTo(middle.distance, 4)
    expect(result.height).toBeCloseTo(middle.height, 4)
  })

  test('returns top rig at maxPitch', () => {
    const result = interpolateOrbitRigs(
      maxPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(result.distance).toBeCloseTo(top.distance, 4)
    expect(result.height).toBeCloseTo(top.height, 4)
  })

  test('returns bottom rig at minPitch', () => {
    const result = interpolateOrbitRigs(
      minPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(result.distance).toBeCloseTo(bottom.distance, 4)
    expect(result.height).toBeCloseTo(bottom.height, 4)
  })

  test('interpolates between middle and top for positive pitch', () => {
    const pitch = maxPitch / 2 // Halfway between 0 and maxPitch
    const result = interpolateOrbitRigs(
      pitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    // Should be between middle and top
    expect(result.distance).toBeGreaterThanOrEqual(
      Math.min(middle.distance, top.distance),
    )
    expect(result.distance).toBeLessThanOrEqual(
      Math.max(middle.distance, top.distance),
    )
  })

  test('interpolates between bottom and middle for negative pitch', () => {
    const pitch = minPitch / 2 // Halfway between minPitch and 0
    const result = interpolateOrbitRigs(
      pitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    // Should be between bottom and middle
    expect(result.distance).toBeGreaterThanOrEqual(
      Math.min(bottom.distance, middle.distance),
    )
    expect(result.distance).toBeLessThanOrEqual(
      Math.max(bottom.distance, middle.distance),
    )
  })
})

describe('interpolateOrbitRigsSmooth', () => {
  const minPitch = -0.5
  const maxPitch = 1.2

  const top: OrbitRig = {distance: 4.5, height: 2.5}
  const middle: OrbitRig = {distance: 5.5, height: 1.5}
  const bottom: OrbitRig = {distance: 3.0, height: 0.5}

  test('returns middle rig at pitch=0', () => {
    const result = interpolateOrbitRigsSmooth(
      0,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(result.distance).toBeCloseTo(middle.distance, 4)
    expect(result.height).toBeCloseTo(middle.height, 4)
  })

  test('returns top rig at maxPitch', () => {
    const result = interpolateOrbitRigsSmooth(
      maxPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(result.distance).toBeCloseTo(top.distance, 4)
    expect(result.height).toBeCloseTo(top.height, 4)
  })

  test('returns bottom rig at minPitch', () => {
    const result = interpolateOrbitRigsSmooth(
      minPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(result.distance).toBeCloseTo(bottom.distance, 4)
    expect(result.height).toBeCloseTo(bottom.height, 4)
  })

  test('produces continuous output (no discontinuities)', () => {
    let prevResult = interpolateOrbitRigsSmooth(
      minPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    // Sweep through full pitch range
    for (let pitch = minPitch + 0.05; pitch <= maxPitch; pitch += 0.05) {
      const result = interpolateOrbitRigsSmooth(
        pitch,
        minPitch,
        maxPitch,
        top,
        middle,
        bottom,
      )

      // Change should be small and continuous
      const distDelta = Math.abs(result.distance - prevResult.distance)
      const heightDelta = Math.abs(result.height - prevResult.height)

      expect(distDelta).toBeLessThan(0.5)
      expect(heightDelta).toBeLessThan(0.3)

      prevResult = result
    }
  })

  test('distance follows expected pattern: bottom < top < middle', () => {
    // At bottom (looking up) - closest distance
    const atBottom = interpolateOrbitRigsSmooth(
      minPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )
    // At middle (horizontal) - largest distance
    const atMiddle = interpolateOrbitRigsSmooth(
      0,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )
    // At top (looking down) - medium distance
    const atTop = interpolateOrbitRigsSmooth(
      maxPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(atBottom.distance).toBeLessThan(atTop.distance)
    expect(atTop.distance).toBeLessThan(atMiddle.distance)
  })

  test('height follows expected pattern: bottom < middle < top', () => {
    const atBottom = interpolateOrbitRigsSmooth(
      minPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )
    const atMiddle = interpolateOrbitRigsSmooth(
      0,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )
    const atTop = interpolateOrbitRigsSmooth(
      maxPitch,
      minPitch,
      maxPitch,
      top,
      middle,
      bottom,
    )

    expect(atBottom.height).toBeLessThan(atMiddle.height)
    expect(atMiddle.height).toBeLessThan(atTop.height)
  })
})
