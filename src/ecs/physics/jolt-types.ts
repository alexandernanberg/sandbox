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
export type JoltCharacterContactListener = Jolt.CharacterContactListener

// Filter types
export type JoltBroadPhaseLayerFilter = Jolt.BroadPhaseLayerFilter
export type JoltObjectLayerFilter = Jolt.ObjectLayerFilter
export type JoltBodyFilter = Jolt.BodyFilter
export type JoltShapeFilter = Jolt.ShapeFilter
export type JoltObjectLayerPairFilter = Jolt.ObjectLayerPairFilter
export type JoltObjectVsBroadPhaseLayerFilter =
  Jolt.ObjectVsBroadPhaseLayerFilter
export type JoltBroadPhaseLayer = Jolt.BroadPhaseLayer

// Layer constants (our custom layers, not from Jolt)
export const LAYER_NON_MOVING = 0
export const LAYER_MOVING = 1
export const NUM_OBJECT_LAYERS = 2

export const BP_LAYER_NON_MOVING = 0
export const BP_LAYER_MOVING = 1
export const NUM_BROAD_PHASE_LAYERS = 2
