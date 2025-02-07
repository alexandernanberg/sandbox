import type {ComponentProps, ReactNode} from 'react'
import {createContext, use, useEffect, useMemo, useRef} from 'react'
import type {
  Camera,
  DirectionalLight as ThreeDirectionalLight,
  HemisphereLight as ThreeHemisphereLight,
  SpotLight as ThreeSpotLight,
} from 'three'
import {CameraHelper, HemisphereLightHelper, SpotLightHelper} from 'three'
import {useHelper} from '~/lib/use-helper'

interface LightsContextValue {
  debug: boolean
}

export const LightContext = createContext<LightsContextValue>({debug: false})

interface LightProviderProps {
  debug?: boolean
  children?: ReactNode
}

export function LightProvider({debug = false, children}: LightProviderProps) {
  const context = useMemo(() => ({debug}), [debug])
  return (
    <LightContext.Provider value={context}>{children}</LightContext.Provider>
  )
}

export function DirectionalLight(props: ComponentProps<'directionalLight'>) {
  const {debug} = use(LightContext)
  const ref = useRef<ThreeDirectionalLight>(null)
  const cameraRef = useRef<Camera>(null)

  useEffect(() => {
    cameraRef.current = ref.current?.shadow.camera ?? null
  }, [])

  useHelper(() => new CameraHelper(cameraRef.current!), debug)

  return <directionalLight ref={ref} {...props} />
}

export function SpotLight(props: ComponentProps<'spotLight'>) {
  const {debug} = use(LightContext)
  const ref = useRef<ThreeSpotLight>(null)

  useHelper(() => new SpotLightHelper(ref.current!, 0xff0000), debug)

  return <spotLight ref={ref} {...props} />
}

export function HemisphereLight(props: ComponentProps<'hemisphereLight'>) {
  const {debug} = use(LightContext)
  const ref = useRef<ThreeHemisphereLight>(null)

  useHelper(() => new HemisphereLightHelper(ref.current!, 0xff0000), debug)

  return <hemisphereLight ref={ref} {...props} />
}
