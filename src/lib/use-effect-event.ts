import {useCallback, useLayoutEffect, useRef} from 'react'

// Based on https://react.dev/reference/react/experimental_useEffectEvent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useEffectEvent<T extends (...args: any[]) => any>(
  handler: T,
): T {
  const handlerRef = useRef<T>(null)

  useLayoutEffect(() => {
    handlerRef.current = handler
  })

  return useCallback((...args: Parameters<T>): ReturnType<T> => {
    const fn = handlerRef.current

    if (!fn) {
      throw new Error('Handler is not initialized')
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return fn(...args)
  }, []) as T
}
