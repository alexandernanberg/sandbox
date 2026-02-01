import type {World} from 'koota'
import * as THREE from 'three'
import {
  Geometry,
  MaterialComponent,
  MeshComponent,
  SceneNode,
  LocalTransform,
  LightComponent,
  NeedsRenderSetup,
  IsRenderable,
  SceneRef,
  type GeometryDescriptor,
  type MaterialType,
  type LightType,
} from './traits'
import {RenderTransform} from '../physics/traits'

// ============================================
// Geometry factory
// ============================================

function createGeometry(descriptor: GeometryDescriptor): THREE.BufferGeometry {
  switch (descriptor.type) {
    case 'box':
      return new THREE.BoxGeometry(
        descriptor.width,
        descriptor.height,
        descriptor.depth,
      )
    case 'sphere':
      return new THREE.SphereGeometry(
        descriptor.radius,
        descriptor.widthSegments ?? 32,
        descriptor.heightSegments ?? 16,
      )
    case 'capsule':
      return new THREE.CapsuleGeometry(
        descriptor.radius,
        descriptor.length,
        descriptor.capSegments ?? 4,
        descriptor.radialSegments ?? 8,
      )
    case 'cylinder':
      return new THREE.CylinderGeometry(
        descriptor.radiusTop,
        descriptor.radiusBottom,
        descriptor.height,
        descriptor.radialSegments ?? 32,
      )
    case 'cone':
      return new THREE.ConeGeometry(
        descriptor.radius,
        descriptor.height,
        descriptor.radialSegments ?? 32,
      )
    case 'plane':
      return new THREE.PlaneGeometry(descriptor.width, descriptor.height)
    case 'custom':
      return descriptor.geometry
  }
}

// ============================================
// Material factory
// ============================================

function createMaterial(
  type: MaterialType,
  props: {
    color: number | string
    emissive?: number | string
    roughness?: number
    metalness?: number
    opacity?: number
    transparent?: boolean
    wireframe?: boolean
    flatShading?: boolean
  },
): THREE.Material {
  const baseProps = {
    color: props.color,
    opacity: props.opacity ?? 1,
    transparent: props.transparent ?? false,
    wireframe: props.wireframe ?? false,
  }

  switch (type) {
    case 'basic':
      return new THREE.MeshBasicMaterial(baseProps)
    case 'lambert':
      return new THREE.MeshLambertMaterial({
        ...baseProps,
        emissive: props.emissive,
        flatShading: props.flatShading,
      })
    case 'phong':
      return new THREE.MeshPhongMaterial({
        ...baseProps,
        emissive: props.emissive,
        flatShading: props.flatShading,
      })
    case 'standard':
      return new THREE.MeshStandardMaterial({
        ...baseProps,
        emissive: props.emissive,
        roughness: props.roughness ?? 0.5,
        metalness: props.metalness ?? 0,
        flatShading: props.flatShading,
      })
  }
}

// ============================================
// Light factory
// ============================================

function createLight(
  type: LightType,
  props: {
    color: number
    intensity: number
    castShadow?: boolean
    distance?: number
    decay?: number
    angle?: number
    penumbra?: number
    groundColor?: number
  },
): THREE.Light {
  switch (type) {
    case 'ambient':
      return new THREE.AmbientLight(props.color, props.intensity)
    case 'directional': {
      const light = new THREE.DirectionalLight(props.color, props.intensity)
      light.castShadow = props.castShadow ?? false
      return light
    }
    case 'point': {
      const light = new THREE.PointLight(
        props.color,
        props.intensity,
        props.distance ?? 0,
        props.decay ?? 2,
      )
      light.castShadow = props.castShadow ?? false
      return light
    }
    case 'spot': {
      const light = new THREE.SpotLight(
        props.color,
        props.intensity,
        props.distance ?? 0,
        props.angle ?? Math.PI / 3,
        props.penumbra ?? 0,
        props.decay ?? 2,
      )
      light.castShadow = props.castShadow ?? false
      return light
    }
    case 'hemisphere':
      return new THREE.HemisphereLight(
        props.color,
        props.groundColor ?? 0x444444,
        props.intensity,
      )
  }
}

// ============================================
// Render setup system
// ============================================

/**
 * Creates Three.js objects for entities that need render setup.
 * Runs once per entity when NeedsRenderSetup is present.
 */
export function renderSetupSystem(world: World, scene: THREE.Scene): void {
  // Process entities that need mesh setup
  const meshEntities = world.query(
    NeedsRenderSetup,
    Geometry,
    MaterialComponent,
    MeshComponent,
  )

  for (const entity of meshEntities) {
    const geo = entity.get(Geometry)
    const mat = entity.get(MaterialComponent)
    const meshComp = entity.get(MeshComponent)

    if (!geo.descriptor) continue

    // Create geometry if not cached
    if (!geo._geometry) {
      const geometry = createGeometry(geo.descriptor)
      entity.set(Geometry, (g) => {
        g._geometry = geometry
        return g
      })
    }

    // Create material if not cached
    if (!mat._material) {
      const material = createMaterial(mat.type, {
        color: mat.color,
        emissive: mat.emissive,
        roughness: mat.roughness,
        metalness: mat.metalness,
        opacity: mat.opacity,
        transparent: mat.transparent,
        wireframe: mat.wireframe,
        flatShading: mat.flatShading,
      })
      entity.set(MaterialComponent, (m) => {
        m._material = material
        return m
      })
    }

    // Create mesh
    const mesh = new THREE.Mesh(geo._geometry!, mat._material!)
    mesh.castShadow = meshComp.castShadow
    mesh.receiveShadow = meshComp.receiveShadow
    mesh.visible = meshComp.visible
    mesh.renderOrder = meshComp.renderOrder
    mesh.layers.mask = meshComp.layers

    // Add SceneNode trait
    if (!entity.has(SceneNode)) {
      entity.add(SceneNode({object: mesh, addedToScene: false}))
    } else {
      entity.set(SceneNode, (n) => {
        n.object = mesh
        return n
      })
    }

    // Mark as renderable, remove setup flag
    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }

  // Process entities that need light setup
  const lightEntities = world.query(NeedsRenderSetup, LightComponent)

  for (const entity of lightEntities) {
    const light = entity.get(LightComponent)

    const lightObj = createLight(light.type, {
      color: light.color,
      intensity: light.intensity,
      castShadow: light.castShadow,
      distance: light.distance,
      decay: light.decay,
      angle: light.angle,
      penumbra: light.penumbra,
      groundColor: light.groundColor,
    })

    if (!entity.has(SceneNode)) {
      entity.add(SceneNode({object: lightObj, addedToScene: false}))
    } else {
      entity.set(SceneNode, (n) => {
        n.object = lightObj
        return n
      })
    }

    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }
}

// ============================================
// Scene graph sync system
// ============================================

/**
 * Adds new objects to scene and syncs transforms.
 */
export function renderSyncSystem(world: World, scene: THREE.Scene): void {
  const renderables = world.query(IsRenderable, SceneNode)

  for (const entity of renderables) {
    const node = entity.get(SceneNode)
    if (!node.object) continue

    // Add to scene if not already
    if (!node.addedToScene) {
      scene.add(node.object)
      entity.set(SceneNode, (n) => {
        n.addedToScene = true
        return n
      })
    }

    // Sync transform from physics (if entity has RenderTransform)
    if (entity.has(RenderTransform)) {
      const transform = entity.get(RenderTransform)
      node.object.position.set(transform.x, transform.y, transform.z)
      node.object.quaternion.set(
        transform.qx,
        transform.qy,
        transform.qz,
        transform.qw,
      )
    }
    // Or sync from local transform (for static/non-physics entities)
    else if (entity.has(LocalTransform)) {
      const local = entity.get(LocalTransform)
      node.object.position.set(local.x, local.y, local.z)
      node.object.rotation.set(local.rx, local.ry, local.rz)
      node.object.scale.set(local.sx, local.sy, local.sz)
    }
  }
}

// ============================================
// Cleanup system
// ============================================

/**
 * Removes objects from scene when entities are destroyed.
 * Call this with destroyed entity list or use world events.
 */
export function renderCleanupSystem(
  world: World,
  scene: THREE.Scene,
  destroyedEntities: Set<number>,
): void {
  // This would be called with entities that were destroyed
  // In practice, you'd hook into world.onEntityDestroyed or similar
  // For now, we'll check SceneNode entities and remove orphaned objects
}

// ============================================
// Render loop integration
// ============================================

export interface RenderContext {
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
}

/**
 * Main render update - call each frame after physics.
 */
export function renderUpdate(world: World, ctx: RenderContext): void {
  renderSetupSystem(world, ctx.scene)
  renderSyncSystem(world, ctx.scene)
}
