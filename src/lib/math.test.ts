import {describe, expect, test} from 'bun:test'
import type {Vec3, Quat, TransformData} from './math'
import {
  setVec3,
  copyVec3,
  addVec3,
  lerpVec3,
  copyQuat,
  slerpQuat,
  copyTransform,
} from './math'

describe('Vec3 operations', () => {
  test('setVec3 sets x, y, z values', () => {
    const v: Vec3 = {x: 0, y: 0, z: 0}
    const result = setVec3(v, 1, 2, 3)

    expect(result).toBe(v) // Returns same object
    expect(v.x).toBe(1)
    expect(v.y).toBe(2)
    expect(v.z).toBe(3)
  })

  test('copyVec3 copies from source to target', () => {
    const target: Vec3 = {x: 0, y: 0, z: 0}
    const source: Vec3 = {x: 5, y: 10, z: 15}
    const result = copyVec3(target, source)

    expect(result).toBe(target)
    expect(target.x).toBe(5)
    expect(target.y).toBe(10)
    expect(target.z).toBe(15)
  })

  test('addVec3 adds two vectors', () => {
    const target: Vec3 = {x: 0, y: 0, z: 0}
    const a: Vec3 = {x: 1, y: 2, z: 3}
    const b: Vec3 = {x: 4, y: 5, z: 6}
    const result = addVec3(target, a, b)

    expect(result).toBe(target)
    expect(target.x).toBe(5)
    expect(target.y).toBe(7)
    expect(target.z).toBe(9)
  })

  test('lerpVec3 interpolates at t=0', () => {
    const target: Vec3 = {x: 0, y: 0, z: 0}
    const a: Vec3 = {x: 0, y: 0, z: 0}
    const b: Vec3 = {x: 10, y: 20, z: 30}
    lerpVec3(target, a, b, 0)

    expect(target.x).toBe(0)
    expect(target.y).toBe(0)
    expect(target.z).toBe(0)
  })

  test('lerpVec3 interpolates at t=1', () => {
    const target: Vec3 = {x: 0, y: 0, z: 0}
    const a: Vec3 = {x: 0, y: 0, z: 0}
    const b: Vec3 = {x: 10, y: 20, z: 30}
    lerpVec3(target, a, b, 1)

    expect(target.x).toBe(10)
    expect(target.y).toBe(20)
    expect(target.z).toBe(30)
  })

  test('lerpVec3 interpolates at t=0.5', () => {
    const target: Vec3 = {x: 0, y: 0, z: 0}
    const a: Vec3 = {x: 0, y: 0, z: 0}
    const b: Vec3 = {x: 10, y: 20, z: 30}
    lerpVec3(target, a, b, 0.5)

    expect(target.x).toBe(5)
    expect(target.y).toBe(10)
    expect(target.z).toBe(15)
  })
})

describe('Quaternion operations', () => {
  test('copyQuat copies quaternion values', () => {
    const target: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const source: Quat = {qx: 0.1, qy: 0.2, qz: 0.3, qw: 0.9}
    const result = copyQuat(target, source)

    expect(result).toBe(target)
    expect(target.qx).toBe(0.1)
    expect(target.qy).toBe(0.2)
    expect(target.qz).toBe(0.3)
    expect(target.qw).toBe(0.9)
  })

  test('slerpQuat returns identity at t=0', () => {
    const out: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const a: Quat = {qx: 0, qy: 0, qz: 0, qw: 1} // Identity
    const b: Quat = {qx: 0, qy: 0.7071, qz: 0, qw: 0.7071} // 90deg Y rotation

    slerpQuat(out, a, b, 0)

    expect(out.qx).toBeCloseTo(0, 5)
    expect(out.qy).toBeCloseTo(0, 5)
    expect(out.qz).toBeCloseTo(0, 5)
    expect(out.qw).toBeCloseTo(1, 5)
  })

  test('slerpQuat returns target at t=1', () => {
    const out: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const a: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const b: Quat = {qx: 0, qy: 0.7071, qz: 0, qw: 0.7071}

    slerpQuat(out, a, b, 1)

    expect(out.qx).toBeCloseTo(0, 4)
    expect(out.qy).toBeCloseTo(0.7071, 4)
    expect(out.qz).toBeCloseTo(0, 4)
    expect(out.qw).toBeCloseTo(0.7071, 4)
  })

  test('slerpQuat interpolates at t=0.5', () => {
    const out: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const a: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const b: Quat = {qx: 0, qy: 0.7071, qz: 0, qw: 0.7071}

    slerpQuat(out, a, b, 0.5)

    // At t=0.5 between identity and 90deg Y, we should have ~45deg Y rotation
    // sin(22.5deg) ≈ 0.3827, cos(22.5deg) ≈ 0.9239
    expect(out.qx).toBeCloseTo(0, 4)
    expect(out.qy).toBeCloseTo(0.3827, 4)
    expect(out.qz).toBeCloseTo(0, 4)
    expect(out.qw).toBeCloseTo(0.9239, 4)
  })

  test('slerpQuat handles nearly identical quaternions', () => {
    const out: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const a: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    const b: Quat = {qx: 0.0000001, qy: 0, qz: 0, qw: 1}

    // Should not throw or produce NaN
    slerpQuat(out, a, b, 0.5)

    expect(Number.isNaN(out.qx)).toBe(false)
    expect(Number.isNaN(out.qy)).toBe(false)
    expect(Number.isNaN(out.qz)).toBe(false)
    expect(Number.isNaN(out.qw)).toBe(false)
  })

  test('slerpQuat takes shortest path', () => {
    const out: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}
    // a and b represent the same rotation but b is negated
    const a: Quat = {qx: 0, qy: 0.7071, qz: 0, qw: 0.7071}
    const b: Quat = {qx: 0, qy: -0.7071, qz: 0, qw: -0.7071}

    slerpQuat(out, a, b, 0.5)

    // Should be same as a (or very close) since they're the same rotation
    expect(out.qy).toBeCloseTo(0.7071, 4)
    expect(Math.abs(out.qw)).toBeCloseTo(0.7071, 4)
  })
})

describe('Transform operations', () => {
  test('copyTransform copies all values', () => {
    const target: TransformData = {x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1}
    const source: TransformData = {
      x: 1,
      y: 2,
      z: 3,
      qx: 0.1,
      qy: 0.2,
      qz: 0.3,
      qw: 0.9,
    }
    const result = copyTransform(target, source)

    expect(result).toBe(target)
    expect(target.x).toBe(1)
    expect(target.y).toBe(2)
    expect(target.z).toBe(3)
    expect(target.qx).toBe(0.1)
    expect(target.qy).toBe(0.2)
    expect(target.qz).toBe(0.3)
    expect(target.qw).toBe(0.9)
  })
})
