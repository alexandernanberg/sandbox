/**
 * Game - Pure vanilla Three.js game runner
 *
 * No React, no r3f - just a game loop.
 * React is only used for UI overlay (separate DOM layer).
 */

import * as THREE from 'three'
import type {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js'
import type {World} from 'koota'
import RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {world} from '../index'
import {initPhysicsWorld, destroyPhysicsWorld} from '../physics/world'
import {stepPhysics} from '../physics/step'
import {renderUpdate} from './systems'
import {
  lightSetupSystem,
  environmentSetupSystem,
  setupPostProcessing,
} from './environment'

export interface GameConfig {
  /** Container element to mount canvas */
  container: HTMLElement
  /** Called once physics is ready */
  onReady?: (game: Game) => void
  /** Called each frame */
  onUpdate?: (game: Game, delta: number) => void
  /** Background color */
  backgroundColor?: number
  /** Enable shadows */
  shadows?: boolean
}

export class Game {
  readonly world: World
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  readonly renderer: THREE.WebGLRenderer

  private clock: THREE.Clock
  private animationFrameId: number = 0
  private running: boolean = false
  private onUpdate?: (game: Game, delta: number) => void
  private composer: EffectComposer | null = null
  private environmentInitialized: boolean = false

  constructor(config: GameConfig) {
    this.world = world
    this.onUpdate = config.onUpdate

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(config.container.clientWidth, config.container.clientHeight)
    this.renderer.shadowMap.enabled = config.shadows ?? true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    config.container.appendChild(this.renderer.domElement)

    // Create scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(config.backgroundColor ?? 0x87ceeb)

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      config.container.clientWidth / config.container.clientHeight,
      0.1,
      1000,
    )
    this.camera.position.set(6, 6, -4)
    this.camera.lookAt(0, 0, 0)

    this.clock = new THREE.Clock()

    // Handle resize
    window.addEventListener('resize', this.handleResize)

    // Initialize physics then call onReady
    this.initPhysics().then(() => {
      config.onReady?.(this)
    })
  }

  private async initPhysics(): Promise<void> {
    await RAPIER.init()
    initPhysicsWorld(RAPIER)
  }

  private handleResize = (): void => {
    const container = this.renderer.domElement.parentElement
    if (!container) return

    const width = container.clientWidth
    const height = container.clientHeight

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  private loop = (): void => {
    if (!this.running) return

    const delta = Math.min(this.clock.getDelta(), 0.25)

    // Custom update callback
    this.onUpdate?.(this, delta)

    // Step physics and all ECS systems
    stepPhysics(this.world, delta)

    // Set up environment (once)
    if (!this.environmentInitialized) {
      environmentSetupSystem(this.world, this.scene)
      this.composer = setupPostProcessing(
        this.world,
        this.renderer,
        this.scene,
        this.camera,
      )
      this.environmentInitialized = true
    }

    // Set up lights (runs for new light entities)
    lightSetupSystem(this.world, this.scene)

    // Sync ECS meshes to Three.js
    renderUpdate(this.world, {
      scene: this.scene,
      camera: this.camera,
      renderer: this.renderer,
    })

    // Render (with or without post-processing)
    if (this.composer) {
      this.composer.render(delta)
    } else {
      this.renderer.render(this.scene, this.camera)
    }

    this.animationFrameId = requestAnimationFrame(this.loop)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.clock.start()
    this.animationFrameId = requestAnimationFrame(this.loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.animationFrameId)
  }

  destroy(): void {
    this.stop()
    window.removeEventListener('resize', this.handleResize)
    destroyPhysicsWorld()
    this.renderer.dispose()
    this.scene.clear()
    this.renderer.domElement.remove()
  }
}

/**
 * Usage:
 *
 * ```typescript
 * import {Game} from './ecs/render/game'
 * import {playgroundActions} from './ecs/scenes/playground'
 *
 * const game = new Game({
 *   container: document.getElementById('game')!,
 *   onReady: (game) => {
 *     playgroundActions.loadPlayground()
 *     game.start()
 *   },
 *   onUpdate: (game, delta) => {
 *     // Custom per-frame logic
 *   },
 * })
 *
 * // Later: game.destroy()
 * ```
 *
 * For React UI overlay, mount React on a separate DOM element:
 *
 * ```tsx
 * // index.html
 * <div id="game"></div>
 * <div id="ui"></div>
 *
 * // main.ts
 * const game = new Game({ container: document.getElementById('game')! })
 *
 * // ui.tsx
 * createRoot(document.getElementById('ui')!).render(<GameUI game={game} />)
 * ```
 */
