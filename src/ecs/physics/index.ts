// ============================================
// Public API for Physics
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
  // Kinematic bodies
  KinematicVelocity,
  // Tags
  IsPhysicsEntity,
  IsColliderEntity,
  PhysicsInitialized,
  ColliderInitialized,
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
  CharacterShapeRef,
  CharacterControllerConfig,
  CharacterMovement,
  IsCharacterController,
} from './character'

// Physics world (ECS-centric, can be used outside React)
export {
  physicsWorld,
  initPhysicsWorld,
  destroyPhysicsWorld,
  setGravity,
  getPhysicsSystem,
  getJoltWorld,
  getJolt,
  getJoltInterface,
  getBodyInterface,
  getTempAllocator,
  registerBodyEntity,
  getEntityForBodyId,
  onBeforeStep,
  onAfterStep,
  FIXED_TIMESTEP,
  MAX_DELTA,
  // Legacy compatibility
  getRapierWorld,
  getEventQueue,
} from './world'
export type {PhysicsWorldState, PhysicsConfig} from './world'

// Step function (runs all physics systems)
export {stepPhysics, getInterpolationAlpha} from './step'
export type {StepResult} from './step'

// Provider (React integration, optional)
export {PhysicsProvider, usePhysicsContext} from './provider'
export type {PhysicsProviderProps, PhysicsContextValue} from './provider'

// Hooks (React integration, optional)
export {usePhysicsUpdate, useJoltWorld, useRapierWorld} from './hooks'
export type {PhysicsStage} from './hooks'

// Jolt types
export type {
  JoltModule,
  JoltPhysicsSystem,
  JoltBody,
  JoltBodyID,
  JoltShape,
  JoltCharacterVirtual,
} from './jolt-types'
export {
  LAYER_NON_MOVING,
  LAYER_MOVING,
  MOTION_TYPE_STATIC,
  MOTION_TYPE_KINEMATIC,
  MOTION_TYPE_DYNAMIC,
  GROUND_STATE_ON_GROUND,
  GROUND_STATE_ON_STEEP_GROUND,
  GROUND_STATE_IN_AIR,
} from './jolt-types'

// React components
export {
  RigidBody,
  BallCollider,
  CuboidCollider,
  BoxCollider,
  CapsuleCollider,
  CylinderCollider,
  ConeCollider,
  ConvexHullCollider,
} from './components'
export type {
  RigidBodyProps,
  RigidBodyApi,
  CollisionEvent,
  CollisionCallback,
  BallColliderProps,
  CuboidColliderProps,
  CapsuleColliderProps,
  CylinderColliderProps,
  ConeColliderProps,
  ConvexHullColliderProps,
} from './components'

// Math utilities (for custom systems)
export {
  setVec3,
  copyVec3,
  addVec3,
  lerpVec3,
  copyQuat,
  slerpQuat,
  copyTransform,
  copyFromObject3D,
  copyFromRapier,
  _transform,
  _quat,
  _vec3,
} from '~/lib/math'
export type {Vec2, Vec3, Quat, TransformData} from '~/lib/math'

// Systems (for advanced usage)
export {
  initializeTransformFromObject3D,
  createPhysicsBodies,
  createColliders,
  storePreviousTransforms,
  syncTransformFromPhysics,
  interpolateTransforms,
  syncToObject3D,
} from './systems'

export {processCollisionEvents, clearCollisionEvents} from './events'

export {
  characterControllerSystem,
  createCharacterController,
  cleanupCharacterController,
} from './character'

// Character controller React component
export {CharacterController} from './character-controller'
export type {
  CharacterControllerProps,
  CharacterControllerApi,
} from './character-controller'
