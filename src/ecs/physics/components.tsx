import type * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {ComponentProps, ReactNode} from 'react'
import {
  createContext,
  use,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import {Vector3} from 'three'
import type {Object3D} from 'three'

// Scratch vector for getWorldScale (avoids allocation per collider setup)
const _scaleVec3 = new Vector3()
import type {RigidBodyType, ColliderShape, CollisionCallback} from './traits'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  ColliderConfig,
  CollisionCallbacks,
  Object3DRef,
  RigidBodyRef,
  IsPhysicsEntity,
  IsColliderEntity,
  ChildOf,
} from './traits'

// Re-export for public API
export type {CollisionEvent, CollisionCallback} from './traits'

// ============================================
// Context for passing entity to child colliders
// ============================================

interface RigidBodyContextValue {
  entityGetter: React.RefObject<() => Entity>
}

const RigidBodyContext = createContext<RigidBodyContextValue | null>(null)

// ============================================
// RigidBody Component
// ============================================

type Triplet = [number, number, number]

/** Imperative API for controlling a rigid body */
export interface RigidBodyApi {
  /** The ECS entity */
  readonly entity: Entity
  /** The Rapier rigid body (null if not yet initialized) */
  readonly body: RAPIER.RigidBody | null
}

export interface RigidBodyProps extends Omit<
  ComponentProps<'object3D'>,
  'ref'
> {
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
  /** Ref to get the imperative API for this rigid body */
  ref?: React.Ref<RigidBodyApi | null>
  /** Ref to get the underlying Object3D */
  object3DRef?: React.Ref<Object3D | null>
  /** Ref to get the ECS entity directly */
  entityRef?: React.RefObject<Entity | null>
  /** Called when a collision starts */
  onCollisionEnter?: CollisionCallback
  /** Called when a collision ends */
  onCollisionExit?: CollisionCallback
}

export function RigidBody({
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
  ref,
  object3DRef,
  entityRef,
  onCollisionEnter,
  onCollisionExit,
  ...props
}: RigidBodyProps) {
  const world = useWorld()
  const object3dRef = useRef<Object3D>(null)
  const spawnedEntityRef = useRef<Entity | null>(null)

  // Parse velocities (stable references for the getter)
  const linVel = linearVelocity
    ? Array.isArray(linearVelocity)
      ? {x: linearVelocity[0], y: linearVelocity[1], z: linearVelocity[2]}
      : {x: linearVelocity.x, y: linearVelocity.y, z: linearVelocity.z}
    : {x: 0, y: 0, z: 0}
  const angVel = angularVelocity
    ? Array.isArray(angularVelocity)
      ? {x: angularVelocity[0], y: angularVelocity[1], z: angularVelocity[2]}
      : {x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z}
    : {x: 0, y: 0, z: 0}

  // Lazy entity getter - first caller (child or parent) triggers spawn
  const entityGetter = useRef(() => {
    if (spawnedEntityRef.current === null) {
      // Spawn entity with physics traits (Object3DRef set later in effect)
      spawnedEntityRef.current = world.spawn(
        IsPhysicsEntity,
        Transform,
        PreviousTransform,
        RenderTransform,
        Object3DRef,
        RigidBodyConfig({
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
          linearVelocityX: linVel.x,
          linearVelocityY: linVel.y,
          linearVelocityZ: linVel.z,
          angularVelocityX: angVel.x,
          angularVelocityY: angVel.y,
          angularVelocityZ: angVel.z,
        }),
      )
    }
    return spawnedEntityRef.current
  })

  // Expose imperative API through ref
  useImperativeHandle<RigidBodyApi | null, RigidBodyApi | null>(ref, () => {
    const entity = spawnedEntityRef.current
    if (!entity) return null

    return {
      entity,
      get body() {
        return entity.get(RigidBodyRef)?.body ?? null
      },
    }
  }, [])

  // Expose object3D through ref
  useImperativeHandle<Object3D | null, Object3D | null>(
    object3DRef,
    () => object3dRef.current,
    [],
  )

  // Expose entity through ref
  useImperativeHandle<Entity | null, Entity | null>(
    entityRef,
    () => spawnedEntityRef.current,
    [],
  )

  // Set Object3DRef after object3d is available
  useLayoutEffect(() => {
    const object3d = object3dRef.current
    if (!object3d) return

    // Ensure entity exists (may have been created by child collider)
    const entity = entityGetter.current()
    entity.set(Object3DRef, {object: object3d})

    return () => {
      if (entity.isAlive()) {
        entity.destroy()
      }
    }
  }, [])

  // Update collision callbacks on entity when they change
  useLayoutEffect(() => {
    const entity = spawnedEntityRef.current
    if (!entity || !entity.isAlive()) return

    const hasCallbacks = onCollisionEnter || onCollisionExit
    if (hasCallbacks) {
      // Add or update CollisionCallbacks trait
      if (!entity.has(CollisionCallbacks)) {
        entity.add(CollisionCallbacks)
      }
      entity.set(CollisionCallbacks, {
        onEnter: onCollisionEnter ?? null,
        onExit: onCollisionExit ?? null,
      })
    } else if (entity.has(CollisionCallbacks)) {
      // Remove trait if no callbacks
      entity.remove(CollisionCallbacks)
    }
  }, [onCollisionEnter, onCollisionExit])

  const context = useMemo<RigidBodyContextValue>(() => ({entityGetter}), [])

  return (
    <object3D ref={object3dRef} {...props}>
      <RigidBodyContext value={context}>{children}</RigidBodyContext>
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
  const context = use(RigidBodyContext)
  const world = useWorld()
  const object3dRef = useRef<Object3D>(null)
  const colliderEntityRef = useRef<Entity | null>(null)

  // Store initial config - props are initial values only, changes after mount are ignored
  const initialConfig = useRef({shape, friction, restitution, density, sensor})

  useLayoutEffect(() => {
    if (!context) return

    const config = initialConfig.current

    // Call the getter to lazily create parent rigid body entity if needed
    const parentEntity = context.entityGetter.current()
    const object3d = object3dRef.current

    // Compute world scale from Object3D hierarchy
    let scaleX = 1,
      scaleY = 1,
      scaleZ = 1
    if (object3d) {
      object3d.updateWorldMatrix(true, false)
      object3d.getWorldScale(_scaleVec3)
      scaleX = _scaleVec3.x
      scaleY = _scaleVec3.y
      scaleZ = _scaleVec3.z
    }

    // Spawn collider entity with relation to parent rigid body
    const colliderEntity = (colliderEntityRef.current = world.spawn(
      IsColliderEntity,
      ChildOf(parentEntity),
      Object3DRef({object: object3d}),
      ColliderConfig({
        shape: config.shape,
        friction: config.friction,
        restitution: config.restitution,
        density: config.density,
        sensor: config.sensor,
        offsetX: object3d?.position.x ?? 0,
        offsetY: object3d?.position.y ?? 0,
        offsetZ: object3d?.position.z ?? 0,
        offsetQx: object3d?.quaternion.x ?? 0,
        offsetQy: object3d?.quaternion.y ?? 0,
        offsetQz: object3d?.quaternion.z ?? 0,
        offsetQw: object3d?.quaternion.w ?? 1,
        scaleX,
        scaleY,
        scaleZ,
      }),
    ))

    return () => {
      if (colliderEntity.isAlive()) {
        colliderEntity.destroy()
      }
    }
  }, [context, world])

  return object3dRef
}

export interface BallColliderProps extends BaseColliderProps {
  radius: number
}

export function BallCollider({
  radius,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: BallColliderProps) {
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

export interface CuboidColliderProps extends BaseColliderProps {
  args: [width: number, height: number, depth: number]
}

export function CuboidCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: CuboidColliderProps) {
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

export const BoxCollider = CuboidCollider

export interface CapsuleColliderProps extends BaseColliderProps {
  args: [radius: number, height: number]
}

export function CapsuleCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: CapsuleColliderProps) {
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

export interface CylinderColliderProps extends BaseColliderProps {
  args: [radius: number, height: number]
}

export function CylinderCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: CylinderColliderProps) {
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

export interface ConeColliderProps extends BaseColliderProps {
  args: [radius: number, height: number]
}

export function ConeCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ConeColliderProps) {
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

export interface ConvexHullColliderProps extends BaseColliderProps {
  args: [points: Float32Array]
}

export function ConvexHullCollider({
  args,
  children,
  friction,
  restitution,
  density,
  sensor,
  ...props
}: ConvexHullColliderProps) {
  const [points] = args

  // Scale is applied automatically by the physics system based on world matrix
  const shape: ColliderShape = {type: 'convexHull', points}
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
