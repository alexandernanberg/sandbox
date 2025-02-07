import type {Ref, RefCallback} from 'react'
import {useEffect, useRef} from 'react'

export function useConstant<T>(fn: () => T): T {
  const ref = useRef<{v: T}>(null)

  // eslint-disable-next-line react-compiler/react-compiler
  if (!ref.current) {
    // eslint-disable-next-line react-compiler/react-compiler
    ref.current = {v: fn()}
  }

  // eslint-disable-next-line react-compiler/react-compiler
  return ref.current.v
}

function assignRef<T>(ref: Ref<T> | null | undefined, value: T | null): void {
  if (ref == null) return
  if (typeof ref === 'function') {
    ref(value)
  } else {
    try {
      ref.current = value
    } catch {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      throw new Error(`Cannot assign value "${value}" to ref`)
    }
  }
}

export function mergeRefs<T>(
  ...refs: Array<Ref<T> | null | undefined>
): RefCallback<T> {
  return (refValue) => {
    for (const ref of refs) {
      assignRef(ref, refValue)
    }
  }
}

export function useInterval<T extends () => void>(
  cb: T,
  delay?: number | null,
) {
  const ref = useRef<T>(null)

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
