import { useHelper } from '@react-three/drei'
import type { ReactNode } from 'react'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
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
  const { debug } = useContext(LightContext)
  const ref = useRef<ThreeDirectionalLight>()
  const cameraRef = useRef<Camera>()

  useEffect(() => {
    cameraRef.current = ref.current?.shadow.camera
  }, [])

  useHelper(debug && cameraRef, CameraHelper)

  return <directionalLight ref={ref} {...props} />
}

export function SpotLight(props: JSX.IntrinsicElements['spotLight']) {
  const { debug } = useContext(LightContext)
  const ref = useRef<ThreeSpotLight>()

  useHelper(debug && ref, SpotLightHelper, 0xff0000)

  return <spotLight ref={ref} {...props} />
}

export function HemisphereLight(
  props: JSX.IntrinsicElements['hemisphereLight'],
) {
  const { debug } = useContext(LightContext)
  const ref = useRef<ThreeHemisphereLight>()

  useHelper(debug && ref, HemisphereLightHelper, 1, 0xff0000)

  return <hemisphereLight ref={ref} {...props} />
}
