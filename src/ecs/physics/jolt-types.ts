// ============================================
// Jolt Physics Type Re-exports
// ============================================
// Re-export types from jolt-physics package

import type Jolt from 'jolt-physics'

// Re-export the Jolt module type
export type JoltModule = typeof Jolt

// Re-export commonly used types from jolt-physics
export type JoltVec3 = Jolt.Vec3
export type JoltRVec3 = Jolt.RVec3
export type JoltQuat = Jolt.Quat
export type JoltShape = Jolt.Shape
export type JoltBodyID = Jolt.BodyID
export type JoltBody = Jolt.Body
export type JoltBodyInterface = Jolt.BodyInterface
export type JoltBodyCreationSettings = Jolt.BodyCreationSettings
export type JoltPhysicsSystem = Jolt.PhysicsSystem
export type JoltTempAllocator = Jolt.TempAllocator
export type JoltCharacterVirtual = Jolt.CharacterVirtual
export type JoltCharacterVirtualSettings = Jolt.CharacterVirtualSettings
export type JoltInterface = Jolt.JoltInterface
export type JoltSettings = Jolt.JoltSettings
export type JoltExtendedUpdateSettings = Jolt.ExtendedUpdateSettings

// Filter types
export type JoltBroadPhaseLayerFilter = Jolt.BroadPhaseLayerFilter
export type JoltObjectLayerFilter = Jolt.ObjectLayerFilter
export type JoltBodyFilter = Jolt.BodyFilter
export type JoltShapeFilter = Jolt.ShapeFilter
export type JoltObjectLayerPairFilter = Jolt.ObjectLayerPairFilter
export type JoltObjectVsBroadPhaseLayerFilter =
  Jolt.ObjectVsBroadPhaseLayerFilter
export type JoltBroadPhaseLayer = Jolt.BroadPhaseLayer

// Layer constants
export const LAYER_NON_MOVING = 0
export const LAYER_MOVING = 1
export const NUM_OBJECT_LAYERS = 2

export const BP_LAYER_NON_MOVING = 0
export const BP_LAYER_MOVING = 1
export const NUM_BROAD_PHASE_LAYERS = 2

// Motion type enum values (match Jolt.EMotionType_*)
export const MOTION_TYPE_STATIC = 0
export const MOTION_TYPE_KINEMATIC = 1
export const MOTION_TYPE_DYNAMIC = 2

// Activation enum (match Jolt.EActivation_*)
export const ACTIVATION_ACTIVATE = 0
export const ACTIVATION_DONT_ACTIVATE = 1

// Ground state enum (match Jolt.EGroundState_*)
export const GROUND_STATE_ON_GROUND = 0
export const GROUND_STATE_ON_STEEP_GROUND = 1
export const GROUND_STATE_NOT_SUPPORTED = 2
export const GROUND_STATE_IN_AIR = 3

// Motion quality (match Jolt.EMotionQuality_*)
export const MOTION_QUALITY_DISCRETE = 0
export const MOTION_QUALITY_LINEAR_CAST = 1

// Back face mode (match Jolt.EBackFaceMode_*)
export const BACK_FACE_MODE_IGNORE = 0
export const BACK_FACE_MODE_COLLIDE = 1
