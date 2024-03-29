import * as RAPIER from '@dimforge/rapier3d'
import { Object3DProps, useUpdate } from '@react-three/fiber'
import type {
  ForwardedRef,
  MutableRefObject,
  ReactNode,
  RefObject,
} from 'react'
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import type { LineSegments } from 'three'
import { BufferAttribute, Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import { Stages } from '~/stages'
import { useConstant } from '~/utils'

const _object3d = new Object3D()
const _position = new Vector3()
const _matrix = new Matrix4()
const _scale = new Vector3()
const _quaternion = new Quaternion()

interface CollisionEvent {
  target: Object3D
}
type CollisionEventCallback = (event: CollisionEvent) => void

///////////////////////////////////////////////////////////////
// PhysicsContext
///////////////////////////////////////////////////////////////

type EventMap = Map<
  number,
  {
    onCollisionEnter?: CollisionEventCallback
    onCollisionExit?: CollisionEventCallback
  }
>

export interface PhysicsContextValue {
  worldRef: MutableRefObject<() => RAPIER.World>
  debug: boolean
  colliderMeshes: Map<number, Object3D>
  colliderEvents: EventMap
  rigidBodyMeshes: Map<number, Object3D>
  rigidBodyEvents: EventMap
  rigidBodyParentOffsets: Map<number, Matrix4>
  updateListeners: Set<RefObject<(delta: number) => void>>
}

const PhysicsContext = createContext<PhysicsContextValue | null>(null)

function usePhysicsContext() {
  const context = useContext(PhysicsContext)

  if (context == null) {
    throw new Error(
      'usePhysicsContext() may be used only in the context of a <Physics> component.',
    )
  }

  return context
}

///////////////////////////////////////////////////////////////
// Physics
///////////////////////////////////////////////////////////////

export interface PhysicsProps {
  children?: ReactNode
  debug?: boolean
  gravity?: Triplet | Vector3
}

const DEFAULT_GRAVITY = new Vector3(0, -9.81, 0)

export function Physics({
  children,
  debug = false,
  gravity = DEFAULT_GRAVITY,
}: PhysicsProps) {
  const worldRef = useRef<RAPIER.World | null>(null)

  const eventQueue = useConstant(() => new RAPIER.EventQueue(true))
  const colliderMeshes = useConstant(() => new Map<number, Object3D>())
  const colliderEvents = useConstant<EventMap>(() => new Map())
  const rigidBodyMeshes = useConstant(() => new Map<number, Object3D>())
  const rigidBodyEvents = useConstant<EventMap>(() => new Map())
  const rigidBodyParentOffsets = useConstant(() => new Map<number, Matrix4>())
  const debugMeshRef = useRef<LineSegments>(null)
  const updateListeners = useConstant(
    () => new Set<RefObject<(delta: number) => void>>(),
  )

  const worldGetter = useRef(() => {
    if (worldRef.current === null) {
      worldRef.current = new RAPIER.World(
        Array.isArray(gravity) ? new Vector3().fromArray(gravity) : gravity,
      )
      worldRef.current.timestep = Stages.Physics.fixedStep
    }
    return worldRef.current
  })

  // Clean up
  useEffect(() => {
    return () => {
      eventQueue.free()
      if (worldRef.current !== null) {
        worldRef.current.free()
        worldRef.current = null
      }
    }
  }, [eventQueue])

  // Update gravity
  useEffect(() => {
    const world = worldGetter.current()
    if (world == null) return
    if (gravity != null) {
      world.gravity = Array.isArray(gravity)
        ? new Vector3().fromArray(gravity)
        : gravity
    }
  }, [gravity])

  useUpdate(() => {
    const world = worldGetter.current()
    if (world == null) return

    world.step(eventQueue)

    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      handleCollisionEvent(
        world,
        handle1,
        colliderEvents,
        colliderMeshes,
        rigidBodyEvents,
        rigidBodyMeshes,
        started,
      )
      handleCollisionEvent(
        world,
        handle2,
        colliderEvents,
        colliderMeshes,
        rigidBodyEvents,
        rigidBodyMeshes,
        started,
      )
    })

    if (debug) {
      const mesh = debugMeshRef.current
      if (!mesh) return

      const buffers = world.debugRender()

      mesh.geometry.setAttribute(
        'position',
        new BufferAttribute(buffers.vertices, 3),
      )
      mesh.geometry.setAttribute(
        'color',
        new BufferAttribute(buffers.colors, 4),
      )
    }
  }, Stages.Physics)

  useUpdate(() => {
    const world = worldGetter.current()
    if (world == null) return

    const alpha = Stages.Fixed.alpha

    world.forEachRigidBody((rigidBody) => {
      if (rigidBody.isSleeping() || rigidBody.isFixed()) return

      const mesh = rigidBodyMeshes.get(rigidBody.handle)
      if (mesh == null) return

      const t = rigidBody.translation()
      const r = rigidBody.rotation()
      const matrixOffset = rigidBodyParentOffsets.get(rigidBody.handle)

      _object3d.position.set(t.x, t.y, t.z)
      _object3d.quaternion.set(r.x, r.y, r.z, r.w)

      if (matrixOffset) {
        _object3d.applyMatrix4(matrixOffset)
      }

      mesh.position.lerp(_object3d.position, alpha)
      mesh.quaternion.slerp(_object3d.quaternion, alpha)
    })
  })

  const context = useMemo<PhysicsContextValue>(
    () => ({
      worldRef: worldGetter,
      debug,
      colliderMeshes,
      colliderEvents,
      rigidBodyMeshes,
      rigidBodyEvents,
      rigidBodyParentOffsets,
      updateListeners,
    }),
    [
      debug,
      colliderMeshes,
      colliderEvents,
      rigidBodyMeshes,
      rigidBodyEvents,
      rigidBodyParentOffsets,
      updateListeners,
    ],
  )

  return (
    <PhysicsContext.Provider value={context}>
      {children}
      {debug && (
        <lineSegments ref={debugMeshRef}>
          <lineBasicMaterial color={0xffffff} vertexColors />
          <bufferGeometry />
        </lineSegments>
      )}
    </PhysicsContext.Provider>
  )
}

function handleCollisionEvent(
  world: RAPIER.World,
  colliderHandle: number,
  colliderEvents: EventMap,
  colliderMeshes: Map<number, Object3D>,
  rigidBodyEvents: EventMap,
  rigidBodyMeshes: Map<number, Object3D>,
  started: boolean,
) {
  const collider = colliderMeshes.get(colliderHandle)
  const colliderEvent = colliderEvents.get(colliderHandle)

  const rigidBody = world.getCollider(colliderHandle).parent()
  const rigidBodyMesh =
    rigidBody != null ? rigidBodyMeshes.get(rigidBody.handle) : null
  const rigidBodyEvent =
    rigidBody != null ? rigidBodyEvents.get(rigidBody.handle) : null

  if (started) {
    collider && colliderEvent?.onCollisionEnter?.({ target: collider })
    rigidBodyMesh &&
      rigidBodyEvent?.onCollisionEnter?.({ target: rigidBodyMesh })
  } else {
    collider && colliderEvent?.onCollisionExit?.({ target: collider })
    rigidBodyMesh &&
      rigidBodyEvent?.onCollisionExit?.({ target: rigidBodyMesh })
  }
}

export function usePhysicsUpdate(cb: (delta: number) => void) {
  const context = usePhysicsContext()
  const ref = useRefCallback(cb)

  useLayoutEffect(() => {
    context.updateListeners.add(ref)
    return () => {
      context.updateListeners.delete(ref)
    }
  }, [context.updateListeners, ref])
}

///////////////////////////////////////////////////////////////
// RigidBody
///////////////////////////////////////////////////////////////

interface RigidBodyContextValue {
  rigidBodyRef: MutableRefObject<() => RAPIER.RigidBody>
  listenForContactEvents: boolean
}

const RigidBodyContext = createContext<RigidBodyContextValue | null>(null)

type RigidBodyType =
  | 'dynamic'
  | 'fixed'
  | 'kinematic-velocity-based'
  | 'kinematic-position-based'

export interface RigidBodyApi extends RAPIER.RigidBody {}

type Triplet = [number, number, number]

export interface RigidBodyProps extends Omit<Object3DProps, 'ref'> {
  type?: RigidBodyType
  linearDamping?: number
  linearVelocity?: Triplet | Vector3
  angularDamping?: number
  angularVelocity?: Triplet | Vector3
  gravityScale?: number
  dominanceGroup?: number
  restrictPosition?: [x: boolean, y: boolean, z: boolean]
  restrictRotation?: [x: boolean, y: boolean, z: boolean]
  lockPosition?: boolean
  lockRotation?: boolean
  ccd?: boolean
  canSleep?: boolean
  onCollision?: CollisionEventCallback
  onCollisionEnter?: CollisionEventCallback
  onCollisionExit?: CollisionEventCallback
}

export const RigidBody = forwardRef(function RigidBody(
  {
    type = 'dynamic',
    children,
    linearDamping,
    linearVelocity,
    angularDamping,
    angularVelocity,
    gravityScale = 1,
    dominanceGroup = 0,
    ccd = false,
    canSleep = true,
    restrictPosition,
    restrictRotation,
    lockPosition = false,
    lockRotation = false,
    onCollision,
    onCollisionEnter = noop,
    onCollisionExit = noop,
    ...props
  }: RigidBodyProps,
  ref?: ForwardedRef<RigidBodyApi | null>,
) {
  const { worldRef, rigidBodyMeshes, rigidBodyEvents, rigidBodyParentOffsets } =
    usePhysicsContext()
  const object3dRef = useRef<Object3D>(null)
  const rigidBodyRef = useRef<RAPIER.RigidBody | null>(null)

  const rigidBodyGetter = useRef(() => {
    if (rigidBodyRef.current === null) {
      const world = worldRef.current()
      const rigidBodyDesc = createRigidBodyDesc(type)
        .setGravityScale(gravityScale)
        .setDominanceGroup(dominanceGroup)
        .setCcdEnabled(ccd)
        .setCanSleep(canSleep)

      if (restrictPosition) {
        const [x, y, z] = restrictPosition
        rigidBodyDesc.restrictTranslations(!x, !y, !z)
      }

      if (restrictRotation) {
        const [x, y, z] = restrictRotation
        rigidBodyDesc.restrictRotations(!x, !y, !z)
      }

      if (lockPosition) {
        rigidBodyDesc.lockTranslations()
      }

      if (lockRotation) {
        rigidBodyDesc.lockRotations()
      }

      if (linearDamping) {
        rigidBodyDesc.setLinearDamping(linearDamping)
      }

      if (linearVelocity) {
        rigidBodyDesc.setLinvel(
          ...(Array.isArray(linearVelocity)
            ? linearVelocity
            : linearVelocity.toArray()),
        )
      }

      if (angularDamping) {
        rigidBodyDesc.setLinearDamping(angularDamping)
      }

      if (angularVelocity) {
        rigidBodyDesc.setAngvel(
          Array.isArray(angularVelocity)
            ? new Vector3().fromArray(angularVelocity)
            : angularVelocity,
        )
      }

      rigidBodyRef.current = world.createRigidBody(rigidBodyDesc)
    }
    return rigidBodyRef.current
  })

  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (object3d === null) return
    const world = worldRef.current()
    const rigidBody = rigidBodyGetter.current()

    // object3d.updateWorldMatrix(true, false)
    object3d.matrixWorld.decompose(_position, _quaternion, _scale)

    if (object3d.parent && object3d.parent.type !== 'Scene') {
      const parentMatrixOffset = object3d.parent.matrixWorld.clone().invert()
      rigidBodyParentOffsets.set(rigidBody.handle, parentMatrixOffset)
    }

    rigidBodyMeshes.set(rigidBody.handle, object3d)

    rigidBody.setRotation(_quaternion, false)
    rigidBody.setTranslation(_position, false)

    return () => {
      if (rigidBodyRef.current !== null) {
        // Check if the rigid body has already been removed.
        if (world.getRigidBody(rigidBody.handle)) {
          world.removeRigidBody(rigidBody)
        }
        rigidBodyRef.current = null
      }
      rigidBodyMeshes.delete(rigidBody.handle)
      rigidBodyParentOffsets.delete(rigidBody.handle)
    }
  }, [worldRef, rigidBodyMeshes, rigidBodyParentOffsets])

  // Because position/rotation props are forwarded directly to the Object3d, the
  // 3d and physics world can become out of sync for sleeping bodies (which are
  // skipped in the useFrame cb). This ensures that every time the component
  // updates, it syncs the position/rotation from the physics world.
  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (object3d === null) return
    const rigidBody = rigidBodyGetter.current()

    const t = rigidBody.translation()
    const r = rigidBody.rotation()
    const matrixOffset = rigidBodyParentOffsets.get(rigidBody.handle)

    if (matrixOffset) {
      _object3d.position.set(t.x, t.y, t.z)
      _object3d.quaternion.set(r.x, r.y, r.z, r.w)
      _object3d.applyMatrix4(matrixOffset)

      object3d.position.setFromMatrixPosition(_object3d.matrix)
      object3d.quaternion.setFromRotationMatrix(_object3d.matrix)
    } else {
      object3d.position.set(t.x, t.y, t.z)
      object3d.quaternion.set(r.x, r.y, r.z, r.w)
    }
  })

  const onCollisionEnterHandler = useEffectEvent(
    onCollision || onCollisionEnter,
  )
  const onCollisionExitHandler = useEffectEvent(onCollisionExit)

  useEffect(() => {
    const rigidBody = rigidBodyGetter.current()
    rigidBodyEvents.set(rigidBody.handle, {
      onCollisionEnter: onCollisionEnterHandler,
      onCollisionExit: onCollisionExitHandler,
    })
    return () => void rigidBodyEvents.delete(rigidBody.handle)
  }, [onCollisionEnterHandler, onCollisionExitHandler, rigidBodyEvents])

  const hasEventListeners =
    !!onCollision || !!onCollisionEnter || !!onCollisionExit

  const context = useMemo<RigidBodyContextValue>(
    () => ({
      rigidBodyRef: rigidBodyGetter,
      listenForContactEvents: hasEventListeners,
    }),
    [hasEventListeners],
  )

  useImperativeHandle(ref, rigidBodyGetter.current)

  return (
    <RigidBodyContext.Provider value={context}>
      <object3D ref={object3dRef} {...props}>
        {children}
      </object3D>
    </RigidBodyContext.Provider>
  )
})

function createRigidBodyDesc(type: RigidBodyType): RAPIER.RigidBodyDesc {
  switch (type) {
    case 'dynamic':
      return RAPIER.RigidBodyDesc.dynamic()
    case 'fixed':
      return RAPIER.RigidBodyDesc.fixed()
    case 'kinematic-velocity-based':
      return RAPIER.RigidBodyDesc.kinematicVelocityBased()
    case 'kinematic-position-based':
      return RAPIER.RigidBodyDesc.kinematicPositionBased()
    default:
      throw new Error(`Unsupported RigidBody.type: "${type}"`)
  }
}

///////////////////////////////////////////////////////////////
// Collider
///////////////////////////////////////////////////////////////

export interface ColliderProps extends Omit<Object3DProps, 'args'> {
  friction?: number
  restitution?: number
  density?: number
  onCollision?: CollisionEventCallback
  onCollisionEnter?: CollisionEventCallback
  onCollisionExit?: CollisionEventCallback
}

export function useCollider<
  T extends (scale: Vector3) => RAPIER.ColliderDesc | null,
>(
  cb: T,
  props: Omit<ColliderProps, 'children'>,
  object3dRef: RefObject<Object3D | undefined>,
) {
  const {
    friction,
    restitution,
    density,
    onCollision,
    onCollisionEnter = noop,
    onCollisionExit = noop,
  } = props
  const { worldRef, colliderEvents, colliderMeshes } = usePhysicsContext()
  const { rigidBodyRef, listenForContactEvents } =
    useContext(RigidBodyContext) || {}

  const colliderRef = useRef<RAPIER.Collider | null>(null)
  const scaleRef = useRef<Vector3 | null>(null)

  const colliderGetter = useRef((position?: Vector3, rotation?: Quaternion) => {
    if (colliderRef.current === null) {
      const world = worldRef.current()
      const rigidBody = rigidBodyRef?.current()
      const scale = scaleRef.current

      if (scale == null) {
        throw new Error('Unable to create collider. Missing "scale"')
      }

      const colliderDesc = cb(scale)

      if (colliderDesc === null) {
        throw new Error('Unable to create collider')
      }

      if (friction) {
        colliderDesc.setFriction(friction)
      }

      if (restitution) {
        colliderDesc.setRestitution(restitution)
      }

      if (density) {
        colliderDesc.setDensity(density)
      }

      if (position) {
        colliderDesc.setTranslation(position.x, position.y, position.z)
      }

      if (rotation) {
        colliderDesc.setRotation(rotation)
      }

      const listenForColliderContactEvents =
        !!onCollision || !!onCollisionEnter || !!onCollisionExit

      if (listenForContactEvents || listenForColliderContactEvents) {
        colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      }

      colliderRef.current = world.createCollider(colliderDesc, rigidBody)
    }
    return colliderRef.current
  })

  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (object3d == null) return

    object3d.updateWorldMatrix(true, false)
    object3d.matrixWorld.decompose(_position, _quaternion, _scale)

    scaleRef.current = _scale.clone()

    const world = worldRef.current()
    const collider = colliderGetter.current(
      object3d.position,
      object3d.quaternion,
    )

    // Seems to be a bug where you cannot set collider translation after it's
    // created. Create PR/issue.
    // collider.setTranslation(object3d.position)
    // collider.setRotation(object3d.quaternion)

    colliderMeshes.set(collider.handle, object3d)

    return () => {
      if (colliderRef.current === null) {
        // Check if the collider has already been removed.
        if (world.getCollider(collider.handle)) {
          world.removeCollider(collider, true)
        }
        colliderMeshes.delete(collider.handle)
        colliderRef.current = null
      }
    }
  }, [colliderMeshes, object3dRef, worldRef])

  const onCollisionEnterHandler = useEffectEvent(
    onCollision || onCollisionEnter,
  )
  const onCollisionExitHandler = useEffectEvent(onCollisionExit)

  useEffect(() => {
    const collider = colliderGetter.current()
    colliderEvents.set(collider.handle, {
      onCollisionEnter: onCollisionEnterHandler,
      onCollisionExit: onCollisionExitHandler,
    })
    return () => void colliderEvents.delete(collider.handle)
  }, [colliderEvents, onCollisionEnterHandler, onCollisionExitHandler])

  return colliderGetter
}

///////////////////////////////////////////////////////////////
// CuboidCollier
///////////////////////////////////////////////////////////////

export interface CuboidColliderProps extends ColliderProps {
  args: [width: number, height: number, depth: number]
}

export function CuboidCollider({
  children,
  args,
  ...props
}: CuboidColliderProps) {
  const [width, height, depth] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    (scale) =>
      RAPIER.ColliderDesc.cuboid(
        (width / 2) * scale.x,
        (height / 2) * scale.y,
        (depth / 2) * scale.z,
      ),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export const BoxCollider = CuboidCollider

///////////////////////////////////////////////////////////////
// BallCollider
///////////////////////////////////////////////////////////////

export interface BallColliderProps extends ColliderProps {
  args: [radius: number]
}

export function BallCollider({ children, args, ...props }: BallColliderProps) {
  const [radius] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    (scale) => RAPIER.ColliderDesc.ball(radius * scale.x),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export const SphereCollider = BallCollider

///////////////////////////////////////////////////////////////
// CylinderCollider
///////////////////////////////////////////////////////////////

export interface CylinderColliderProps extends ColliderProps {
  args: [radius: number, height: number]
}

export function CylinderCollider({
  children,
  args,
  ...props
}: CylinderColliderProps) {
  const [radius, height] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    (scale) =>
      RAPIER.ColliderDesc.cylinder((height / 2) * scale.y, radius * scale.x),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// CapsuleCollider
///////////////////////////////////////////////////////////////

export interface CapsuleColliderProps extends ColliderProps {
  args: [radius: number, height: number]
}

export function CapsuleCollider({
  children,
  args,
  ...props
}: CapsuleColliderProps) {
  const [radius, height] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    (scale) =>
      RAPIER.ColliderDesc.capsule((height / 2) * scale.y, radius * scale.x),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// ConeCollider
///////////////////////////////////////////////////////////////

export interface ConeColliderProps extends ColliderProps {
  args: [radius: number, height: number]
}

export function ConeCollider({ children, args, ...props }: ConeColliderProps) {
  const [radius, height] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    (scale) =>
      RAPIER.ColliderDesc.cone((height / 2) * scale.y, radius * scale.x),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// ConvexMeshCollider
///////////////////////////////////////////////////////////////

export interface ConvexMeshColliderProps extends ColliderProps {
  args: [vertices: Float32Array, indices: Uint32Array]
}

export function ConvexMeshCollider({
  children,
  args,
  ...props
}: ConvexMeshColliderProps) {
  const [vertices, indices] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    () => RAPIER.ColliderDesc.convexMesh(vertices, indices),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// ConvexHullCollider
///////////////////////////////////////////////////////////////

export interface ConvexHullColliderProps extends ColliderProps {
  args: [Readonly<Float32Array>]
}

export function ConvexHullCollider({
  children,
  args,
  ...props
}: ConvexHullColliderProps) {
  const [points] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    (scale) =>
      RAPIER.ColliderDesc.convexHull(
        scalePoints(points.slice(), scale.toArray()),
      ),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

function scalePoints(points: Float32Array, scale: [number, number, number]) {
  for (let i = 0; i < points.length; i++) {
    const scaleIndex = i % 3
    const scaleValue = scale[scaleIndex]
    if (scaleValue !== 1) {
      points[i] = points[i] * scaleValue
    }
  }
  return points
}

///////////////////////////////////////////////////////////////
// TrimeshCollider
///////////////////////////////////////////////////////////////

export interface TrimeshColliderProps extends ColliderProps {
  args: [vertices: Float32Array, indices: Uint32Array]
}

export function TrimeshCollider({
  children,
  args,
  ...props
}: TrimeshColliderProps) {
  const [vertices, indices] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    () => RAPIER.ColliderDesc.trimesh(vertices, indices),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// HeightfieldCollider
///////////////////////////////////////////////////////////////

export interface HeightfieldColliderProps extends ColliderProps {
  args: [
    nrows: number,
    ncols: number,
    heights: Float32Array,
    scale: RAPIER.Vector,
  ]
}

export function HeightfieldCollider({
  children,
  args,
  ...props
}: HeightfieldColliderProps) {
  const [nrows, ncols, heights, scale] = args
  const object3dRef = useRef<Object3D>(null)

  useCollider(
    () => RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale),
    props,
    object3dRef,
  )

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// Joints
///////////////////////////////////////////////////////////////

export function useImpulseJoint(
  body1: MutableRefObject<RigidBodyApi | null>,
  body2: MutableRefObject<RigidBodyApi | null>,
  params: RAPIER.JointData,
) {
  const { worldRef } = usePhysicsContext()
  const jointRef = useRef<RAPIER.ImpulseJoint | null>(null)

  const jointGetter = useRef(() => {
    if (jointRef.current === null) {
      if (!body1.current || !body2.current) return
      const world = worldRef.current()
      const rb1 = world.getRigidBody(body1.current.handle)
      const rb2 = world.getRigidBody(body2.current.handle)

      const joint = world.createImpulseJoint(params, rb1, rb2, true)

      jointRef.current = joint
    }

    return jointRef.current
  })

  useLayoutEffect(() => {
    const world = worldRef.current()
    const joint = jointGetter.current()

    return () => {
      if (joint) {
        world.removeImpulseJoint(joint, true)
        jointRef.current = null
      }
    }
  }, [worldRef])

  return jointGetter
}

export function useSphericalJoint(
  body1: MutableRefObject<RigidBodyApi | null>,
  body2: MutableRefObject<RigidBodyApi | null>,
  params: Parameters<typeof RAPIER.JointData.spherical>,
) {
  return useImpulseJoint(body1, body2, RAPIER.JointData.spherical(...params))
}

///////////////////////////////////////////////////////////////
// CharacterController
///////////////////////////////////////////////////////////////

interface CharacterControllerParams {
  offset: number
}

export function useCharacterController(params: CharacterControllerParams) {
  const { worldRef } = usePhysicsContext()
  const characterControllerRef =
    useRef<RAPIER.KinematicCharacterController | null>(null)

  const characterControllerGetter = useRef(() => {
    if (characterControllerRef.current === null) {
      const world = worldRef.current()

      const characterController = world.createCharacterController(params.offset)

      characterController.enableAutostep(0.7, 0.3, true)
      characterController.enableSnapToGround(0.3)
      characterController.setCharacterMass(100)
      characterController.setApplyImpulsesToDynamicBodies(true)
      characterController.setSlideEnabled(true)

      characterControllerRef.current = characterController
    }

    return characterControllerRef.current
  })

  useLayoutEffect(() => {
    const world = worldRef.current()
    const characterController = characterControllerGetter.current()

    return () => {
      if (characterController) {
        world.removeCharacterController(characterController)
        characterControllerRef.current = null
      }
    }
  }, [worldRef])

  return characterControllerGetter
}

///////////////////////////////////////////////////////////////
// Utils
///////////////////////////////////////////////////////////////

function noop() {
  // noop
}

// Based on https://github.com/reactjs/rfcs/pull/220
function useEffectEvent<T extends (...args: any[]) => any>(handler: T) {
  const handlerRef = useRef<T | null>(null)

  useLayoutEffect(() => {
    handlerRef.current = handler
  })

  return useCallback((...args: any[]) => {
    const fn = handlerRef.current
    return fn?.(...args)
  }, [])
}

function useRefCallback<T extends (...args: any[]) => any>(handler: T) {
  const handlerRef = useRef<T | null>(null)

  useLayoutEffect(() => {
    handlerRef.current = handler
  })

  return handlerRef
}
