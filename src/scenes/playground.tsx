import { useTexture } from '@react-three/drei'
import type { Color, GroupProps } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { button, useControls } from 'leva'
import { useRef, useState } from 'react'
import seedrandom from 'seedrandom'
import { RepeatWrapping } from 'three'
import type {
  CuboidColliderProps,
  RigidBodyApi,
  RigidBodyProps,
} from '../components/physics'
import {
  BallCollider,
  CapsuleCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useSphericalJoint,
} from '../components/physics'
import Ramp from '../models/ramp'
import Slope from '../models/slope'
import Stone from '../models/stone'

export function Playground() {
  const [items, setItems] = useState<Array<number>>([])

  const spawnItems = (num = 1) => {
    setItems((state) => [
      ...state,
      ...new Array(num).fill(0).map((_, i) => i * 100_000 + performance.now()),
    ])
  }

  const objectControls = useControls(
    'Objects',
    {
      _spawn: {
        label: 'Spawn 10 balls',
        ...button(() => spawnItems(10)),
      },
      _reset: {
        label: 'Reset',
        ...button(() => setItems([])),
      },
    },
    {
      collapsed: true,
    },
  )

  return (
    <>
      <Floor />
      <Walls />

      {items.map((item) => (
        <Ball key={item} position={[Math.random(), 6, Math.random()]} />
      ))}

      <Character />

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

      <RockingBoard position={[-8, 0.5, 12]} />

      <Swing position={[8, 0, 12]} rotation-y={-Math.PI / 2} />

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

      <RigidBody position={[0, 4, -2]} scale={3} angularVelocity={[10, 0, 0]}>
        <Stone />
      </RigidBody>
      <RigidBody position={[0, 5, -2]} scale={2}>
        <Stone />
      </RigidBody>
      <RigidBody position={[0, 6, -2]} scale={0.75}>
        <Stone />
      </RigidBody>
      <RigidBody position={[0, 7, -2]}>
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
    </>
  )
}

function Character(props: RigidBodyProps) {
  return (
    <RigidBody
      restrictRotation={[true, false, true]}
      position={[0, 1.75 / 2, 0]}
      {...props}
    >
      <CapsuleCollider args={[0.5, 1.75]}>
        <mesh castShadow receiveShadow>
          <capsuleGeometry args={[0.5, 1.75, 10, 20]} />
          <meshPhongMaterial color={0xf0f0f0} />
        </mesh>
      </CapsuleCollider>
    </RigidBody>
  )
}

function Swing(props: GroupProps) {
  const rackRef = useRef<RigidBodyApi>(null)
  const chain1Ref = useRef<RigidBodyApi>(null)
  const chain2Ref = useRef<RigidBodyApi>(null)
  const chain3Ref = useRef<RigidBodyApi>(null)
  const chain4Ref = useRef<RigidBodyApi>(null)

  // useSphericalJoint(rackRef, chain1Ref, [
  //   { x: 0, y: 1.7, z: 0 },
  //   { x: 0, y: 1.4, z: 0 },
  // ])

  useSphericalJoint(chain2Ref, chain1Ref, [
    { x: 0, y: 0.26, z: 0 },
    { x: 0, y: -0.26, z: 0 },
  ])

  useSphericalJoint(chain3Ref, chain2Ref, [
    { x: 0, y: 0.26, z: 0 },
    { x: 0, y: -0.26, z: 0 },
  ])
  useSphericalJoint(chain4Ref, chain3Ref, [
    { x: 0, y: 0.26, z: 0 },
    { x: 0, y: -0.26, z: 0 },
  ])

  return (
    <group {...props}>
      <RigidBody position={[0, 1.7, 0]} type="static" ref={rackRef}>
        <CylinderCollider
          args={[0.1, 4]}
          position={[1, 0, -1.9]}
          rotation-z={0.52}
        >
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.1, 0.1, 4, 10]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CylinderCollider>
        <CylinderCollider
          args={[0.1, 4]}
          position={[-1, 0, -1.9]}
          rotation-z={-0.52}
        >
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.1, 0.1, 4, 10]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CylinderCollider>

        <CylinderCollider
          args={[0.1, 4]}
          position={[1, 0, 1.9]}
          rotation-z={0.52}
        >
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.1, 0.1, 4, 10]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CylinderCollider>
        <CylinderCollider
          args={[0.1, 4]}
          position={[-1, 0, 1.9]}
          rotation-z={-0.52}
        >
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.1, 0.1, 4, 10]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CylinderCollider>
        <CylinderCollider
          args={[0.1, 4]}
          position={[0, 1.75, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.1, 0.1, 4, 10]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CylinderCollider>
      </RigidBody>

      <group position={[0, 1.75, 1]}>
        <RigidBody ref={chain1Ref} position={[0, 1.5, 0]}>
          <CylinderCollider args={[0.05, 0.5]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
              <meshPhongMaterial color={0xadadad} />
            </mesh>
          </CylinderCollider>
        </RigidBody>
        <RigidBody ref={chain2Ref} position={[0, 1, 0]}>
          <CylinderCollider args={[0.05, 0.5]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
              <meshPhongMaterial color={0xadadad} />
            </mesh>
          </CylinderCollider>
        </RigidBody>
        <RigidBody ref={chain3Ref} position={[0, 0, 0]}>
          <CylinderCollider args={[0.05, 0.5]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
              <meshPhongMaterial color={0xadadad} />
            </mesh>
          </CylinderCollider>
        </RigidBody>
        <RigidBody ref={chain4Ref} position={[0, -1, 0]}>
          <CylinderCollider args={[0.05, 0.5]}>
            <mesh castShadow receiveShadow>
              <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
              <meshPhongMaterial color={0xadadad} />
            </mesh>
          </CylinderCollider>
        </RigidBody>
      </group>
    </group>
  )
}

function Ball(props: RigidBodyProps) {
  const colors = ['red', 'green', 'blue', 'yellow', 'purple']
  const [color, setColor] = useState(
    () => colors[Math.floor(Math.random() * colors.length)],
  )
  const ref = useRef<RigidBodyApi>(null)

  return (
    <RigidBody
      {...props}
      ref={ref}
      onPointerDown={() => {
        ref.current?.applyImpulse({ x: 0, y: 50, z: 0 }, true)
      }}
      // onCollision={() => {
      // ref.current?.setLinvel({ x: 0, y: 5, z: 0 }, true)
      // setColor((s) => {
      // const currentIndex = colors.indexOf(s)
      // const arr = [...colors]
      // arr.splice(currentIndex, 1)
      // return arr[Math.floor(Math.random() * arr.length)]
      // })
      // }}
      // onCollisionEnter={() => {
      //   setColor('green')
      // }}
      // onCollisionExit={() => {
      //   setColor('red')
      // }}
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
    const rigidBody = ref.current
    if (!rigidBody) return
    const vec = rigidBody.translation()
    vec.y = clamp(3.875 + Math.sin(state.clock.elapsedTime) * 5, 0.25, 7.75)
    rigidBody.setNextKinematicTranslation(vec)
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
        <Box args={[1, 7, 1]} position={[0.5, 3.5, 0.5]} color={0x9f9f9f} />
        <Box args={[1, 7, 1]} position={[0.5, 3.5, -2.5]} color={0x9f9f9f} />
        <Box args={[1, 7, 1]} position={[-2.5, 3.5, 0.5]} color={0x9f9f9f} />
        <Box args={[1, 7, 1]} position={[-2.5, 3.5, -2.5]} color={0x9f9f9f} />
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
