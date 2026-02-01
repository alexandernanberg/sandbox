import {trait, relation} from 'koota'
import type {
  BufferGeometry,
  Material,
  Object3D,
  Color,
  Texture,
  Scene,
  Camera,
} from 'three'

// ============================================
// Geometry trait - describes 3D shape
// ============================================

export type GeometryDescriptor =
  | {type: 'box'; width: number; height: number; depth: number}
  | {type: 'sphere'; radius: number; widthSegments?: number; heightSegments?: number}
  | {type: 'capsule'; radius: number; length: number; capSegments?: number; radialSegments?: number}
  | {type: 'cylinder'; radiusTop: number; radiusBottom: number; height: number; radialSegments?: number}
  | {type: 'cone'; radius: number; height: number; radialSegments?: number}
  | {type: 'plane'; width: number; height: number}
  | {type: 'custom'; geometry: BufferGeometry}

export const Geometry = trait(() => ({
  descriptor: null as GeometryDescriptor | null,
  // Cached Three.js geometry (created by render system)
  _geometry: null as BufferGeometry | null,
}))

// ============================================
// Material trait - describes appearance
// ============================================

export type MaterialType = 'basic' | 'standard' | 'phong' | 'lambert'

export const MaterialComponent = trait(() => ({
  type: 'phong' as MaterialType,
  color: 0xffffff as number | string,
  emissive: 0x000000 as number | string,
  roughness: 0.5,
  metalness: 0,
  opacity: 1,
  transparent: false,
  wireframe: false,
  flatShading: false,
  // Map textures (paths or Texture objects)
  map: null as string | Texture | null,
  normalMap: null as string | Texture | null,
  // Cached Three.js material (created by render system)
  _material: null as Material | null,
}))

// ============================================
// Mesh trait - combines geometry + material
// ============================================

export const MeshComponent = trait(() => ({
  castShadow: true,
  receiveShadow: true,
  visible: true,
  renderOrder: 0,
  // Layer mask for camera culling
  layers: 1,
}))

// ============================================
// Scene graph traits
// ============================================

// The actual Three.js object (created by render system)
export const SceneNode = trait(() => ({
  object: null as Object3D | null,
  addedToScene: false,
  // Parent entity for hierarchy (null = root)
  parentEntity: null as number | null,
}))

// Local transform (relative to parent)
export const LocalTransform = trait(() => ({
  x: 0,
  y: 0,
  z: 0,
  rx: 0, // Euler rotation
  ry: 0,
  rz: 0,
  sx: 1, // Scale
  sy: 1,
  sz: 1,
}))

// Relation for scene hierarchy
export const SceneChildOf = relation()

// ============================================
// Camera traits
// ============================================

export const PerspectiveCameraComponent = trait(() => ({
  fov: 75,
  near: 0.1,
  far: 1000,
  active: false,
  _camera: null as Camera | null,
}))

// ============================================
// Light traits
// ============================================

export type LightType = 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere'

export const LightComponent = trait(() => ({
  type: 'point' as LightType,
  color: 0xffffff as number,
  intensity: 1,
  // Directional/Spot specific
  castShadow: false,
  shadowMapSize: 1024,
  // Point/Spot specific
  distance: 0,
  decay: 2,
  // Spot specific
  angle: Math.PI / 3,
  penumbra: 0,
  // Hemisphere specific
  groundColor: 0x444444 as number,
}))

// ============================================
// Render tags
// ============================================

// Entity needs its Three.js objects created
export const NeedsRenderSetup = trait()

// Entity's render state is dirty and needs sync
export const RenderDirty = trait()

// Entity is visible in scene
export const IsRenderable = trait()

// ============================================
// Scene management
// ============================================

// Singleton: holds the Three.js scene reference
export const SceneRef = trait(() => ({
  scene: null as Scene | null,
}))

// Singleton: render statistics
export const RenderStats = trait(() => ({
  meshCount: 0,
  drawCalls: 0,
  triangles: 0,
}))
