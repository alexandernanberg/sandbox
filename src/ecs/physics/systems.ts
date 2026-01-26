import type {World} from 'koota'
import {createQuery, Not} from 'koota'
import {Matrix4, Object3D} from 'three'
import {
  copyFromObject3D,
  copyQuat,
  copyTransform,
  lerpVec3,
  slerpQuat,
  _transform,
  _quat,
} from '~/lib/math'
import type {JoltPhysicsSystem, JoltShape, JoltModule} from './jolt-types'
import type {RigidBodyType, ColliderShape} from './traits'
import {CharacterMovement, IsCharacterController} from './character'
import {
  LAYER_NON_MOVING,
  LAYER_MOVING,
  MOTION_TYPE_STATIC,
  MOTION_TYPE_KINEMATIC,
  MOTION_TYPE_DYNAMIC,
  MOTION_QUALITY_DISCRETE,
  MOTION_QUALITY_LINEAR_CAST,
  ACTIVATION_ACTIVATE,
} from './jolt-types'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  RigidBodyRef,
  ColliderConfig,
  IsPhysicsEntity,
  IsColliderEntity,
  PhysicsInitialized,
  ColliderInitialized,
  Object3DRef,
  ParentInverseMatrix,
  ChildOf,
} from './traits'
import {getJolt, registerBodyEntity} from './world'

// ============================================
// Cached Queries (created once, reused every frame)
// ============================================

// Use Not() to filter at query level instead of checking in loops
const uninitializedTransformQuery = createQuery(
  Object3DRef,
  IsPhysicsEntity,
  Transform,
  Not(PhysicsInitialized),
)
const uninitializedBodiesQuery = createQuery(
  RigidBodyConfig,
  Transform,
  IsPhysicsEntity,
  Not(PhysicsInitialized),
)
const uninitializedCollidersQuery = createQuery(
  IsColliderEntity,
  ColliderConfig,
  ChildOf('*'),
  Not(ColliderInitialized),
)
const previousTransformQuery = createQuery(
  Transform,
  PreviousTransform,
  PhysicsInitialized,
)
const syncFromPhysicsQuery = createQuery(
  Transform,
  RigidBodyRef,
  PhysicsInitialized,
)
const interpolateQuery = createQuery(
  Transform,
  PreviousTransform,
  RenderTransform,
  PhysicsInitialized,
)
// Split into two queries: root objects (common case) and nested objects
const syncToObject3DRootQuery = createQuery(
  RenderTransform,
  Object3DRef,
  PhysicsInitialized,
  Not(ParentInverseMatrix),
)
const syncToObject3DNestedQuery = createQuery(
  RenderTransform,
  Object3DRef,
  PhysicsInitialized,
  ParentInverseMatrix,
)
const characterVisualSmoothQuery = createQuery(
  Transform,
  RenderTransform,
  CharacterMovement,
  IsCharacterController,
  PhysicsInitialized,
)

// Temporary Three.js objects for matrix operations
const _tempObject3D = new Object3D()
const _tempMatrix4 = new Matrix4()
const _parentInverseMatrix = new Matrix4()

// ============================================
// Transform Initialization System
// ============================================

export function initializeTransformFromObject3D(world: World): void {
  for (const entity of world.query(uninitializedTransformQuery)) {
    const object3d = entity.get(Object3DRef)!.object
    if (!object3d) continue

    // Decompose world matrix to get initial transform
    object3d.updateWorldMatrix(true, false)
    _tempObject3D.matrix.copy(object3d.matrixWorld)
    _tempObject3D.matrix.decompose(
      _tempObject3D.position,
      _tempObject3D.quaternion,
      _tempObject3D.scale,
    )

    copyFromObject3D(_transform, _tempObject3D)
    entity.set(Transform, _transform)
    entity.set(PreviousTransform, _transform)
    entity.set(RenderTransform, _transform)

    // Store parent inverse matrix for nested objects
    if (object3d.parent && object3d.parent.type !== 'Scene') {
      _parentInverseMatrix.copy(object3d.parent.matrixWorld).invert()
      entity.add(
        ParentInverseMatrix({
          elements: new Float32Array(_parentInverseMatrix.elements),
        }),
      )
    }
  }
}

// ============================================
// Body Creation System
// ============================================

// Store pending collider configs until body is ready
interface ColliderConfigData {
  shape: ColliderShape | null
  friction: number
  restitution: number
  density: number
  sensor: boolean
  offsetX: number
  offsetY: number
  offsetZ: number
  offsetQx: number
  offsetQy: number
  offsetQz: number
  offsetQw: number
  scaleX: number
  scaleY: number
  scaleZ: number
}

// Reserved for future use - collecting pending colliders until body is created
const _pendingColliders = new Map<
  unknown,
  {shape: ColliderShape; config: ColliderConfigData}[]
>()

export function createPhysicsBodies(
  world: World,
  physicsSystem: JoltPhysicsSystem,
) {
  const Jolt = getJolt()
  const bodyInterface = physicsSystem.GetBodyInterface()

  // Query filters uninitialized entities via Not(PhysicsInitialized)
  const entities = world.query(uninitializedBodiesQuery)

  for (const entity of entities) {
    const config = entity.get(RigidBodyConfig)!
    const transform = entity.get(Transform)!

    // Get collider configs from child entities
    const colliderConfigs: {
      shape: ColliderShape
      config: ColliderConfigData
    }[] = []

    // Find child collider entities
    for (const colliderEntity of world.query(uninitializedCollidersQuery)) {
      const parents = colliderEntity.targetsFor(ChildOf)
      if (parents.length > 0 && parents[0] === entity) {
        const colliderConfig = colliderEntity.get(ColliderConfig)
        if (colliderConfig && colliderConfig.shape) {
          colliderConfigs.push({
            shape: colliderConfig.shape,
            config: colliderConfig as ColliderConfigData,
          })
        }
      }
    }

    // If no colliders yet, store as pending
    if (colliderConfigs.length === 0) {
      continue
    }

    // Create shape(s)
    let shape: JoltShape
    if (colliderConfigs.length === 1) {
      // Single collider - use directly
      const colliderData = colliderConfigs[0]!
      shape = createJoltShape(
        Jolt,
        colliderData.shape,
        colliderData.config.scaleX,
        colliderData.config.scaleY,
        colliderData.config.scaleZ,
      )
    } else {
      // Multiple colliders - create compound shape
      const compoundSettings = new Jolt.StaticCompoundShapeSettings()

      for (const colliderData of colliderConfigs) {
        const subShape = createJoltShape(
          Jolt,
          colliderData.shape,
          colliderData.config.scaleX,
          colliderData.config.scaleY,
          colliderData.config.scaleZ,
        )

        const offset = new Jolt.Vec3(
          colliderData.config.offsetX,
          colliderData.config.offsetY,
          colliderData.config.offsetZ,
        )
        const rotation = new Jolt.Quat(
          colliderData.config.offsetQx,
          colliderData.config.offsetQy,
          colliderData.config.offsetQz,
          colliderData.config.offsetQw,
        )

        // Use AddShapeShape which takes a Shape directly (not ShapeSettings)
        compoundSettings.AddShapeShape(offset, rotation, subShape, 0)
        Jolt.destroy(offset)
        Jolt.destroy(rotation)
      }

      shape = compoundSettings.Create().Get()
      shape.AddRef()
      Jolt.destroy(compoundSettings)
    }

    // Determine motion type
    const motionType = getMotionType(config.type)
    const layer =
      motionType === MOTION_TYPE_STATIC ? LAYER_NON_MOVING : LAYER_MOVING

    // Create body settings
    const position = new Jolt.RVec3(transform.x, transform.y, transform.z)
    const rotation = new Jolt.Quat(
      transform.qx,
      transform.qy,
      transform.qz,
      transform.qw,
    )

    const bodySettings = new Jolt.BodyCreationSettings(
      shape,
      position,
      rotation,
      motionType,
      layer,
    )

    // Configure body properties
    bodySettings.mGravityFactor = config.gravityScale
    bodySettings.mLinearDamping = config.linearDamping
    bodySettings.mAngularDamping = config.angularDamping
    bodySettings.mAllowSleeping = config.canSleep
    bodySettings.mMotionQuality = config.ccd
      ? MOTION_QUALITY_LINEAR_CAST
      : MOTION_QUALITY_DISCRETE

    // Set friction/restitution from first collider
    if (colliderConfigs.length > 0) {
      bodySettings.mFriction = colliderConfigs[0]!.config.friction
      bodySettings.mRestitution = colliderConfigs[0]!.config.restitution
    }

    // Set initial velocities
    if (
      config.linearVelocityX !== 0 ||
      config.linearVelocityY !== 0 ||
      config.linearVelocityZ !== 0
    ) {
      const linVel = new Jolt.Vec3(
        config.linearVelocityX,
        config.linearVelocityY,
        config.linearVelocityZ,
      )
      bodySettings.mLinearVelocity = linVel
      Jolt.destroy(linVel)
    }

    if (
      config.angularVelocityX !== 0 ||
      config.angularVelocityY !== 0 ||
      config.angularVelocityZ !== 0
    ) {
      const angVel = new Jolt.Vec3(
        config.angularVelocityX,
        config.angularVelocityY,
        config.angularVelocityZ,
      )
      bodySettings.mAngularVelocity = angVel
      Jolt.destroy(angVel)
    }

    // Create the body
    const body = bodyInterface.CreateBody(bodySettings)
    const bodyId = body.GetID()

    // Register entity mapping for collision events
    registerBodyEntity(bodyId, entity)

    // Add to physics world
    bodyInterface.AddBody(bodyId, ACTIVATION_ACTIVATE)

    // Cleanup temporary objects
    Jolt.destroy(position)
    Jolt.destroy(rotation)
    Jolt.destroy(bodySettings)

    // Add runtime ref
    entity.add(RigidBodyRef)
    entity.set(RigidBodyRef, (ref) => {
      ref.bodyId = bodyId
      ref.body = body
      ref.shape = shape
      return ref
    })

    // Mark as initialized
    entity.add(PhysicsInitialized)

    // Mark child colliders as initialized
    for (const colliderEntity of world.query(uninitializedCollidersQuery)) {
      const parents = colliderEntity.targetsFor(ChildOf)
      if (parents.length > 0 && parents[0] === entity) {
        colliderEntity.add(ColliderInitialized)
      }
    }
  }
}

function getMotionType(type: RigidBodyType): number {
  switch (type) {
    case 'dynamic':
      return MOTION_TYPE_DYNAMIC
    case 'fixed':
      return MOTION_TYPE_STATIC
    case 'kinematic-velocity-based':
    case 'kinematic-position-based':
      return MOTION_TYPE_KINEMATIC
    default:
      return MOTION_TYPE_DYNAMIC
  }
}

function createJoltShape(
  Jolt: JoltModule,
  shape: ColliderShape,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
): JoltShape {
  const uniformScale = Math.max(scaleX, scaleY, scaleZ)

  switch (shape.type) {
    case 'ball': {
      // SphereShape(radius, material?) - omit material for default
      const result = new Jolt.SphereShape(shape.radius * uniformScale)
      return result
    }
    case 'cuboid': {
      // BoxShape(halfExtent, convexRadius?, material?)
      const halfExtent = new Jolt.Vec3(
        shape.hx * scaleX,
        shape.hy * scaleY,
        shape.hz * scaleZ,
      )
      const result = new Jolt.BoxShape(halfExtent, 0.05)
      Jolt.destroy(halfExtent)
      return result
    }
    case 'capsule': {
      // CapsuleShape(halfHeight, radius, material?)
      const result = new Jolt.CapsuleShape(
        shape.halfHeight * scaleY,
        shape.radius * Math.max(scaleX, scaleZ),
      )
      return result
    }
    case 'cylinder': {
      // CylinderShape(halfHeight, radius, convexRadius?, material?)
      const result = new Jolt.CylinderShape(
        shape.halfHeight * scaleY,
        shape.radius * Math.max(scaleX, scaleZ),
        0.05,
      )
      return result
    }
    case 'cone': {
      // Jolt doesn't have a cone shape, use cylinder as approximation
      const result = new Jolt.CylinderShape(
        shape.halfHeight * scaleY,
        shape.radius * Math.max(scaleX, scaleZ),
        0.05,
      )
      return result
    }
    case 'convexHull': {
      // Scale the vertices
      const scaledPoints = new Float32Array(shape.points.length)
      for (let i = 0; i < shape.points.length; i += 3) {
        scaledPoints[i] = shape.points[i]! * scaleX
        scaledPoints[i + 1] = shape.points[i + 1]! * scaleY
        scaledPoints[i + 2] = shape.points[i + 2]! * scaleZ
      }
      const settings = new Jolt.ConvexHullShapeSettings()
      for (let i = 0; i < scaledPoints.length; i += 3) {
        const point = new Jolt.Vec3(
          scaledPoints[i]!,
          scaledPoints[i + 1]!,
          scaledPoints[i + 2]!,
        )
        settings.mPoints.push_back(point)
        Jolt.destroy(point)
      }
      const result = settings.Create().Get()
      Jolt.destroy(settings)
      return result
    }
    case 'trimesh': {
      // Scale the vertices
      const scaledVertices = new Float32Array(shape.vertices.length)
      for (let i = 0; i < shape.vertices.length; i += 3) {
        scaledVertices[i] = shape.vertices[i]! * scaleX
        scaledVertices[i + 1] = shape.vertices[i + 1]! * scaleY
        scaledVertices[i + 2] = shape.vertices[i + 2]! * scaleZ
      }
      // Build triangle list (Triangle constructor takes Vec3, not Float3)
      const triList = new Jolt.TriangleList()
      for (let i = 0; i < shape.indices.length; i += 3) {
        const i0 = shape.indices[i]! * 3
        const i1 = shape.indices[i + 1]! * 3
        const i2 = shape.indices[i + 2]! * 3
        const v0 = new Jolt.Vec3(
          scaledVertices[i0]!,
          scaledVertices[i0 + 1]!,
          scaledVertices[i0 + 2]!,
        )
        const v1 = new Jolt.Vec3(
          scaledVertices[i1]!,
          scaledVertices[i1 + 1]!,
          scaledVertices[i1 + 2]!,
        )
        const v2 = new Jolt.Vec3(
          scaledVertices[i2]!,
          scaledVertices[i2 + 1]!,
          scaledVertices[i2 + 2]!,
        )
        const tri = new Jolt.Triangle(v0, v1, v2, 0)
        triList.push_back(tri)
        Jolt.destroy(v0)
        Jolt.destroy(v1)
        Jolt.destroy(v2)
        Jolt.destroy(tri)
      }
      // Use constructor that accepts TriangleList directly
      const settings = new Jolt.MeshShapeSettings(triList)
      const result = settings.Create().Get()
      Jolt.destroy(triList)
      Jolt.destroy(settings)
      return result
    }
    case 'heightfield': {
      // Create heightfield shape
      const settings = new Jolt.HeightFieldShapeSettings()
      settings.mSampleCount = shape.ncols
      settings.mBlockSize = 2
      settings.mOffset = new Jolt.Vec3(0, 0, 0)
      settings.mScale = new Jolt.Vec3(
        shape.scale.x * scaleX,
        shape.scale.y * scaleY,
        shape.scale.z * scaleZ,
      )
      // Copy height data
      for (let i = 0; i < shape.heights.length; i++) {
        settings.mHeightSamples.push_back(shape.heights[i]!)
      }
      const result = settings.Create().Get()
      Jolt.destroy(settings)
      return result
    }
    default: {
      // Fallback to unit sphere
      const result = new Jolt.SphereShape(1)
      return result
    }
  }
}

// ============================================
// Collider Creation System
// ============================================

// In Jolt, colliders (shapes) are created as part of the body
// This function is kept for compatibility but colliders are created in createPhysicsBodies
export function createColliders(
  _world: World,
  _physicsSystem: JoltPhysicsSystem,
) {
  // Colliders are now handled in createPhysicsBodies since Jolt
  // attaches shapes directly to bodies
  // This function exists for API compatibility
}

// ============================================
// Transform Sync Systems
// ============================================

export function storePreviousTransforms(world: World): void {
  world.query(previousTransformQuery).updateEach(([current, previous]) => {
    copyTransform(previous, current)
  })
}

export function syncTransformFromPhysics(
  world: World,
  physicsSystem: JoltPhysicsSystem,
) {
  const bodyInterface = physicsSystem.GetBodyInterface()
  const entities = world.query(syncFromPhysicsQuery)

  for (const entity of entities) {
    const bodyRef = entity.get(RigidBodyRef)!
    const bodyId = bodyRef.bodyId

    // Check if body ID is valid (invalid IDs have index 0xFFFFFFFF)
    if (!bodyId || bodyId.GetIndex() === 0xffffffff) continue

    // Skip if body is not active (sleeping) or static
    if (!bodyInterface.IsActive(bodyId)) continue

    // Get position and rotation from Jolt
    const pos = bodyInterface.GetPosition(bodyId)
    const rot = bodyInterface.GetRotation(bodyId)

    // Copy to scratch transform
    _transform.x = pos.GetX()
    _transform.y = pos.GetY()
    _transform.z = pos.GetZ()
    _transform.qx = rot.GetX()
    _transform.qy = rot.GetY()
    _transform.qz = rot.GetZ()
    _transform.qw = rot.GetW()

    entity.set(Transform, _transform)
  }
}

export function interpolateTransforms(world: World, alpha: number): void {
  world.query(interpolateQuery).updateEach(([current, previous, render]) => {
    lerpVec3(render, previous, current, alpha)
    slerpQuat(_quat, previous, current, alpha)
    copyQuat(render, _quat)
  })
}

export function syncToObject3D(world: World): void {
  // Fast path for root objects (common case) - no has() check needed
  for (const entity of world.query(syncToObject3DRootQuery)) {
    const render = entity.get(RenderTransform)!
    const objRef = entity.get(Object3DRef)!
    const object = objRef.object
    if (!object) continue

    object.position.set(render.x, render.y, render.z)
    object.quaternion.set(render.qx, render.qy, render.qz, render.qw)
  }

  // Nested objects need parent inverse matrix transform
  for (const entity of world.query(syncToObject3DNestedQuery)) {
    const render = entity.get(RenderTransform)!
    const objRef = entity.get(Object3DRef)!
    const parentInverse = entity.get(ParentInverseMatrix)!
    const object = objRef.object

    if (!object || !parentInverse.elements) continue

    // Apply inverse matrix to convert world coords back to local coords
    _tempObject3D.position.set(render.x, render.y, render.z)
    _tempObject3D.quaternion.set(render.qx, render.qy, render.qz, render.qw)
    _tempMatrix4.fromArray(parentInverse.elements)
    _tempObject3D.applyMatrix4(_tempMatrix4)

    object.position.copy(_tempObject3D.position)
    object.quaternion.copy(_tempObject3D.quaternion)
  }
}

// ============================================
// Character Visual Smoothing System
// ============================================

/** How quickly visual Y catches up to physics Y (higher = faster) */
const VISUAL_SMOOTH_FACTOR = 15.0
/** Minimum Y jump to trigger smoothing (smaller changes snap instantly) */
const STEP_UP_THRESHOLD = 0.08

/**
 * Smooth character visual Y position for step-up climbing.
 * Only applies smoothing when there's a sudden upward Y change (step-up).
 * Gradual changes (slopes, normal movement) snap instantly to avoid camera lag.
 *
 * Call this AFTER interpolateTransforms and BEFORE syncToObject3D.
 */
export function smoothCharacterVisuals(world: World, delta: number): void {
  for (const entity of world.query(characterVisualSmoothQuery)) {
    const movement = entity.get(CharacterMovement)!
    const transform = entity.get(Transform)!

    // Skip if not initialized yet
    if (!movement.visualYInitialized) continue

    // Target is the CURRENT physics Y (not interpolated)
    const targetY = transform.y
    const currentVisualY = movement.visualY

    // Calculate how much Y jumped this frame
    const yDelta = targetY - currentVisualY

    let newVisualY: number

    // Only smooth large upward jumps (step-ups) while grounded
    // Small changes and downward movement snap instantly
    if (movement.grounded && !movement.sliding && yDelta > STEP_UP_THRESHOLD) {
      // Smoothly interpolate visual Y toward physics Y
      const t = 1 - Math.exp(-VISUAL_SMOOTH_FACTOR * delta)
      newVisualY = currentVisualY + yDelta * t
    } else {
      // Snap to physics Y (no smoothing needed)
      newVisualY = targetY
    }

    // Apply visual Y to render transform (override the interpolated Y)
    entity.set(RenderTransform, (r) => {
      r.y = newVisualY
      return r
    })

    // Update visual Y in movement state
    entity.set(CharacterMovement, (m) => {
      m.visualY = newVisualY
      return m
    })
  }
}
