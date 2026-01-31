import type {Entity} from 'koota'
import {RigidBodyRef} from './traits'

// ============================================
// Vector Types
// ============================================

export interface Vec3 {
  x: number
  y: number
  z: number
}

// Reusable vector to avoid allocations for return values
const _tempVec3: Vec3 = {x: 0, y: 0, z: 0}
const _zeroVec3: Readonly<Vec3> = {x: 0, y: 0, z: 0}

// ============================================
// Impulse Functions (instant velocity change)
// ============================================

/**
 * Apply an impulse at the center of mass.
 * An impulse is an instantaneous change in velocity.
 *
 * @param entity - Entity with RigidBodyRef
 * @param impulse - Impulse vector in world space
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function applyImpulse(
  entity: Entity,
  impulse: Vec3,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.applyImpulse(impulse, wakeUp)
  }
}

/**
 * Apply an impulse at a specific world point.
 * This will cause both linear and angular velocity changes.
 * Useful for explosions, impacts at specific locations.
 *
 * @param entity - Entity with RigidBodyRef
 * @param impulse - Impulse vector in world space
 * @param point - World-space point where impulse is applied
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function applyImpulseAtPoint(
  entity: Entity,
  impulse: Vec3,
  point: Vec3,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.applyImpulseAtPoint(impulse, point, wakeUp)
  }
}

/**
 * Apply a torque impulse (instant angular velocity change).
 *
 * @param entity - Entity with RigidBodyRef
 * @param torqueImpulse - Torque impulse vector
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function applyTorqueImpulse(
  entity: Entity,
  torqueImpulse: Vec3,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.applyTorqueImpulse(torqueImpulse, wakeUp)
  }
}

// ============================================
// Force Functions (accumulated each frame)
// ============================================

/**
 * Add a force at the center of mass.
 * Forces are accumulated and applied during the next physics step.
 * Call this every frame for continuous forces (e.g., wind, thrusters).
 *
 * @param entity - Entity with RigidBodyRef
 * @param force - Force vector in world space
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function addForce(entity: Entity, force: Vec3, wakeUp = true): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.addForce(force, wakeUp)
  }
}

/**
 * Add a force at a specific world point.
 * This will cause both linear acceleration and torque.
 * Useful for thrusters, grappling hooks at specific attachment points.
 *
 * @param entity - Entity with RigidBodyRef
 * @param force - Force vector in world space
 * @param point - World-space point where force is applied
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function addForceAtPoint(
  entity: Entity,
  force: Vec3,
  point: Vec3,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.addForceAtPoint(force, point, wakeUp)
  }
}

/**
 * Add a torque (rotational force).
 * Torques are accumulated and applied during the next physics step.
 *
 * @param entity - Entity with RigidBodyRef
 * @param torque - Torque vector
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function addTorque(entity: Entity, torque: Vec3, wakeUp = true): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.addTorque(torque, wakeUp)
  }
}

/**
 * Reset all accumulated forces on a body.
 * Call this if you want to cancel forces added this frame.
 *
 * @param entity - Entity with RigidBodyRef
 * @param wakeUp - Whether to wake the body if sleeping (default: false)
 */
export function resetForces(entity: Entity, wakeUp = false): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.resetForces(wakeUp)
  }
}

/**
 * Reset all accumulated torques on a body.
 *
 * @param entity - Entity with RigidBodyRef
 * @param wakeUp - Whether to wake the body if sleeping (default: false)
 */
export function resetTorques(entity: Entity, wakeUp = false): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.resetTorques(wakeUp)
  }
}

// ============================================
// Velocity Functions
// ============================================

/**
 * Get the linear velocity of a rigid body.
 * Returns a zero vector if entity has no body.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Linear velocity vector (read-only reference, copy if you need to store)
 */
export function getLinearVelocity(entity: Entity): Readonly<Vec3> {
  if (!entity.has(RigidBodyRef)) return _zeroVec3
  const body = entity.get(RigidBodyRef)!.body
  if (!body) return _zeroVec3

  const vel = body.linvel()
  _tempVec3.x = vel.x
  _tempVec3.y = vel.y
  _tempVec3.z = vel.z
  return _tempVec3
}

/**
 * Set the linear velocity of a rigid body directly.
 *
 * @param entity - Entity with RigidBodyRef
 * @param velocity - New linear velocity
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setLinearVelocity(
  entity: Entity,
  velocity: Vec3,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setLinvel(velocity, wakeUp)
  }
}

/**
 * Get the angular velocity of a rigid body.
 * Returns a zero vector if entity has no body.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Angular velocity vector (read-only reference, copy if you need to store)
 */
export function getAngularVelocity(entity: Entity): Readonly<Vec3> {
  if (!entity.has(RigidBodyRef)) return _zeroVec3
  const body = entity.get(RigidBodyRef)!.body
  if (!body) return _zeroVec3

  const vel = body.angvel()
  _tempVec3.x = vel.x
  _tempVec3.y = vel.y
  _tempVec3.z = vel.z
  return _tempVec3
}

/**
 * Set the angular velocity of a rigid body directly.
 *
 * @param entity - Entity with RigidBodyRef
 * @param velocity - New angular velocity
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setAngularVelocity(
  entity: Entity,
  velocity: Vec3,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setAngvel(velocity, wakeUp)
  }
}

// ============================================
// Utility Functions
// ============================================

/**
 * Get the speed (magnitude of linear velocity) of a rigid body.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Speed (scalar)
 */
export function getSpeed(entity: Entity): number {
  const vel = getLinearVelocity(entity)
  return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
}

/**
 * Get the angular speed (magnitude of angular velocity) of a rigid body.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Angular speed (scalar)
 */
export function getAngularSpeed(entity: Entity): number {
  const vel = getAngularVelocity(entity)
  return Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
}

/**
 * Apply an explosion impulse to all bodies in a radius.
 * Impulse strength falls off with distance.
 *
 * @param center - World-space center of explosion
 * @param radius - Maximum radius of effect
 * @param strength - Impulse strength at center
 * @param entities - Entities to check (should have RigidBodyRef)
 * @param falloff - Falloff function: 'linear' or 'quadratic' (default: 'linear')
 */
export function applyExplosion(
  center: Vec3,
  radius: number,
  strength: number,
  entities: Iterable<Entity>,
  falloff: 'linear' | 'quadratic' = 'linear',
): void {
  for (const entity of entities) {
    if (!entity.has(RigidBodyRef)) continue
    const body = entity.get(RigidBodyRef)!.body
    if (!body) continue

    // Get body position
    const pos = body.translation()
    const dx = pos.x - center.x
    const dy = pos.y - center.y
    const dz = pos.z - center.z
    const distSq = dx * dx + dy * dy + dz * dz
    const dist = Math.sqrt(distSq)

    // Skip if outside radius
    if (dist > radius || dist < 0.001) continue

    // Calculate falloff
    const t = dist / radius
    const factor = falloff === 'quadratic' ? (1 - t) * (1 - t) : 1 - t

    // Calculate impulse direction and magnitude
    const invDist = 1 / dist
    const impulse: Vec3 = {
      x: dx * invDist * strength * factor,
      y: dy * invDist * strength * factor,
      z: dz * invDist * strength * factor,
    }

    body.applyImpulse(impulse, true)
  }
}
