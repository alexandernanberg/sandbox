import type * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {trait, createQuery} from 'koota'
import type {Entity, World} from 'koota'
import {RigidBodyRef, Transform, PhysicsInitialized} from './traits'

// Reusable scratch objects to avoid allocations in hot paths
const _velocity = {x: 0, y: 0, z: 0}
const _nextPos = {x: 0, y: 0, z: 0}
const _movement = {vx: 0, vy: 0, vz: 0, mx: 0, my: 0, mz: 0, grounded: false}

// ============================================
// Character Controller Traits
// ============================================

// Runtime reference to Rapier character controller
export const CharacterControllerRef = trait(() => ({
  controller: null as RAPIER.KinematicCharacterController | null,
}))

// Configuration for character controller
export const CharacterControllerConfig = trait({
  offset: 0.01,
  autostepMaxHeight: 0.5,
  autostepMinWidth: 0.1,
  autostepIncludesDynamicBodies: true,
  snapToGroundDistance: 0.3,
  mass: 75,
  applyImpulsesToDynamicBodies: true,
  slideEnabled: true,
})

// Movement state for character
export const CharacterMovement = trait({
  // Desired velocity (input)
  vx: 0,
  vy: 0,
  vz: 0,
  // Computed movement (output)
  mx: 0,
  my: 0,
  mz: 0,
  // State
  grounded: false,
})

// Tag for entities that are character controllers
export const IsCharacterController = trait()

// ============================================
// Cached Queries
// ============================================

const characterSystemQuery = createQuery(
  CharacterControllerRef,
  CharacterMovement,
  RigidBodyRef,
  Transform,
  PhysicsInitialized,
)

const characterCreationQuery = createQuery(
  CharacterControllerConfig,
  IsCharacterController,
  PhysicsInitialized,
)

// ============================================
// Character Controller System
// ============================================

export function characterControllerSystem(
  world: World,
  _rapierWorld: RAPIER.World,
) {
  const entities = world.query(characterSystemQuery)

  for (const entity of entities) {
    const controllerRef = entity.get(CharacterControllerRef)!
    const movement = entity.get(CharacterMovement)!
    const bodyRef = entity.get(RigidBodyRef)!
    const transform = entity.get(Transform)!

    const controller = controllerRef.controller
    const body = bodyRef.body

    if (!controller || !body) continue

    // Get the first collider from the rigid body
    const collider = body.collider(0)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!collider) continue

    // Compute collider movement based on desired velocity (reuse scratch object)
    _velocity.x = movement.vx
    _velocity.y = movement.vy
    _velocity.z = movement.vz
    controller.computeColliderMovement(collider, _velocity)

    // Get computed movement and update state
    const computed = controller.computedMovement()
    const grounded = controller.computedGrounded()

    // Reuse scratch object for CharacterMovement
    _movement.vx = movement.vx
    _movement.vy = movement.vy
    _movement.vz = movement.vz
    _movement.mx = computed.x
    _movement.my = computed.y
    _movement.mz = computed.z
    _movement.grounded = grounded
    entity.set(CharacterMovement, _movement)

    // Apply movement to rigid body (reuse scratch object)
    _nextPos.x = transform.x + computed.x
    _nextPos.y = transform.y + computed.y
    _nextPos.z = transform.z + computed.z
    body.setNextKinematicTranslation(_nextPos)
  }
}

// ============================================
// Character Controller Creation
// ============================================

export function createCharacterController(
  world: World,
  rapierWorld: RAPIER.World,
) {
  const entities = world.query(characterCreationQuery)

  for (const entity of entities) {
    // Skip if already has controller
    if (entity.has(CharacterControllerRef)) {
      const ref = entity.get(CharacterControllerRef)!
      if (ref.controller) continue
    }

    const config = entity.get(CharacterControllerConfig)!

    // Create the character controller
    const controller = rapierWorld.createCharacterController(config.offset)

    controller.enableAutostep(
      config.autostepMaxHeight,
      config.autostepMinWidth,
      config.autostepIncludesDynamicBodies,
    )
    controller.enableSnapToGround(config.snapToGroundDistance)
    controller.setCharacterMass(config.mass)
    controller.setApplyImpulsesToDynamicBodies(
      config.applyImpulsesToDynamicBodies,
    )
    controller.setSlideEnabled(config.slideEnabled)

    // Add or update the ref using set callback
    if (!entity.has(CharacterControllerRef)) {
      entity.add(CharacterControllerRef)
    }
    entity.set(CharacterControllerRef, (ref) => {
      ref.controller = controller
      return ref
    })
  }
}

// ============================================
// Character Controller Cleanup
// ============================================

export function cleanupCharacterController(
  entity: Entity,
  rapierWorld: RAPIER.World,
) {
  if (!entity.has(CharacterControllerRef)) return

  const ref = entity.get(CharacterControllerRef)!
  if (ref.controller) {
    rapierWorld.removeCharacterController(ref.controller)
    // Use set callback to clear the controller reference
    entity.set(CharacterControllerRef, (r) => {
      r.controller = null
      return r
    })
  }
}
