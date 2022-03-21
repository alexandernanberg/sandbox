import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Object3DNode } from '@react-three/fiber'
import { useFrame, useThree } from '@react-three/fiber'
import type {
  ForwardedRef,
  MutableRefObject,
  ReactNode,
  RefObject,
} from 'react'
import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { suspend } from 'suspend-react'
import type { Object3D } from 'three'
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
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

interface CollisionEvent {
  target: Object3D
}
type CollisionEventCallback = (event: CollisionEvent) => void

// TODO: number for perf
function uuid(type: string, id: number) {
  return `${type}:${id}`
}

///////////////////////////////////////////////////////////////
// PhysicsContext
///////////////////////////////////////////////////////////////

export interface PhysicsContextValue {
  worldRef: MutableRefObject<() => RAPIER.World>
  debug: boolean
  bodies: Map<number, Object3D>
  colliders: Map<number, Object3D>
  events: Map<
    string,
    {
      onCollisionEnter?: CollisionEventCallback
      onCollisionExit?: CollisionEventCallback
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

  const worldRef = useRef<RAPIER.World | null>(null)

  const worldGetter = useRef(() => {
    if (worldRef.current === null) {
      const gravity = { x: 0.0, y: -9.81, z: 0.0 }
      worldRef.current = new RAPIER.World(gravity)
    }
    return worldRef.current
  })

  useEffect(() => {
    return () => {
      if (worldRef.current !== null) {
        worldRef.current.free()
        worldRef.current = null
      }
    }
  }, [])

  const eventQueue = useConstant(() => new RAPIER.EventQueue(true))
  const bodies = useConstant(() => new Map<number, Object3D>())
  const colliders = useConstant(() => new Map<number, Object3D>())
  const events = useConstant<PhysicsContextValue['events']>(() => new Map())

  // TODO: investigate using a fixed update frequency + fix 60 vs 120 hz.
  useFrame(() => {
    const world = worldGetter.current()
    if (!world) return

    world.step(eventQueue)

    world.forEachRigidBody((rigidBody) => {
      if (rigidBody.isSleeping() || rigidBody.isFixed()) return
      const object3d = bodies.get(rigidBody.handle)
      if (!object3d) return

      const positionOffset = object3d.userData?.positionOffset as
        | Vector3
        | undefined
      const rotationOffset = object3d.userData?.rotationOffset as
        | Quaternion
        | undefined

      const r = rigidBody.rotation()
      const t = rigidBody.translation()

      object3d.quaternion.set(r.x, r.y, r.z, r.w)
      if (rotationOffset) {
        object3d.quaternion.multiply(rotationOffset)
      }

      object3d.position.set(t.x, t.y, t.z)
      if (positionOffset) {
        object3d.position.sub(positionOffset)
      }
    })

    eventQueue.drainCollisionEvents((handle1, handle2, started) => {
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

  const context = useMemo<PhysicsContextValue>(
    () => ({ worldRef: worldGetter, debug, bodies, colliders, events }),
    [bodies, colliders, debug, events],
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
  rigidBodyRef: MutableRefObject<() => RAPIER.RigidBody>
  shouldCollidersListenForContactEvents: boolean
}

const RigidBodyContext = createContext<RigidBodyContextValue | null>(null)

type RigidBodyType =
  | 'dynamic'
  | 'static'
  | 'kinematic-velocity-based'
  | 'kinematic-position-based'

export interface RigidBodyProps extends Omit<Object3DProps, 'ref'> {
  type?: RigidBodyType
  onCollision?: CollisionEventCallback
  onCollisionEnter?: CollisionEventCallback
  onCollisionExit?: CollisionEventCallback
}

export interface RigidBodyApi extends RAPIER.RigidBody {}

function createRigidBodyDesc(type: RigidBodyType): RAPIER.RigidBodyDesc {
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
}

const _position = new Vector3()
const _scale = new Vector3()
const _quaternion = new Quaternion()

export const RigidBody = forwardRef(function RigidBody(
  {
    type = 'dynamic',
    children,
    onCollision,
    onCollisionEnter,
    onCollisionExit,
    ...props
  }: RigidBodyProps,
  ref?: ForwardedRef<RigidBodyApi | null>,
) {
  const { worldRef, bodies, events } = usePhysicsContext()
  const object3dRef = useRef<Object3D>()
  const rigidBodyRef = useRef<RAPIER.RigidBody | null>(null)

  const rigidBodyGetter = useRef(() => {
    if (rigidBodyRef.current === null) {
      const world = worldRef.current()
      const rigidBodyDesc = createRigidBodyDesc(type)
      rigidBodyRef.current = world.createRigidBody(rigidBodyDesc)
    }
    return rigidBodyRef.current
  })

  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (!object3d) return
    const world = worldRef.current()
    const rigidBody = rigidBodyGetter.current()

    object3d.updateWorldMatrix(true, false)
    object3d.matrixWorld.decompose(_position, _quaternion, _scale)

    rigidBody.setRotation(_quaternion, true)
    rigidBody.setTranslation(_position, true)

    // world - local = delta

    const positionOffset = _position.clone().sub(object3d.position)
    object3d.userData.positionOffset = positionOffset

    const rotationOffset = _quaternion
      .clone()
      .invert()
      .premultiply(object3d.quaternion)
    object3d.userData.rotationOffset = rotationOffset

    bodies.set(rigidBody.handle, object3d)

    return () => {
      if (rigidBodyRef.current !== null) {
        // Check if the rigid body has already been removed.
        if (world.getRigidBody(rigidBody.handle)) {
          world.removeRigidBody(rigidBody)
        }
        bodies.delete(rigidBody.handle)
        rigidBodyRef.current = null
      }
    }
  }, [bodies, worldRef])

  useEffect(() => {
    if (!onCollision) return
    const rigidBody = rigidBodyGetter.current()
    const id = uuid('rigidBody', rigidBody.handle)
    events.set(id, {
      onCollisionEnter: onCollisionEnter || onCollision,
      onCollisionExit,
    })
    return () => void events.delete(id)
  })

  const hasEventListeners = !!onCollision

  const context = useMemo<RigidBodyContextValue>(
    () => ({
      rigidBodyRef: rigidBodyGetter,
      shouldCollidersListenForContactEvents: hasEventListeners,
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

///////////////////////////////////////////////////////////////
// Colliders
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
    onCollisionEnter,
    onCollisionExit,
  } = props
  const { worldRef, events, colliders, debug } = usePhysicsContext()
  const { rigidBodyRef, shouldCollidersListenForContactEvents } =
    useContext(RigidBodyContext) || {}
  const shouldListenForContactEvents = !!onCollision
  const colliderRef = useRef<RAPIER.Collider | null>(null)

  const scaleRef = useRef<Vector3 | null>(null)

  const colliderGetter = useRef((position?: Vector3, rotation?: Quaternion) => {
    if (colliderRef.current === null) {
      const world = worldRef.current()
      const rigidBody = rigidBodyRef?.current()
      const scale = scaleRef.current

      if (!scale) {
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

      if (
        shouldListenForContactEvents ||
        shouldCollidersListenForContactEvents
      ) {
        colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
      }

      colliderRef.current = world.createCollider(
        colliderDesc,
        rigidBody?.handle,
      )
    }
    return colliderRef.current
  })

  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (!object3d) return

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

    colliders.set(collider.handle, object3d)

    return () => {
      if (colliderRef.current === null) {
        // Check if the collider has already been removed.
        if (world.getCollider(collider.handle)) {
          world.removeCollider(collider, true)
        }
        colliders.delete(collider.handle)
        colliderRef.current = null
      }
    }
  }, [colliders, object3dRef, worldRef])

  useEffect(() => {
    if (!onCollision) return
    const collider = colliderGetter.current()
    const id = uuid('collider', collider.handle)
    events.set(id, {
      onCollisionEnter: onCollisionEnter || onCollision,
      onCollisionExit,
    })
    return () => void events.delete(id)
  })

  const scene = useThree((state) => state.scene)
  const meshRef = useRef<Mesh | null>(null)

  useLayoutEffect(() => {
    if (!debug) return
    const collider = colliderGetter.current()
    const mesh = (meshRef.current = meshFromCollider(collider))

    scene.add(mesh)

    return () => {
      mesh.geometry.dispose()
      if (Array.isArray(mesh.material)) {
        for (const material of mesh.material) {
          material.dispose()
        }
      } else {
        mesh.material.dispose()
      }
      scene.remove(mesh)
      meshRef.current = null
    }
  }, [debug, scene])

  // TODO: investigate if this can be moved to <Physics>
  useFrame(() => {
    if (!debug) return
    const collider = colliderGetter.current()
    const mesh = meshRef.current
    if (!mesh) return

    const position = collider.translation()
    const rotation = collider.rotation()

    mesh.position.set(position.x, position.y, position.z)
    mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
  })

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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

  useCollider(
    (scale) =>
      RAPIER.ColliderDesc.capsule(radius * scale.x, (height / 2) * scale.y),
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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

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
  const object3dRef = useRef<Object3D>()

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

function meshFromCollider(collider: RAPIER.Collider): Mesh {
  switch (collider.shapeType()) {
    // TODO: use actual capsule
    case RAPIER.ShapeType.Cuboid:
    case RAPIER.ShapeType.Capsule: {
      const vec = collider.halfExtents()
      const geometry = new BoxGeometry(vec.x * 2, vec.y * 2, vec.z * 2)
      const material = new MeshBasicMaterial({
        wireframe: true,
        color: 0x0000ff,
      })
      return new Mesh(geometry, material)
    }
    case RAPIER.ShapeType.Cone: {
      const radius = collider.radius()
      const height = collider.halfHeight() * 2

      const geometry = new ConeGeometry(radius, height, 32)
      const material = new MeshBasicMaterial({
        wireframe: true,
        color: 0x00ff00,
      })
      return new Mesh(geometry, material)
    }
    case RAPIER.ShapeType.Cylinder: {
      const radius = collider.radius()
      const height = collider.halfHeight() * 2

      const geometry = new CylinderGeometry(radius, radius, height, 32)
      const material = new MeshBasicMaterial({
        wireframe: true,
        color: 0x00ff00,
      })
      return new Mesh(geometry, material)
    }
    case RAPIER.ShapeType.Ball: {
      const radius = collider.radius()

      const geometry = new SphereGeometry(radius, 32)
      const material = new MeshBasicMaterial({
        wireframe: true,
        color: 0x00ff00,
      })
      return new Mesh(geometry, material)
    }
    case RAPIER.ShapeType.TriMesh:
    case RAPIER.ShapeType.ConvexPolyhedron: {
      const vertices = collider.vertices()
      const indices = collider.indices()

      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(vertices, 3))
      geometry.setIndex(new BufferAttribute(indices, 1))

      const material = new MeshBasicMaterial({
        wireframe: true,
        color: 0xff0000,
      })
      return new Mesh(geometry, material)
    }

    case RAPIER.ShapeType.HeightField: {
      const heights = collider.heightfieldHeights()
      const nrows = collider.heightfieldNRows()
      const ncols = collider.heightfieldNCols()
      const scale = collider.heightfieldScale()

      const { vertices, indices } = geometryFromHeightfield(
        nrows,
        ncols,
        heights,
        scale,
      )

      const geometry = new BufferGeometry()
      geometry.setAttribute('position', new BufferAttribute(vertices, 3))
      geometry.setIndex(new BufferAttribute(indices, 1))

      const material = new MeshBasicMaterial({
        wireframe: true,
        color: 0xff0000,
      })
      return new Mesh(geometry, material)
    }
    default:
      throw new Error(`Unkown shape: ${collider.shapeType()}`)
  }
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
