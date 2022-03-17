import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Object3DNode } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import type { DependencyList, ForwardedRef, ReactNode, RefObject } from 'react'
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { suspend } from 'suspend-react'
import type { Object3D } from 'three'
import { Euler, Quaternion, Vector3 } from 'three'
import { useConstant } from '../utils'

// Temporary solution until the PR is merged.
// https://github.com/pmndrs/react-three-fiber/pull/2099#issuecomment-1050891821
export type Object3DProps = Object3DNode<Object3D, typeof Object3D>
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      object3D: Object3DProps
    }
  }
}

type Vector3Like = Vector3 | Parameters<Vector3['set']>
type QuaternionLike = Quaternion | Parameters<Quaternion['set']>
type EulerLike = Euler | Parameters<Euler['set']>

interface CollideEvent {
  target: Object3D
}
type CollideEventCallback = (event: CollideEvent) => void

function uuid(type: string, id: number) {
  return `${type}:${id}`
}

///////////////////////////////////////////////////////////////
// PhysicsContext
///////////////////////////////////////////////////////////////

export interface PhysicsContextValue {
  world: RAPIER.World
  debug: boolean
  bodies: Map<number, Object3D>
  colliders: Map<number, Object3D>
  events: Map<
    string,
    {
      onCollisionEnter?: CollideEventCallback
      onCollisionExit?: CollideEventCallback
    }
  >
}

const PhysicsContext = createContext<PhysicsContextValue | null>(null)

function usePhysicsContext() {
  const context = useContext(PhysicsContext)

  if (!context) {
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
}

export function Physics({ children, debug = false }: PhysicsProps) {
  suspend(() => RAPIER.init(), ['rapier'])

  const world = useConstant(() => {
    const gravity = { x: 0.0, y: -9.81, z: 0.0 }
    return new RAPIER.World(gravity)
  })

  useEffect(() => {
    return () => world.free()
  }, [world])

  const eventQueue = useConstant(() => new RAPIER.EventQueue(true))
  const bodies = useConstant(() => new Map<number, Object3D>())
  const colliders = useConstant(() => new Map<number, Object3D>())
  const events = useConstant<PhysicsContextValue['events']>(() => new Map())

  const vec = new Vector3()
  const quat = new Quaternion()

  // TODO: investigate using a fixed update frequency + fix 60 vs 120 hz.
  useFrame(() => {
    if (!world) return

    world.step(eventQueue)

    world.forEachRigidBody((rigidBody) => {
      if (rigidBody.isSleeping() || rigidBody.isStatic()) return
      const object3d = bodies.get(rigidBody.handle)
      if (!object3d) return

      const positionOffset = object3d.userData?.positionOffset as
        | Vector3
        | undefined
      const rotationOffset = object3d.userData?.rotationOffset as
        | Quaternion
        | undefined

      const t = rigidBody.translation()
      const r = rigidBody.rotation()

      vec.set(t.x, t.y, t.z)

      if (positionOffset) {
        vec.sub(positionOffset)
      }

      quat.set(r.x, r.y, r.z, r.w)
      // TODO: figure out how to solve rotation
      // if (rotationOffset) quat.sub(rotationOffset)

      object3d.position.copy(vec)
      object3d.quaternion.copy(quat)
    })

    eventQueue.drainContactEvents((handle1, handle2, started) => {
      const body1Handle = world.getCollider(handle1).parent()
      const body2Handle = world.getCollider(handle2).parent()

      const event1 = events.get(uuid('collider', handle1))
      const event2 = events.get(uuid('collider', handle2))
      const bodyEvent1 = events.get(uuid('rigidBody', body1Handle))
      const bodyEvent2 = events.get(uuid('rigidBody', body2Handle))

      const collider1 = colliders.get(handle1)
      const collider2 = colliders.get(handle2)
      const body1 = bodies.get(body1Handle)
      const body2 = bodies.get(body2Handle)

      if (started) {
        collider1 && event1?.onCollisionEnter?.({ target: collider1 })
        collider2 && event2?.onCollisionEnter?.({ target: collider2 })
        body1 && bodyEvent1?.onCollisionEnter?.({ target: body1 })
        body2 && bodyEvent2?.onCollisionEnter?.({ target: body2 })
      } else {
        collider1 && event1?.onCollisionExit?.({ target: collider1 })
        collider2 && event2?.onCollisionExit?.({ target: collider2 })
        body1 && bodyEvent1?.onCollisionExit?.({ target: body1 })
        body2 && bodyEvent2?.onCollisionExit?.({ target: body2 })
      }
    })
  })

  const context = useMemo(
    () => ({ world, debug, bodies, colliders, events }),
    [bodies, colliders, debug, events, world],
  )

  return (
    <PhysicsContext.Provider value={context}>
      {children}
    </PhysicsContext.Provider>
  )
}

///////////////////////////////////////////////////////////////
// RigidBody
///////////////////////////////////////////////////////////////

interface RigidBodyContextValue {
  rigidBody: RAPIER.RigidBody | null
  shouldCollidersListenForContactEvents: boolean
}

const RigidBodyContext = createContext<RigidBodyContextValue>({
  rigidBody: null,
  shouldCollidersListenForContactEvents: false,
})

type RigidBodyType =
  | 'dynamic'
  | 'static'
  | 'kinematic-velocity-based'
  | 'kinematic-position-based'

export interface RigidBodyProps {
  children?: ReactNode
  position?: Vector3Like
  quaternion?: QuaternionLike
  rotation?: EulerLike
  type?: RigidBodyType
  onCollision?: CollideEventCallback
  onCollisionEnter?: CollideEventCallback
  onCollisionExit?: CollideEventCallback
}

export interface RigidBodyApi extends RAPIER.RigidBody {}

export const RigidBody = forwardRef(function RigidBody(
  {
    type = 'dynamic',
    position: rawPosition,
    quaternion: rawQuaternion,
    rotation: rawRotation,
    children,
    onCollision,
    onCollisionEnter,
    onCollisionExit,
  }: RigidBodyProps,
  ref?: ForwardedRef<RigidBodyApi | null>,
) {
  const { world, bodies, events } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()
  const [rigidBody, setRigidBody] = useState<RAPIER.RigidBody | null>(null)

  useImperativeHandle(ref, () => rigidBody as RAPIER.RigidBody)

  const rigidBodyDesc = useConstant<RAPIER.RigidBodyDesc>(() => {
    switch (type) {
      case 'dynamic':
        return RAPIER.RigidBodyDesc.newDynamic()
      case 'static':
        return RAPIER.RigidBodyDesc.newStatic()
      case 'kinematic-velocity-based':
        return RAPIER.RigidBodyDesc.newKinematicVelocityBased()
      case 'kinematic-position-based':
        return RAPIER.RigidBodyDesc.newKinematicPositionBased()
      default:
        throw new Error(`Unsupported RigidBody.type: "${type}"`)
    }
  })

  const rotation = useConstant(() => {
    const quat = new Quaternion()

    if (rawQuaternion) {
      if (Array.isArray(rawQuaternion)) {
        return quat.fromArray(rawQuaternion)
      }
      return quat.copy(rawQuaternion)
    }

    if (rawRotation) {
      const euler = Array.isArray(rawRotation)
        ? new Euler().fromArray(rawRotation)
        : rawRotation
      return quat.setFromEuler(euler)
    }

    return quat
  })

  const position = useConstant(() => {
    const vec = new Vector3()

    if (!rawPosition) {
      return vec
    }

    if (Array.isArray(rawPosition)) {
      return vec.fromArray(rawPosition)
    }

    return vec.copy(rawPosition)
  })

  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (!object3d) return

    // Get offset from world center.
    const relativePosition = position.clone()
    object3d.getWorldPosition(position)
    object3d.getWorldQuaternion(rotation)
    const positionOffset = position.clone().sub(relativePosition)
    object3d.userData.positionOffset = positionOffset

    rigidBodyDesc.setTranslation(position.x, position.y, position.z)
    rigidBodyDesc.setRotation(rotation)

    // Create rigid body.
    const body = world.createRigidBody(rigidBodyDesc)
    setRigidBody(body)

    // Add body to set.
    bodies.set(body.handle, object3d)

    return () => {
      // Check if the rigid body has already been removed.
      if (body && world.getRigidBody(body.handle)) {
        world.removeRigidBody(body)
      }
      bodies.delete(body.handle)
    }
  }, [world, rigidBodyDesc, bodies, position, rotation])

  useEffect(() => {
    if (!rigidBody || !onCollision) return
    const id = uuid('rigidBody', rigidBody.handle)
    events.set(id, {
      onCollisionEnter: onCollisionEnter || onCollision,
      onCollisionExit,
    })
    return () => void events.delete(id)
  })

  const hasEventListeners = !!onCollision

  const context = useMemo(
    () => ({
      rigidBody,
      shouldCollidersListenForContactEvents: hasEventListeners,
    }),
    [rigidBody, hasEventListeners],
  )

  return (
    <RigidBodyContext.Provider value={context}>
      <object3D ref={object3dRef} position={position} quaternion={rotation}>
        {rigidBody ? children : null}
      </object3D>
    </RigidBodyContext.Provider>
  )
})

///////////////////////////////////////////////////////////////
// Colliders
///////////////////////////////////////////////////////////////

export interface ColliderProps {
  position?: Vector3Like
  quaternion?: QuaternionLike
  rotation?: EulerLike
  friction?: number
  restitution?: number
  density?: number
  children?: ReactNode
  onCollision?: CollideEventCallback
  onCollisionEnter?: CollideEventCallback
  onCollisionExit?: CollideEventCallback
}

type UseColliderReturn<T extends () => void> =
  ReturnType<T> extends RAPIER.ColliderDesc
    ? RAPIER.Collider
    : ReturnType<T> extends RAPIER.ColliderDesc | null
    ? RAPIER.Collider | null
    : never

export function useCollider<T extends () => RAPIER.ColliderDesc | null>(
  cb: T,
  props: Omit<ColliderProps, 'children'>,
  object3dRef: RefObject<Object3D | undefined>,
): UseColliderReturn<T> | null {
  const {
    position,
    quaternion,
    rotation,
    friction,
    restitution,
    density,
    onCollision,
    onCollisionEnter,
    onCollisionExit,
  } = props
  const { world, events, colliders } = usePhysicsContext()
  const { rigidBody, shouldCollidersListenForContactEvents } =
    useContext(RigidBodyContext)
  const [collider, setCollider] = useState<RAPIER.Collider>()
  const shouldListenForContactEvents = !!onCollision

  const colliderDesc = useConstant(() => {
    const desc = cb()

    if (desc === null) {
      return null
    }

    if (position) {
      const arr = Array.isArray(position)
        ? position
        : (Object.values(position) as [number, number, number])
      desc.setTranslation(...arr)
    }

    const quat = new Quaternion()

    if (rotation) {
      const euler = Array.isArray(rotation)
        ? new Euler().fromArray(rotation)
        : rotation

      quat.setFromEuler(euler)
    }

    if (quaternion) {
      if (Array.isArray(quaternion)) {
        quat.fromArray(quaternion)
      } else {
        quat.copy(quaternion)
      }
    }

    desc.setRotation(quat)

    if (friction) {
      desc.setFriction(friction)
    }

    if (restitution) {
      desc.setRestitution(restitution)
    }

    if (density) {
      desc.setDensity(density)
    }

    if (shouldListenForContactEvents || shouldCollidersListenForContactEvents) {
      desc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_EVENTS)
    }

    // TODO: add mass etc

    return desc
  })

  useLayoutEffect(() => {
    if (!colliderDesc) return

    const coll = world.createCollider(colliderDesc, rigidBody?.handle)
    setCollider(coll)

    return () => {
      // Check if the collider has already been removed.
      if (coll && world.getCollider(coll.handle)) {
        world.removeCollider(coll, true)
      }
    }
  }, [world, colliderDesc, rigidBody?.handle])

  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (!object3d || !collider) return

    colliders.set(collider.handle, object3d)
    return () => void colliders.delete(collider.handle)
  }, [world, colliders, object3dRef, collider])

  useEffect(() => {
    if (!collider || !onCollision) return
    const id = uuid('collider', collider.handle)
    events.set(id, {
      onCollisionEnter: onCollisionEnter || onCollision,
      onCollisionExit,
    })
    return () => void events.delete(id)
  })

  if (!collider) {
    return null
  }

  return collider as unknown as UseColliderReturn<T>
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
  const { debug } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()

  const collider = useCollider(
    () => RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
    props,
    object3dRef,
  )

  if (!collider) {
    return null
  }

  const vec = collider.halfExtents()

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <boxGeometry args={[vec.x * 2, vec.y * 2, vec.z * 2]} />
          <meshBasicMaterial wireframe color={0x0000ff} />
        </mesh>
      )}
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
  const { debug } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()
  useCollider(() => RAPIER.ColliderDesc.ball(radius), props, object3dRef)

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <sphereGeometry args={args} />
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
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
  const { debug } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()
  useCollider(
    () => RAPIER.ColliderDesc.cylinder(height / 2, radius),
    props,
    object3dRef,
  )

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <cylinderGeometry args={[radius, radius, height, 32]} />
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
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
  const { debug } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()
  useCollider(
    () => RAPIER.ColliderDesc.capsule(radius, height / 2),
    props,
    object3dRef,
  )

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        // TODO: use <capsuleGeometry> once it's released
        <mesh>
          <boxGeometry args={[radius * 2, height]} />
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
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
  const { debug } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()
  useCollider(
    () => RAPIER.ColliderDesc.cone(height / 2, radius),
    props,
    object3dRef,
  )

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <coneGeometry args={[radius, height, 32]} />
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
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
  const { debug } = usePhysicsContext()
  const [vertices, indices] = args
  const itemSize = 3
  const object3dRef = useRef<Object3D>()
  useCollider(
    () => RAPIER.ColliderDesc.convexMesh(vertices, indices),
    props,
    object3dRef,
  )

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attach="attributes-position"
              count={vertices.length / itemSize}
              array={vertices}
              itemSize={itemSize}
            />
          </bufferGeometry>
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
      {children}
    </object3D>
  )
}

///////////////////////////////////////////////////////////////
// ConvexHullCollider
///////////////////////////////////////////////////////////////

export interface ConvexHullColliderProps extends ColliderProps {
  args: [Float32Array]
}

export function ConvexHullCollider({
  children,
  args,
  ...props
}: ConvexHullColliderProps) {
  const [points] = args
  const { debug } = usePhysicsContext()
  const itemSize = 3
  const object3dRef = useRef<Object3D>()
  const collider = useCollider(
    () => RAPIER.ColliderDesc.convexHull(points),
    props,
    object3dRef,
  )

  if (!collider) {
    return null
  }

  const vertices = collider.vertices()
  const indices = collider.indices()

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && vertices && indices && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attach="attributes-position"
              count={vertices.length / itemSize}
              array={vertices}
              itemSize={itemSize}
            />
          </bufferGeometry>
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
      {children}
    </object3D>
  )
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
  const { debug } = usePhysicsContext()
  const itemSize = 3
  const object3dRef = useRef<Object3D>()
  useCollider(
    () => RAPIER.ColliderDesc.trimesh(vertices, indices),
    props,
    object3dRef,
  )

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attach="attributes-position"
              count={vertices.length / itemSize}
              array={vertices}
              itemSize={itemSize}
            />
          </bufferGeometry>
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
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
  const { debug } = usePhysicsContext()
  const itemSize = 3
  const object3dRef = useRef<Object3D>()
  useCollider(
    () => RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale),
    props,
    object3dRef,
  )

  // TODO: only calculate when debug=true
  const { vertices, indices } = useConstant(() =>
    geometryFromHeightfield(nrows, ncols, heights, scale),
  )

  return (
    <object3D
      ref={object3dRef}
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attach="attributes-position"
              count={vertices.length / itemSize}
              array={vertices}
              itemSize={itemSize}
            />
          </bufferGeometry>
          <meshBasicMaterial wireframe color={0x00ff00} />
        </mesh>
      )}
      {children}
    </object3D>
  )
}

function geometryFromHeightfield(
  nrows: number,
  ncols: number,
  heights: Float32Array,
  scale: RAPIER.Vector,
) {
  const vertices = []
  const indices = []
  const eltWX = 1.0 / nrows
  const eltWY = 1.0 / ncols

  let i: number
  let j: number

  for (j = 0; j <= ncols; ++j) {
    for (i = 0; i <= nrows; ++i) {
      const x = (j * eltWX - 0.5) * scale.x
      const y = heights[j * (nrows + 1) + i] * scale.y
      const z = (i * eltWY - 0.5) * scale.z

      vertices.push(x, y, z)
    }
  }

  for (j = 0; j < ncols; ++j) {
    for (i = 0; i < nrows; ++i) {
      const i1 = (i + 0) * (ncols + 1) + (j + 0)
      const i2 = (i + 0) * (ncols + 1) + (j + 1)
      const i3 = (i + 1) * (ncols + 1) + (j + 0)
      const i4 = (i + 1) * (ncols + 1) + (j + 1)

      indices.push(i1, i3, i2)
      indices.push(i3, i4, i2)
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}

function useEffectfulState<T>(fn: () => T, deps: DependencyList = []) {
  const [state, set] = useState<T>()
  useLayoutEffect(() => {
    const result = fn()
    set(result)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}
