import {Loader, OrbitControls, Sky as SkyShader, Stats} from '@react-three/drei'
import {Canvas} from '@react-three/fiber'
import {WorldProvider} from 'koota/react'
import {useReducer} from 'react'
import {InputManager} from '~/components/input-manager'
import {
  DirectionalLight,
  HemisphereLight,
  LightProvider,
} from '~/components/lights'
import {world} from '~/ecs'
import {PhysicsProvider} from '~/ecs/physics'
import {Playground} from '~/scenes/playground'
import {DebugControls, useControls} from './components/debug-controls'

export function Root() {
  return (
    <>
      {/* WorldProvider makes the ECS world available to all components */}
      <WorldProvider world={world}>
        <Canvas camera={{position: [6, 6, -4]}} shadows>
          <DebugControls>
            <App />
          </DebugControls>
        </Canvas>
      </WorldProvider>
      <Loader />
    </>
  )
}

function App() {
  const [physicsKey, updatePhysicsKey] = useReducer((num: number) => num + 1, 0)

  const cameraControls = useControls(
    'Camera',
    {
      debug: {value: false},
      showOrbitRings: {value: false},
    },
    {expanded: false, index: 0},
  )
  const lightsControl = useControls(
    'Lights',
    {debug: {value: false}},
    {expanded: false, index: 1},
  )
  const physicsControls = useControls(
    'Physics',
    {
      debug: {value: true},
      gravity: {value: [0, -9.81, 0]},
      _reset: {
        title: 'Reset',
        action: updatePhysicsKey,
      },
    },
    {index: 3},
  )

  return (
    <LightProvider debug={lightsControl.debug}>
      <Stats />
      <OrbitControls target={[-2, 0, 6]} makeDefault={cameraControls.debug} />
      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <PhysicsProvider
        key={physicsKey}
        debug={physicsControls.debug}
        gravity={physicsControls.gravity}
      >
        <InputManager disablePointerLock={cameraControls.debug} />
        <Playground
          debugCamera={cameraControls.debug}
          showOrbitRings={cameraControls.showOrbitRings}
        />
      </PhysicsProvider>
    </LightProvider>
  )
}

function Sky() {
  const {sun: position} = useControls(
    'Sky',
    {
      sun: {
        label: 'Sun position',
        value: [100, 200, 100],
      },
    },
    {expanded: false, index: 2},
  )

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
