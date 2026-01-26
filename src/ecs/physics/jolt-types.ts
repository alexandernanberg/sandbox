// ============================================
// Jolt Physics Type Definitions
// ============================================
// The jolt-physics package mirrors the C++ API
// These types help with TypeScript integration

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type JoltModule = any

export interface JoltVec3 {
  GetX(): number
  GetY(): number
  GetZ(): number
  Set(x: number, y: number, z: number): void
}

export interface JoltQuat {
  GetX(): number
  GetY(): number
  GetZ(): number
  GetW(): number
  Set(x: number, y: number, z: number, w: number): void
}

export interface JoltRVec3 {
  GetX(): number
  GetY(): number
  GetZ(): number
}

export interface JoltShape {
  GetSubType(): number
  AddRef(): void
  Release(): void
}

export interface JoltBodyID {
  GetIndex(): number
  GetIndexAndSequenceNumber(): number
  IsInvalid(): boolean
}

export interface JoltBody {
  GetID(): JoltBodyID
  GetPosition(): JoltRVec3
  GetRotation(): JoltQuat
  GetLinearVelocity(): JoltVec3
  GetAngularVelocity(): JoltVec3
  SetLinearVelocity(vel: JoltVec3): void
  SetAngularVelocity(vel: JoltVec3): void
  IsActive(): boolean
  IsDynamic(): boolean
  IsKinematic(): boolean
  IsStatic(): boolean
  GetMotionType(): number
  SetMotionType(type: number): void
  GetShape(): JoltShape
  GetWorldSpaceBounds(): JoltAABox
  GetUserData(): number
  SetUserData(data: number): void
}

export interface JoltAABox {
  mMin: JoltVec3
  mMax: JoltVec3
}

export interface JoltBodyInterface {
  CreateBody(settings: JoltBodyCreationSettings): JoltBody
  AddBody(bodyId: JoltBodyID, activation: number): void
  RemoveBody(bodyId: JoltBodyID): void
  DestroyBody(bodyId: JoltBodyID): void
  GetBodyIDs(outBodyIDs: unknown): void
  GetLinearVelocity(bodyId: JoltBodyID): JoltVec3
  SetLinearVelocity(bodyId: JoltBodyID, vel: JoltVec3): void
  GetAngularVelocity(bodyId: JoltBodyID): JoltVec3
  SetAngularVelocity(bodyId: JoltBodyID, vel: JoltVec3): void
  GetPosition(bodyId: JoltBodyID): JoltRVec3
  SetPosition(bodyId: JoltBodyID, pos: JoltRVec3, activation: number): void
  GetRotation(bodyId: JoltBodyID): JoltQuat
  SetRotation(bodyId: JoltBodyID, rot: JoltQuat, activation: number): void
  SetPositionAndRotation(
    bodyId: JoltBodyID,
    pos: JoltRVec3,
    rot: JoltQuat,
    activation: number,
  ): void
  MoveKinematic(
    bodyId: JoltBodyID,
    targetPos: JoltRVec3,
    targetRot: JoltQuat,
    deltaTime: number,
  ): void
  AddImpulse(bodyId: JoltBodyID, impulse: JoltVec3): void
  AddImpulseAtPoint(
    bodyId: JoltBodyID,
    impulse: JoltVec3,
    point: JoltRVec3,
  ): void
  IsActive(bodyId: JoltBodyID): boolean
  ActivateBody(bodyId: JoltBodyID): void
  DeactivateBody(bodyId: JoltBodyID): void
}

export interface JoltBodyCreationSettings {
  mPosition: JoltRVec3
  mRotation: JoltQuat
  mMotionType: number
  mObjectLayer: number
  mLinearVelocity: JoltVec3
  mAngularVelocity: JoltVec3
  mLinearDamping: number
  mAngularDamping: number
  mGravityFactor: number
  mMotionQuality: number
  mAllowSleeping: boolean
  mFriction: number
  mRestitution: number
  mIsSensor: boolean
  mUserData: number
}

export interface JoltCharacterVirtualSettings {
  mUp: JoltVec3
  mSupportingVolume: unknown
  mMaxSlopeAngle: number
  mMass: number
  mMaxStrength: number
  mShape: JoltShape
  mBackFaceMode: number
  mCharacterPadding: number
  mPenetrationRecoverySpeed: number
  mPredictiveContactDistance: number
  mEnhancedInternalEdgeRemoval: boolean
  mInnerBodyShape: JoltShape | null
  mInnerBodyLayer: number
}

export interface JoltCharacterVirtual {
  GetPosition(): JoltRVec3
  SetPosition(pos: JoltRVec3): void
  GetRotation(): JoltQuat
  SetRotation(rot: JoltQuat): void
  GetLinearVelocity(): JoltVec3
  SetLinearVelocity(vel: JoltVec3): void
  GetUp(): JoltVec3
  SetUp(up: JoltVec3): void
  GetGroundState(): number
  GetGroundNormal(): JoltVec3
  GetGroundVelocity(): JoltVec3
  GetGroundPosition(): JoltRVec3
  GetGroundBodyID(): JoltBodyID
  IsSlopeTooSteep(normal: JoltVec3): boolean
  GetShape(): JoltShape
  SetShape(
    shape: JoltShape,
    maxPenetrationDepth: number,
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
    shapeFilter: unknown,
    allocator: unknown,
  ): boolean
  RefreshContacts(
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
    shapeFilter: unknown,
    allocator: unknown,
  ): void
  Update(
    deltaTime: number,
    gravity: JoltVec3,
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
    shapeFilter: unknown,
    allocator: unknown,
  ): void
  ExtendedUpdate(
    deltaTime: number,
    gravity: JoltVec3,
    settings: JoltExtendedUpdateSettings,
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
    shapeFilter: unknown,
    allocator: unknown,
  ): void
  CancelVelocityTowardsSteepSlopes(desiredVelocity: JoltVec3): JoltVec3
  GetCenterOfMassPosition(): JoltRVec3
  GetMass(): number
  SetMass(mass: number): void
}

export interface JoltExtendedUpdateSettings {
  mStickToFloorStepDown: JoltVec3
  mWalkStairsStepUp: JoltVec3
  mWalkStairsMinStepForward: number
  mWalkStairsStepForwardTest: number
  mWalkStairsCosAngleForwardContact: number
  mWalkStairsStepDownExtra: JoltVec3
}

export interface JoltNarrowPhaseQuery {
  CastRay(
    ray: JoltRRayCast,
    hit: JoltRayCastResult,
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
  ): boolean
  CastShape(
    shape: JoltShape,
    start: JoltRMat44,
    direction: JoltVec3,
    settings: JoltShapeCastSettings,
    baseOffset: JoltRVec3,
    collector: unknown,
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
    shapeFilter: unknown,
  ): void
  CollideShape(
    shape: JoltShape,
    scale: JoltVec3,
    position: JoltRMat44,
    settings: JoltCollideShapeSettings,
    baseOffset: JoltRVec3,
    collector: unknown,
    broadPhaseLayerFilter: unknown,
    objectLayerFilter: unknown,
    bodyFilter: unknown,
    shapeFilter: unknown,
  ): void
}

export interface JoltRRayCast {
  mOrigin: JoltRVec3
  mDirection: JoltVec3
}

export interface JoltRayCastResult {
  mBodyID: JoltBodyID
  mFraction: number
  mSubShapeID2: unknown
}

export interface JoltRMat44 {
  SetTranslation(translation: JoltRVec3): void
  SetRotation(rotation: JoltQuat): void
}

export interface JoltShapeCastSettings {
  mBackFaceModeTriangles: number
  mBackFaceModeConvex: number
  mUseShrunkenShapeAndConvexRadius: boolean
  mActiveEdgeMode: number
  mCollectFacesMode: number
  mCollisionTolerance: number
  mPenetrationTolerance: number
  mReturnDeepestPoint: boolean
}

export interface JoltCollideShapeSettings {
  mBackFaceMode: number
  mActiveEdgeMode: number
  mCollectFacesMode: number
  mCollisionTolerance: number
  mPenetrationTolerance: number
  mMaxSeparationDistance: number
}

// JoltSettings for simplified JS API initialization
export interface JoltSettings {
  mMaxWorkerThreads: number
  mMaxBodies: number
  mMaxBodyPairs: number
  mMaxContactConstraints: number
  mTempAllocatorSize: number
}

// JoltInterface - simplified JS API wrapper
export interface JoltInterface {
  GetPhysicsSystem(): JoltPhysicsSystem
  GetTempAllocator(): JoltTempAllocator
  Step(deltaTime: number, collisionSteps: number): number
  SetGravity(gravity: JoltVec3): void
  GetGravity(): JoltVec3
}

export interface JoltPhysicsSystem {
  Init(
    maxBodies: number,
    numBodyMutexes: number,
    maxBodyPairs: number,
    maxContactConstraints: number,
    broadPhaseLayerInterface: unknown,
    objectVsBroadPhaseLayerFilter: unknown,
    objectLayerPairFilter: unknown,
  ): void
  GetBodyInterface(): JoltBodyInterface
  GetBodyInterfaceNoLock(): JoltBodyInterface
  GetBodyLockInterface(): unknown
  GetNarrowPhaseQuery(): JoltNarrowPhaseQuery
  GetNarrowPhaseQueryNoLock(): JoltNarrowPhaseQuery
  GetBodies(): unknown
  GetNumBodies(): number
  GetNumActiveBodies(type: number): number
  GetMaxBodies(): number
  GetGravity(): JoltVec3
  SetGravity(gravity: JoltVec3): void
  Update(
    deltaTime: number,
    collisionSteps: number,
    tempAllocator: JoltTempAllocator,
    jobSystem: JoltJobSystem,
  ): number
  OptimizeBroadPhase(): void
  SetContactListener(listener: unknown): void
  SetBodyActivationListener(listener: unknown): void
  GetObjectVsBroadPhaseLayerFilter(): unknown
  GetObjectLayerPairFilter(): unknown
}

export interface JoltTempAllocator {
  // Opaque handle
}

export interface JoltJobSystem {
  // Opaque handle
}

export interface JoltContactSettings {
  mCombinedFriction: number
  mCombinedRestitution: number
  mInvMassScale1: number
  mInvMassScale2: number
  mInvInertiaScale1: number
  mInvInertiaScale2: number
  mIsSensor: boolean
  mRelativeLinearSurfaceVelocity: JoltVec3
  mRelativeAngularSurfaceVelocity: JoltVec3
}

export interface JoltContactManifold {
  mBaseOffset: JoltRVec3
  mWorldSpaceNormal: JoltVec3
  mPenetrationDepth: number
  mSubShapeID1: unknown
  mSubShapeID2: unknown
  mRelativeContactPointsOn1: unknown
  mRelativeContactPointsOn2: unknown
}

// Layer constants
export const LAYER_NON_MOVING = 0
export const LAYER_MOVING = 1
export const NUM_OBJECT_LAYERS = 2

export const BP_LAYER_NON_MOVING = 0
export const BP_LAYER_MOVING = 1
export const NUM_BROAD_PHASE_LAYERS = 2

// Motion type enum values
export const MOTION_TYPE_STATIC = 0
export const MOTION_TYPE_KINEMATIC = 1
export const MOTION_TYPE_DYNAMIC = 2

// Activation enum
export const ACTIVATION_ACTIVATE = 0
export const ACTIVATION_DONT_ACTIVATE = 1

// Ground state enum
export const GROUND_STATE_ON_GROUND = 0
export const GROUND_STATE_ON_STEEP_GROUND = 1
export const GROUND_STATE_NOT_SUPPORTED = 2
export const GROUND_STATE_IN_AIR = 3

// Motion quality
export const MOTION_QUALITY_DISCRETE = 0
export const MOTION_QUALITY_LINEAR_CAST = 1

// Back face mode
export const BACK_FACE_MODE_IGNORE = 0
export const BACK_FACE_MODE_COLLIDE = 1

// Active edge mode
export const ACTIVE_EDGE_MODE_ONLY_ACTIVE = 0
export const ACTIVE_EDGE_MODE_ALL = 1

// Collect faces mode
export const COLLECT_FACES_MODE_NO_FACES = 0
export const COLLECT_FACES_MODE_COLLECT_FACES = 1
