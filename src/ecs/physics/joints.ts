import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {
  JointData,
  MotorModel,
  JointAxesMask,
} from '@dimforge/rapier3d-simd-compat'
import type {Entity} from 'koota'
import type {Vec3} from './forces'
import {RigidBodyRef} from './traits'
import {getRapierWorld} from './world'

// Re-export useful Rapier types
export {JointAxesMask, MotorModel}

// ============================================
// Types
// ============================================

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

/** Handle to a created joint */
export interface JointHandle {
  /** Internal Rapier handle */
  readonly handle: number
  /** The Rapier joint object */
  readonly joint: RAPIER.ImpulseJoint
}

/** Common options for all joints */
interface BaseJointOptions {
  /** Local anchor point on body1 */
  anchor1?: Vec3
  /** Local anchor point on body2 */
  anchor2?: Vec3
  /** Whether to wake up both bodies (default: true) */
  wakeUp?: boolean
  /** Whether to enable collisions between connected bodies (default: true) */
  contactsEnabled?: boolean
}

/** Options for fixed joints */
export interface FixedJointOptions extends BaseJointOptions {
  /** Reference frame orientation on body1 */
  frame1?: Quat
  /** Reference frame orientation on body2 */
  frame2?: Quat
}

/** Options for revolute joints (hinge) */
export interface RevoluteJointOptions extends BaseJointOptions {
  /** Axis of rotation (in local space of both bodies) */
  axis?: Vec3
  /** Rotation limits [min, max] in radians */
  limits?: [number, number]
}

/** Options for prismatic joints (slider) */
export interface PrismaticJointOptions extends BaseJointOptions {
  /** Axis of translation (in local space of both bodies) */
  axis?: Vec3
  /** Translation limits [min, max] */
  limits?: [number, number]
}

/** Options for spherical joints (ball-socket) */
export interface SphericalJointOptions extends BaseJointOptions {}

/** Options for rope joints */
export interface RopeJointOptions extends BaseJointOptions {
  /** Maximum distance between anchors */
  maxLength: number
}

/** Options for spring joints */
export interface SpringJointOptions extends BaseJointOptions {
  /** Rest length of the spring */
  restLength: number
  /** Spring stiffness */
  stiffness: number
  /** Spring damping */
  damping: number
}

/** Options for generic joints */
export interface GenericJointOptions extends BaseJointOptions {
  /** Axis of the joint */
  axis?: Vec3
  /** Mask of locked axes (use JointAxesMask) */
  lockedAxes: number
}

// ============================================
// Default values
// ============================================

const DEFAULT_ANCHOR: Vec3 = {x: 0, y: 0, z: 0}
const DEFAULT_AXIS: Vec3 = {x: 1, y: 0, z: 0}
const IDENTITY_QUAT: Quat = {x: 0, y: 0, z: 0, w: 1}

// ============================================
// Helper to get bodies
// ============================================

function getBodies(
  entity1: Entity,
  entity2: Entity,
): [RAPIER.RigidBody, RAPIER.RigidBody] | null {
  if (!entity1.has(RigidBodyRef) || !entity2.has(RigidBodyRef)) {
    console.warn('Both entities must have RigidBodyRef to create a joint')
    return null
  }

  const body1 = entity1.get(RigidBodyRef)!.body
  const body2 = entity2.get(RigidBodyRef)!.body

  if (!body1 || !body2) {
    console.warn('Both bodies must be initialized to create a joint')
    return null
  }

  return [body1, body2]
}

// ============================================
// Joint Creation Functions
// ============================================

/**
 * Create a fixed joint that welds two bodies together.
 * Removes all degrees of freedom between the bodies.
 */
export function createFixedJoint(
  entity1: Entity,
  entity2: Entity,
  options: FixedJointOptions = {},
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const frame1 = options.frame1 ?? IDENTITY_QUAT
  const frame2 = options.frame2 ?? IDENTITY_QUAT
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.fixed(anchor1, frame1, anchor2, frame2)
  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

/**
 * Create a revolute joint (hinge).
 * Allows rotation around a single axis.
 */
export function createRevoluteJoint(
  entity1: Entity,
  entity2: Entity,
  options: RevoluteJointOptions = {},
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const axis = options.axis ?? DEFAULT_AXIS
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.revolute(anchor1, anchor2, axis)

  if (options.limits) {
    jointData.limitsEnabled = true
    jointData.limits = options.limits
  }

  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

/**
 * Create a prismatic joint (slider).
 * Allows translation along a single axis.
 */
export function createPrismaticJoint(
  entity1: Entity,
  entity2: Entity,
  options: PrismaticJointOptions = {},
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const axis = options.axis ?? DEFAULT_AXIS
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.prismatic(anchor1, anchor2, axis)

  if (options.limits) {
    jointData.limitsEnabled = true
    jointData.limits = options.limits
  }

  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

/**
 * Create a spherical joint (ball-socket).
 * Allows rotation in all directions but no translation.
 */
export function createSphericalJoint(
  entity1: Entity,
  entity2: Entity,
  options: SphericalJointOptions = {},
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.spherical(anchor1, anchor2)
  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

/**
 * Create a rope joint.
 * Enforces a maximum distance between anchors.
 */
export function createRopeJoint(
  entity1: Entity,
  entity2: Entity,
  options: RopeJointOptions,
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.rope(options.maxLength, anchor1, anchor2)
  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

/**
 * Create a spring joint.
 * Applies spring forces to maintain a rest length.
 */
export function createSpringJoint(
  entity1: Entity,
  entity2: Entity,
  options: SpringJointOptions,
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.spring(
    options.restLength,
    options.stiffness,
    options.damping,
    anchor1,
    anchor2,
  )
  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

/**
 * Create a generic joint with custom degrees of freedom.
 * Use JointAxesMask to specify which axes to lock.
 */
export function createGenericJoint(
  entity1: Entity,
  entity2: Entity,
  options: GenericJointOptions,
): JointHandle | null {
  const world = getRapierWorld()
  if (!world) return null

  const bodies = getBodies(entity1, entity2)
  if (!bodies) return null
  const [body1, body2] = bodies

  const anchor1 = options.anchor1 ?? DEFAULT_ANCHOR
  const anchor2 = options.anchor2 ?? DEFAULT_ANCHOR
  const axis = options.axis ?? DEFAULT_AXIS
  const wakeUp = options.wakeUp ?? true

  const jointData = JointData.generic(
    anchor1,
    anchor2,
    axis,
    options.lockedAxes,
  )
  const joint = world.createImpulseJoint(jointData, body1, body2, wakeUp)

  if (options.contactsEnabled === false) {
    joint.setContactsEnabled(false)
  }

  return {handle: joint.handle, joint}
}

// ============================================
// Joint Destruction
// ============================================

/**
 * Destroy a joint.
 *
 * @param jointHandle - The joint handle to destroy
 * @param wakeUp - Whether to wake the connected bodies (default: true)
 */
export function destroyJoint(jointHandle: JointHandle, wakeUp = true): void {
  const world = getRapierWorld()
  if (!world) return

  world.removeImpulseJoint(jointHandle.joint, wakeUp)
}

// ============================================
// Motor Configuration (for revolute/prismatic)
// ============================================

/**
 * Configure a velocity-based motor on a revolute or prismatic joint.
 *
 * @param jointHandle - The joint handle
 * @param targetVelocity - Target velocity (rad/s for revolute, m/s for prismatic)
 * @param factor - Motor strength factor
 */
export function configureMotorVelocity(
  jointHandle: JointHandle,
  targetVelocity: number,
  factor: number,
): void {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('configureMotorVelocity' in joint) {
    joint.configureMotorVelocity(targetVelocity, factor)
  }
}

/**
 * Configure a position-based motor on a revolute or prismatic joint.
 *
 * @param jointHandle - The joint handle
 * @param targetPosition - Target position (radians for revolute, meters for prismatic)
 * @param stiffness - Motor stiffness
 * @param damping - Motor damping
 */
export function configureMotorPosition(
  jointHandle: JointHandle,
  targetPosition: number,
  stiffness: number,
  damping: number,
): void {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('configureMotorPosition' in joint) {
    joint.configureMotorPosition(targetPosition, stiffness, damping)
  }
}

/**
 * Configure a motor with both position and velocity targets.
 *
 * @param jointHandle - The joint handle
 * @param targetPosition - Target position
 * @param targetVelocity - Target velocity
 * @param stiffness - Motor stiffness
 * @param damping - Motor damping
 */
export function configureMotor(
  jointHandle: JointHandle,
  targetPosition: number,
  targetVelocity: number,
  stiffness: number,
  damping: number,
): void {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('configureMotor' in joint) {
    joint.configureMotor(targetPosition, targetVelocity, stiffness, damping)
  }
}

/**
 * Set the motor model (acceleration-based or force-based).
 *
 * @param jointHandle - The joint handle
 * @param model - The motor model
 */
export function setMotorModel(
  jointHandle: JointHandle,
  model: RAPIER.MotorModel,
): void {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('configureMotorModel' in joint) {
    joint.configureMotorModel(model)
  }
}

// ============================================
// Limit Configuration
// ============================================

/**
 * Set the limits for a revolute or prismatic joint.
 *
 * @param jointHandle - The joint handle
 * @param min - Minimum limit
 * @param max - Maximum limit
 */
export function setJointLimits(
  jointHandle: JointHandle,
  min: number,
  max: number,
): void {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('setLimits' in joint) {
    joint.setLimits(min, max)
  }
}

/**
 * Check if limits are enabled for a joint.
 */
export function areLimitsEnabled(jointHandle: JointHandle): boolean {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('limitsEnabled' in joint) {
    return joint.limitsEnabled()
  }
  return false
}

/**
 * Get the current limits of a joint.
 */
export function getJointLimits(
  jointHandle: JointHandle,
): [number, number] | null {
  const joint = jointHandle.joint as
    | RAPIER.RevoluteImpulseJoint
    | RAPIER.PrismaticImpulseJoint
  if ('limitsMin' in joint && 'limitsMax' in joint) {
    return [joint.limitsMin(), joint.limitsMax()]
  }
  return null
}

// ============================================
// Anchor Configuration
// ============================================

/**
 * Set the anchor point on body 1.
 */
export function setAnchor1(jointHandle: JointHandle, anchor: Vec3): void {
  jointHandle.joint.setAnchor1(anchor)
}

/**
 * Set the anchor point on body 2.
 */
export function setAnchor2(jointHandle: JointHandle, anchor: Vec3): void {
  jointHandle.joint.setAnchor2(anchor)
}

/**
 * Get the anchor point on body 1.
 */
export function getAnchor1(jointHandle: JointHandle): Vec3 {
  const anchor = jointHandle.joint.anchor1()
  return {x: anchor.x, y: anchor.y, z: anchor.z}
}

/**
 * Get the anchor point on body 2.
 */
export function getAnchor2(jointHandle: JointHandle): Vec3 {
  const anchor = jointHandle.joint.anchor2()
  return {x: anchor.x, y: anchor.y, z: anchor.z}
}

// ============================================
// Contact Control
// ============================================

/**
 * Enable or disable collisions between the connected bodies.
 */
export function setContactsEnabled(
  jointHandle: JointHandle,
  enabled: boolean,
): void {
  jointHandle.joint.setContactsEnabled(enabled)
}

/**
 * Check if collisions are enabled between the connected bodies.
 */
export function areContactsEnabled(jointHandle: JointHandle): boolean {
  return jointHandle.joint.contactsEnabled()
}
