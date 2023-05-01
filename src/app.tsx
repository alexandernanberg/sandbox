import {
  Loader,
  OrbitControls,
  PerspectiveCamera,
  Sky as SkyShader,
  Stats,
} from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { Suspense, useReducer } from 'react'
import {
  DirectionalLight,
  HemisphereLight,
  LightProvider,
} from '~/components/lights'
import { Physics } from '~/components/physics'
import { Playground } from '~/scenes/playground'
import { lifecycle } from './stages'

export function Root() {
  return (
    <>
      <Canvas camera={{ position: [6, 6, -4] }} shadows stages={lifecycle}>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </Canvas>
      <Loader />
    </>
  )
}

export function App() {
  const [physicsKey, updatePhysicsKey] = useReducer((num) => num + 1, 0)

  const cameraControls = useControls(
    'Camera',
    {
      debug: { label: 'Debug', value: false },
    },
    { collapsed: true },
  )
  const lightsControl = useControls(
    'Lights',
    {
      debug: { label: 'Debug', value: false },
    },
    { collapsed: true },
  )
  const physicsControls = useControls('Physics', {
    debug: { label: 'Debug', value: false },
    gravity: { label: 'Gravity', value: [0, -9.81, 0] },
    _reset: {
      label: 'Reset',
      ...button(updatePhysicsKey),
    },
  })

  return (
    <LightProvider debug={lightsControl.debug}>
      <Stats />
      <PerspectiveCamera makeDefault position={[8, 8, -10]} />
      <OrbitControls target={[-2, 0, 6]} />

      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <Physics
        key={physicsKey}
        debug={physicsControls.debug}
        gravity={physicsControls.gravity}
      >
        <Playground />
      </Physics>
    </LightProvider>
  )
}

function Sky() {
  const controls = useControls(
    'Sky',
    {
      sun: {
        label: 'Sun position',
        value: [100, 200, 100],
      },
    },
    { collapsed: true },
  )

  const { sun: position } = controls

  return (
    <>
      <SkyShader
        sunPosition={position}
        distance={10000}
        mieDirectionalG={0.9}
      />
      <HemisphereLight
        args={[0xffffff, 0xffffff, 1.0]}
        color={0x7095c1}
        position={[0, 50, 0]}
        groundColor={0xcbc1b2}
      />
      <DirectionalLight
        position={position}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-22}
        shadow-camera-bottom={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
      />
    </>
  )
}
