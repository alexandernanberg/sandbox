import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Object3DNode } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { suspend } from 'suspend-react'
import type { Object3D } from 'three'
import { useConstant } from '../utils'

// Temporary solution until the PR is merged.
// https://github.com/pmndrs/react-three-fiber/pull/2099#issuecomment-1050891821
export type Object3DProps = Object3DNode<THREE.Object3D, typeof Object3D>
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      object3D: Object3DProps
    }
  }
}

///////////////////////////////////////////////////////////////
// PhysicsContext
///////////////////////////////////////////////////////////////

interface PhysicsContextValue {
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

interface PhysicsProps {
  children: ReactNode
  debug?: boolean
}

export function Physics({ children, debug = false }: PhysicsProps) {
  suspend(() => RAPIER.init(), ['rapier'])

  const world = useConstant(() => {
    const gravity = { x: 0.0, y: -9.81, z: 0.0 }
    return new RAPIER.World(gravity)
  })

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

interface RigidBodyProps {
  children: ReactNode
  position?: [x: number, y: number, z: number]
  rotation?: [x: number, y: number, z: number, w: number]
  type?: RigidBodyType
}

export function RigidBody({
  children,
  position,
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

    if (position) {
      rigidBodyDesc.setTranslation(...position)
    }

    if (rotation) {
      const [x, y, z, w] = rotation
      rigidBodyDesc.setRotation({ x, y, z, w })
    }

    return world.createRigidBody(rigidBodyDesc)
  })

  // Remove the rigid body whenever the component unmounts.
  useEffect(() => {
    return () => world.removeRigidBody(rigidBody)
  }, [rigidBody, world])

  useFrame(() => {
    const object3d = ref.current
    if (!object3d) return

    if (!rigidBody.isSleeping() && !rigidBody.isStatic()) {
      const pos = rigidBody.translation()
      const rot = rigidBody.rotation()

      object3d.position.set(pos.x, pos.y, pos.z)
      object3d.quaternion.set(rot.x, rot.y, rot.z, rot.w)
    }
  })

  return (
    <RigidBodyContext.Provider value={rigidBody}>
      <object3D ref={ref} position={position} quaternion={rotation}>
        {children}
      </object3D>
    </RigidBodyContext.Provider>
  )
}

///////////////////////////////////////////////////////////////
// Colliders
///////////////////////////////////////////////////////////////

interface ColliderProps {
  position?: [x: number, y: number, z: number]
  rotation?: [x: number, y: number, z: number, w: number]
  friction?: number
  restitution?: number
  density?: number
  children: ReactNode
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
  const { position, rotation, friction, restitution, density } = props
  const rigidBody = useContext(RigidBodyContext)
  const { world } = usePhysicsContext()

  const collider = useConstant(() => {
    const colliderDesc = cb()

    if (colliderDesc === null) {
      return null
    }

    if (position) {
      colliderDesc.setTranslation(...position)
    }

    if (rotation) {
      const [x, y, z, w] = rotation
      colliderDesc.setRotation({ x, y, z, w })
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

    // TODO: add mass etc

    if (rigidBody) {
      return world.createCollider(colliderDesc, rigidBody.handle)
    }

    return world.createCollider(colliderDesc)
  })

  return collider as unknown as UseColliderReturn<T>
}

///////////////////////////////////////////////////////////////
// CuboidCollier
///////////////////////////////////////////////////////////////

interface CuboidColliderProps extends ColliderProps {
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
    <object3D>
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

interface BallColliderProps extends ColliderProps {
  args: [radius: number]
}

export function BallCollider({ children, args, ...props }: BallColliderProps) {
  const [radius] = args
  const { debug } = usePhysicsContext()

  useCollider(() => RAPIER.ColliderDesc.ball(radius), props)

  return (
    <object3D>
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

interface CylinderColliderProps extends ColliderProps {
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
    <object3D>
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

interface CapsuleColliderProps extends ColliderProps {
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
    <object3D>
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

interface ConeColliderProps extends ColliderProps {
  args: [radius: number, height: number]
}

export function ConeCollider({ children, args, ...props }: ConeColliderProps) {
  const [radius, height] = args
  const { debug } = usePhysicsContext()

  useCollider(() => RAPIER.ColliderDesc.cone(height / 2, radius), props)

  return (
    <object3D>
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
// ConvexHullCollider
///////////////////////////////////////////////////////////////

interface ConvexHullColliderProps extends ColliderProps {
  args: Float32Array
}

export function ConvexHullCollider({
  children,
  args,
  ...props
}: ConvexHullColliderProps) {
  const { debug } = usePhysicsContext()
  const itemSize = 3

  const collider = useCollider(
    () => RAPIER.ColliderDesc.convexHull(args),
    props,
  )

  const vertices = collider.vertices()
  const indices = collider.indices()

  return (
    <object3D>
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
// TrimeshCollider
///////////////////////////////////////////////////////////////

interface TrimeshColliderProps extends ColliderProps {
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
    <object3D>
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

interface HeightfieldColliderProps extends ColliderProps {
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
    <object3D>
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
