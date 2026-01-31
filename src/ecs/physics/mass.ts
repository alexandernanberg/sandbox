import type {Entity} from 'koota'
import type {Vec3} from './forces'
import {RigidBodyRef} from './traits'

// ============================================
// Quaternion Type (for inertia frame)
// ============================================

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

// Reusable objects to avoid allocations
const _tempVec3: Vec3 = {x: 0, y: 0, z: 0}
const _zeroVec3: Readonly<Vec3> = {x: 0, y: 0, z: 0}
const _identityQuat: Readonly<Quat> = {x: 0, y: 0, z: 0, w: 1}

// ============================================
// Mass Getters
// ============================================

/**
 * Get the total mass of a rigid body.
 * Includes contributions from all attached colliders.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Total mass (0 for entities without a body)
 */
export function getMass(entity: Entity): number {
  if (!entity.has(RigidBodyRef)) return 0
  const body = entity.get(RigidBodyRef)!.body
  return body?.mass() ?? 0
}

/**
 * Get the inverse mass of a rigid body.
 * If this is zero, the body has infinite mass (fixed/kinematic).
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Inverse mass
 */
export function getInverseMass(entity: Entity): number {
  if (!entity.has(RigidBodyRef)) return 0
  const body = entity.get(RigidBodyRef)!.body
  return body?.invMass() ?? 0
}

/**
 * Get the center of mass in local space.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Local center of mass (read-only reference)
 */
export function getLocalCenterOfMass(entity: Entity): Readonly<Vec3> {
  if (!entity.has(RigidBodyRef)) return _zeroVec3
  const body = entity.get(RigidBodyRef)!.body
  if (!body) return _zeroVec3

  const com = body.localCom()
  _tempVec3.x = com.x
  _tempVec3.y = com.y
  _tempVec3.z = com.z
  return _tempVec3
}

/**
 * Get the center of mass in world space.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns World center of mass (read-only reference)
 */
export function getWorldCenterOfMass(entity: Entity): Readonly<Vec3> {
  if (!entity.has(RigidBodyRef)) return _zeroVec3
  const body = entity.get(RigidBodyRef)!.body
  if (!body) return _zeroVec3

  const com = body.worldCom()
  _tempVec3.x = com.x
  _tempVec3.y = com.y
  _tempVec3.z = com.z
  return _tempVec3
}

/**
 * Get the principal angular inertia (eigenvalues of the inertia tensor).
 * Higher values mean more resistance to rotation around that axis.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Principal inertia values (read-only reference)
 */
export function getPrincipalInertia(entity: Entity): Readonly<Vec3> {
  if (!entity.has(RigidBodyRef)) return _zeroVec3
  const body = entity.get(RigidBodyRef)!.body
  if (!body) return _zeroVec3

  const inertia = body.principalInertia()
  _tempVec3.x = inertia.x
  _tempVec3.y = inertia.y
  _tempVec3.z = inertia.z
  return _tempVec3
}

/**
 * Get the inverse principal angular inertia.
 * Components set to zero indicate infinite inertia (locked) along that axis.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Inverse principal inertia values (read-only reference)
 */
export function getInversePrincipalInertia(entity: Entity): Readonly<Vec3> {
  if (!entity.has(RigidBodyRef)) return _zeroVec3
  const body = entity.get(RigidBodyRef)!.body
  if (!body) return _zeroVec3

  const inertia = body.invPrincipalInertia()
  _tempVec3.x = inertia.x
  _tempVec3.y = inertia.y
  _tempVec3.z = inertia.z
  return _tempVec3
}

// ============================================
// Gravity Scale
// ============================================

/**
 * Get the gravity scale factor for a rigid body.
 * 1.0 = normal gravity, 0.0 = no gravity, 2.0 = double gravity.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Gravity scale factor
 */
export function getGravityScale(entity: Entity): number {
  if (!entity.has(RigidBodyRef)) return 1
  const body = entity.get(RigidBodyRef)!.body
  return body?.gravityScale() ?? 1
}

/**
 * Set the gravity scale factor for a rigid body.
 * Use 0.0 to make the body float (ignore gravity).
 *
 * @param entity - Entity with RigidBodyRef
 * @param scale - Gravity scale factor
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setGravityScale(
  entity: Entity,
  scale: number,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setGravityScale(scale, wakeUp)
  }
}

// ============================================
// Damping
// ============================================

/**
 * Get the linear damping coefficient.
 * Slows down translational movement over time.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Linear damping coefficient
 */
export function getLinearDamping(entity: Entity): number {
  if (!entity.has(RigidBodyRef)) return 0
  const body = entity.get(RigidBodyRef)!.body
  return body?.linearDamping() ?? 0
}

/**
 * Set the linear damping coefficient.
 * Higher values slow translational movement faster.
 *
 * @param entity - Entity with RigidBodyRef
 * @param damping - Damping coefficient (>= 0)
 */
export function setLinearDamping(entity: Entity, damping: number): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setLinearDamping(damping)
  }
}

/**
 * Get the angular damping coefficient.
 * Slows down rotational movement over time.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Angular damping coefficient
 */
export function getAngularDamping(entity: Entity): number {
  if (!entity.has(RigidBodyRef)) return 0
  const body = entity.get(RigidBodyRef)!.body
  return body?.angularDamping() ?? 0
}

/**
 * Set the angular damping coefficient.
 * Higher values slow rotational movement faster.
 *
 * @param entity - Entity with RigidBodyRef
 * @param damping - Damping coefficient (>= 0)
 */
export function setAngularDamping(entity: Entity, damping: number): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setAngularDamping(damping)
  }
}

// ============================================
// Mass Setters
// ============================================

/**
 * Set the additional mass of a rigid body.
 * The total mass is this value plus contributions from colliders.
 * Angular inertia is automatically scaled based on this mass.
 *
 * @param entity - Entity with RigidBodyRef
 * @param mass - Additional mass value
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setAdditionalMass(
  entity: Entity,
  mass: number,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setAdditionalMass(mass, wakeUp)
  }
}

/**
 * Set the additional mass properties of a rigid body.
 * Provides full control over mass, center of mass, and inertia.
 *
 * @param entity - Entity with RigidBodyRef
 * @param mass - Additional mass
 * @param centerOfMass - Local-space center of mass
 * @param principalAngularInertia - Inertia along principal axes
 * @param angularInertiaLocalFrame - Orientation of the inertia tensor (default: identity)
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setAdditionalMassProperties(
  entity: Entity,
  mass: number,
  centerOfMass: Vec3,
  principalAngularInertia: Vec3,
  angularInertiaLocalFrame: Quat = _identityQuat,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setAdditionalMassProperties(
      mass,
      centerOfMass,
      principalAngularInertia,
      angularInertiaLocalFrame,
      wakeUp,
    )
  }
}

/**
 * Recompute mass properties from attached colliders.
 * Call this after modifying collider densities or shapes.
 *
 * @param entity - Entity with RigidBodyRef
 */
export function recomputeMassPropertiesFromColliders(entity: Entity): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.recomputeMassPropertiesFromColliders()
  }
}

// ============================================
// Locked Axes
// ============================================

/**
 * Lock or unlock all translations.
 * When locked, the body won't move due to forces or impulses.
 *
 * @param entity - Entity with RigidBodyRef
 * @param locked - Whether translations should be locked
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function lockTranslations(
  entity: Entity,
  locked: boolean,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.lockTranslations(locked, wakeUp)
  }
}

/**
 * Lock or unlock all rotations.
 * When locked, the body won't rotate due to torques or impulses.
 *
 * @param entity - Entity with RigidBodyRef
 * @param locked - Whether rotations should be locked
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function lockRotations(
  entity: Entity,
  locked: boolean,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.lockRotations(locked, wakeUp)
  }
}

/**
 * Enable or disable translations along specific axes.
 * Useful for 2D-style movement or constraining to planes.
 *
 * @param entity - Entity with RigidBodyRef
 * @param enableX - Allow translation along X axis
 * @param enableY - Allow translation along Y axis
 * @param enableZ - Allow translation along Z axis
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setEnabledTranslations(
  entity: Entity,
  enableX: boolean,
  enableY: boolean,
  enableZ: boolean,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setEnabledTranslations(enableX, enableY, enableZ, wakeUp)
  }
}

/**
 * Enable or disable rotations along specific axes.
 * Useful for 2D-style rotation or turret-style constraints.
 *
 * @param entity - Entity with RigidBodyRef
 * @param enableX - Allow rotation around X axis
 * @param enableY - Allow rotation around Y axis
 * @param enableZ - Allow rotation around Z axis
 * @param wakeUp - Whether to wake the body if sleeping (default: true)
 */
export function setEnabledRotations(
  entity: Entity,
  enableX: boolean,
  enableY: boolean,
  enableZ: boolean,
  wakeUp = true,
): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setEnabledRotations(enableX, enableY, enableZ, wakeUp)
  }
}

// ============================================
// Dominance Groups
// ============================================

/**
 * Get the dominance group of a rigid body.
 * Bodies with higher dominance push bodies with lower dominance,
 * but not vice versa.
 *
 * @param entity - Entity with RigidBodyRef
 * @returns Dominance group (-127 to 127)
 */
export function getDominanceGroup(entity: Entity): number {
  if (!entity.has(RigidBodyRef)) return 0
  const body = entity.get(RigidBodyRef)!.body
  return body?.dominanceGroup() ?? 0
}

/**
 * Set the dominance group of a rigid body.
 * Bodies with higher dominance push bodies with lower dominance,
 * but not vice versa. Useful for player-NPC interactions.
 *
 * @param entity - Entity with RigidBodyRef
 * @param group - Dominance group (-127 to 127)
 */
export function setDominanceGroup(entity: Entity, group: number): void {
  if (!entity.has(RigidBodyRef)) return
  const body = entity.get(RigidBodyRef)!.body
  if (body) {
    body.setDominanceGroup(group)
  }
}
