/**
 * System Scheduler using Directed
 *
 * Declarative system ordering based on dependencies.
 */

import {Schedule} from 'directed'
import type {World} from 'koota'
import type * as THREE from 'three'

// ============================================
// System Context
// ============================================

export interface SystemContext {
  world: World
  delta: number
  fixedDelta: number
  scene: THREE.Scene
  camera: THREE.Camera
  renderer: THREE.WebGLRenderer
  // Add more as needed
}

export type System = (ctx: SystemContext) => void

// ============================================
// Schedule Tags (Phases)
// ============================================

/**
 * Standard execution phases:
 *
 * input       → Read input devices
 * pre-physics → Prepare for physics (create bodies, read transforms)
 * movement    → Apply movement to characters/objects
 * physics     → Step physics simulation
 * post-physics → React to physics results (collision events)
 * animation   → Update animations
 * pre-render  → Prepare render state (LOD, culling)
 * render      → Sync to Three.js, render
 * post-render → Cleanup, debug visualization
 */
export const Phase = {
  INPUT: 'input',
  PRE_PHYSICS: 'pre-physics',
  MOVEMENT: 'movement',
  PHYSICS: 'physics',
  POST_PHYSICS: 'post-physics',
  ANIMATION: 'animation',
  PRE_RENDER: 'pre-render',
  RENDER: 'render',
  POST_RENDER: 'post-render',
} as const

// ============================================
// Create Game Schedule
// ============================================

export function createGameSchedule(): Schedule<SystemContext> {
  const schedule = new Schedule<SystemContext>()

  // Define phase ordering with placeholder systems
  const phaseOrder = [
    Phase.INPUT,
    Phase.PRE_PHYSICS,
    Phase.MOVEMENT,
    Phase.PHYSICS,
    Phase.POST_PHYSICS,
    Phase.ANIMATION,
    Phase.PRE_RENDER,
    Phase.RENDER,
    Phase.POST_RENDER,
  ]

  // Create phase markers
  for (let i = 0; i < phaseOrder.length; i++) {
    const phase = phaseOrder[i]
    const prevPhase = phaseOrder[i - 1]

    // Empty function just to establish phase ordering
    const phaseMarker: System = () => {}
    Object.defineProperty(phaseMarker, 'name', {value: `__phase_${phase}`})

    if (prevPhase) {
      schedule.add(phaseMarker, {tag: phase, after: prevPhase})
    } else {
      schedule.add(phaseMarker, {tag: phase})
    }
  }

  return schedule
}

// ============================================
// Example Usage
// ============================================

/*
import {createGameSchedule, Phase} from './scheduler'
import {playerMovementSystem} from './player/systems'
import {renderSyncSystem} from './render/systems'

const schedule = createGameSchedule()

// Add systems with phase dependencies
schedule.add(
  (ctx) => cameraInputSystem(ctx.world),
  { tag: Phase.INPUT }
)

schedule.add(
  (ctx) => playerMovementSystem(ctx.world, ctx.fixedDelta),
  { tag: Phase.MOVEMENT, after: Phase.INPUT }
)

schedule.add(
  (ctx) => physicsStep(ctx.world, ctx.delta),
  { tag: Phase.PHYSICS, after: Phase.MOVEMENT }
)

schedule.add(
  (ctx) => renderSyncSystem(ctx.world, ctx.scene),
  { tag: Phase.RENDER, after: Phase.POST_PHYSICS }
)

// In game loop:
schedule.run({ world, delta, fixedDelta, scene, camera, renderer })
*/

// ============================================
// System Registration Helpers
// ============================================

export interface SystemOptions {
  /** Phase to run in */
  phase?: keyof typeof Phase
  /** Run before these systems/tags */
  before?: string | string[] | System | System[]
  /** Run after these systems/tags */
  after?: string | string[] | System | System[]
  /** Custom tag for this system */
  tag?: string
  /** Only run when condition is true */
  runIf?: (ctx: SystemContext) => boolean
}

export class GameScheduler {
  private schedule: Schedule<SystemContext>
  private conditionalSystems: Map<System, (ctx: SystemContext) => boolean> = new Map()

  constructor() {
    this.schedule = createGameSchedule()
  }

  /**
   * Add a system to the schedule.
   */
  add(system: System, options: SystemOptions = {}): this {
    const scheduleOptions: Parameters<Schedule<SystemContext>['add']>[1] = {}

    if (options.phase) {
      scheduleOptions.after = Phase[options.phase]
    }
    if (options.before) {
      scheduleOptions.before = options.before as string
    }
    if (options.after) {
      scheduleOptions.after = options.after as string
    }
    if (options.tag) {
      scheduleOptions.tag = options.tag
    }

    // Wrap with condition if provided
    if (options.runIf) {
      this.conditionalSystems.set(system, options.runIf)
    }

    this.schedule.add(system, scheduleOptions)
    return this
  }

  /**
   * Run all systems in order.
   */
  run(ctx: SystemContext): void {
    // Note: directed doesn't support conditional execution natively,
    // so we'd need to wrap systems or use a custom runner
    this.schedule.run(ctx)
  }

  /**
   * Get the underlying schedule for advanced usage.
   */
  getSchedule(): Schedule<SystemContext> {
    return this.schedule
  }
}

// ============================================
// Fixed Timestep Integration
// ============================================

/**
 * Some systems run at fixed timestep (physics),
 * others run every frame (render).
 *
 * We can use two schedules:
 */
export interface DualScheduler {
  /** Runs at fixed timestep (physics, gameplay) */
  fixed: GameScheduler
  /** Runs every frame (render, input, interpolation) */
  frame: GameScheduler
}

export function createDualScheduler(): DualScheduler {
  return {
    fixed: new GameScheduler(),
    frame: new GameScheduler(),
  }
}

/*
Usage with fixed timestep:

const {fixed, frame} = createDualScheduler()

// Fixed timestep systems (60Hz)
fixed.add(playerMovementSystem, { phase: 'MOVEMENT' })
fixed.add(physicsStepSystem, { phase: 'PHYSICS' })
fixed.add(collisionEventsSystem, { phase: 'POST_PHYSICS' })

// Frame systems (vsync)
frame.add(inputSystem, { phase: 'INPUT' })
frame.add(interpolationSystem, { phase: 'PRE_RENDER' })
frame.add(renderSystem, { phase: 'RENDER' })

// In game loop:
accumulator += delta
while (accumulator >= FIXED_TIMESTEP) {
  fixed.run({ ...ctx, delta: FIXED_TIMESTEP })
  accumulator -= FIXED_TIMESTEP
}
const alpha = accumulator / FIXED_TIMESTEP
frame.run({ ...ctx, delta, alpha })
*/
