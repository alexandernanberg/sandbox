import {Text, useTexture} from '@react-three/drei'
import type {Color} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useActions} from 'koota/react'
import type {ComponentProps, RefObject} from 'react'
import {Suspense, useRef, useState} from 'react'
import {RepeatWrapping, Vector3} from 'three'
import {useControls} from '~/components/debug-controls'
import type {InputManagerRef} from '~/components/input-manager'
import {actions} from '~/ecs'
import {Balls} from '~/ecs/balls'
import {
  RigidBody,
  CuboidCollider,
  BallCollider,
  ConeCollider,
  CylinderCollider,
  usePhysicsUpdate,
  RigidBodyRef,
  CharacterController,
} from '~/ecs/physics'
import type {CharacterControllerApi} from '~/ecs/physics'
import Ramp from '~/models/ramp'
import Slope from '~/models/slope'
import Stone from '~/models/stone'

interface PlaygroundProps {
  debugCamera: boolean
  inputManagerRef: RefObject<InputManagerRef | null>
}

export function Playground({
  debugCamera: _debugCamera,
  inputManagerRef,
}: PlaygroundProps) {
  // useActions gives us ECS actions bound to the world in context
  const {spawnBalls, clearBalls} = useActions(actions)

  const _objectControls = useControls(
    'Objects',
    {
      _spawn: {
        title: 'Spawn 10 balls',
        action: () => spawnBalls(10), // ECS action instead of setState
      },
      _reset: {
        title: 'Reset',
        index: 1,
        action: () => clearBalls(), // ECS action to destroy entities
      },
    },
    {expanded: true, index: 4},
  )

  return (
    <>
      <Player position={[0, 2, 0]} inputManagerRef={inputManagerRef} />

      <Floor />
      <Walls />

      {/* ECS-managed balls - queries the world for all IsBall entities */}
      <Balls />

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

// TODO: ChainSegment and Swing use physics joints which aren't in ECS yet
// Uncomment and migrate when ECS joints are implemented

interface BallProps {
  position?: [number, number, number]
  linearVelocity?: [number, number, number]
}

function Ball({position, linearVelocity}: BallProps) {
  const colors = ['red', 'green', 'blue', 'yellow', 'purple']
  const [color] = useState(
    () => colors[Math.floor(Math.random() * colors.length)],
  )
  const entityRef = useRef<Entity | null>(null)

  const handlePointerDown = () => {
    const entity = entityRef.current
    if (!entity) return
    const bodyRef = entity.get(RigidBodyRef)
    if (bodyRef?.body) {
      bodyRef.body.applyImpulse({x: 0, y: 5, z: 0}, true)
    }
  }

  return (
    <RigidBody
      position={position}
      linearVelocity={linearVelocity}
      entityRef={entityRef}
    >
      <BallCollider radius={0.5} restitution={1} friction={0.9} density={1}>
        <mesh castShadow receiveShadow onPointerDown={handlePointerDown}>
          <sphereGeometry args={[0.5]} />
          <meshPhongMaterial color={color} />
        </mesh>
      </BallCollider>
    </RigidBody>
  )
}

function RockingBoard(props: ComponentProps<'group'>) {
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

interface BoxProps {
  args?: [number, number, number]
  color?: Color
  friction?: number
  restitution?: number
  density?: number
  position?: [number, number, number]
}

function Box({args = [1, 1, 1], color = 0xfffff0, ...props}: BoxProps) {
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

function Slopes(props: ComponentProps<'group'>) {
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
  const thickness = 1
  const height = 10
  const area = 50

  const y = height / 2
  const pos = area / 2 + thickness / 2

  return (
    <>
      <RigidBody type="fixed" position={[pos, y, 0]}>
        <CuboidCollider args={[thickness, height, area]} />
      </RigidBody>
      <RigidBody type="fixed" position={[pos * -1, y, 0]}>
        <CuboidCollider args={[thickness, height, area]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, y, pos]}>
        <CuboidCollider args={[area, height, thickness]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, y, pos * -1]}>
        <CuboidCollider args={[area, height, thickness]} />
      </RigidBody>
    </>
  )
}

function Floor() {
  const size = 50
  const textureRepeat = size / 2
  const tileTexture = useTexture('/textures/prototype/light/texture_08.png')
  // eslint-disable-next-line react-compiler/react-compiler
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for future use
function Wall() {
  const wallTexture = useTexture('/textures/prototype/light/texture_12.png')

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

interface ElevatorProps {
  position?: [number, number, number]
}

function Elevator({position}: ElevatorProps) {
  const entityRef = useRef<Entity | null>(null)

  usePhysicsUpdate(() => {
    const entity = entityRef.current
    if (!entity) return
    const bodyRef = entity.get(RigidBodyRef)
    if (!bodyRef?.body) return
    const vec = bodyRef.body.translation()
    vec.y = clamp(3.875 + Math.sin(performance.now() / 1000) * 5, 0.25, 7.75)
    bodyRef.body.setNextKinematicTranslation(vec)
  })

  return (
    <RigidBody
      position={position}
      entityRef={entityRef}
      type="kinematic-position-based"
    >
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

// ============================================
// Player with keyboard controls
// ============================================

interface PlayerProps {
  position?: [number, number, number]
  inputManagerRef: RefObject<InputManagerRef | null>
}

function Player({position, inputManagerRef}: PlayerProps) {
  const controllerRef = useRef<CharacterControllerApi | null>(null)

  const velocity = useRef(new Vector3())
  const walkSpeed = 5
  const sprintSpeed = 8
  const jumpHeight = 1
  const gravity = -1

  usePhysicsUpdate((delta) => {
    const controller = controllerRef.current
    const inputManager = inputManagerRef.current
    if (!controller || !inputManager) return

    const input = inputManager.getInput()
    const {grounded: isGrounded} = controller.getMovement()

    // Get input from input manager
    const inputMovement = input.movement.clone().normalize()
    const sprint = input.keyboard.ShiftLeft
    const jump = input.keyboard.Space

    const speed = sprint ? sprintSpeed : walkSpeed

    // Horizontal movement (inputMovement.x = left/right, inputMovement.y = forward/back)
    velocity.current.x = inputMovement.x * speed * delta
    velocity.current.z = inputMovement.y * speed * delta

    // Jumping
    if (isGrounded && jump) {
      velocity.current.y = Math.sqrt(jumpHeight * -0.05 * gravity)
    }

    // Gravity
    if (isGrounded && velocity.current.y < 0) {
      velocity.current.y = 0
    } else {
      velocity.current.y += gravity * delta
    }

    controller.setVelocity(
      velocity.current.x,
      velocity.current.y,
      velocity.current.z,
    )
  })

  return (
    <CharacterController
      ref={controllerRef}
      position={position}
      height={1.75}
      radius={0.5}
    >
      <mesh castShadow receiveShadow>
        <capsuleGeometry args={[0.5, 1.75, 4, 8]} />
        <meshPhongMaterial color={0xf0f0f0} />
      </mesh>
      <mesh castShadow receiveShadow position={[0, 1.15, 0.3]}>
        <boxGeometry args={[0.5, 0.25, 0.5]} />
        <meshPhongMaterial color={0xf0f0f0} />
      </mesh>
    </CharacterController>
  )
}
