import type {Entity, Trait} from 'koota'
import type {StateMachineData} from './traits'

export {
  createStateMachineTrait,
  type StateMachineData,
  type StateType,
} from './traits'

// Type for AoS traits created by createStateMachineTrait
export type StateMachineTrait<T extends string> = Trait<
  () => StateMachineData<T>
>

// ============================================
// State Machine Utilities
// ============================================
// These utilities are provided for custom state machines.
// The built-in playerStateMachineSystem inlines these operations
// for performance when using updateEach.

/**
 * Transition an entity to a new state.
 * Updates previous state, resets timeInState, and optionally sets substate.
 *
 * @example
 * transitionState(entity, PlayerState, 'jumping')
 * transitionState(entity, PlayerState, 'grounded', 'walking')
 */
export function transitionState<T extends string>(
  entity: Entity,
  stateTrait: StateMachineTrait<T>,
  newState: T,
  substate?: string | null,
): void {
  entity.set(stateTrait, (s: StateMachineData<T>) => {
    if (s.current !== newState) {
      s.previous = s.current
      s.current = newState
      s.timeInState = 0
    }
    s.substate = substate ?? null
    return s
  })
}

/**
 * Update time in state. Call once per frame with delta.
 */
export function updateStateTime<T extends string>(
  entity: Entity,
  stateTrait: StateMachineTrait<T>,
  delta: number,
): void {
  entity.set(stateTrait, (s: StateMachineData<T>) => {
    s.timeInState += delta
    return s
  })
}

/**
 * Check if entity just entered the current state (timeInState < delta).
 * Useful for triggering one-shot effects on state entry.
 */
export function justEntered<T extends string>(
  entity: Entity,
  stateTrait: StateMachineTrait<T>,
  delta: number,
): boolean {
  const state = entity.get(stateTrait)
  return state ? state.timeInState < delta : false
}

/**
 * Check if entity's previous state matches.
 * Useful for detecting specific transitions.
 */
export function transitionedFrom<T extends string>(
  entity: Entity,
  stateTrait: StateMachineTrait<T>,
  previousState: T,
): boolean {
  const state = entity.get(stateTrait)
  return state
    ? state.previous === previousState && state.timeInState === 0
    : false
}

// ============================================
// Tag Sync Utilities
// ============================================

/**
 * Sync tag traits based on current state.
 * Adds the tag for current state, removes all others.
 *
 * @example
 * const stateToTag = {
 *   grounded: IsGrounded,
 *   airborne: IsAirborne,
 * } as const
 *
 * syncStateTags(entity, PlayerState, stateToTag)
 */
export function syncStateTags<T extends string>(
  entity: Entity,
  stateTrait: StateMachineTrait<T>,
  stateToTag: Partial<Record<T, Trait>>,
): void {
  const state = entity.get(stateTrait)
  if (!state) return

  for (const [stateKey, tag] of Object.entries(stateToTag) as Array<
    [T, Trait]
  >) {
    if (stateKey === state.current) {
      if (!entity.has(tag)) {
        entity.add(tag)
      }
    } else {
      if (entity.has(tag)) {
        entity.remove(tag)
      }
    }
  }
}
