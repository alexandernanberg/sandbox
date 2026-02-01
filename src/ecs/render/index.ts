// Traits
export {
  Geometry,
  MaterialComponent,
  MeshComponent,
  SceneNode,
  LocalTransform,
  SceneChildOf,
  PerspectiveCameraComponent,
  LightComponent,
  NeedsRenderSetup,
  RenderDirty,
  IsRenderable,
  SceneRef,
  RenderStats,
  type GeometryDescriptor,
  type MaterialType,
  type LightType,
} from './traits'

// Systems
export {
  renderSetupSystem,
  renderSyncSystem,
  renderCleanupSystem,
  renderUpdate,
  type RenderContext,
} from './systems'

// Prefabs
export {
  spawnMesh,
  spawnRigidBody,
  spawnStaticBody,
  spawnKinematicBody,
  spawnLight,
  prefab,
  type TransformOptions,
  type PhysicsBodyOptions,
  type ColliderOptions,
  type MeshOptions,
} from './prefabs'

// React integration (minimal)
export {GameCanvas, type GameCanvasProps, type GameContext} from './game-canvas'
