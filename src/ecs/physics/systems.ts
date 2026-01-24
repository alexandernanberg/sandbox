import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import type {World} from 'koota'
import {Matrix4, Object3D} from 'three'
import type {RigidBodyType, ColliderShape} from './traits'
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

// Temporary objects for transforms
const _tempObject3D = new Object3D()
const _tempMatrix4 = new Matrix4()

// ============================================
// Transform Initialization System
// ============================================

export function initializeTransformFromObject3D(world: World) {
  // Query entities that need transform initialization
  const entities = world.query(Object3DRef, IsPhysicsEntity, Transform)

  for (const entity of entities) {
    // Skip if already initialized
    if (entity.has(PhysicsInitialized)) continue

    const objRef = entity.get(Object3DRef)!
    const object3d = objRef.object
    if (!object3d) continue

    // Ensure world matrix is up to date (including parent chain)
    object3d.updateWorldMatrix(true, false)
    _tempObject3D.matrix.copy(object3d.matrixWorld)
    _tempObject3D.matrix.decompose(
      _tempObject3D.position,
      _tempObject3D.quaternion,
      _tempObject3D.scale,
    )

    // Set transform values
    const transformData = {
      x: _tempObject3D.position.x,
      y: _tempObject3D.position.y,
      z: _tempObject3D.position.z,
      qx: _tempObject3D.quaternion.x,
      qy: _tempObject3D.quaternion.y,
      qz: _tempObject3D.quaternion.z,
      qw: _tempObject3D.quaternion.w,
    }
    entity.set(Transform, transformData)
    entity.set(PreviousTransform, transformData)
    entity.set(RenderTransform, transformData)

    // Store parent inverse matrix for nested objects (for syncing back to local coords)
    if (object3d.parent && object3d.parent.type !== 'Scene') {
      const invertedWorldMatrix = object3d.parent.matrixWorld.clone().invert()
      entity.add(ParentInverseMatrix)
      entity.set(ParentInverseMatrix, (ref) => {
        ref.elements = new Float32Array(invertedWorldMatrix.elements)
        return ref
      })
    }
  }
}

// ============================================
// Body Creation System
// ============================================

export function createPhysicsBodies(world: World, rapierWorld: RAPIER.World) {
  // Query for entities that have config but haven't been initialized
  const entities = world.query(RigidBodyConfig, Transform, IsPhysicsEntity)

  for (const entity of entities) {
    // Skip if already has a body
    if (entity.has(PhysicsInitialized)) continue

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

export function createColliders(world: World, rapierWorld: RAPIER.World) {
  // Query initialized rigid bodies
  const rigidBodies = world.query(RigidBodyRef, PhysicsInitialized)

  for (const parentEntity of rigidBodies) {
    const bodyRef = parentEntity.get(RigidBodyRef)!
    if (!bodyRef.body) continue

    // Query collider entities that are children of this rigid body
    const colliders = world.query(
      IsColliderEntity,
      ColliderConfig,
      ChildOf(parentEntity),
    )

    for (const entity of colliders) {
      // Skip if already initialized
      if (entity.has(ColliderInitialized)) continue

      const config = entity.get(ColliderConfig)!
      if (!config.shape) continue

      // Read world scale from config (computed on mount by React component)
      const scale = {x: config.scaleX, y: config.scaleY, z: config.scaleZ}

      // Create collider description based on shape, applying world scale
      const colliderDesc = createColliderDesc(config.shape, scale)
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

export function storePreviousTransforms(world: World) {
  const entities = world.query(Transform, PreviousTransform, PhysicsInitialized)

  for (const entity of entities) {
    const current = entity.get(Transform)!
    // Use set with object for schema traits
    entity.set(PreviousTransform, {
      x: current.x,
      y: current.y,
      z: current.z,
      qx: current.qx,
      qy: current.qy,
      qz: current.qz,
      qw: current.qw,
    })
  }
}

export function syncTransformFromPhysics(world: World) {
  const entities = world.query(Transform, RigidBodyRef, PhysicsInitialized)

  for (const entity of entities) {
    const bodyRef = entity.get(RigidBodyRef)!
    const body = bodyRef.body

    if (!body || body.isSleeping() || body.isFixed()) continue

    const translation = body.translation()
    const rotation = body.rotation()

    // Use set with object for schema traits
    entity.set(Transform, {
      x: translation.x,
      y: translation.y,
      z: translation.z,
      qx: rotation.x,
      qy: rotation.y,
      qz: rotation.z,
      qw: rotation.w,
    })
  }
}

export function interpolateTransforms(world: World, alpha: number) {
  const entities = world.query(
    Transform,
    PreviousTransform,
    RenderTransform,
    PhysicsInitialized,
  )

  for (const entity of entities) {
    const current = entity.get(Transform)!
    const previous = entity.get(PreviousTransform)!

    // Compute interpolated rotation
    const rotation = {qx: 0, qy: 0, qz: 0, qw: 1}
    slerp(
      previous.qx,
      previous.qy,
      previous.qz,
      previous.qw,
      current.qx,
      current.qy,
      current.qz,
      current.qw,
      alpha,
      rotation,
    )

    // Use set with object for schema traits
    entity.set(RenderTransform, {
      x: previous.x + (current.x - previous.x) * alpha,
      y: previous.y + (current.y - previous.y) * alpha,
      z: previous.z + (current.z - previous.z) * alpha,
      qx: rotation.qx,
      qy: rotation.qy,
      qz: rotation.qz,
      qw: rotation.qw,
    })
  }
}

// Quaternion slerp helper
function slerp(
  ax: number,
  ay: number,
  az: number,
  aw: number,
  bx: number,
  by: number,
  bz: number,
  bw: number,
  t: number,
  out: {qx: number; qy: number; qz: number; qw: number},
) {
  let cosom = ax * bx + ay * by + az * bz + aw * bw

  // Shortest path
  if (cosom < 0) {
    cosom = -cosom
    bx = -bx
    by = -by
    bz = -bz
    bw = -bw
  }

  let scale0: number
  let scale1: number

  if (1 - cosom > 0.000001) {
    const omega = Math.acos(cosom)
    const sinom = Math.sin(omega)
    scale0 = Math.sin((1 - t) * omega) / sinom
    scale1 = Math.sin(t * omega) / sinom
  } else {
    // Close to same rotation, use linear interpolation
    scale0 = 1 - t
    scale1 = t
  }

  out.qx = scale0 * ax + scale1 * bx
  out.qy = scale0 * ay + scale1 * by
  out.qz = scale0 * az + scale1 * bz
  out.qw = scale0 * aw + scale1 * bw
}

export function syncToObject3D(world: World) {
  const entities = world.query(RenderTransform, Object3DRef, PhysicsInitialized)

  for (const entity of entities) {
    const render = entity.get(RenderTransform)!
    const objRef = entity.get(Object3DRef)!
    const object = objRef.object

    if (!object) continue

    // Check if this entity has a parent inverse matrix (nested in a group)
    if (entity.has(ParentInverseMatrix)) {
      const parentInverse = entity.get(ParentInverseMatrix)!
      if (parentInverse.elements) {
        // Apply inverse matrix to convert world coords back to local coords
        _tempObject3D.position.set(render.x, render.y, render.z)
        _tempObject3D.quaternion.set(render.qx, render.qy, render.qz, render.qw)
        _tempMatrix4.fromArray(parentInverse.elements)
        _tempObject3D.applyMatrix4(_tempMatrix4)

        object.position.copy(_tempObject3D.position)
        object.quaternion.copy(_tempObject3D.quaternion)
        continue
      }
    }

    // No parent inverse matrix - set directly (object is at scene root)
    object.position.set(render.x, render.y, render.z)
    object.quaternion.set(render.qx, render.qy, render.qz, render.qw)
  }
}
