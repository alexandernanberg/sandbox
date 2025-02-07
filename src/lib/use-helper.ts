import {useFrame, useThree} from '@react-three/fiber'
import {useLayoutEffect, useRef} from 'react'
import type {Object3D} from 'three'
import {useEffectEvent} from './use-effect-event'

interface Helper extends Object3D {
  update: () => void
  dispose: () => void
}

export function useHelper<T extends Helper>(createFn: () => T, enabled = true) {
  const helperRef = useRef<T>(null)
  const scene = useThree((state) => state.scene)
  const create = useEffectEvent(createFn)

  useLayoutEffect(() => {
    if (!enabled) return

    const currentHelper = create()

    // Prevent the helpers from blocking rays
    currentHelper.traverse((child) => (child.raycast = () => null))
    scene.add(currentHelper)

    helperRef.current = currentHelper

    return () => {
      scene.remove(currentHelper)
      currentHelper.dispose()
      helperRef.current = null
    }
  }, [create, scene, enabled])

  useFrame(() => {
    if (helperRef.current) {
      helperRef.current.update()
    }
  })

  return helperRef
}
