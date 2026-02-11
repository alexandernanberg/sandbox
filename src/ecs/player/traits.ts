import {trait} from 'koota'
import type {Vec2} from '~/lib/math'
import {createStateMachineTrait} from '../state-machine'

// ============================================
// Player State Machine
// ============================================

/**
 * Player movement states.
 * - idle: Standing still on ground
 * - walking: Moving on ground (normal speed)
 * - running: Moving on ground (sprint speed)
 * - jumping: Rising through air after jump
 * - falling: Descending through air
 * - sliding: On steep slope, reduced control
 */
export type PlayerStateType =
  | 'idle'
  | 'walking'
  | 'running'
  | 'jumping'
  | 'falling'
  | 'sliding'

/**
 * Player state machine trait.
 * Tracks current state, previous state, and time in state.
 */
export const PlayerState = createStateMachineTrait<PlayerStateType>('idle')

// Query-friendly tag traits (synced when state changes)
/** Tag for grounded players (idle, walking, running) */
export const IsGrounded = trait()
/** Tag for airborne players (jumping, falling) */
export const IsAirborne = trait()
/** Tag for sliding players */
export const IsSliding = trait()

// ============================================
// Input Traits
// ============================================

/**
 * Singleton trait for current input state.
 * Updated each frame from the InputManager.
 */
export const Input = trait(() => ({
  /** Movement input (normalized, -1 to 1) */
  movement: {x: 0, y: 0} as Vec2,
  /** Jump action */
  jump: false,
  /** Sprint action */
  sprint: false,
}))

// ============================================
// Player Traits
// ============================================

/** Tag for player-controlled entities */
export const IsPlayer = trait()

/** Configuration for player movement */
export const PlayerMovementConfig = trait({
  walkSpeed: 6,
  sprintSpeed: 10,
  jumpHeight: 1,
  gravity: -1,
})

/** Current player velocity (accumulated between frames) */
export const PlayerVelocity = trait(() => ({
  x: 0,
  y: 0,
  z: 0,
}))

/** Character facing direction for visual mesh rotation */
export const FacingDirection = trait({
  /** Desired facing direction (radians) */
  targetYaw: 0,
  /** Current interpolated yaw (radians) */
  currentYaw: 0,
  /** Turn speed (radians per second) */
  turnSpeed: 10,
})
