/**
 * GameCanvas - Minimal React wrapper for pure ECS rendering
 *
 * This component manages:
 * - Three.js WebGLRenderer and canvas
 * - Game loop (requestAnimationFrame)
 * - Window resize handling
 *
 * It does NOT manage:
 * - Scene graph (handled by ECS render system)
 * - Entity spawning (handled by ECS actions)
 * - Game logic (handled by ECS systems)
 */

import {useEffect, useRef, useCallback} from 'react'
import * as THREE from 'three'
import type {World} from 'koota'
import {useWorld} from 'koota/react'
import {renderUpdate} from './systems'
import {stepPhysics} from '../physics/step'
import type {StepResult} from '../physics/step'

export interface GameCanvasProps {
  /** Called once when the game is ready to load content */
  onLoad?: (ctx: GameContext) => void
  /** Called each frame before physics */
  onBeforePhysics?: (ctx: GameContext, delta: number) => void
  /** Called each frame after physics, before render */
  onAfterPhysics?: (ctx: GameContext, delta: number, result: StepResult) => void
  /** Show stats overlay */
  showStats?: boolean
  /** Initial camera position */
  cameraPosition?: [number, number, number]
  /** Background color */
  backgroundColor?: number
  /** Enable shadows */
  shadows?: boolean
}

export interface GameContext {
  world: World
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
}

export function GameCanvas({
  onLoad,
  onBeforePhysics,
  onAfterPhysics,
  showStats = false,
  cameraPosition = [6, 6, -4],
  backgroundColor = 0x87ceeb,
  shadows = true,
}: GameCanvasProps) {
  const world = useWorld()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const contextRef = useRef<GameContext | null>(null)
  const clockRef = useRef<THREE.Clock | null>(null)
  const animationFrameRef = useRef<number>(0)

  // Initialize Three.js
  const initThree = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return null

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.shadowMap.enabled = shadows
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(backgroundColor)
    scene.fog = new THREE.Fog(0xffffff, 10, 90)

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    camera.position.set(...cameraPosition)
    camera.lookAt(0, 0, 0)

    return {renderer, scene, camera}
  }, [backgroundColor, cameraPosition, shadows])

  // Game loop
  const gameLoop = useCallback(() => {
    const ctx = contextRef.current
    const clock = clockRef.current
    if (!ctx || !clock) return

    const delta = Math.min(clock.getDelta(), 0.25) // Clamp delta

    // Pre-physics callback
    onBeforePhysics?.(ctx, delta)

    // Step physics and ECS systems
    const result = stepPhysics(world, delta)

    // Post-physics callback
    onAfterPhysics?.(ctx, delta, result)

    // Update render system (create objects, sync transforms)
    renderUpdate(world, {
      scene: ctx.scene,
      camera: ctx.camera,
      renderer: ctx.renderer,
    })

    // Render
    ctx.renderer.render(ctx.scene, ctx.camera)

    // Continue loop
    animationFrameRef.current = requestAnimationFrame(gameLoop)
  }, [world, onBeforePhysics, onAfterPhysics])

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      const ctx = contextRef.current
      if (!ctx) return

      const width = window.innerWidth
      const height = window.innerHeight

      ctx.camera.aspect = width / height
      ctx.camera.updateProjectionMatrix()
      ctx.renderer.setSize(width, height)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Initialize and start game loop
  useEffect(() => {
    const threeContext = initThree()
    if (!threeContext) return

    const ctx: GameContext = {
      world,
      scene: threeContext.scene,
      camera: threeContext.camera,
      renderer: threeContext.renderer,
    }
    contextRef.current = ctx
    clockRef.current = new THREE.Clock()

    // Call onLoad to let parent spawn initial entities
    onLoad?.(ctx)

    // Start game loop
    animationFrameRef.current = requestAnimationFrame(gameLoop)

    return () => {
      // Cleanup
      cancelAnimationFrame(animationFrameRef.current)
      threeContext.renderer.dispose()
      threeContext.scene.clear()
    }
  }, [world, initThree, gameLoop, onLoad])

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        touchAction: 'none',
      }}
    />
  )
}

/**
 * Example usage:
 *
 * ```tsx
 * import {WorldProvider} from 'koota/react'
 * import {world} from './ecs'
 * import {playgroundActions} from './ecs/scenes/playground'
 * import {GameCanvas} from './ecs/render/game-canvas'
 *
 * function App() {
 *   const handleLoad = useCallback((ctx: GameContext) => {
 *     // Initialize physics (would be async in real impl)
 *     // initPhysics().then(() => {
 *     playgroundActions.loadPlayground()
 *     // })
 *   }, [])
 *
 *   return (
 *     <WorldProvider world={world}>
 *       <GameCanvas onLoad={handleLoad} />
 *       <GameUI /> // React UI overlay
 *     </WorldProvider>
 *   )
 * }
 * ```
 */
