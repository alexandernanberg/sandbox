import {trait} from 'koota'

// ============================================
// Game Phase Types
// ============================================

export type GamePhase =
  | 'loading'
  | 'main-menu'
  | 'playing'
  | 'paused'
  | 'game-over'
  | 'victory'

// ============================================
// Game State Singleton Trait
// ============================================

/** Tag for the game state singleton entity */
export const IsGameState = trait()

/**
 * Global game state singleton.
 * Tracks the current game phase, pause state, and game time.
 * Use with IsGameState tag for singleton pattern.
 *
 * @example
 * // Spawn singleton
 * world.spawn(IsGameState, GameState)
 *
 * // Query and read
 * const gameState = getGameState(world)
 * if (gameState?.isPaused) return
 */
export const GameState = trait(() => ({
  /** Current game phase */
  phase: 'loading' as GamePhase,
  /** Previous game phase (for transitions) */
  previousPhase: 'loading' as GamePhase,
  /** Whether the game is paused */
  isPaused: false,
  /** Total game time in seconds (paused time excluded) */
  gameTime: 0,
  /** Time spent in current phase */
  phaseTime: 0,
  /** Player's current score */
  score: 0,
  /** Total collectibles in the level */
  totalCollectibles: 0,
  /** Collectibles the player has picked up */
  collectedCount: 0,
  /** Best time for completion (0 if not completed) */
  bestTime: 0,
}))
