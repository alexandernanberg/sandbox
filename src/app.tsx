import {
  Loader,
  OrbitControls,
  Sky as SkyShader,
  Stats,
  useTexture,
} from '@react-three/drei'
import type { Color, GroupProps } from '@react-three/fiber'
import { Canvas, useFrame } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { Suspense, useEffect, useReducer, useRef, useState } from 'react'
import seedrandom from 'seedrandom'
import { Euler, Quaternion, RepeatWrapping } from 'three'
import {
  DirectionalLight,
  HemisphereLight,
  LightProvider,
} from './components/lights'
import type {
  CuboidColliderProps,
  RigidBodyApi,
  RigidBodyProps,
} from './components/physics'
import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
} from './components/physics'
import Ramp from './models/ramp'
import Slope from './models/slope'
import Stone from './models/stone'

export function Root() {
  return (
    <>
      <Canvas camera={{ position: [6, 6, -4] }} shadows>
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

  const q1 = new Quaternion().setFromEuler(new Euler(0, 0.5, 0))
  const q2 = new Quaternion().setFromEuler(new Euler(0, -0.5, 0))

  const [items, setItems] = useState<Array<number>>([])

  useEffect(() => {
    const handler = () => {
      setItems((prev) => [...prev, performance.now()])
    }
    document.addEventListener('pointerdown', handler)
    return () => {
      document.removeEventListener('pointerdown', handler)
    }
  }, [])

  return (
    <LightProvider debug={lightsControl.debug}>
      <Stats />
      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <OrbitControls target={[0, 0, 0]} />

      <Physics
        key={physicsKey}
        debug={physicsControls.debug}
        gravity={physicsControls.gravity}
      >
        <Floor />
        <Walls />

        {items.map((item) => (
          <Ball key={item} position={[Math.random(), 3, Math.random()]} />
        ))}

        <Slopes position={[0, 0, 12]} />

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
        <group position={[3, 3, 0]}>
          <RigidBody rotation={[0, 0.5, 0]}>
            <CuboidCollider args={[1, 1, 1]}>
              <mesh castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshPhongMaterial color="red" />
              </mesh>
            </CuboidCollider>
          </RigidBody>
        </group>

        <RockingBoard
          // rotation-y={-Math.PI / 2}
          position={[-8, 0.5, 12]}
        />

        <RigidBody position={[-7, 12, 0]}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CuboidCollider>
        </RigidBody>

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

        <RigidBody position={[0, 4, 0]} scale={3} angularVelocity={[10, 0, 0]}>
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

        <Ball position={[2, 4, 0]} linearVelocity={[1, 10, 0]} />

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
  const ref = useRef<RigidBodyApi>(null)

  return (
    <RigidBody
      {...props}
      ref={ref}
      // onCollision={() => {
      // ref.current?.setLinvel({ x: 0, y: 5, z: 0 }, true)
      // setColor((s) => {
      // const currentIndex = colors.indexOf(s)
      // const arr = [...colors]
      // arr.splice(currentIndex, 1)
      // return arr[Math.floor(Math.random() * arr.length)]
      // })
      // }}
      onCollisionEnter={() => {
        setColor('green')
      }}
      onCollisionExit={() => {
        setColor('red')
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

function RockingBoard(props: GroupProps) {
  return (
    <group {...props}>
      <RigidBody type="static" rotation-x={Math.PI / 2}>
        <CylinderCollider args={[0.5, 1]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
            <meshPhongMaterial color={0xadadad} />
          </mesh>
        </CylinderCollider>
      </RigidBody>
      <RigidBody
        position={[0, 0.75, 0]}
        rotation-z={-0.3}
        lockPosition
        restrictRotation={[true, true, false]}
      >
        <CuboidCollider args={[7, 0.25, 1]} restitution={0} density={1}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[7, 0.25, 1]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CuboidCollider>
      </RigidBody>
      <RigidBody position={[-2.5, 5, 0]}>
        <Box args={[1, 1, 1]} friction={1} density={100} color="blue" />
      </RigidBody>
      <RigidBody position={[2.5, 0.5, 0]}>
        <Box args={[0.5, 0.5, 0.5]} friction={1} restitution={0} color="blue" />
      </RigidBody>
    </group>
  )
}

function Box({
  args = [1, 1, 1],
  color = 0xfffff0,
  ...props
}: CuboidColliderProps & { color?: Color }) {
  return (
    <CuboidCollider args={args} {...props}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshPhongMaterial color={color} />
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

function Walls() {
  const width = 1
  const height = 10
  return (
    <>
      <RigidBody type="static" position={[15.5, height / 2, 0]}>
        <CuboidCollider args={[width, height, 30]} />
      </RigidBody>
      <RigidBody type="static" position={[-15.5, height / 2, 0]}>
        <CuboidCollider args={[width, height, 30]} />
      </RigidBody>
      <RigidBody type="static" position={[0, height / 2, 15.5]}>
        <CuboidCollider args={[30, height, width]} />
      </RigidBody>
      <RigidBody type="static" position={[0, height / 2, -15.5]}>
        <CuboidCollider args={[30, height, width]} />
      </RigidBody>
    </>
  )
}

function Floor() {
  const size = 30
  const textureRepeat = 30 / 2 / 2
  const tileTexture = useTexture(
    'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@latest/prototype/light/texture_08.png',
  )
  tileTexture.wrapS = tileTexture.wrapT = RepeatWrapping
  tileTexture.repeat.set(textureRepeat, textureRepeat)

  return (
    <RigidBody type="static" position={[0, 0, 0]}>
      <CuboidCollider args={[size, 0, size]}>
        <mesh castShadow receiveShadow rotation-x={Math.PI / -2}>
          <planeGeometry args={[size, size]} />
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
        shadow-camera-left={-22}
        shadow-camera-bottom={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
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
