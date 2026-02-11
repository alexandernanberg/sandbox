import {Text, useTexture} from '@react-three/drei'
import type {Color} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useActions} from 'koota/react'
import type {ComponentProps} from 'react'
import {Suspense, useLayoutEffect, useRef, useState} from 'react'
import {RepeatWrapping} from 'three'
import {OrbitDebugVisualizer, ThirdPersonCamera} from '~/components/cameras'
import {useControls, useMonitor} from '~/components/debug-controls'
import {
  actions,
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  FacingDirection,
} from '~/ecs'
import {Balls} from '~/ecs/balls'
import {IsCameraTarget} from '~/ecs/camera'
import {
  RigidBody,
  CuboidCollider,
  BallCollider,
  ConeCollider,
  CylinderCollider,
  usePhysicsUpdate,
  RigidBodyRef,
  CharacterController,
  CharacterMovement,
  KinematicVelocity,
} from '~/ecs/physics'
import type {CharacterControllerApi} from '~/ecs/physics'
import Ramp from '~/models/ramp'
import Slope from '~/models/slope'
import Stone from '~/models/stone'

interface PlaygroundProps {
  debugCamera: boolean
  showOrbitRings: boolean
}

export function Playground({debugCamera, showOrbitRings}: PlaygroundProps) {
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
      {!debugCamera && <ThirdPersonCamera />}
      {showOrbitRings && <OrbitDebugVisualizer />}
      <Player position={[0, 2, 0]} />

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

      {/* Spinning platforms */}
      <SpinningPlatform position={[-12, 0.5, 8]} speed={1.5} />
      <SpinningPlatform
        position={[-12, 0.5, -8]}
        speed={0.8}
        size={[10, 0.25, 2]}
        color={0xd94a90}
      />

      {/* Trampoline */}
      <Trampoline position={[12, 0, 8]} />

      {/* Stairs */}
      <Stairs position={[0, 0, -10]} />
      {/* Gentler stairs - smaller step height */}
      <Stairs position={[4, 0, -10]} stepHeight={0.15} stepDepth={0.5} />

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
  const prevY = useRef<number | null>(null)
  const physicsTime = useRef(0)

  useLayoutEffect(() => {
    const entity = entityRef.current
    if (!entity) return
    entity.add(KinematicVelocity)
    return () => {
      if (entity.isAlive()) {
        entity.remove(KinematicVelocity)
      }
    }
  }, [])

  usePhysicsUpdate((delta) => {
    const entity = entityRef.current
    if (!entity) return
    const bodyRef = entity.get(RigidBodyRef)
    if (!bodyRef?.body) return

    // Use physics time instead of wall time to ensure consistent velocity
    // across multiple physics steps per frame
    physicsTime.current += delta

    const vec = bodyRef.body.translation()
    const newY = clamp(3.875 + Math.sin(physicsTime.current) * 5, 0.25, 7.75)

    // Set velocity (per-frame delta)
    if (prevY.current !== null) {
      entity.set(KinematicVelocity, {
        x: 0,
        y: newY - prevY.current,
        z: 0,
        ax: 0,
        ay: 0,
        az: 0,
      })
    }
    prevY.current = newY

    vec.y = newY
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
// Spinning Platform
// ============================================

interface SpinningPlatformProps {
  position?: [number, number, number]
  speed?: number
  size?: [number, number, number]
  color?: number
}

function SpinningPlatform({
  position,
  speed = 1,
  size = [4, 0.25, 4],
  color = 0x4a90d9,
}: SpinningPlatformProps) {
  const entityRef = useRef<Entity | null>(null)
  const angle = useRef(0)

  useLayoutEffect(() => {
    const entity = entityRef.current
    if (!entity) return
    entity.add(KinematicVelocity)
    return () => {
      if (entity.isAlive()) {
        entity.remove(KinematicVelocity)
      }
    }
  }, [])

  usePhysicsUpdate((delta) => {
    const entity = entityRef.current
    if (!entity) return
    const bodyRef = entity.get(RigidBodyRef)
    if (!bodyRef?.body) return

    const angularVelocity = speed * delta
    angle.current += angularVelocity
    const body = bodyRef.body
    const pos = body.translation()

    // Set angular velocity (radians per physics step around Y axis)
    entity.set(KinematicVelocity, {
      x: 0,
      y: 0,
      z: 0,
      ax: 0,
      ay: angularVelocity,
      az: 0,
    })

    // Set next kinematic rotation (quaternion for Y-axis rotation)
    const halfAngle = angle.current / 2
    body.setNextKinematicRotation({
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    })
    body.setNextKinematicTranslation(pos)
  })

  return (
    <RigidBody
      position={position}
      entityRef={entityRef}
      type="kinematic-position-based"
    >
      <CuboidCollider args={size}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={color} />
        </mesh>
      </CuboidCollider>
    </RigidBody>
  )
}

// ============================================
// Trampoline
// ============================================

interface TrampolineProps {
  position?: [number, number, number]
}

function Trampoline({position}: TrampolineProps) {
  return (
    <RigidBody type="fixed" position={position}>
      {/* Frame */}
      <CuboidCollider args={[3, 0.2, 3]} position={[0, -0.1, 0]}>
        <mesh castShadow receiveShadow position={[0, -0.1, 0]}>
          <boxGeometry args={[3, 0.2, 3]} />
          <meshStandardMaterial color={0x333333} />
        </mesh>
      </CuboidCollider>
      {/* Bouncy surface */}
      <CuboidCollider
        args={[2.5, 0.1, 2.5]}
        position={[0, 0.1, 0]}
        restitution={2}
        friction={0.8}
      >
        <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
          <boxGeometry args={[2.5, 0.1, 2.5]} />
          <meshStandardMaterial color={0xff4444} />
        </mesh>
      </CuboidCollider>
    </RigidBody>
  )
}

// ============================================
// Stairs
// ============================================

interface StairsProps {
  position?: [number, number, number]
  stepCount?: number
  stepHeight?: number
  stepDepth?: number
  stepWidth?: number
}

function Stairs({
  position = [0, 0, 0],
  stepCount = 8,
  stepHeight = 0.25,
  stepDepth = 0.4,
  stepWidth = 3,
}: StairsProps) {
  const steps = []

  for (let i = 0; i < stepCount; i++) {
    const y = stepHeight / 2 + i * stepHeight
    const z = -i * stepDepth
    steps.push(
      <CuboidCollider
        key={i}
        args={[stepWidth, stepHeight, stepDepth]}
        position={[0, y, z]}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[stepWidth, stepHeight, stepDepth]} />
          <meshStandardMaterial color={0x808080} />
        </mesh>
      </CuboidCollider>,
    )
  }

  return (
    <RigidBody type="fixed" position={position}>
      {steps}
    </RigidBody>
  )
}

// ============================================
// Player with ECS-driven movement
// ============================================

interface PlayerProps {
  position?: [number, number, number]
}

function Player({position}: PlayerProps) {
  const controllerRef = useRef<CharacterControllerApi | null>(null)

  // KCC debug monitor
  const kccDebug = useMonitor(
    'KCC Debug',
    {
      state: {label: 'State', type: 'string'},
      groundY: {label: 'Ground Y', format: (v) => v.toFixed(3)},
      groundDist: {label: 'Ground Dist', format: (v) => v.toFixed(3)},
      coyote: {label: 'Coyote'},
      inputVel: {label: 'Input Vel', type: 'string'},
      moveVel: {label: 'Move Vel', type: 'string'},
      posY: {label: 'Pos Y', format: (v) => v.toFixed(3)},
    },
    {expanded: true, index: 0},
  )

  // Update debug values each physics frame
  usePhysicsUpdate(() => {
    const controller = controllerRef.current
    if (!controller || !controller.entity.isAlive()) return

    const movement = controller.entity.get(CharacterMovement)
    if (!movement) return

    // State as readable string
    const state = movement.grounded
      ? 'Grounded'
      : movement.sliding
        ? 'Sliding'
        : 'Airborne'
    // eslint-disable-next-line react-compiler/react-compiler -- intentional mutation for debug monitor
    kccDebug.current.state = state
    kccDebug.current.groundY = movement.groundNormalY
    kccDebug.current.groundDist = movement.groundDistance
    kccDebug.current.coyote = movement.coyoteCounter

    // Format vectors as strings
    const fmt = (x: number, y: number, z: number) =>
      `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`
    kccDebug.current.inputVel = fmt(movement.vx, movement.vy, movement.vz)
    kccDebug.current.moveVel = fmt(movement.mx, movement.my, movement.mz)

    // Get Y position from rigid body
    const bodyRef = controller.entity.get(RigidBodyRef)
    if (bodyRef?.body) {
      kccDebug.current.posY = bodyRef.body.translation().y
    }
  })

  // Add player traits to the character controller entity
  useLayoutEffect(() => {
    const controller = controllerRef.current
    if (!controller) return

    const entity = controller.entity

    // Add player traits
    entity.add(IsPlayer)
    entity.add(PlayerMovementConfig)
    entity.add(PlayerVelocity)
    entity.add(FacingDirection)
    entity.add(IsCameraTarget)

    return () => {
      if (entity.isAlive()) {
        entity.remove(IsPlayer)
        entity.remove(PlayerMovementConfig)
        entity.remove(PlayerVelocity)
        entity.remove(FacingDirection)
        entity.remove(IsCameraTarget)
      }
    }
  }, [])

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
