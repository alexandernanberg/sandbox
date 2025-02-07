import type {DependencyList} from 'react'
import {useEffect, useLayoutEffect, useRef} from 'react'
import {useEffectEvent} from './use-effect-event'

export function useResourceEffect<T>(
  create: () => T,
  createDeps: DependencyList = EMPTY_ARRAY,
  update: (resource: T) => void = noop,
  updateDeps: DependencyList = EMPTY_ARRAY,
  destroy: (resource: T) => void = noop,
) {
  const instanceRef = useRef<T>(null)
  const onCreate = useEffectEvent(create)
  const onUpdate = useEffectEvent(update)
  const onDestroy = useEffectEvent(destroy)

  useLayoutEffect(() => {
    instanceRef.current = onCreate()
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, createDeps)

  useLayoutEffect(() => {
    onUpdate(instanceRef.current!)
    // eslint-disable-next-line react-compiler/react-compiler
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, updateDeps)

  useEffect(() => {
    return () => {
      if (instanceRef.current !== null) {
        onDestroy(instanceRef.current)
        instanceRef.current = null
      }
    }
  }, [onDestroy])

  return instanceRef
}

function noop() {}

const EMPTY_ARRAY: ReadonlyArray<unknown> = []
