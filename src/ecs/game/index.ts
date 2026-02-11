import {createActions, createQuery} from 'koota'
import type {World} from 'koota'
import type {GamePhase} from './traits'
import {GameState, IsGameState} from './traits'

export {GameState, IsGameState, type GamePhase} from './traits'

// ============================================
// Cached Query
// ============================================

const gameStateQuery = createQuery(IsGameState, GameState)

// ============================================
// Helper Functions
// ============================================

/**
 * Get the game state from the world.
 * Returns null if no game state singleton exists.
 */
export function getGameState(world: World) {
  for (const entity of world.query(gameStateQuery)) {
    return entity.get(GameState)
  }
  return null
}

/**
 * Check if the game is currently paused.
 * Returns false if no game state exists (fail-safe for initialization).
 */
export function isPaused(world: World): boolean {
  const state = getGameState(world)
  return state?.isPaused ?? false
}

// ============================================
// Game Actions
// ============================================

const isGameStateQuery = createQuery(IsGameState)

export const gameActions = createActions((world) => ({
  /**
   * Initialize the game state singleton.
   * Call this once at startup.
   */
  initGameState: () => {
    // Check if already exists
    if (world.query(isGameStateQuery).length > 0) {
      return
    }
    world.spawn(IsGameState, GameState)
  },

  /**
   * Set the game phase.
   * Tracks previous phase for transitions.
   */
  setPhase: (phase: GamePhase) => {
    world.query(gameStateQuery).updateEach(([state]) => {
      const currentPhase = state.phase
      state.previousPhase = currentPhase
      state.phase = phase
      state.phaseTime = 0
      // Auto-pause when entering pause phase
      if (phase === 'paused') {
        state.isPaused = true
      }
      // Auto-unpause when leaving pause phase
      if (currentPhase === 'paused' && phase !== 'paused') {
        state.isPaused = false
      }
    })
  },

  /**
   * Toggle pause state.
   * When pausing, phase becomes 'paused'.
   * When unpausing, phase returns to previous phase.
   */
  togglePause: () => {
    world.query(gameStateQuery).updateEach(([state]) => {
      if (state.isPaused) {
        // Unpause: restore previous phase
        state.isPaused = false
        const prevPhase = state.previousPhase
        state.previousPhase = state.phase
        state.phase = prevPhase !== 'paused' ? prevPhase : 'playing'
        state.phaseTime = 0
      } else {
        // Pause: save current phase
        state.isPaused = true
        state.previousPhase = state.phase
        state.phase = 'paused'
        state.phaseTime = 0
      }
    })
  },

  /**
   * Update game time (call each frame with delta).
   * Only advances time when not paused.
   */
  updateGameTime: (delta: number) => {
    world.query(gameStateQuery).updateEach(([state]) => {
      state.phaseTime += delta
      if (!state.isPaused) {
        state.gameTime += delta
      }
    })
  },
}))
