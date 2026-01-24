// ============================================
// Public API for ECS Physics
// ============================================

// Core traits
export {
  // Transform traits
  Transform,
  PreviousTransform,
  RenderTransform,
  // Physics configuration
  RigidBodyConfig,
  ColliderConfig,
  // Runtime refs
  RigidBodyRef,
  ColliderRef,
  Object3DRef,
  ParentInverseMatrix,
  ChildOf,
  // Tags
  IsPhysicsEntity,
  IsColliderEntity,
  PhysicsInitialized,
  ColliderInitialized,
  NeedsSync,
  // Initial state
  InitialLinearVelocity,
  InitialAngularVelocity,
  // Types
  type RigidBodyType,
  type ColliderShape,
} from './traits'

// Event traits
export {
  CollisionEntered,
  CollisionExited,
  getCollisionsEntered,
  getCollisionsExited,
  isCollidingWith,
} from './events'

// Character controller
export {
  CharacterControllerRef,
  CharacterControllerConfig,
  CharacterMovement,
  IsCharacterController,
} from './character'

// Provider
export {ECSPhysicsProvider, useECSPhysicsContext} from './provider'
export type {ECSPhysicsProviderProps, ECSPhysicsContextValue} from './provider'

// Hooks
export {useECSPhysicsUpdate, useRapierWorld} from './hooks'
export type {PhysicsStage} from './hooks'

// React components
export {
  ECSRigidBody,
  ECSBallCollider,
  ECSCuboidCollider,
  ECSBoxCollider,
  ECSCapsuleCollider,
  ECSCylinderCollider,
  ECSConeCollider,
  ECSConvexHullCollider,
} from './components'
export type {
  ECSRigidBodyProps,
  ECSBallColliderProps,
  ECSCuboidColliderProps,
  ECSCapsuleColliderProps,
  ECSCylinderColliderProps,
  ECSConeColliderProps,
  ECSConvexHullColliderProps,
} from './components'

// Systems (for advanced usage)
export {
  initializeTransformFromObject3D,
  createPhysicsBodies,
  createColliders,
  storePreviousTransforms,
  syncTransformFromPhysics,
  interpolateTransforms,
  syncToObject3D,
  cleanupPhysicsEntity,
} from './systems'

export {
  processCollisionEvents,
  clearCollisionEvents,
  createHandleToEntityMap,
} from './events'

export {
  characterControllerSystem,
  createCharacterController,
  cleanupCharacterController,
} from './character'
