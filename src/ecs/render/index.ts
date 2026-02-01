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

// Environment & Lighting
export {
  // Traits
  Light,
  AmbientLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  HemisphereLight,
  RectAreaLight,
  LightRef,
  Environment,
  Fog,
  PostProcessing,
  ComposerRef,
  // Systems
  lightSetupSystem,
  environmentSetupSystem,
  setupPostProcessing,
  // Spawners
  spawnAmbientLight,
  spawnDirectionalLight,
  spawnPointLight,
  spawnSpotLight,
  setupEnvironment,
  setupPostProcessingConfig,
} from './environment'

// Game runner (vanilla - no React)
export {Game, type GameConfig} from './game'

// React integration (minimal wrapper)
export {GameCanvas, type GameCanvasProps, type GameContext} from './game-canvas'
