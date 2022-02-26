import {
  Environment,
  Loader,
  OrbitControls,
  Sky as SkyShader,
  useHelper,
  useTexture,
} from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { Perf } from 'r3f-perf'
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  DirectionalLight,
  DirectionalLightHelper,
  HemisphereLight,
  HemisphereLightHelper,
  Vector3,
} from 'three'
import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
} from './components/Physics'
import { useConstant } from './utils'

export function Root() {
  return (
    <>
      <Canvas shadows mode="concurrent" camera={{ position: [5, 4, -4] }}>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </Canvas>
      <Loader />
    </>
  )
}

const LightDebugContext = createContext<boolean>(false)

export function App() {
  const [physicsKey, setPhysicsKey] = useState(1)

  const controls = useControls({})
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
    _reset: {
      label: 'Reset',
      ...button(() => setPhysicsKey((s) => s + 1)),
    },
  })

  const [items, setItems] = useState<Array<number>>([])

  // useInterval(() => {
  //   setItems((state) => {
  //     const arr = [...state]
  //     const num = (arr[arr.length - 1] || 0) + 1
  //     arr.push(num)
  //     if (arr.length > 20) {
  //       arr.shift()
  //     }
  //     return arr
  //   })
  // }, 250)

  const texture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/purple/texture_01.png',
  )

  return (
    <LightDebugContext.Provider value={lightsControl.debug}>
      <Perf position="bottom-right" trackCPU />
      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <OrbitControls />

      <Physics debug={physicsControls.debug} key={physicsKey}>
        <RigidBody type="static">
          <CuboidCollider args={[30, 0, 30]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[30, 0.1, 30]} />
              <meshStandardMaterial color="white" />
            </mesh>
          </CuboidCollider>
        </RigidBody>

        <RigidBody type="static" position={[5, 3 / 2, 2]}>
          <CuboidCollider args={[1, 3, 6]}>
            <mesh castShadow>
              <boxGeometry args={[1, 3, 6]} />
              <meshStandardMaterial color="gray" />
            </mesh>
          </CuboidCollider>
        </RigidBody>

        {items.map((item) => (
          <RigidBody key={item} position={[0, 6, 0]}>
            <CuboidCollider args={[1, 1, 1]}>
              <mesh castShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="blue" />
              </mesh>
            </CuboidCollider>
          </RigidBody>
        ))}

        <RigidBody position={[2, 4, 0]}>
          <BallCollider
            args={[0.5]}
            restitution={1}
            friction={0.9}
            density={12}
          >
            <mesh castShadow>
              <sphereGeometry args={[0.5]} />
              <meshStandardMaterial color="red" />
            </mesh>
          </BallCollider>
        </RigidBody>

        <RigidBody position={[2, 5, 0]}>
          <ConeCollider args={[0.5, 1]}>
            <mesh castShadow>
              <coneGeometry args={[0.5, 1]} />
              <meshStandardMaterial color="red" />
            </mesh>
          </ConeCollider>
        </RigidBody>

        <RigidBody position={[0, 2, 0]}>
          <CylinderCollider args={[0.5, 1]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.5, 0.5, 1]} />
              <meshStandardMaterial color="red" />
            </mesh>
          </CylinderCollider>
        </RigidBody>

        <RigidBody position={[0.5, 5, 0]}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial map={texture} />
            </mesh>
          </CuboidCollider>
        </RigidBody>
      </Physics>
    </LightDebugContext.Provider>
  )
}

function Sky() {
  const debugLights = useContext(LightDebugContext)
  const sunPosition = useConstant(() => new Vector3(100, 200, 100))

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

  const dirLightRef = useRef<DirectionalLight>()
  useHelper(debugLights && dirLightRef, DirectionalLightHelper, 1, 'red')

  const hemiLightRef = useRef<HemisphereLight>()
  useHelper(debugLights && hemiLightRef, HemisphereLightHelper, 1, 'red')

  HemisphereLightHelper

  return (
    <>
      <SkyShader
        sunPosition={controls.sun}
        distance={10000}
        mieDirectionalG={0.9}
      />
      <hemisphereLight
        ref={hemiLightRef}
        args={[0xffffff, 0xffffff, 1.0]}
        color={0x7095c1}
        position={[0, 50, 0]}
        groundColor={0xcbc1b2}
      />
      <directionalLight
        ref={dirLightRef}
        position={controls.sun}
        castShadow
        // shadow-mapSize={[1024, 1024]}
        // shadow-camera-left={-5}
        // shadow-camera-right={5}
        // shadow-camera-top={5}
        // shadow-camera-bottom={-5}
        // shadow-camera-near={1}
        // shadow-camera-far={20}
      />
      <Environment preset="park" />
    </>
  )
}

function useInterval<T extends () => void>(cb: T, delay?: number) {
  const ref = useRef<T>()

  useEffect(() => {
    ref.current = cb
  }, [cb])

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
