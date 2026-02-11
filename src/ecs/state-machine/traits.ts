import {trait} from 'koota'
import type {Trait} from 'koota'

// ============================================
// State Machine Trait Factory
// ============================================

/**
 * State machine data structure.
 * Tracks current state, previous state, and time spent in current state.
 */
export interface StateMachineData<T extends string> {
  /** Current state */
  current: T
  /** Previous state (for transition detection) */
  previous: T
  /** Time spent in current state (seconds) */
  timeInState: number
  /** Hierarchical substate (e.g., "grounded.walking") */
  substate: string | null
}

/**
 * Creates a state machine trait with the given initial state.
 * Use this factory to create type-safe state machine traits.
 *
 * @example
 * // Define states
 * type PlayerStateType = 'idle' | 'walking' | 'running' | 'jumping' | 'falling'
 *
 * // Create trait
 * const PlayerState = createStateMachineTrait<PlayerStateType>('idle')
 *
 * // Use in entity
 * entity.add(PlayerState)
 * const state = entity.get(PlayerState)!
 * console.log(state.current) // 'idle'
 */
export function createStateMachineTrait<T extends string>(initialState: T) {
  return trait(
    (): StateMachineData<T> => ({
      current: initialState,
      previous: initialState,
      timeInState: 0,
      substate: null,
    }),
  )
}

/**
 * Type helper to extract the state type from a state machine trait.
 * Works with traits created by createStateMachineTrait.
 */
export type StateType<T> =
  T extends Trait<() => StateMachineData<infer S>> ? S : never
