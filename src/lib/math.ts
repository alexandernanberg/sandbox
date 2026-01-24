import type {Object3D} from 'three'

// ============================================
// Types
// ============================================

/** 2D vector */
export interface Vec2 {
  x: number
  y: number
}

/** 3D vector / position component */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Quaternion component (using qx/qy/qz/qw to match trait schema) */
export interface Quat {
  qx: number
  qy: number
  qz: number
  qw: number
}

/** Full transform (position + rotation) */
export interface TransformData extends Vec3, Quat {}

// ============================================
// Vec3 Operations
// ============================================

/** Set Vec3 values from individual components */
export function setVec3<T extends Vec3>(
  target: T,
  x: number,
  y: number,
  z: number,
): T {
  target.x = x
  target.y = y
  target.z = z
  return target
}

/** Copy Vec3 from source to target */
export function copyVec3<T extends Vec3>(target: T, source: Vec3): T {
  target.x = source.x
  target.y = source.y
  target.z = source.z
  return target
}

/** Add two Vec3: target = a + b */
export function addVec3<T extends Vec3>(target: T, a: Vec3, b: Vec3): T {
  target.x = a.x + b.x
  target.y = a.y + b.y
  target.z = a.z + b.z
  return target
}

/** Linear interpolation: target = a + (b - a) * t */
export function lerpVec3<T extends Vec3>(
  target: T,
  a: Vec3,
  b: Vec3,
  t: number,
): T {
  target.x = a.x + (b.x - a.x) * t
  target.y = a.y + (b.y - a.y) * t
  target.z = a.z + (b.z - a.z) * t
  return target
}

// ============================================
// Quaternion Operations
// ============================================

/** Copy Quat from source to target */
export function copyQuat<T extends Quat>(target: T, source: Quat): T {
  target.qx = source.qx
  target.qy = source.qy
  target.qz = source.qz
  target.qw = source.qw
  return target
}

/** Spherical linear interpolation between two quaternions */
export function slerpQuat<T extends Quat>(
  out: T,
  a: Quat,
  b: Quat,
  t: number,
): T {
  let bx = b.qx,
    by = b.qy,
    bz = b.qz,
    bw = b.qw
  let cosom = a.qx * bx + a.qy * by + a.qz * bz + a.qw * bw

  // Shortest path
  if (cosom < 0) {
    cosom = -cosom
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }

  let scale0: number
  let scale1: number

  if (1 - cosom > 0.000001) {
    const omega = Math.acos(cosom)
    const sinom = Math.sin(omega)
    scale0 = Math.sin((1 - t) * omega) / sinom
    scale1 = Math.sin(t * omega) / sinom
  } else {
    // Close to same rotation, use linear interpolation
    scale0 = 1 - t
    scale1 = t
  }

  out.qx = scale0 * a.qx + scale1 * bx
  out.qy = scale0 * a.qy + scale1 * by
  out.qz = scale0 * a.qz + scale1 * bz
  out.qw = scale0 * a.qw + scale1 * bw
  return out
}

// ============================================
// Transform Operations
// ============================================

/** Copy full transform from source to target */
export function copyTransform<T extends TransformData>(
  target: T,
  source: TransformData,
): T {
  target.x = source.x
  target.y = source.y
  target.z = source.z
  target.qx = source.qx
  target.qy = source.qy
  target.qz = source.qz
  target.qw = source.qw
  return target
}

/** Copy position and quaternion from Three.js Object3D to transform */
export function copyFromObject3D<T extends TransformData>(
  target: T,
  obj: Object3D,
): T {
  target.x = obj.position.x
  target.y = obj.position.y
  target.z = obj.position.z
  target.qx = obj.quaternion.x
  target.qy = obj.quaternion.y
  target.qz = obj.quaternion.z
  target.qw = obj.quaternion.w
  return target
}

/** Copy from Rapier translation/rotation to transform */
export function copyFromRapier<T extends TransformData>(
  target: T,
  translation: Vec3,
  rotation: {x: number; y: number; z: number; w: number},
): T {
  target.x = translation.x
  target.y = translation.y
  target.z = translation.z
  target.qx = rotation.x
  target.qy = rotation.y
  target.qz = rotation.z
  target.qw = rotation.w
  return target
}

// ============================================
// Scratch Objects (pre-allocated for hot paths)
// ============================================

/** Reusable transform scratch object */
export const _transform: TransformData = {
  x: 0,
  y: 0,
  z: 0,
  qx: 0,
  qy: 0,
  qz: 0,
  qw: 1,
}

/** Reusable quaternion scratch object */
export const _quat: Quat = {qx: 0, qy: 0, qz: 0, qw: 1}

/** Reusable Vec3 scratch object */
export const _vec3: Vec3 = {x: 0, y: 0, z: 0}
