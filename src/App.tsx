import {
  Loader,
  OrbitControls,
  Sky as SkyShader,
  Stats,
  useTexture,
} from '@react-three/drei'
import type { GroupProps } from '@react-three/fiber'
import { Canvas, useFrame } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { Suspense, useRef, useState } from 'react'
import seedrandom from 'seedrandom'
import { RepeatWrapping } from 'three'
import {
  DirectionalLight,
  HemisphereLight,
  LightProvider,
} from './components/Lights'
import type {
  CuboidColliderProps,
  RigidBodyApi,
  RigidBodyProps,
} from './components/Physics'
import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  Physics,
  RigidBody,
} from './components/Physics'
import Ramp from './models/Ramp'
import Slope from './models/Slope'
import Stone from './models/Stone'

export function Root() {
  return (
    <>
      <Canvas camera={{ position: [5, 4, 8] }} shadows>
        <Suspense fallback={null}>
          <App />
        </Suspense>
      </Canvas>
      <Loader />
    </>
  )
}

export function App() {
  const [physicsKey, setPhysicsKey] = useState(1)

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

  return (
    <LightProvider debug={lightsControl.debug}>
      <Stats />
      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <OrbitControls target={[0, 0, 12]} />

      <Physics debug={physicsControls.debug} key={physicsKey}>
        <Floor />

        <RigidBody position={[0, 3, 12.5]} scale={0.5}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CuboidCollider>
        </RigidBody>
        <RigidBody position={[1, 3, 12.5]} scale={0.5}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CuboidCollider>
        </RigidBody>
        <RigidBody position={[2, 3, 12.5]} scale={0.5}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CuboidCollider>
        </RigidBody>
        <RigidBody position={[3, 3, 12.5]} scale={0.5}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CuboidCollider>
        </RigidBody>

        <Slopes position={[0, 0, 12]} />

        <group position={[-6, 0, 0]}>
          <Tower />
          <Elevator position={[0, 0.5, 6]} />
          <RigidBody position={[0, 7, 6]}>
            <CuboidCollider args={[1, 1, 1]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshPhongMaterial color="red" />
              </mesh>
            </CuboidCollider>
          </RigidBody>
        </group>

        {/* <Wall /> */}

        <RigidBody position={[0, 4, 0]} scale={3}>
          <Stone />
        </RigidBody>
        <RigidBody position={[0, 5, 0]} scale={2}>
          <Stone />
        </RigidBody>
        <RigidBody position={[0, 6, 0]} scale={0.75}>
          <Stone />
        </RigidBody>
        <RigidBody position={[0, 7, 0]}>
          <Stone />
        </RigidBody>

        <Ball position={[2, 4, 0]} />

        <RigidBody position={[2, 5, 0.5]}>
          <ConeCollider args={[0.5, 1]}>
            <mesh castShadow receiveShadow>
              <coneGeometry args={[0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </ConeCollider>
        </RigidBody>
      </Physics>
    </LightProvider>
  )
}

function Ball(props: RigidBodyProps) {
  const colors = ['red', 'green', 'blue', 'yellow', 'purple']
  const [color, setColor] = useState(colors[0])

  // useLayoutEffect(() => {
  //   console.log('layout effect')
  // }, [])

  // useEffect(() => {
  //   console.log('effect')
  // }, [])

  // useFrame(() => {
  //   console.log('frame')
  // })

  return (
    <RigidBody
      {...props}
      onCollision={() => {
        setColor((s) => {
          const currentIndex = colors.indexOf(s)
          const arr = [...colors]
          arr.splice(currentIndex, 1)
          return arr[Math.floor(Math.random() * arr.length)]
        })
      }}
    >
      <BallCollider args={[0.5]} restitution={1} friction={0.9} density={12}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[0.5]} />
          <meshPhongMaterial color={color} />
        </mesh>
      </BallCollider>
    </RigidBody>
  )
}

function Box({ args = [1, 1, 1], ...props }: CuboidColliderProps) {
  return (
    <CuboidCollider args={args} {...props}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshPhongMaterial color={0xfffff0} />
      </mesh>
    </CuboidCollider>
  )
}

function Slopes(props: GroupProps) {
  return (
    <group {...props}>
      <RigidBody
        type="static"
        position={[3, 0.125, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1, 0.25, 1]}
      >
        <Slope />
      </RigidBody>
      <RigidBody
        type="static"
        position={[2, 0.25, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1, 0.5, 1]}
      >
        <Slope />
      </RigidBody>
      <RigidBody
        type="static"
        position={[1, 0.375, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1, 0.75, 1]}
      >
        <Slope />
      </RigidBody>
      <RigidBody
        type="static"
        position={[0, 0.5, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1, 1, 1]}
      >
        <Slope />
      </RigidBody>
      <RigidBody
        type="static"
        position={[-1, 0.625, 0]}
        rotation={[0, Math.PI / 2, 0]}
        scale={[1, 1.25, 1]}
      >
        <Slope />
      </RigidBody>
    </group>
  )
}

function Floor() {
  const size = 30
  const textureRepeat = 30 / 2 / 2
  const tileTexture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/dark/texture_08.png',
  )
  tileTexture.wrapS = tileTexture.wrapT = RepeatWrapping
  tileTexture.repeat.set(textureRepeat, textureRepeat)

  return (
    <RigidBody type="static" position={[0, -0.5, 0]}>
      <CuboidCollider args={[size, 1, size]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[size, 1, size]} />
          <meshStandardMaterial map={tileTexture} />
        </mesh>
      </CuboidCollider>
    </RigidBody>
  )
}

function Wall() {
  const wallTexture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/light/texture_12.png',
  )

  return (
    <RigidBody type="static" position={[5, 3 / 2, 2]}>
      <CuboidCollider args={[1, 3, 6]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1, 3, 6]} />
          <meshPhongMaterial map={wallTexture} />
        </mesh>
      </CuboidCollider>
    </RigidBody>
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function Elevator(props: RigidBodyProps) {
  const ref = useRef<RigidBodyApi>(null)

  useFrame((state) => {
    if (!ref.current) return
    const vec = ref.current.translation()
    vec.y = clamp(3.875 + Math.sin(state.clock.elapsedTime) * 5, 0.25, 7.75)
    ref.current.setNextKinematicTranslation(vec)
  })

  return (
    <RigidBody ref={ref} type="kinematic-position-based" {...props}>
      <CuboidCollider args={[2, 0.5, 2]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2, 0.5, 2]} />
          <meshStandardMaterial color={0xed7200} />
        </mesh>
      </CuboidCollider>
    </RigidBody>
  )
}

function Tower() {
  return (
    <RigidBody type="static">
      <group>
        <Box args={[1, 7, 1]} position={[0.5, 3.5, 0.5]} />
        <Box args={[1, 7, 1]} position={[0.5, 3.5, -2.5]} />
        <Box args={[1, 7, 1]} position={[-2.5, 3.5, 0.5]} />
        <Box args={[1, 7, 1]} position={[-2.5, 3.5, -2.5]} />
      </group>
      <Ramp position={[-1, 1, 2]} />
      <Box args={[2, 0.5, 2]} position={[-4, 1.75, 2]} />
      <Ramp position={[-4, 3, -1]} rotation={[0, -Math.PI / 2, 0]} />
      <Box args={[2, 0.5, 2]} position={[-4, 3.75, -4]} />
      <Ramp position={[-1, 5, -4]} rotation={[0, -Math.PI, 0]} />
      <Box args={[2, 0.5, 2]} position={[2, 5.75, -4]} />
      <Ramp position={[2, 7, -1]} rotation={[0, Math.PI / 2, 0]} />
      <Box args={[2, 0.5, 4]} position={[2, 7.75, 3]} />
      <Box args={[6, 1, 8]} position={[-2, 7.5, 1]} />
    </RigidBody>
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
        shadow-camera-left={-18}
        shadow-camera-bottom={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
      />
    </>
  )
}

function generateHeightfield(nsubdivs: number): Float32Array {
  const heights: Array<number> = []

  const rng = seedrandom('heightfield')

  let i: number
  let j: number
  for (i = 0; i <= nsubdivs; ++i) {
    for (j = 0; j <= nsubdivs; ++j) {
      heights.push(rng())
    }
  }

  return new Float32Array(heights)
}

function generateConvexPolyhedron() {
  const rng = seedrandom('convexPolyhedron')
  const scale = 2.0

  const vertices = []
  for (let l = 0; l < 10; ++l) {
    vertices.push(rng() * scale, rng() * scale, rng() * scale)
  }

  return { vertices: new Float32Array(vertices) }
}

function generateTrimesh(nsubdivs: number, wx: number, wy: number, wz: number) {
  const vertices = []
  const indices = []

  const elementWidth = 1.0 / nsubdivs
  const rng = seedrandom('trimesh')

  let i: number
  let j: number
  for (i = 0; i <= nsubdivs; ++i) {
    for (j = 0; j <= nsubdivs; ++j) {
      const x = (j * elementWidth - 0.5) * wx
      const y = rng() * wy
      const z = (i * elementWidth - 0.5) * wz

      vertices.push(x, y, z)
    }
  }

  for (i = 0; i < nsubdivs; ++i) {
    for (j = 0; j < nsubdivs; ++j) {
      const i1 = (i + 0) * (nsubdivs + 1) + (j + 0)
      const i2 = (i + 0) * (nsubdivs + 1) + (j + 1)
      const i3 = (i + 1) * (nsubdivs + 1) + (j + 0)
      const i4 = (i + 1) * (nsubdivs + 1) + (j + 1)

      indices.push(i1, i3, i2)
      indices.push(i3, i4, i2)
    }
  }

  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
  }
}
