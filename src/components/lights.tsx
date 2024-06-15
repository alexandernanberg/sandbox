import { useHelper } from '@react-three/drei'
import type { ReactNode } from 'react'
import { createContext, use, useEffect, useMemo, useRef } from 'react'
import type {
  Camera,
  DirectionalLight as ThreeDirectionalLight,
  HemisphereLight as ThreeHemisphereLight,
  SpotLight as ThreeSpotLight,
} from 'three'
import { CameraHelper, HemisphereLightHelper, SpotLightHelper } from 'three'

interface LightsContextValue {
  debug: boolean
}

export const LightContext = createContext<LightsContextValue>({ debug: false })

interface LightProviderProps {
  debug?: boolean
  children?: ReactNode
}

export function LightProvider({ debug = false, children }: LightProviderProps) {
  const context = useMemo(() => ({ debug }), [debug])
  return (
    <LightContext.Provider value={context}>{children}</LightContext.Provider>
  )
}

export function DirectionalLight(
  props: JSX.IntrinsicElements['directionalLight'],
) {
  const { debug } = use(LightContext)
  const ref = useRef<ThreeDirectionalLight>(null)
  const cameraRef = useRef<Camera | null>(null)

  useEffect(() => {
    cameraRef.current = ref.current?.shadow.camera ?? null
  }, [])

  useHelper(debug && cameraRef, CameraHelper)

  return <directionalLight ref={ref} {...props} />
}

export function SpotLight(props: JSX.IntrinsicElements['spotLight']) {
  const { debug } = use(LightContext)
  const ref = useRef<ThreeSpotLight>(null)

  useHelper(debug && ref, SpotLightHelper, 0xff0000)

  return <spotLight ref={ref} {...props} />
}

export function HemisphereLight(
  props: JSX.IntrinsicElements['hemisphereLight'],
) {
  const { debug } = use(LightContext)
  const ref = useRef<ThreeHemisphereLight>(null)

  useHelper(debug && ref, HemisphereLightHelper, 1, 0xff0000)

  return <hemisphereLight ref={ref} {...props} />
}
