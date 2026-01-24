import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {ComponentProps, ReactNode} from 'react'
import {createContext, use, useLayoutEffect, useRef, useState} from 'react'
import type {Object3D, Vector3} from 'three'
import type {RigidBodyType, ColliderShape} from './traits'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  ColliderConfig,
  Object3DRef,
  IsPhysicsEntity,
  IsColliderEntity,
  ChildOf,
  InitialLinearVelocity,
  InitialAngularVelocity,
} from './traits'

// ============================================
// Context for passing entity to child colliders
// ============================================

interface ECSRigidBodyContextValue {
  entity: Entity
}

const ECSRigidBodyContext = createContext<ECSRigidBodyContextValue | null>(null)

// ============================================
// ECSRigidBody Component
// ============================================

type Triplet = [number, number, number]

export interface ECSRigidBodyProps extends ComponentProps<'object3D'> {
  children?: ReactNode
  type?: RigidBodyType
  gravityScale?: number
  linearDamping?: number
  angularDamping?: number
  linearVelocity?: Triplet | Vector3
  angularVelocity?: Triplet | Vector3
  ccd?: boolean
  canSleep?: boolean
  dominanceGroup?: number
  lockPosition?: boolean
  lockRotation?: boolean
  restrictPosition?: [boolean, boolean, boolean]
  restrictRotation?: [boolean, boolean, boolean]
}

export function ECSRigidBody({
  children,
  type = 'dynamic',
  gravityScale = 1,
  linearDamping = 0,
  angularDamping = 0,
  linearVelocity,
  angularVelocity,
  ccd = false,
  canSleep = true,
  dominanceGroup = 0,
  lockPosition = false,
  lockRotation = false,
  restrictPosition,
  restrictRotation,
  ...props
}: ECSRigidBodyProps) {
  const world = useWorld()
  const [entity, setEntity] = useState<Entity | null>(null)
  const object3dRef = useRef<Object3D>(null)

  // Create entity on mount
  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (!object3d) return

    // Spawn entity with physics traits (transform will be initialized by system)
    const spawnedEntity = world.spawn(
      IsPhysicsEntity,
      Transform,
      PreviousTransform,
      RenderTransform,
      [Object3DRef, {object: object3d}],
      [
        RigidBodyConfig,
        {
          type,
          gravityScale,
          linearDamping,
          angularDamping,
          ccd,
          canSleep,
          dominanceGroup,
          lockPosition,
          lockRotation,
          restrictPosition: restrictPosition ?? null,
          restrictRotation: restrictRotation ?? null,
        },
      ],
    )

    // Set initial velocities if provided
    if (linearVelocity) {
      spawnedEntity.add(InitialLinearVelocity)
      const vel = Array.isArray(linearVelocity)
        ? {x: linearVelocity[0], y: linearVelocity[1], z: linearVelocity[2]}
        : {x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z}
      spawnedEntity.set(InitialLinearVelocity, vel)
    }

    if (angularVelocity) {
      spawnedEntity.add(InitialAngularVelocity)
      const vel = Array.isArray(angularVelocity)
        ? {x: angularVelocity[0], y: angularVelocity[1], z: angularVelocity[2]}
        : {x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z}
      spawnedEntity.set(InitialAngularVelocity, vel)
    }

    setEntity(spawnedEntity)

    return () => {
      spawnedEntity.destroy()
      setEntity(null)
    }
  }, [
    world,
    type,
    gravityScale,
    linearDamping,
    angularDamping,
    ccd,
    canSleep,
    dominanceGroup,
    lockPosition,
    lockRotation,
    restrictPosition,
    restrictRotation,
    linearVelocity,
    angularVelocity,
  ])

  return (
    <object3D ref={object3dRef} {...props}>
      {entity && (
        <ECSRigidBodyContext.Provider value={{entity}}>
          {children}
        </ECSRigidBodyContext.Provider>
      )}
    </object3D>
  )
}

// ============================================
// Collider Components
// ============================================

interface BaseColliderProps extends Omit<ComponentProps<'object3D'>, 'args'> {
  children?: ReactNode
  friction?: number
  restitution?: number
  density?: number
  sensor?: boolean
}

function useColliderSetup(shape: ColliderShape, props: BaseColliderProps) {
  const {friction = 0.5, restitution = 0, density = 1, sensor = false} = props
  const context = use(ECSRigidBodyContext)
  const world = useWorld()
  const object3dRef = useRef<Object3D>(null)

  useLayoutEffect(() => {
    if (!context) return

    const {entity: parentEntity} = context
    const object3d = object3dRef.current

    // Spawn collider entity with relation to parent rigid body
    const colliderEntity = world.spawn(
      IsColliderEntity,
      ChildOf(parentEntity),
      [Object3DRef, {object: object3d}],
      [
        ColliderConfig,
        {
          shape,
          friction,
          restitution,
          density,
          sensor,
          offsetX: object3d?.position.x ?? 0,
          offsetY: object3d?.position.y ?? 0,
          offsetZ: object3d?.position.z ?? 0,
          offsetQx: object3d?.quaternion.x ?? 0,
          offsetQy: object3d?.quaternion.y ?? 0,
          offsetQz: object3d?.quaternion.z ?? 0,
          offsetQw: object3d?.quaternion.w ?? 1,
        },
      ],
    )

    return () => {
      colliderEntity.destroy()
    }
  }, [context, world, shape, friction, restitution, density, sensor])

  return object3dRef
}

export interface ECSBallColliderProps extends BaseColliderProps {
  radius: number
}

export function ECSBallCollider({
  radius,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ECSBallColliderProps) {
  const shape: ColliderShape = {type: 'ball', radius}
  const object3dRef = useColliderSetup(shape, {
    friction,
    restitution,
    density,
    sensor,
  })

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export interface ECSCuboidColliderProps extends BaseColliderProps {
  args: [width: number, height: number, depth: number]
}

export function ECSCuboidCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ECSCuboidColliderProps) {
  const [width, height, depth] = args
  const shape: ColliderShape = {
    type: 'cuboid',
    hx: width / 2,
    hy: height / 2,
    hz: depth / 2,
  }
  const object3dRef = useColliderSetup(shape, {
    friction,
    restitution,
    density,
    sensor,
  })

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export const ECSBoxCollider = ECSCuboidCollider

export interface ECSCapsuleColliderProps extends BaseColliderProps {
  args: [radius: number, height: number]
}

export function ECSCapsuleCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ECSCapsuleColliderProps) {
  const [radius, height] = args
  const shape: ColliderShape = {type: 'capsule', halfHeight: height / 2, radius}
  const object3dRef = useColliderSetup(shape, {
    friction,
    restitution,
    density,
    sensor,
  })

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export interface ECSCylinderColliderProps extends BaseColliderProps {
  args: [radius: number, height: number]
}

export function ECSCylinderCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ECSCylinderColliderProps) {
  const [radius, height] = args
  const shape: ColliderShape = {
    type: 'cylinder',
    halfHeight: height / 2,
    radius,
  }
  const object3dRef = useColliderSetup(shape, {
    friction,
    restitution,
    density,
    sensor,
  })

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export interface ECSConeColliderProps extends BaseColliderProps {
  args: [radius: number, height: number]
}

export function ECSConeCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ECSConeColliderProps) {
  const [radius, height] = args
  const shape: ColliderShape = {type: 'cone', halfHeight: height / 2, radius}
  const object3dRef = useColliderSetup(shape, {
    friction,
    restitution,
    density,
    sensor,
  })

  return (
    <object3D ref={object3dRef} {...props}>
      {children}
    </object3D>
  )
}

export interface ECSConvexHullColliderProps extends BaseColliderProps {
  args: [points: Float32Array]
}

export function ECSConvexHullCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  scale,
  ...props
}: ECSConvexHullColliderProps & {scale?: [number, number, number] | number}) {
  const [points] = args

  // Scale the vertices if scale is provided (Rapier doesn't support collider scaling)
  const scaledPoints = (() => {
    if (!scale) return points

    const sx = typeof scale === 'number' ? scale : scale[0]
    const sy = typeof scale === 'number' ? scale : scale[1]
    const sz = typeof scale === 'number' ? scale : scale[2]

    const scaled = new Float32Array(points.length)
    for (let i = 0; i < points.length; i += 3) {
      scaled[i] = points[i]! * sx
      scaled[i + 1] = points[i + 1]! * sy
      scaled[i + 2] = points[i + 2]! * sz
    }
    return scaled
  })()

  const shape: ColliderShape = {type: 'convexHull', points: scaledPoints}
  const object3dRef = useColliderSetup(shape, {
    friction,
    restitution,
    density,
    sensor,
  })

  return (
    <object3D ref={object3dRef} scale={scale} {...props}>
      {children}
    </object3D>
  )
}
