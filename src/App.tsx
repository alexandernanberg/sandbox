import {
  Environment,
  Loader,
  OrbitControls,
  Sky as SkyShader,
  useHelper,
  useTexture,
} from '@react-three/drei'
import type { Object3DNode } from '@react-three/fiber'
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
import seedrandom from 'seedrandom'
import type {
  DirectionalLight,
  HemisphereLight,
  Uint32BufferAttribute,
} from 'three'
import {
  DirectionalLightHelper,
  DoubleSide,
  HemisphereLightHelper,
  RepeatWrapping,
  Vector3,
} from 'three'
import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
  TrimeshCollider,
} from './components/Physics'
import { useConstant } from './utils'

// Temporary solution
export type Uint32BufferAttributeProps = Object3DNode<
  THREE.Uint32BufferAttribute,
  typeof Uint32BufferAttribute
>
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      uint32BufferAttribute: Uint32BufferAttributeProps
    }
  }
}

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

  const boxTexture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/dark/texture_01.png',
  )
  const wallTexture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/light/texture_12.png',
  )
  const tileTexture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/light/texture_07.png',
  )
  tileTexture.wrapS = RepeatWrapping
  tileTexture.wrapT = RepeatWrapping
  tileTexture.repeat.set(10, 10)

  const trimesh = useConstant(() => generateTriMesh(20, 20.0, 2, 20))

  return (
    <LightDebugContext.Provider value={lightsControl.debug}>
      <Perf position="bottom-right" />
      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <OrbitControls />

      <Physics debug={physicsControls.debug} key={physicsKey}>
        <RigidBody type="static">
          <TrimeshCollider args={[trimesh.vertices, trimesh.indices]}>
            <mesh receiveShadow>
              <bufferGeometry
                ref={(geometry) => geometry?.computeVertexNormals()}
              >
                <bufferAttribute attach="index" args={[trimesh.indices, 1]} />
                <bufferAttribute
                  attachObject={['attributes', 'position']}
                  count={trimesh.vertices.length / 3}
                  array={trimesh.vertices}
                  itemSize={3}
                />
              </bufferGeometry>
              <meshPhongMaterial color="white" side={DoubleSide} />
            </mesh>
          </TrimeshCollider>
        </RigidBody>

        <RigidBody type="static">
          <CuboidCollider args={[30, 0, 30]}>
            <mesh castShadow receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
              <planeGeometry args={[30, 30]} />
              <meshPhongMaterial map={tileTexture} />
            </mesh>
          </CuboidCollider>
        </RigidBody>

        <RigidBody type="static" position={[5, 3 / 2, 2]}>
          <CuboidCollider args={[1, 3, 6]}>
            <mesh castShadow>
              <boxGeometry args={[1, 3, 6]} />
              <meshPhongMaterial map={wallTexture} />
            </mesh>
          </CuboidCollider>
        </RigidBody>

        {items.map((item) => (
          <RigidBody key={item} position={[0, 6, 0]}>
            <CuboidCollider args={[1, 1, 1]}>
              <mesh castShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshPhongMaterial color="blue" />
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
              <meshPhongMaterial color="red" />
            </mesh>
          </BallCollider>
        </RigidBody>

        <RigidBody position={[2, 5, 0]}>
          <ConeCollider args={[0.5, 1]}>
            <mesh castShadow>
              <coneGeometry args={[0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </ConeCollider>
        </RigidBody>

        <RigidBody position={[0, 2, 0]}>
          <CylinderCollider args={[0.5, 1]}>
            <mesh castShadow>
              <cylinderGeometry args={[0.5, 0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CylinderCollider>
        </RigidBody>

        <RigidBody position={[0.5, 5, 0]}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="purple" />
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

function generateTriMesh(nsubdivs: number, wx: number, wy: number, wz: number) {
  let vertices = []
  let indices = []

  let elementWidth = 1.0 / nsubdivs
  let rng = seedrandom('trimesh')

  let i: number
  let j: number
  for (i = 0; i <= nsubdivs; ++i) {
    for (j = 0; j <= nsubdivs; ++j) {
      let x = (j * elementWidth - 0.5) * wx
      let y = rng() * wy
      let z = (i * elementWidth - 0.5) * wz

      vertices.push(x, y, z)
    }
  }

  for (i = 0; i < nsubdivs; ++i) {
    for (j = 0; j < nsubdivs; ++j) {
      let i1 = (i + 0) * (nsubdivs + 1) + (j + 0)
      let i2 = (i + 0) * (nsubdivs + 1) + (j + 1)
      let i3 = (i + 1) * (nsubdivs + 1) + (j + 0)
      let i4 = (i + 1) * (nsubdivs + 1) + (j + 1)

      indices.push(i1, i3, i2)
      indices.push(i3, i4, i2)
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
