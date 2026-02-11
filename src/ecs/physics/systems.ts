import * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import type {World} from 'koota'
import {createQuery, Not} from 'koota'
import {Matrix4, Object3D} from 'three'
import {
  copyFromObject3D,
  copyFromRapier,
  copyQuat,
  copyTransform,
  lerpVec3,
  slerpQuat,
  _transform,
  _quat,
  _vec3,
} from '~/lib/math'
import type {RigidBodyType, ColliderShape} from './traits'
import {CharacterMovement, IsCharacterController} from './character'
import {
  Transform,
  PreviousTransform,
  RenderTransform,
  RigidBodyConfig,
  RigidBodyRef,
  ColliderConfig,
  ColliderRef,
  IsPhysicsEntity,
  IsColliderEntity,
  PhysicsInitialized,
  ColliderInitialized,
  Object3DRef,
  ParentInverseMatrix,
  ChildOf,
} from './traits'

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

export function createPhysicsBodies(
  world: World,
  rapierWorld: RAPIER.World,
): void {
  const entities = world.query(uninitializedBodiesQuery)

  for (const entity of entities) {
    const config = entity.get(RigidBodyConfig)!
    const transform = entity.get(Transform)!

    // Create rigid body description
    const rigidBodyDesc = createRigidBodyDesc(config.type)
      .setGravityScale(config.gravityScale)
      .setLinearDamping(config.linearDamping)
      .setAngularDamping(config.angularDamping)
      .setCcdEnabled(config.ccd)
      .setCanSleep(config.canSleep)
      .setDominanceGroup(config.dominanceGroup)
      .setTranslation(transform.x, transform.y, transform.z)
      .setRotation({
        x: transform.qx,
        y: transform.qy,
        z: transform.qz,
        w: transform.qw,
      })

    if (config.restrictPosition) {
      const [x, y, z] = config.restrictPosition
      rigidBodyDesc.enabledTranslations(!x, !y, !z)
    }

    if (config.restrictRotation) {
      const [x, y, z] = config.restrictRotation
      rigidBodyDesc.enabledRotations(!x, !y, !z)
    }

    if (config.lockPosition) {
      rigidBodyDesc.lockTranslations()
    }

    if (config.lockRotation) {
      rigidBodyDesc.lockRotations()
    }

    // Set initial velocities if non-zero
    if (
      config.linearVelocityX !== 0 ||
      config.linearVelocityY !== 0 ||
      config.linearVelocityZ !== 0
    ) {
      rigidBodyDesc.setLinvel(
        config.linearVelocityX,
        config.linearVelocityY,
        config.linearVelocityZ,
      )
    }

    if (
      config.angularVelocityX !== 0 ||
      config.angularVelocityY !== 0 ||
      config.angularVelocityZ !== 0
    ) {
      rigidBodyDesc.setAngvel({
        x: config.angularVelocityX,
        y: config.angularVelocityY,
        z: config.angularVelocityZ,
      })
    }

    // Create the rigid body
    const body = rapierWorld.createRigidBody(rigidBodyDesc)

    // Store entity reference on rigid body for O(1) lookup in collision events
    body.userData = entity

    // Add runtime ref using set callback for proper mutation
    entity.add(RigidBodyRef)
    entity.set(RigidBodyRef, (ref) => {
      ref.handle = body.handle
      ref.body = body
      return ref
    })

    // Mark as initialized
    entity.add(PhysicsInitialized)
  }
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
      throw new Error(`Unsupported RigidBody type: "${type as string}"`)
  }
}

// ============================================
// Collider Creation System
// ============================================

// Reusable scale object to avoid allocations
const _scale = {x: 1, y: 1, z: 1}

export function createColliders(world: World, rapierWorld: RAPIER.World): void {
  const colliders = world.query(uninitializedCollidersQuery)

  for (const entity of colliders) {
    // Get parent rigid body from relation
    const parents = entity.targetsFor(ChildOf)
    if (parents.length === 0) continue

    const parentEntity = parents[0]!

    // Skip if parent isn't initialized yet
    if (!parentEntity.has(PhysicsInitialized)) continue

    const bodyRef = parentEntity.get(RigidBodyRef)
    if (!bodyRef?.body) continue

    const config = entity.get(ColliderConfig)!
    if (!config.shape) continue

    // Reuse scale object to avoid allocations
    _scale.x = config.scaleX
    _scale.y = config.scaleY
    _scale.z = config.scaleZ

    // Create collider description based on shape, applying world scale
    const colliderDesc = createColliderDesc(config.shape, _scale)
    if (!colliderDesc) continue

    colliderDesc
      .setFriction(config.friction)
      .setRestitution(config.restitution)
      .setDensity(config.density)
      .setSensor(config.sensor)
      .setTranslation(config.offsetX, config.offsetY, config.offsetZ)
      .setRotation({
        x: config.offsetQx,
        y: config.offsetQy,
        z: config.offsetQz,
        w: config.offsetQw,
      })

    // Enable collision events
    colliderDesc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)

    // Create the collider attached to parent rigid body
    const collider = rapierWorld.createCollider(colliderDesc, bodyRef.body)

    // Add runtime ref
    entity.add(ColliderRef)
    entity.set(ColliderRef, (ref) => {
      ref.handle = collider.handle
      ref.collider = collider
      return ref
    })

    // Mark as initialized
    entity.add(ColliderInitialized)
  }
}

function createColliderDesc(
  shape: ColliderShape | null,
  scale: {x: number; y: number; z: number},
): RAPIER.ColliderDesc | null {
  if (!shape) return null

  // Use uniform scale for shapes that don't support non-uniform scaling
  const uniformScale = Math.max(scale.x, scale.y, scale.z)

  switch (shape.type) {
    case 'ball':
      return RAPIER.ColliderDesc.ball(shape.radius * uniformScale)
    case 'cuboid':
      return RAPIER.ColliderDesc.cuboid(
        shape.hx * scale.x,
        shape.hy * scale.y,
        shape.hz * scale.z,
      )
    case 'capsule':
      // Capsule: height scales on Y, radius uses max of X/Z
      return RAPIER.ColliderDesc.capsule(
        shape.halfHeight * scale.y,
        shape.radius * Math.max(scale.x, scale.z),
      )
    case 'cylinder':
      // Cylinder: height scales on Y, radius uses max of X/Z
      return RAPIER.ColliderDesc.cylinder(
        shape.halfHeight * scale.y,
        shape.radius * Math.max(scale.x, scale.z),
      )
    case 'cone':
      // Cone: height scales on Y, radius uses max of X/Z
      return RAPIER.ColliderDesc.cone(
        shape.halfHeight * scale.y,
        shape.radius * Math.max(scale.x, scale.z),
      )
    case 'convexHull': {
      // Scale the vertices
      const scaledPoints = new Float32Array(shape.points.length)
      for (let i = 0; i < shape.points.length; i += 3) {
        scaledPoints[i] = shape.points[i]! * scale.x
        scaledPoints[i + 1] = shape.points[i + 1]! * scale.y
        scaledPoints[i + 2] = shape.points[i + 2]! * scale.z
      }
      return RAPIER.ColliderDesc.convexHull(scaledPoints)
    }
    case 'trimesh': {
      // Scale the vertices
      const scaledVertices = new Float32Array(shape.vertices.length)
      for (let i = 0; i < shape.vertices.length; i += 3) {
        scaledVertices[i] = shape.vertices[i]! * scale.x
        scaledVertices[i + 1] = shape.vertices[i + 1]! * scale.y
        scaledVertices[i + 2] = shape.vertices[i + 2]! * scale.z
      }
      return RAPIER.ColliderDesc.trimesh(scaledVertices, shape.indices)
    }
    case 'heightfield':
      return RAPIER.ColliderDesc.heightfield(
        shape.nrows,
        shape.ncols,
        shape.heights,
        {
          x: shape.scale.x * scale.x,
          y: shape.scale.y * scale.y,
          z: shape.scale.z * scale.z,
        },
      )
    default:
      return null
  }
}

// ============================================
// Transform Sync Systems
// ============================================

export function storePreviousTransforms(world: World): void {
  world.query(previousTransformQuery).updateEach(([current, previous]) => {
    copyTransform(previous, current)
  })
}

export function syncTransformFromPhysics(world: World): void {
  for (const entity of world.query(syncFromPhysicsQuery)) {
    const body = entity.get(RigidBodyRef)!.body
    if (!body || body.isSleeping() || body.isFixed()) continue

    copyFromRapier(_transform, body.translation(), body.rotation())
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
