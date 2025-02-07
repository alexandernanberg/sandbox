import * as RAPIER from '@dimforge/rapier3d-compat'
import {useFrame} from '@react-three/fiber'
import type {ComponentProps, ReactNode, Ref, RefObject} from 'react'
import {
  createContext,
  use,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import type {LineSegments, Matrix4} from 'three'
import {BufferAttribute, Object3D, Quaternion, Vector3} from 'three'
import {useEffectEvent} from '~/lib/use-effect-event'
import {useConstant} from '~/utils'

const _object3d = new Object3D()
const _position = new Vector3()
// const _matrix = new Matrix4()
const _scale = new Vector3()
const _quaternion = new Quaternion()

type Object3DProps = ComponentProps<'object3D'>

///////////////////////////////////////////////////////////////
// Events
///////////////////////////////////////////////////////////////

interface CollisionEvent {
  target: Object3D
}
type CollisionEventCallback = (event: CollisionEvent) => void

interface ContactForceEvent {
  totalForce: () => RAPIER.Vector3
  totalForceMagnitude: () => number
  maxForceDirection: () => RAPIER.Vector3
  maxForceMagnitude: () => number
}
type ContactForceEventCallback = (event: ContactForceEvent) => void

interface PhysicsEvents {
  onCollisionEnter?: CollisionEventCallback
  onCollisionExit?: CollisionEventCallback
  onContactForce?: ContactForceEventCallback
}

type EventMap = Map<number, PhysicsEvents>

///////////////////////////////////////////////////////////////
// PhysicsContext
///////////////////////////////////////////////////////////////

export interface PhysicsContextValue {
  worldRef: RefObject<() => RAPIER.World>
  debug: boolean
  colliderMeshes: Map<number, Object3D>
  colliderEvents: EventMap
  rigidBodyMeshes: Map<number, Object3D>
  rigidBodyEvents: EventMap
  rigidBodyInvertedWorldMatrices: Map<number, Matrix4>
  beforeStepCallbacks: Set<RefObject<(delta: number) => void>>
  afterStepCallbacks: Set<RefObject<(delta: number) => void>>
}

const PhysicsContext = createContext<PhysicsContextValue | null>(null)

function usePhysicsContext() {
  const context = use(PhysicsContext)

  if (context == null) {
    throw new Error(
      'usePhysicsContext() may be used only in the context of a <Physics> component.',
    )
  }

  return context
}

export function usePhysics() {
  const context = usePhysicsContext()
  return {worldRef: context.worldRef}
}

///////////////////////////////////////////////////////////////
// Physics
///////////////////////////////////////////////////////////////

const DEFAULT_GRAVITY = new Vector3(0, -9.81, 0)
const fixedTimeStep = 1 / 60

const init = RAPIER.init()

export interface PhysicsProps {
  children?: ReactNode
  debug?: boolean
  gravity?: Triplet | Vector3
}

export function Physics({
  children,
  debug = false,
  gravity = DEFAULT_GRAVITY,
}: PhysicsProps) {
  use(init)
  const worldRef = useRef<RAPIER.World>(null)
  const eventQueueRef = useRef<RAPIER.EventQueue>(null)

  const frameAccumulatorRef = useRef(0)
  const afterStepCallbacks = useConstant(
    () => new Set<RefObject<(delta: number) => void>>(),
  )
  const beforeStepCallbacks = useConstant(
    () => new Set<RefObject<(delta: number) => void>>(),
  )

  const colliderMeshes = useConstant(() => new Map<number, Object3D>())
  const colliderEvents = useConstant(() => new Map<number, PhysicsEvents>())

  const rigidBodyMeshes = useConstant(() => new Map<number, Object3D>())
  const rigidBodyEvents = useConstant(() => new Map<number, PhysicsEvents>())
  const rigidBodyInvertedWorldMatrices = useConstant(
    () => new Map<number, Matrix4>(),
  )
  const rigidBodyPrevPositions = useConstant(
    () => new Map<number, RAPIER.Vector3>(),
  )
  const rigidBodyPrevRotations = useConstant(
    () => new Map<number, RAPIER.Rotation>(),
  )

  const debugMeshRef = useRef<LineSegments>(null)

  const worldGetter = useRef(() => {
    if (worldRef.current === null) {
      worldRef.current = new RAPIER.World(
        Array.isArray(gravity) ? new Vector3().fromArray(gravity) : gravity,
      )
      worldRef.current.timestep = fixedTimeStep
    }
    return worldRef.current
  })

  const eventQueueGetter = useRef(() => {
    if (eventQueueRef.current === null) {
      eventQueueRef.current = new RAPIER.EventQueue(true)
    }
    return eventQueueRef.current
  })

  // Clean up
  useEffect(() => {
    return () => {
      if (worldRef.current !== null) {
        worldRef.current.free()
        worldRef.current = null
      }
      if (eventQueueRef.current !== null) {
        eventQueueRef.current.free()
        eventQueueRef.current = null
      }
    }
  }, [])

  // Update gravity
  useEffect(() => {
    const world = worldGetter.current()
    world.gravity = Array.isArray(gravity)
      ? new Vector3().fromArray(gravity)
      : gravity
  }, [gravity])

  useFrame((_state, delta) => {
    const world = worldGetter.current()
    const eventQueue = eventQueueGetter.current()

    if (delta > 0.25) {
      delta = 0.25
    }

    frameAccumulatorRef.current += delta

    // Fixed update
    while (frameAccumulatorRef.current >= fixedTimeStep) {
      for (const cb of beforeStepCallbacks) {
        cb.current(fixedTimeStep)
      }

      rigidBodyPrevPositions.clear()
      rigidBodyPrevRotations.clear()
      world.forEachRigidBody((body) => {
        // TODO: body.nextTranslation?
        rigidBodyPrevPositions.set(body.handle, body.translation())
        rigidBodyPrevRotations.set(body.handle, body.rotation())
      })

      world.step(eventQueue)

      for (const cb of afterStepCallbacks) {
        cb.current(fixedTimeStep)
      }

      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        // TODO: world.contactPair
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

      eventQueue.drainContactForceEvents((event) => {
        const source1 = getColliderSource(
          world,
          event.collider1(),
          colliderEvents,
          colliderMeshes,
          rigidBodyEvents,
          rigidBodyMeshes,
        )
        const source2 = getColliderSource(
          world,
          event.collider2(),
          colliderEvents,
          colliderMeshes,
          rigidBodyEvents,
          rigidBodyMeshes,
        )

        const collisionPayload = {
          totalForce: () => event.totalForce(),
          totalForceMagnitude: () => event.totalForceMagnitude(),
          maxForceDirection: () => event.maxForceDirection(),
          maxForceMagnitude: () => event.maxForceMagnitude(),
        }

        const collisionPayload1 = {...collisionPayload}
        const collisionPayload2 = {...collisionPayload}

        source1.collider.events?.onContactForce?.(collisionPayload1)
        source1.rigidBody.events?.onContactForce?.(collisionPayload1)
        source2.collider.events?.onContactForce?.(collisionPayload2)
        source2.rigidBody.events?.onContactForce?.(collisionPayload2)
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

      frameAccumulatorRef.current -= fixedTimeStep
    }

    const alpha = frameAccumulatorRef.current / fixedTimeStep

    world.forEachRigidBody((rigidBody) => {
      if (rigidBody.isSleeping() || rigidBody.isFixed()) return

      const mesh = rigidBodyMeshes.get(rigidBody.handle)
      if (mesh == null) return

      const t = rigidBody.translation()
      const r = rigidBody.rotation()

      const invertedWorldMatrix = rigidBodyInvertedWorldMatrices.get(
        rigidBody.handle,
      )
      const prevPosition = rigidBodyPrevPositions.get(rigidBody.handle)
      const prevRotation = rigidBodyPrevRotations.get(rigidBody.handle)

      if (prevPosition && prevRotation) {
        mesh.position.copy(prevPosition)
        mesh.quaternion.copy(prevRotation)

        if (invertedWorldMatrix) {
          mesh.applyMatrix4(invertedWorldMatrix)
        }
      }

      _object3d.position.copy(t)
      _object3d.quaternion.copy(r)

      if (invertedWorldMatrix) {
        _object3d.applyMatrix4(invertedWorldMatrix)
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
      rigidBodyInvertedWorldMatrices,
      afterStepCallbacks,
      beforeStepCallbacks,
    }),
    [
      debug,
      colliderMeshes,
      colliderEvents,
      rigidBodyMeshes,
      rigidBodyEvents,
      rigidBodyInvertedWorldMatrices,
      afterStepCallbacks,
      beforeStepCallbacks,
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

interface CollisionSource {
  collider: {
    mesh?: Object3D
    events?: PhysicsEvents
  }
  rigidBody: {
    mesh?: Object3D
    events?: PhysicsEvents
  }
}

function getColliderSource(
  world: RAPIER.World,
  colliderHandle: number,
  colliderEventsMap: EventMap,
  colliderMeshesMap: Map<number, Object3D>,
  rigidBodyEventsMap: EventMap,
  rigidBodyMeshesMap: Map<number, Object3D>,
): CollisionSource {
  const collider = world.getCollider(colliderHandle)
  const colliderMesh = colliderMeshesMap.get(colliderHandle)
  const colliderEvents = colliderEventsMap.get(colliderHandle)

  const rigidBodyHandle = collider.parent()?.handle
  const rigidBodyMesh = rigidBodyHandle
    ? rigidBodyMeshesMap.get(rigidBodyHandle)
    : undefined
  const rigidBodyEvents = rigidBodyHandle
    ? rigidBodyEventsMap.get(rigidBodyHandle)
    : undefined

  return {
    collider: {
      mesh: colliderMesh,
      events: colliderEvents,
    },
    rigidBody: {
      mesh: rigidBodyMesh,
      events: rigidBodyEvents,
    },
  }
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
  const {collider, rigidBody} = getColliderSource(
    world,
    colliderHandle,
    colliderEvents,
    colliderMeshes,
    rigidBodyEvents,
    rigidBodyMeshes,
  )

  // TODO: lazy target?
  if (started) {
    collider.events?.onCollisionEnter?.({target: collider.mesh!})
    rigidBody.events?.onCollisionEnter?.({target: rigidBody.mesh!})
  } else {
    collider.events?.onCollisionExit?.({target: collider.mesh!})
    rigidBody.events?.onCollisionExit?.({target: rigidBody.mesh!})
  }
}

export function usePhysicsUpdate(
  cb: (delta: number) => void,
  stage: 'early' | 'late' = 'early',
) {
  const context = usePhysicsContext()
  const ref = useRefCallback(cb)

  const key = stage === 'early' ? 'beforeStepCallbacks' : 'afterStepCallbacks'
  const subscriptions = context[key]

  useLayoutEffect(() => {
    subscriptions.add(ref)
    return () => {
      subscriptions.delete(ref)
    }
  }, [ref, subscriptions])
}

///////////////////////////////////////////////////////////////
// RigidBody
///////////////////////////////////////////////////////////////

interface RigidBodyContextValue {
  rigidBodyRef: RefObject<() => RAPIER.RigidBody>
  hasCollisionEvent: boolean
  hasContactForceEvent: boolean
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
  ref?: Ref<RigidBodyApi>
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
  onContactForce?: ContactForceEventCallback
}

export function RigidBody({
  ref,
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
  onCollisionEnter,
  onCollisionExit,
  onContactForce,
  ...props
}: RigidBodyProps) {
  const {
    worldRef,
    rigidBodyMeshes,
    rigidBodyEvents,
    rigidBodyInvertedWorldMatrices,
  } = usePhysicsContext()
  const object3dRef = useRef<Object3D>(null)
  const rigidBodyRef = useRef<RAPIER.RigidBody>(null)

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
        rigidBodyDesc.enabledTranslations(!x, !y, !z)
      }

      if (restrictRotation) {
        const [x, y, z] = restrictRotation
        rigidBodyDesc.enabledRotations(!x, !y, !z)
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

    object3d.matrixWorld.decompose(_position, _quaternion, _scale)

    if (object3d.parent && object3d.parent.type !== 'Scene') {
      // object3d.updateWorldMatrix(true, false)
      const invertedWorldMatrix = object3d.parent.matrixWorld.clone().invert()
      rigidBodyInvertedWorldMatrices.set(rigidBody.handle, invertedWorldMatrix)
    }

    rigidBodyMeshes.set(rigidBody.handle, object3d)

    rigidBody.setRotation(_quaternion, false)
    rigidBody.setTranslation(_position, false)

    return () => {
      if (rigidBodyRef.current !== null) {
        // Check if the rigid body has already been removed.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (world.getRigidBody(rigidBody.handle)) {
          world.removeRigidBody(rigidBody)
        }
        rigidBodyRef.current = null
        rigidBodyMeshes.delete(rigidBody.handle)
        rigidBodyInvertedWorldMatrices.delete(rigidBody.handle)
      }
    }
  }, [worldRef, rigidBodyMeshes, rigidBodyInvertedWorldMatrices])

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
    const matrixOffset = rigidBodyInvertedWorldMatrices.get(rigidBody.handle)

    if (matrixOffset) {
      _object3d.position.copy(t)
      _object3d.quaternion.copy(r)
      _object3d.applyMatrix4(matrixOffset)

      object3d.position.setFromMatrixPosition(_object3d.matrix)
      object3d.quaternion.setFromRotationMatrix(_object3d.matrix)
    } else {
      object3d.position.copy(t)
      object3d.quaternion.copy(r)
    }
  })

  const onCollisionEnterHandler = useEffectEvent(
    onCollision || onCollisionEnter || noop,
  )
  const onCollisionExitHandler = useEffectEvent(onCollisionExit || noop)
  const onContactForceHandler = useEffectEvent(onContactForce || noop)

  useEffect(() => {
    const rigidBody = rigidBodyGetter.current()
    rigidBodyEvents.set(rigidBody.handle, {
      onCollisionEnter: onCollisionEnterHandler,
      onCollisionExit: onCollisionExitHandler,
      onContactForce: onContactForceHandler,
    })
    return () => void rigidBodyEvents.delete(rigidBody.handle)
  }, [
    rigidBodyEvents,
    onCollisionEnterHandler,
    onCollisionExitHandler,
    onContactForceHandler,
  ])

  const hasCollisionEvent =
    !!onCollision || !!onCollisionEnter || !!onCollisionExit
  const hasContactForceEvent = !!onContactForce

  const context = useMemo<RigidBodyContextValue>(
    () => ({
      rigidBodyRef: rigidBodyGetter,
      hasCollisionEvent,
      hasContactForceEvent,
    }),
    [hasCollisionEvent, hasContactForceEvent],
  )

  useImperativeHandle(ref, () => rigidBodyRef.current!)

  return (
    <RigidBodyContext.Provider value={context}>
      <object3D ref={object3dRef} {...props}>
        {children}
      </object3D>
    </RigidBodyContext.Provider>
  )
}

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
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
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
  sensor?: boolean
  onCollision?: CollisionEventCallback
  onCollisionEnter?: CollisionEventCallback
  onCollisionExit?: CollisionEventCallback
  onContactForce?: ContactForceEventCallback
}

export function useCollider<
  T extends (scale: Vector3) => RAPIER.ColliderDesc | null,
>(
  cb: T,
  props: Omit<ColliderProps, 'children'>,
  object3dRef: RefObject<Object3D | null>,
) {
  const {
    friction,
    restitution,
    density,
    sensor,
    onCollision,
    onCollisionEnter,
    onCollisionExit,
    onContactForce,
  } = props
  const {worldRef, colliderEvents, colliderMeshes} = usePhysicsContext()
  const context = use(RigidBodyContext)
  const {rigidBodyRef} = context || {}

  const colliderRef = useRef<RAPIER.Collider>(null)
  const scaleRef = useRef<Vector3>(null)

  const hasCollisionEvent =
    context?.hasCollisionEvent ||
    !!onCollision ||
    !!onCollisionEnter ||
    !!onCollisionExit
  const hasContactForceEvent = context?.hasContactForceEvent || !!onContactForce

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

      if (sensor) {
        colliderDesc.setSensor(sensor)
      }

      setColliderActiveEvents(
        colliderDesc,
        hasCollisionEvent,
        hasContactForceEvent,
      )

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
      if (colliderRef.current !== null) {
        // Check if the collider has already been removed.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (world.getCollider(collider.handle)) {
          world.removeCollider(collider, true)
        }
        colliderMeshes.delete(collider.handle)
        colliderRef.current = null
      }
    }
  }, [colliderMeshes, object3dRef, worldRef])

  useEffect(() => {
    const collider = colliderGetter.current()
    setColliderActiveEvents(collider, hasCollisionEvent, hasContactForceEvent)
  }, [hasCollisionEvent, hasContactForceEvent])

  const onCollisionEnterHandler = useEffectEvent(
    onCollision || onCollisionEnter || noop,
  )
  const onCollisionExitHandler = useEffectEvent(onCollisionExit || noop)
  const onContactForceHandler = useEffectEvent(onContactForce || noop)

  useEffect(() => {
    const collider = colliderGetter.current()
    colliderEvents.set(collider.handle, {
      onCollisionEnter: onCollisionEnterHandler,
      onCollisionExit: onCollisionExitHandler,
      onContactForce: onContactForceHandler,
    })
    return () => void colliderEvents.delete(collider.handle)
  }, [
    colliderEvents,
    onCollisionEnterHandler,
    onCollisionExitHandler,
    onContactForceHandler,
  ])

  return colliderGetter
}

function setColliderActiveEvents(
  collider: RAPIER.ColliderDesc | RAPIER.Collider,
  hasCollisionEvent: boolean,
  hasContactForceEvent: boolean,
) {
  if (hasCollisionEvent && hasContactForceEvent) {
    collider.setActiveEvents(
      RAPIER.ActiveEvents.COLLISION_EVENTS |
        RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
    )
  } else if (hasCollisionEvent) {
    collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
  } else if (hasContactForceEvent) {
    collider.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
  } else {
    collider.setActiveEvents(RAPIER.ActiveEvents.NONE)
  }
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

export function BallCollider({children, args, ...props}: BallColliderProps) {
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

export function ConeCollider({children, args, ...props}: ConeColliderProps) {
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
      points[i] = points[i]! * scaleValue!
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
  body1: RefObject<RigidBodyApi | null>,
  body2: RefObject<RigidBodyApi | null>,
  params: RAPIER.JointData,
) {
  const {worldRef} = usePhysicsContext()
  const jointRef = useRef<RAPIER.ImpulseJoint>(null)

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
  body1: RefObject<RigidBodyApi | null>,
  body2: RefObject<RigidBodyApi | null>,
  params: Parameters<typeof RAPIER.JointData.spherical>,
) {
  return useImpulseJoint(body1, body2, RAPIER.JointData.spherical(...params))
}

///////////////////////////////////////////////////////////////
// Utils
///////////////////////////////////////////////////////////////

function noop() {
  // noop
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useRefCallback<T extends (...args: any[]) => any>(handler: T) {
  const handlerRef = useRef<T>(handler)

  useLayoutEffect(() => {
    handlerRef.current = handler
  })

  return handlerRef
}
