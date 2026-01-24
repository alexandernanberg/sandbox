import {useLayoutEffect} from 'react'
import {getRapierWorld, onBeforeStep, onAfterStep} from './world'

export type PhysicsStage = 'early' | 'late'

/**
 * Register a callback to run during the physics step.
 * 'early' runs before the physics step (for character controllers, applying forces)
 * 'late' runs after the physics step (for post-physics logic)
 */
export function usePhysicsUpdate(
  cb: (delta: number) => void,
  stage: PhysicsStage = 'early',
) {
  useLayoutEffect(() => {
    const unsubscribe = stage === 'early' ? onBeforeStep(cb) : onAfterStep(cb)
    return unsubscribe
  }, [cb, stage])
}

/**
 * Get access to the Rapier world for direct physics operations.
 * Returns a getter function that returns the world (or null if not initialized).
 */
export function useRapierWorld() {
  return getRapierWorld
}
