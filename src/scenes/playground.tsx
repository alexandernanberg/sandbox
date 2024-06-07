/* eslint-disable @typescript-eslint/no-unused-vars */

import { PerspectiveCamera, Text, useTexture } from '@react-three/drei'
import type { GroupProps, Color } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { button, useControls } from 'leva'
import type { ComponentProps, MutableRefObject, RefObject } from 'react'
import { Suspense, forwardRef, useRef, useState } from 'react'
import seedrandom from 'seedrandom'
import type { Object3D } from 'three'
import { Quaternion, RepeatWrapping, Vector3 } from 'three'
import type { InputManagerRef } from '~/components/input-manager'
import { InputManager } from '~/components/input-manager'
import type {
  CuboidColliderProps,
  RigidBodyApi,
  RigidBodyProps,
} from '~/components/physics'
import {
  BallCollider,
  CapsuleCollider,
  ConeCollider,
  CuboidCollider,
  CylinderCollider,
  RigidBody,
  useCharacterController,
  usePhysicsUpdate,
  useSphericalJoint,
} from '~/components/physics'
import Ramp from '~/models/ramp'
import Slope from '~/models/slope'
import Stone from '~/models/stone'
import { useConstant, useForkRef } from '~/utils'

interface PlaygroundProps {
  debugCamera: boolean
}

export function Playground({ debugCamera }: PlaygroundProps) {
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

  const inputManagerRef = useRef<InputManagerRef>(null)
  const targetRef = useRef<Object3D>(null)

  return (
    <>
      <Floor />
      <Walls />

      {items.map((item) => (
        <Ball key={item} position={[Math.random(), 6, Math.random()]} />
      ))}

      <InputManager ref={inputManagerRef} />

      <Player
        position={[0, 3, 0]}
        inputManagerRef={inputManagerRef}
        ref={targetRef}
      />
      <ThirdPersonCamera
        targetRef={targetRef}
        inputManagerRef={inputManagerRef}
        makeDefault={!debugCamera}
      />

      <Slopes position={[8, 0, 3]} />

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

      {/* <Swing position={[8, 0, 12]} rotation-y={-Math.PI / 2} /> */}

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

interface PlayerProps extends RigidBodyProps {
  inputManagerRef: RefObject<InputManagerRef>
}

const Player = forwardRef<Object3D, PlayerProps>(function Player(
  { inputManagerRef, ...props },
  forwardedRef,
) {
  const rigidBodyRef = useRef<RigidBodyApi>(null)
  const characterControllerRef = useCharacterController({ offset: 0.1 })

  const gravity = -9.81
  const speed = 0.1
  const playerVelocity = new Vector3(0, 0, 0)
  const jumpHeight = 1

  usePhysicsUpdate((delta) => {
    const rigidBody = rigidBodyRef.current
    const inputManager = inputManagerRef.current
    if (!rigidBody || !inputManager) return
    const characterController = characterControllerRef.current()

    const input = inputManager.getInput()
    const inputMovement = input.movement.normalize()
    const nextPos = rigidBody.translation()

    const isGrounded = characterController.computedGrounded()

    playerVelocity.x = inputMovement.x * speed
    playerVelocity.z = inputMovement.y * speed

    if (isGrounded && playerVelocity.y < 0) {
      playerVelocity.y = 0
    }

    if (isGrounded && input.keyboard.Space) {
      playerVelocity.y += Math.sqrt(jumpHeight * -0.05 * gravity)
    }

    playerVelocity.y += gravity * delta

    characterController.computeColliderMovement(
      rigidBody.collider(0),
      playerVelocity,
    )

    const movement = characterController.computedMovement()
    nextPos.x += movement.x
    nextPos.y += movement.y
    nextPos.z += movement.z
    rigidBody.setNextKinematicTranslation(nextPos)
  })

  return (
    <RigidBody ref={rigidBodyRef} type="kinematic-position-based" {...props}>
      <object3D ref={forwardedRef}>
        <CapsuleCollider args={[0.5, 1.75]}>
          <mesh castShadow receiveShadow>
            <capsuleGeometry args={[0.5, 1.75, 10, 20]} />
            <meshPhongMaterial color={0xf0f0f0} />
          </mesh>
        </CapsuleCollider>
      </object3D>
    </RigidBody>
  )
})

interface ThirdPersonCameraProps {
  targetRef: RefObject<Object3D>
  inputManagerRef: RefObject<InputManagerRef>
  makeDefault?: boolean
}

const ThirdPersonCamera = forwardRef<Object3D, ThirdPersonCameraProps>(
  function ThirdPersonCamera(
    { targetRef, inputManagerRef, makeDefault = true },
    forwardedRef,
  ) {
    const ref = useRef()
    const cameraRef = forwardedRef || ref
    const groupRef = useRef()

    const currentPosition = useConstant(() => new Vector3())
    const currentLookAt = useConstant(() => new Vector3())

    useFrame((_, delta) => {
      const camera = cameraRef.current
      const target = targetRef.current
      const inputManager = inputManagerRef.current

      if (!target || !inputManager) return
      // const group = groupRef.current;
      const input = inputManager.getInput()

      // console.log(input.lookAt)

      const pos = new Vector3()
      target.getWorldPosition(pos)
      const quat = new Quaternion()
      target.getWorldQuaternion(quat)

      const idealOffset = new Vector3(0.5, 2.5, -3)
      idealOffset.applyQuaternion(quat)
      idealOffset.add(pos)

      const idealLookAt = new Vector3(0, 0, 5)
      idealLookAt.applyQuaternion(quat)
      idealLookAt.add(pos)

      const t = 1.05 - Math.pow(0.001, delta)
      currentPosition.lerp(idealOffset, t)
      currentLookAt.lerp(idealLookAt, t)

      camera.position.copy(currentPosition)
      camera.lookAt(currentLookAt)
    })

    return (
      <group>
        <PerspectiveCamera
          makeDefault={makeDefault}
          ref={cameraRef}
          fov={90}
          position={[0, 4, 8]}
          zoom={1.2}
          near={0.1}
          far={1000}
        />
      </group>
    )
  },
)

interface ChainSegmentProps extends RigidBodyProps {
  target: MutableRefObject<RigidBodyApi | null>
}

const ChainSegment = forwardRef<RigidBodyApi, ChainSegmentProps>(
  function ChainSegment({ target }, forwardedRef) {
    const ownRef = useRef<RigidBodyApi | null>(null)
    const ref = useForkRef(ownRef, forwardedRef)

    useSphericalJoint(ownRef, target, [
      { x: 0, y: 0.26, z: 0 },
      { x: 0, y: -0.26, z: 0 },
    ])

    return (
      <RigidBody ref={ref} position={[0, 0, 0]}>
        <CylinderCollider args={[0.05, 0.5]}>
          <mesh castShadow receiveShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.5, 6]} />
            <meshPhongMaterial color={0xadadad} />
          </mesh>
        </CylinderCollider>
      </RigidBody>
    )
  },
)

// interface ChainProps {
//   target: MutableRefObject<RigidBodyApi | null>
//   segments: number
// }

// const Chain = forwardRef<RigidBodyApi, ChainProps>(function Chain(
//   { target, segments },
//   forwardedRef,
// ) {
//   const segmentsArray = useMemo(() =>new Array(segments - 1), [segments])
//   const segmentsRef = useRef(segmentsArray.map(() => createRef<RigidBodyApi>()))

//   console.log(segmentsArray)

//   return (<>

// <ChainSegment key={index} ref={segmentsRef.current[index]} target={target} />
//   {segmentsArray.map((_, index) => {
//     return (
//       <ChainSegment key={index} ref={segmentsRef.current[index]} target={} />
//     )
//   })}
//   </>
// })

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
      <RigidBody position={[0, 1.7, 0]} type="fixed" ref={rackRef}>
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

        <ChainSegment ref={chain1Ref} target={chain1Ref} />
        <ChainSegment ref={chain1Ref} target={chain2Ref} />
        <ChainSegment ref={chain1Ref} target={chain3Ref} />
        <ChainSegment ref={chain1Ref} target={chain4Ref} />
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
      <RigidBody type="fixed" rotation-x={Math.PI / 2}>
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
        restrictPosition={[true, true, true]}
      >
        <CuboidCollider args={[7, 0.25, 1]} restitution={0} density={1}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[7, 0.25, 1]} />
            <meshPhongMaterial color={0x964b00} />
          </mesh>
        </CuboidCollider>
      </RigidBody>
      <RigidBody position={[-2.5, 5, 0]}>
        <Box args={[1, 1, 1]} friction={1} density={50} color="blue" />
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

function runFromAngleAndRaise(angle: number, rise: number) {
  const radians = (angle * Math.PI) / 180
  return rise / Math.tan(radians)
}

function Slopes(props: GroupProps) {
  const slopes = [30, 45, 60, 80, 90].map((angle, index) => {
    const run = runFromAngleAndRaise(angle, 2)
    return (
      <group key={angle}>
        <CuboidCollider args={[2, 4, 2]} position={[0, 2, 2 * index]}>
          <Suspense fallback={null}>
            <Text
              position={[-1.01, 1, 0]}
              rotation={[0, -Math.PI / 2, 0]}
              color={'#000'}
              fontSize={0.75}
              maxWidth={200}
              lineHeight={1}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
            >
              {angle}&deg;
            </Text>
          </Suspense>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2, 4, 2]} />
            <meshPhongMaterial color={0xfffff0} />
          </mesh>
        </CuboidCollider>
        <Slope
          position={[-1.001 - run / 2, 1, 2 * index]}
          scale={[run, 2, 2]}
          rotation={[0, Math.PI, 0]}
        />
      </group>
    )
  })

  return (
    <group {...props}>
      <RigidBody type="fixed">{slopes}</RigidBody>
    </group>
  )
}

function Walls() {
  const width = 1
  const height = 10
  return (
    <>
      <RigidBody type="fixed" position={[15.5, height / 2, 0]}>
        <CuboidCollider args={[width, height, 30]} />
      </RigidBody>
      <RigidBody type="fixed" position={[-15.5, height / 2, 0]}>
        <CuboidCollider args={[width, height, 30]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, height / 2, 15.5]}>
        <CuboidCollider args={[30, height, width]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, height / 2, -15.5]}>
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
    <RigidBody type="fixed" position={[0, 0, 0]}>
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
    <RigidBody type="fixed" position={[5, 3 / 2, 2]}>
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

  usePhysicsUpdate(() => {
    const rigidBody = ref.current
    if (!rigidBody) return
    const vec = rigidBody.translation()
    vec.y = clamp(3.875 + Math.sin(performance.now() / 1000) * 5, 0.25, 7.75)
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
    <RigidBody type="fixed">
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
