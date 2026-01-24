import type {RefObject} from 'react'
import {useLayoutEffect} from 'react'
import {useECSPhysicsContext} from './provider'

export type PhysicsStage = 'early' | 'late'

/**
 * Register a callback to run during the physics step.
 * 'early' runs before the physics step (for character controllers, applying forces)
 * 'late' runs after the physics step (for post-physics logic)
 */
export function useECSPhysicsUpdate(
  cb: (delta: number) => void,
  stage: PhysicsStage = 'early',
) {
  const context = useECSPhysicsContext()

  useLayoutEffect(() => {
    const ref = {current: cb}
    const subscriptions =
      stage === 'early'
        ? context.beforeStepCallbacks
        : context.afterStepCallbacks

    subscriptions.add(ref as RefObject<(delta: number) => void>)
    return () => {
      subscriptions.delete(ref as RefObject<(delta: number) => void>)
    }
  }, [cb, stage, context])
}

/**
 * Get access to the Rapier world for direct physics operations.
 */
export function useRapierWorld() {
  const context = useECSPhysicsContext()
  return context.worldRef
}
