import type { MutableRefObject, Ref, RefCallback } from 'react'
import { useEffect, useMemo, useRef } from 'react'

export function useConstant<T>(fn: () => T): T {
  const ref = useRef<{ v: T }>()

  if (!ref.current) {
    ref.current = { v: fn() }
  }

  return ref.current.v
}

function setRef<T>(
  ref: MutableRefObject<T | null> | RefCallback<T> | null | undefined,
  value: T | null,
): void {
  if (ref == null) return
  if (typeof ref === 'function') {
    ref(value)
  } else {
    try {
      ref.current = value // eslint-disable-line no-param-reassign
    } catch (error) {
      throw new Error(`Cannot assign value "${value}" to ref "${ref}"`)
    }
  }
}

export function useForkRef<T>(
  ...refs: Array<Ref<T> | null | undefined>
): RefCallback<T> | null {
  return useMemo(
    () => {
      if (refs.every((ref) => ref == null)) {
        return null
      }
      return (refValue) => {
        refs.forEach((ref) => setRef(ref, refValue))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs,
  )
}

export function useInterval<T extends () => void>(cb: T, delay?: number) {
  const ref = useRef<T>()

  useEffect(() => {
    ref.current = cb
  })

  useEffect(() => {
    function tick() {
      ref.current?.()
    }
    if (delay !== null) {
      const id = setInterval(tick, delay)
      return () => clearInterval(id)
    }
  }, [delay])
}
