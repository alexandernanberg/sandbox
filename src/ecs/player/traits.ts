import {trait} from 'koota'
import type {Vec2} from '~/lib/math'

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
