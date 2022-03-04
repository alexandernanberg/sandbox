import {
  Environment,
  Loader,
  OrbitControls,
  Sky as SkyShader,
  useTexture,
} from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { Perf } from 'r3f-perf'
import { Suspense, useState } from 'react'
import seedrandom from 'seedrandom'
import { RepeatWrapping } from 'three'
import {
  DirectionalLight,
  HemisphereLight,
  LightProvider,
} from './components/Lights'
import type { CuboidColliderProps, RigidBodyProps } from './components/Physics'
import {
  BallCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  Physics,
  RigidBody,
} from './components/Physics'
import Ramp from './models/Ramp'
import Stone from './models/Stone'

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
  tileTexture.repeat.set(7.5, 7.5)

  // const trimesh = useConstant(() => generateTrimesh(5, 10, 2, 10))

  // const geometry = useConstant(() => {
  //   const geo = new BufferGeometry()
  //   geo.setIndex(new BufferAttribute(trimesh.indices, 1))
  //   geo.setAttribute('position', new BufferAttribute(trimesh.vertices, 3))
  //   return geo
  // })

  // useLayoutEffect(() => {
  //   geometry.computeVertexNormals()
  // }, [geometry])

  return (
    <LightProvider debug={lightsControl.debug}>
      <Perf position="bottom-right" />
      <fog attach="fog" args={[0xffffff, 10, 90]} />
      <Sky />

      <OrbitControls />

      <Physics debug={physicsControls.debug} key={physicsKey}>
        <Tower />

        <Stone position={[0, 4, 0]} />

        {/* <RigidBody type="static">
          <HeightfieldCollider
            args={[nsubdivs, nsubdivs, heights, { x: 70, y: 4, z: 70 }]}
          >
            <mesh receiveShadow>
              <meshPhongMaterial color="white" side={DoubleSide} />
            </mesh>
          </HeightfieldCollider>
        </RigidBody> */}

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
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 3, 6]} />
              <meshPhongMaterial map={wallTexture} />
            </mesh>
          </CuboidCollider>
        </RigidBody>

        {items.map((item) => (
          <RigidBody key={item} position={[0, 6, 0]}>
            <CuboidCollider args={[1, 1, 1]}>
              <mesh castShadow receiveShadow>
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
            <mesh castShadow receiveShadow>
              <sphereGeometry args={[0.5]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </BallCollider>
        </RigidBody>

        <RigidBody position={[2, 5, 0.5]}>
          <ConeCollider args={[0.5, 1]}>
            <mesh castShadow receiveShadow>
              <coneGeometry args={[0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </ConeCollider>
        </RigidBody>

        <RigidBody position={[-5, 6, 0]}>
          <CylinderCollider args={[0.5, 1]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CylinderCollider>
        </RigidBody>

        <RigidBody position={[-5, 6, -4]}>
          <CylinderCollider args={[0.5, 1]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CylinderCollider>
        </RigidBody>

        <RigidBody position={[-10, 6, 0]}>
          <CylinderCollider args={[0.5, 1]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CylinderCollider>
        </RigidBody>

        <RigidBody position={[-10, 6, -4]}>
          <CylinderCollider args={[0.5, 1]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.5, 0.5, 1]} />
              <meshPhongMaterial color="red" />
            </mesh>
          </CylinderCollider>
        </RigidBody>

        <RigidBody position={[0.5, 5, 5]}>
          <CuboidCollider args={[1, 1, 1]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <meshPhongMaterial color="purple" />
            </mesh>
          </CuboidCollider>
        </RigidBody>
      </Physics>
    </LightProvider>
  )
}

interface BoxProps {
  args?: CuboidColliderProps['args']
  position?: RigidBodyProps['position']
  quaternion?: RigidBodyProps['quaternion']
  rotation?: RigidBodyProps['rotation']
}

function Box({ args = [1, 1, 1], position, quaternion, rotation }: BoxProps) {
  return (
    <CuboidCollider
      args={args}
      position={position}
      quaternion={quaternion}
      rotation={rotation}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={args} />
        <meshPhongMaterial color={0xfffff0} />
      </mesh>
    </CuboidCollider>
  )
}

function Tower() {
  return (
    <RigidBody type="static" position={[-6, 0, 0]}>
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

  return (
    <>
      <SkyShader
        sunPosition={controls.sun}
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
