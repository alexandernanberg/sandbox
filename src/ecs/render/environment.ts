/**
 * Environment, Lighting, and Post-Processing Traits & Systems
 *
 * Handles:
 * - Lights (ambient, directional, point, spot, hemisphere)
 * - Shadows configuration
 * - Environment maps / skybox
 * - Fog
 * - Post-processing (bloom, SSAO, tone mapping)
 */

import {trait} from 'koota'
import type {World} from 'koota'
import * as THREE from 'three'
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js'
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js'
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {SMAAPass} from 'three/examples/jsm/postprocessing/SMAAPass.js'
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js'
import {LocalTransform, SceneNode, NeedsRenderSetup, IsRenderable} from './traits'

// ============================================
// Light Traits
// ============================================

/** Base light properties shared by all light types */
export const Light = trait(() => ({
  color: 0xffffff,
  intensity: 1,
}))

/** Ambient light - uniform lighting from all directions */
export const AmbientLight = trait()

/** Directional light - parallel rays like the sun */
export const DirectionalLight = trait(() => ({
  castShadow: false,
  // Shadow camera bounds
  shadowCameraLeft: -10,
  shadowCameraRight: 10,
  shadowCameraTop: 10,
  shadowCameraBottom: -10,
  shadowCameraNear: 0.5,
  shadowCameraFar: 50,
  shadowMapSize: 2048,
  shadowBias: -0.0001,
  // Target position
  targetX: 0,
  targetY: 0,
  targetZ: 0,
}))

/** Point light - emits in all directions from a point */
export const PointLight = trait(() => ({
  distance: 0, // 0 = infinite
  decay: 2,
  castShadow: false,
  shadowMapSize: 512,
  shadowBias: -0.001,
}))

/** Spot light - cone of light */
export const SpotLight = trait(() => ({
  distance: 0,
  decay: 2,
  angle: Math.PI / 6, // Outer cone angle
  penumbra: 0, // Soft edge (0-1)
  castShadow: false,
  shadowMapSize: 512,
  shadowBias: -0.001,
  targetX: 0,
  targetY: 0,
  targetZ: 0,
}))

/** Hemisphere light - sky/ground gradient */
export const HemisphereLight = trait(() => ({
  groundColor: 0x444444,
}))

/** Rect area light - rectangular light source */
export const RectAreaLight = trait(() => ({
  width: 10,
  height: 10,
}))

// Runtime light reference
export const LightRef = trait(() => ({
  light: null as THREE.Light | null,
}))

// ============================================
// Environment Traits
// ============================================

/** Skybox/environment map */
export const Environment = trait(() => ({
  // Can be: 'color' | 'gradient' | 'hdri' | 'cubemap'
  type: 'color' as 'color' | 'gradient' | 'hdri' | 'cubemap',
  // For color type
  color: 0x87ceeb,
  // For gradient type
  topColor: 0x0077ff,
  bottomColor: 0xffffff,
  // For hdri/cubemap type
  path: null as string | null,
  // Apply as scene environment (affects PBR materials)
  asEnvironment: true,
  // Apply as scene background
  asBackground: true,
  // Environment intensity
  envIntensity: 1,
}))

/** Fog configuration */
export const Fog = trait(() => ({
  type: 'linear' as 'linear' | 'exponential',
  color: 0xffffff,
  // Linear fog
  near: 10,
  far: 100,
  // Exponential fog
  density: 0.01,
}))

// ============================================
// Post-Processing Traits
// ============================================

/** Global post-processing configuration (singleton) */
export const PostProcessing = trait(() => ({
  enabled: true,
  // Bloom
  bloomEnabled: false,
  bloomStrength: 1.0,
  bloomRadius: 0.4,
  bloomThreshold: 0.8,
  // Anti-aliasing
  antialiasType: 'smaa' as 'none' | 'smaa' | 'fxaa',
  // Tone mapping (handled by renderer, not post-processing)
  toneMapping: 'aces' as 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces',
  exposure: 1.0,
  // Vignette
  vignetteEnabled: false,
  vignetteOffset: 1.0,
  vignetteDarkness: 1.0,
}))

// Runtime composer reference
export const ComposerRef = trait(() => ({
  composer: null as EffectComposer | null,
}))

// ============================================
// Light Setup System
// ============================================

export function lightSetupSystem(world: World, scene: THREE.Scene): void {
  // Ambient lights
  for (const entity of world.query(NeedsRenderSetup, Light, AmbientLight)) {
    const {color, intensity} = entity.get(Light)
    const light = new THREE.AmbientLight(color, intensity)

    entity.add(LightRef({light}))
    entity.add(SceneNode({object: light, addedToScene: false}))
    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }

  // Directional lights
  for (const entity of world.query(NeedsRenderSetup, Light, DirectionalLight)) {
    const base = entity.get(Light)
    const dir = entity.get(DirectionalLight)
    const light = new THREE.DirectionalLight(base.color, base.intensity)

    light.castShadow = dir.castShadow
    if (dir.castShadow) {
      light.shadow.mapSize.width = dir.shadowMapSize
      light.shadow.mapSize.height = dir.shadowMapSize
      light.shadow.camera.left = dir.shadowCameraLeft
      light.shadow.camera.right = dir.shadowCameraRight
      light.shadow.camera.top = dir.shadowCameraTop
      light.shadow.camera.bottom = dir.shadowCameraBottom
      light.shadow.camera.near = dir.shadowCameraNear
      light.shadow.camera.far = dir.shadowCameraFar
      light.shadow.bias = dir.shadowBias
    }
    light.target.position.set(dir.targetX, dir.targetY, dir.targetZ)
    scene.add(light.target) // Target needs to be in scene

    entity.add(LightRef({light}))
    entity.add(SceneNode({object: light, addedToScene: false}))
    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }

  // Point lights
  for (const entity of world.query(NeedsRenderSetup, Light, PointLight)) {
    const base = entity.get(Light)
    const point = entity.get(PointLight)
    const light = new THREE.PointLight(
      base.color,
      base.intensity,
      point.distance,
      point.decay,
    )

    light.castShadow = point.castShadow
    if (point.castShadow) {
      light.shadow.mapSize.width = point.shadowMapSize
      light.shadow.mapSize.height = point.shadowMapSize
      light.shadow.bias = point.shadowBias
    }

    entity.add(LightRef({light}))
    entity.add(SceneNode({object: light, addedToScene: false}))
    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }

  // Spot lights
  for (const entity of world.query(NeedsRenderSetup, Light, SpotLight)) {
    const base = entity.get(Light)
    const spot = entity.get(SpotLight)
    const light = new THREE.SpotLight(
      base.color,
      base.intensity,
      spot.distance,
      spot.angle,
      spot.penumbra,
      spot.decay,
    )

    light.castShadow = spot.castShadow
    if (spot.castShadow) {
      light.shadow.mapSize.width = spot.shadowMapSize
      light.shadow.mapSize.height = spot.shadowMapSize
      light.shadow.bias = spot.shadowBias
    }
    light.target.position.set(spot.targetX, spot.targetY, spot.targetZ)
    scene.add(light.target)

    entity.add(LightRef({light}))
    entity.add(SceneNode({object: light, addedToScene: false}))
    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }

  // Hemisphere lights
  for (const entity of world.query(NeedsRenderSetup, Light, HemisphereLight)) {
    const base = entity.get(Light)
    const hemi = entity.get(HemisphereLight)
    const light = new THREE.HemisphereLight(
      base.color,
      hemi.groundColor,
      base.intensity,
    )

    entity.add(LightRef({light}))
    entity.add(SceneNode({object: light, addedToScene: false}))
    entity.add(IsRenderable)
    entity.remove(NeedsRenderSetup)
  }
}

// ============================================
// Environment Setup System
// ============================================

export function environmentSetupSystem(world: World, scene: THREE.Scene): void {
  // Find environment entity (singleton pattern)
  const envEntities = world.query(Environment)
  if (envEntities.length === 0) return

  const entity = envEntities[0]
  const env = entity.get(Environment)

  switch (env.type) {
    case 'color':
      if (env.asBackground) {
        scene.background = new THREE.Color(env.color)
      }
      break

    case 'gradient': {
      // Create gradient texture
      const canvas = document.createElement('canvas')
      canvas.width = 2
      canvas.height = 256
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createLinearGradient(0, 0, 0, 256)
      gradient.addColorStop(0, new THREE.Color(env.topColor).getStyle())
      gradient.addColorStop(1, new THREE.Color(env.bottomColor).getStyle())
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 2, 256)

      const texture = new THREE.CanvasTexture(canvas)
      texture.mapping = THREE.EquirectangularReflectionMapping
      if (env.asBackground) {
        scene.background = texture
      }
      break
    }

    case 'hdri':
    case 'cubemap':
      // Would load texture asynchronously
      // For now, just set color fallback
      scene.background = new THREE.Color(env.color)
      break
  }

  // Fog
  const fogEntities = world.query(Fog)
  if (fogEntities.length > 0) {
    const fog = fogEntities[0].get(Fog)
    if (fog.type === 'linear') {
      scene.fog = new THREE.Fog(fog.color, fog.near, fog.far)
    } else {
      scene.fog = new THREE.FogExp2(fog.color, fog.density)
    }
  }
}

// ============================================
// Post-Processing Setup
// ============================================

export function setupPostProcessing(
  world: World,
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): EffectComposer | null {
  const ppEntities = world.query(PostProcessing)
  if (ppEntities.length === 0) return null

  const pp = ppEntities[0].get(PostProcessing)
  if (!pp.enabled) return null

  // Set up tone mapping on renderer
  switch (pp.toneMapping) {
    case 'none':
      renderer.toneMapping = THREE.NoToneMapping
      break
    case 'linear':
      renderer.toneMapping = THREE.LinearToneMapping
      break
    case 'reinhard':
      renderer.toneMapping = THREE.ReinhardToneMapping
      break
    case 'cineon':
      renderer.toneMapping = THREE.CineonToneMapping
      break
    case 'aces':
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      break
  }
  renderer.toneMappingExposure = pp.exposure

  // If only tone mapping, no composer needed
  if (!pp.bloomEnabled && pp.antialiasType === 'none') {
    return null
  }

  // Create composer
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  // Bloom
  if (pp.bloomEnabled) {
    const size = renderer.getSize(new THREE.Vector2())
    const bloomPass = new UnrealBloomPass(
      size,
      pp.bloomStrength,
      pp.bloomRadius,
      pp.bloomThreshold,
    )
    composer.addPass(bloomPass)
  }

  // Anti-aliasing
  if (pp.antialiasType === 'smaa') {
    const size = renderer.getSize(new THREE.Vector2())
    const smaaPass = new SMAAPass(size.x, size.y)
    composer.addPass(smaaPass)
  }

  // Output pass (gamma correction)
  composer.addPass(new OutputPass())

  return composer
}

// ============================================
// Spawners
// ============================================

export function spawnAmbientLight(
  world: World,
  color: number = 0xffffff,
  intensity: number = 0.5,
) {
  return world.spawn(
    NeedsRenderSetup,
    Light({color, intensity}),
    AmbientLight,
  )
}

export function spawnDirectionalLight(
  world: World,
  options: {
    color?: number
    intensity?: number
    position?: [number, number, number]
    target?: [number, number, number]
    castShadow?: boolean
    shadowMapSize?: number
  } = {},
) {
  const pos = options.position ?? [10, 20, 10]
  const target = options.target ?? [0, 0, 0]

  return world.spawn(
    NeedsRenderSetup,
    Light({
      color: options.color ?? 0xffffff,
      intensity: options.intensity ?? 1,
    }),
    DirectionalLight({
      castShadow: options.castShadow ?? true,
      shadowMapSize: options.shadowMapSize ?? 2048,
      targetX: target[0],
      targetY: target[1],
      targetZ: target[2],
    }),
    LocalTransform({x: pos[0], y: pos[1], z: pos[2]}),
  )
}

export function spawnPointLight(
  world: World,
  options: {
    color?: number
    intensity?: number
    position?: [number, number, number]
    distance?: number
    decay?: number
    castShadow?: boolean
  } = {},
) {
  const pos = options.position ?? [0, 5, 0]

  return world.spawn(
    NeedsRenderSetup,
    Light({
      color: options.color ?? 0xffffff,
      intensity: options.intensity ?? 1,
    }),
    PointLight({
      distance: options.distance ?? 0,
      decay: options.decay ?? 2,
      castShadow: options.castShadow ?? false,
    }),
    LocalTransform({x: pos[0], y: pos[1], z: pos[2]}),
  )
}

export function spawnSpotLight(
  world: World,
  options: {
    color?: number
    intensity?: number
    position?: [number, number, number]
    target?: [number, number, number]
    angle?: number
    penumbra?: number
    distance?: number
    castShadow?: boolean
  } = {},
) {
  const pos = options.position ?? [0, 10, 0]
  const target = options.target ?? [0, 0, 0]

  return world.spawn(
    NeedsRenderSetup,
    Light({
      color: options.color ?? 0xffffff,
      intensity: options.intensity ?? 1,
    }),
    SpotLight({
      angle: options.angle ?? Math.PI / 6,
      penumbra: options.penumbra ?? 0.1,
      distance: options.distance ?? 0,
      castShadow: options.castShadow ?? true,
      targetX: target[0],
      targetY: target[1],
      targetZ: target[2],
    }),
    LocalTransform({x: pos[0], y: pos[1], z: pos[2]}),
  )
}

export function setupEnvironment(
  world: World,
  options: {
    backgroundColor?: number
    fog?: {near: number; far: number; color?: number}
  } = {},
) {
  world.spawn(
    Environment({
      type: 'color',
      color: options.backgroundColor ?? 0x87ceeb,
    }),
  )

  if (options.fog) {
    world.spawn(
      Fog({
        type: 'linear',
        color: options.fog.color ?? 0xffffff,
        near: options.fog.near,
        far: options.fog.far,
      }),
    )
  }
}

export function setupPostProcessingConfig(
  world: World,
  options: {
    bloom?: {strength?: number; radius?: number; threshold?: number}
    antialias?: 'none' | 'smaa' | 'fxaa'
    toneMapping?: 'none' | 'aces' | 'reinhard' | 'cineon'
    exposure?: number
  } = {},
) {
  world.spawn(
    PostProcessing({
      enabled: true,
      bloomEnabled: !!options.bloom,
      bloomStrength: options.bloom?.strength ?? 1.0,
      bloomRadius: options.bloom?.radius ?? 0.4,
      bloomThreshold: options.bloom?.threshold ?? 0.8,
      antialiasType: options.antialias ?? 'smaa',
      toneMapping: options.toneMapping ?? 'aces',
      exposure: options.exposure ?? 1.0,
    }),
  )
}
