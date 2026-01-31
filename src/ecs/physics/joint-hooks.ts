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
// Joint Hooks
// ============================================

/**
 * Create a fixed joint between two bodies.
 * The joint is automatically destroyed when the component unmounts.
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createFixedJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createRevoluteJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createPrismaticJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createSphericalJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createRopeJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createSpringJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
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
  const jointRef = useRef<JointHandle | null>(null)

  useEffect(() => {
    const entity1 = getEntity(body1)
    const entity2 = getEntity(body2)

    if (!entity1 || !entity2) return

    jointRef.current = createGenericJoint(entity1, entity2, options)

    return () => {
      if (jointRef.current) {
        destroyJoint(jointRef.current)
        jointRef.current = null
      }
    }
  }, [body1, body2, options])

  return jointRef.current
}
