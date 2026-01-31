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
  // Sleep state
  SleepState,
  SleepCallbacks,
  // Tags
  IsPhysicsEntity,
  IsColliderEntity,
  PhysicsInitialized,
  ColliderInitialized,
  // Collision groups
  createCollisionGroups,
  CollisionGroup,
  // Types
  type RigidBodyType,
  type ColliderShape,
  type CoefficientCombineRule,
  type ContactForceEvent,
  type ContactForceCallback,
  type SleepCallback,
} from './traits'

// Event traits and helpers
export {
  // Collision events
  CollisionEntered,
  CollisionExited,
  getCollisionsEntered,
  getCollisionsExited,
  isCollidingWith,
  // Contact force events
  ContactForceReceived,
  getContactForces,
  getTotalContactForceMagnitude,
  getMaxContactForceMagnitude,
  // Sleep state helpers
  isSleeping,
  justSlept,
  justWoke,
  putToSleep,
  wakeUp,
} from './events'

// Force and impulse helpers
export {
  // Impulses (instant velocity change)
  applyImpulse,
  applyImpulseAtPoint,
  applyTorqueImpulse,
  // Forces (accumulated each frame)
  addForce,
  addForceAtPoint,
  addTorque,
  resetForces,
  resetTorques,
  // Velocity control
  getLinearVelocity,
  setLinearVelocity,
  getAngularVelocity,
  setAngularVelocity,
  // Utilities
  getSpeed,
  getAngularSpeed,
  applyExplosion,
} from './forces'

// Mass properties helpers
export {
  // Mass getters
  getMass,
  getInverseMass,
  getLocalCenterOfMass,
  getWorldCenterOfMass,
  getPrincipalInertia,
  getInversePrincipalInertia,
  // Gravity scale
  getGravityScale,
  setGravityScale,
  // Damping
  getLinearDamping,
  setLinearDamping,
  getAngularDamping,
  setAngularDamping,
  // Mass setters
  setAdditionalMass,
  setAdditionalMassProperties,
  recomputeMassPropertiesFromColliders,
  // Locked axes
  lockTranslations,
  lockRotations,
  setEnabledTranslations,
  setEnabledRotations,
  // Dominance groups
  getDominanceGroup,
  setDominanceGroup,
} from './mass'

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
  getRapierWorld,
  getEventQueue,
  onBeforeStep,
  onAfterStep,
  // Runtime configuration
  setSolverIterations,
  setInternalPgsIterations,
  setMaxCcdSubsteps,
  // Profiling
  setProfilerEnabled,
  getPhysicsTimings,
  FIXED_TIMESTEP,
  MAX_DELTA,
} from './world'
export type {PhysicsWorldState, PhysicsConfig, PhysicsTimings} from './world'

// Step function (runs all physics systems)
export {stepPhysics, getInterpolationAlpha} from './step'
export type {StepResult} from './step'

// Provider (React integration, optional)
export {PhysicsProvider, usePhysicsContext} from './provider'
export type {PhysicsProviderProps, PhysicsContextValue} from './provider'

// Hooks (React integration, optional)
export {usePhysicsUpdate, useRapierWorld} from './hooks'
export type {PhysicsStage} from './hooks'

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
  updateSleepStates,
} from './systems'

export {
  processCollisionEvents,
  processContactForceEvents,
  clearCollisionEvents,
} from './events'

// Scene queries (raycasting, shape casting)
export {
  castRay,
  castRayAndGetNormal,
  castShape,
  pointIntersection,
  projectPoint,
  QueryFilterFlags,
} from './queries'
export type {
  RaycastHit,
  RaycastOptions,
  ShapeCastHit,
  ShapeCastOptions,
} from './queries'

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

// Joints (imperative API)
export {
  // Joint creation
  createFixedJoint,
  createRevoluteJoint,
  createPrismaticJoint,
  createSphericalJoint,
  createRopeJoint,
  createSpringJoint,
  createGenericJoint,
  destroyJoint,
  // Motor configuration
  configureMotorVelocity,
  configureMotorPosition,
  configureMotor,
  setMotorModel,
  // Limit configuration
  setJointLimits,
  areLimitsEnabled,
  getJointLimits,
  // Anchor configuration
  setAnchor1,
  setAnchor2,
  getAnchor1,
  getAnchor2,
  // Contact control
  setContactsEnabled,
  areContactsEnabled,
  // Re-exported Rapier types
  JointAxesMask,
  MotorModel,
} from './joints'
export type {
  JointHandle,
  FixedJointOptions,
  RevoluteJointOptions,
  PrismaticJointOptions,
  SphericalJointOptions,
  RopeJointOptions,
  SpringJointOptions,
  GenericJointOptions,
} from './joints'

// Joint hooks (React integration)
export {
  useFixedJoint,
  useRevoluteJoint,
  usePrismaticJoint,
  useSphericalJoint,
  useRopeJoint,
  useSpringJoint,
  useGenericJoint,
} from './joint-hooks'
