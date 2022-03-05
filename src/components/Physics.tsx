import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Object3DNode } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import type { ReactNode } from 'react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
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

///////////////////////////////////////////////////////////////
// PhysicsContext
///////////////////////////////////////////////////////////////

export interface PhysicsContextValue {
  world: RAPIER.World
  debug: boolean
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

  // TODO: investigate using a fixed update frequency.
  useFrame(() => {
    world.step()
  })

  const context = useMemo(() => ({ world, debug }), [debug, world])

  return (
    <PhysicsContext.Provider value={context}>
      {children}
    </PhysicsContext.Provider>
  )
}

///////////////////////////////////////////////////////////////
// RigidBody
///////////////////////////////////////////////////////////////

const RigidBodyContext = createContext<RAPIER.RigidBody | null>(null)

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
}

export function RigidBody({
  children,
  position,
  quaternion,
  rotation,
  type = 'dynamic',
}: RigidBodyProps) {
  const { world } = usePhysicsContext()
  const ref = useRef<Object3D>(null)

  const rigidBody = useConstant(() => {
    let rigidBodyDesc: RAPIER.RigidBodyDesc
    switch (type) {
      case 'dynamic':
        rigidBodyDesc = RAPIER.RigidBodyDesc.newDynamic()
        break
      case 'static':
        rigidBodyDesc = RAPIER.RigidBodyDesc.newStatic()
        break
      case 'kinematic-velocity-based':
        rigidBodyDesc = RAPIER.RigidBodyDesc.newKinematicVelocityBased()
        break
      case 'kinematic-position-based':
        rigidBodyDesc = RAPIER.RigidBodyDesc.newKinematicPositionBased()
        break
      default:
        throw new Error(`Unsupported RigidBody.type: "${type}"`)
    }

    return world.createRigidBody(rigidBodyDesc)
  })

  // Set rotation/quaternion
  const rotationQuat = useConstant(() => {
    const quat = new Quaternion()

    if (quaternion) {
      if (Array.isArray(quaternion)) {
        return quat.fromArray(quaternion)
      }
      return quat.copy(quaternion)
    }

    if (rotation) {
      const euler = Array.isArray(rotation)
        ? new Euler().fromArray(rotation)
        : rotation
      return quat.setFromEuler(euler)
    }

    return quat
  })

  useLayoutEffect(() => {
    const object3d = ref.current
    if (!object3d) return

    object3d.getWorldQuaternion(rotationQuat)
    rigidBody.setRotation(rotationQuat, false)
  }, [rigidBody, rotationQuat])

  // Set position/translation
  const positionVec = useConstant(() => {
    const vec = new Vector3()

    if (!position) {
      return vec
    }

    if (Array.isArray(position)) {
      return vec.fromArray(position)
    }

    return vec.copy(position)
  })

  useLayoutEffect(() => {
    const object3d = ref.current
    if (!object3d) return

    object3d.getWorldPosition(positionVec)
    rigidBody.setTranslation(positionVec, false)
  }, [rigidBody, positionVec])

  // Remove the rigid body whenever the component unmounts.
  useEffect(() => {
    return () => world.removeRigidBody(rigidBody)
  }, [rigidBody, world])

  // TODO: investigate if we can iterate through all bodies in <Physics> and
  // remove the useFrame for each body.
  useFrame(() => {
    const object3d = ref.current

    if (object3d && !rigidBody.isSleeping() && !rigidBody.isStatic()) {
      const vec = rigidBody.translation()
      const quat = rigidBody.rotation()

      object3d.position.set(vec.x, vec.y, vec.z)
      object3d.quaternion.set(quat.x, quat.y, quat.z, quat.w)
    }
  })

  return (
    <RigidBodyContext.Provider value={rigidBody}>
      <object3D ref={ref} position={position} quaternion={rotationQuat}>
        {children}
      </object3D>
    </RigidBodyContext.Provider>
  )
}

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
): UseColliderReturn<T> {
  const { position, quaternion, rotation, friction, restitution, density } =
    props
  const rigidBody = useContext(RigidBodyContext)
  const { world } = usePhysicsContext()

  const collider = useConstant(() => {
    const colliderDesc = cb()

    if (colliderDesc === null) {
      return null
    }

    if (position) {
      const arr = Array.isArray(position)
        ? position
        : (Object.values(position) as [number, number, number])
      colliderDesc.setTranslation(...arr)
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

    colliderDesc.setRotation(quat)

    if (friction) {
      colliderDesc.setFriction(friction)
    }

    if (restitution) {
      colliderDesc.setRestitution(restitution)
    }

    if (density) {
      colliderDesc.setDensity(density)
    }

    // TODO: add mass etc

    if (rigidBody) {
      return world.createCollider(colliderDesc, rigidBody.handle)
    }

    return world.createCollider(colliderDesc)
  })

  useEffect(() => {
    if (collider) {
      return () => world.removeCollider(collider, true)
    }
  }, [world, collider])

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

  useCollider(
    () => RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2),
    props,
  )

  return (
    <object3D
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <boxGeometry args={args} />
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

  useCollider(() => RAPIER.ColliderDesc.ball(radius), props)

  return (
    <object3D
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

  useCollider(() => RAPIER.ColliderDesc.cylinder(height / 2, radius), props)

  return (
    <object3D
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

  useCollider(() => RAPIER.ColliderDesc.capsule(radius, height / 2), props)

  return (
    <object3D
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

  useCollider(() => RAPIER.ColliderDesc.cone(height / 2, radius), props)

  return (
    <object3D
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

  const collider = useCollider(
    () => RAPIER.ColliderDesc.convexMesh(vertices, indices),
    props,
  )

  return (
    <object3D
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attachObject={['attributes', 'position']}
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

  const collider = useCollider(
    () => RAPIER.ColliderDesc.convexHull(points),
    props,
  )

  const vertices = collider?.vertices()
  const indices = collider?.indices()

  return (
    <object3D
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && vertices && indices && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attachObject={['attributes', 'position']}
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

  useCollider(() => RAPIER.ColliderDesc.trimesh(vertices, indices), props)

  return (
    <object3D
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attachObject={['attributes', 'position']}
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

  useCollider(
    () => RAPIER.ColliderDesc.heightfield(nrows, ncols, heights, scale),
    props,
  )

  // TODO: only calculate when debug=true
  const { vertices, indices } = useConstant(() =>
    geometryFromHeightfield(nrows, ncols, heights, scale),
  )

  return (
    <object3D
      position={props.position}
      quaternion={props.quaternion}
      rotation={props.rotation}
    >
      {debug && (
        <mesh>
          <bufferGeometry>
            <bufferAttribute attach="index" args={[indices, 1]} />
            <bufferAttribute
              attachObject={['attributes', 'position']}
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
