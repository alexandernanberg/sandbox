import type {Entity} from 'koota'
import {useEffect, useRef} from 'react'
import type {RigidBodyApi} from './components'
import type {
  JointHandle,
  FixedJointOptions,
  RevoluteJointOptions,
  PrismaticJointOptions,
  SphericalJointOptions,
  RopeJointOptions,
  SpringJointOptions,
  GenericJointOptions,
} from './joints'
import {
  createFixedJoint,
  createRevoluteJoint,
  createPrismaticJoint,
  createSphericalJoint,
  createRopeJoint,
  createSpringJoint,
  createGenericJoint,
  destroyJoint,
} from './joints'

// ============================================
// Types
// ============================================

/** Reference to a rigid body - either a RigidBodyApi ref or an Entity */
type BodyRef =
  | React.RefObject<RigidBodyApi | null>
  | React.RefObject<Entity | null>
  | Entity

/** Extracts the entity from a BodyRef */
function getEntity(ref: BodyRef): Entity | null {
  if ('current' in ref) {
    const current = ref.current
    if (!current) return null
    // Check if it's a RigidBodyApi (has entity property)
    if ('entity' in current) return current.entity
    // Otherwise it's an Entity directly
    return current
  }
  // It's an Entity directly
  return ref
}

// ============================================
// Generic Joint Hook Factory
// ============================================

/**
 * Creates a joint hook for any joint type.
 * Options are captured at creation time - changing options won't update the joint.
 * The joint is created once when both bodies are ready and destroyed on unmount.
 */
function useJoint<T>(
  body1: BodyRef,
  body2: BodyRef,
  options: T,
  createFn: (entity1: Entity, entity2: Entity, opts: T) => JointHandle | null,
): JointHandle | null {
  const jointRef = useRef<JointHandle | null>(null)
  // Capture options in ref - joints are created once, not updated
  const optionsRef = useRef(options)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createFn(entity1, entity2, optionsRef.current)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
    // Only depend on body refs - options captured at first render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body1, body2])

  return jointRef.current
}

// ============================================
// Joint Hooks
// ============================================

/**
 * Create a fixed joint between two bodies.
 * The joint is automatically destroyed when the component unmounts.
 *
 * Note: Options are captured when bodies become available. Changing options
 * after creation has no effect - use the returned handle to modify the joint.
 *
 * @param body1 - Ref to the first body (RigidBodyApi ref or Entity ref)
 * @param body2 - Ref to the second body
 * @param options - Joint configuration options
 * @returns The joint handle (null until both bodies are ready)
 *
 * @example
 * ```tsx
 * const body1Ref = useRef<RigidBodyApi>(null)
 * const body2Ref = useRef<RigidBodyApi>(null)
 *
 * const joint = useFixedJoint(body1Ref, body2Ref, {
 *   anchor1: {x: 0, y: 1, z: 0},
 *   anchor2: {x: 0, y: -1, z: 0},
 * })
 * ```
 */
export function useFixedJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: FixedJointOptions = {},
): JointHandle | null {
  return useJoint(body1, body2, options, createFixedJoint)
}

/**
 * Create a revolute joint (hinge) between two bodies.
 * Allows rotation around a single axis.
 *
 * @example
 * ```tsx
 * const doorRef = useRef<RigidBodyApi>(null)
 * const frameRef = useRef<RigidBodyApi>(null)
 *
 * const joint = useRevoluteJoint(doorRef, frameRef, {
 *   anchor1: {x: -0.5, y: 0, z: 0},
 *   anchor2: {x: 0.5, y: 0, z: 0},
 *   axis: {x: 0, y: 1, z: 0},
 *   limits: [-Math.PI / 2, 0],
 * })
 * ```
 */
export function useRevoluteJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: RevoluteJointOptions = {},
): JointHandle | null {
  return useJoint(body1, body2, options, createRevoluteJoint)
}

/**
 * Create a prismatic joint (slider) between two bodies.
 * Allows translation along a single axis.
 *
 * @example
 * ```tsx
 * const pistonRef = useRef<RigidBodyApi>(null)
 * const cylinderRef = useRef<RigidBodyApi>(null)
 *
 * const joint = usePrismaticJoint(pistonRef, cylinderRef, {
 *   axis: {x: 0, y: 1, z: 0},
 *   limits: [0, 2],
 * })
 * ```
 */
export function usePrismaticJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: PrismaticJointOptions = {},
): JointHandle | null {
  return useJoint(body1, body2, options, createPrismaticJoint)
}

/**
 * Create a spherical joint (ball-socket) between two bodies.
 * Allows rotation in all directions but no translation.
 *
 * @example
 * ```tsx
 * const armRef = useRef<RigidBodyApi>(null)
 * const shoulderRef = useRef<RigidBodyApi>(null)
 *
 * const joint = useSphericalJoint(armRef, shoulderRef, {
 *   anchor1: {x: 0, y: 0.5, z: 0},
 *   anchor2: {x: 0, y: -0.5, z: 0},
 * })
 * ```
 */
export function useSphericalJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: SphericalJointOptions = {},
): JointHandle | null {
  return useJoint(body1, body2, options, createSphericalJoint)
}

/**
 * Create a rope joint between two bodies.
 * Enforces a maximum distance between anchors.
 *
 * @example
 * ```tsx
 * const ballRef = useRef<RigidBodyApi>(null)
 * const anchorRef = useRef<RigidBodyApi>(null)
 *
 * const joint = useRopeJoint(ballRef, anchorRef, {
 *   maxLength: 5,
 * })
 * ```
 */
export function useRopeJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: RopeJointOptions,
): JointHandle | null {
  return useJoint(body1, body2, options, createRopeJoint)
}

/**
 * Create a spring joint between two bodies.
 * Applies spring forces to maintain a rest length.
 *
 * @example
 * ```tsx
 * const massRef = useRef<RigidBodyApi>(null)
 * const anchorRef = useRef<RigidBodyApi>(null)
 *
 * const joint = useSpringJoint(massRef, anchorRef, {
 *   restLength: 2,
 *   stiffness: 100,
 *   damping: 10,
 * })
 * ```
 */
export function useSpringJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: SpringJointOptions,
): JointHandle | null {
  return useJoint(body1, body2, options, createSpringJoint)
}

/**
 * Create a generic joint with custom degrees of freedom.
 * Use JointAxesMask to specify which axes to lock.
 *
 * @example
 * ```tsx
 * import { JointAxesMask } from '~/ecs/physics'
 *
 * const body1Ref = useRef<RigidBodyApi>(null)
 * const body2Ref = useRef<RigidBodyApi>(null)
 *
 * // Lock only linear X and Y axes (allow Z translation and all rotations)
 * const joint = useGenericJoint(body1Ref, body2Ref, {
 *   lockedAxes: JointAxesMask.LinX | JointAxesMask.LinY,
 * })
 * ```
 */
export function useGenericJoint(
  body1: BodyRef,
  body2: BodyRef,
  options: GenericJointOptions,
): JointHandle | null {
  return useJoint(body1, body2, options, createGenericJoint)
}
