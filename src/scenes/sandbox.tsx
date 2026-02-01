import {Text, useTexture} from '@react-three/drei'
import type {Entity} from 'koota'
import {useActions} from 'koota/react'
import type {ComponentProps} from 'react'
import {Suspense, useLayoutEffect, useRef} from 'react'
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
  usePhysicsUpdate,
  RigidBodyRef,
  CharacterController,
  CharacterMovement,
  KinematicVelocity,
} from '~/ecs/physics'
import type {CharacterControllerApi} from '~/ecs/physics'

// Sandbox components
import {
  Spawner,
  SpawnedObjects,
  JumpPad,
  MovingPlatform,
  SlopeTestSuite,
  StairTestSuite,
  ConveyorBelt,
  KCCDebugOverlay,
  KCCTuningPanel,
  StressTestPanel,
} from '~/sandbox'

// ============================================
// Sandbox Scene
// ============================================

interface SandboxProps {
  debugCamera: boolean
  showOrbitRings: boolean
}

export function Sandbox({debugCamera, showOrbitRings}: SandboxProps) {
  const {spawnBalls, clearBalls} = useActions(actions)
  const playerRef = useRef<CharacterControllerApi | null>(null)

  // Debug controls
  const debugControls = useControls(
    'Sandbox Debug',
    {
      showKCCOverlay: {value: true},
      showGroundRay: {value: true},
      showGroundNormal: {value: true},
      showVelocity: {value: true},
    },
    {expanded: true, index: 1},
  )

  const _objectControls = useControls(
    'Objects',
    {
      _spawn: {
        title: 'Spawn 10 balls',
        action: () => spawnBalls(10),
      },
      _reset: {
        title: 'Reset Balls',
        action: () => clearBalls(),
      },
    },
    {expanded: true, index: 4},
  )

  return (
    <>
      {!debugCamera && <ThirdPersonCamera />}
      {showOrbitRings && <OrbitDebugVisualizer />}

      {/* Player */}
      <Player ref={playerRef} position={[0, 2, 0]} />

      {/* KCC Debug Overlay */}
      {debugControls.showKCCOverlay && playerRef.current && (
        <KCCDebugOverlay
          entity={playerRef.current.entity}
          showGroundRay={debugControls.showGroundRay}
          showGroundNormal={debugControls.showGroundNormal}
          showVelocity={debugControls.showVelocity}
        />
      )}

      {/* KCC Tuning Panel */}
      <KCCTuningPanel
        entity={playerRef.current?.entity ?? null}
        enabled={true}
      />

      {/* Stress Test Panel */}
      <StressTestPanel />

      {/* Spawner system */}
      <Spawner />
      <SpawnedObjects />

      {/* Environment */}
      <Floor />
      <Walls />

      {/* ECS balls */}
      <Balls />

      {/* ============================================ */}
      {/* KCC TEST GEOMETRY */}
      {/* ============================================ */}

      {/* Comprehensive slope test suite */}
      <SlopeTestSuite position={[12, 0, 5]} angles={[15, 30, 45, 50, 55, 60, 75, 89]} />

      {/* Stair test suite with varying heights */}
      <StairTestSuite position={[0, 0, -12]} />

      {/* Jump pads */}
      <group position={[-10, 0, 5]}>
        <JumpPad position={[0, 0, 0]} launchVelocity={[0, 12, 0]} />
        <JumpPad position={[3, 0, 0]} launchVelocity={[0, 15, 5]} color={0xff8800} />
        <JumpPad position={[6, 0, 0]} launchVelocity={[5, 10, 0]} color={0xff00ff} />

        <Suspense fallback={null}>
          <Text position={[0, 2, 0]} fontSize={0.3} color="#fff">
            Vertical
          </Text>
          <Text position={[3, 2, 0]} fontSize={0.3} color="#fff">
            Forward Arc
          </Text>
          <Text position={[6, 2, 0]} fontSize={0.3} color="#fff">
            Side Arc
          </Text>
        </Suspense>
      </group>

      {/* Moving platforms */}
      <group position={[-8, 0, -5]}>
        {/* Vertical elevator */}
        <MovingPlatform
          position={[0, 1, 0]}
          path={{type: 'linear', axis: 'y', distance: 4, speed: 1}}
          color={0xed7200}
        />

        {/* Horizontal platform */}
        <MovingPlatform
          position={[5, 1, 0]}
          path={{type: 'linear', axis: 'x', distance: 3, speed: 1.5}}
          color={0x4a90d9}
        />

        {/* Circular platform */}
        <MovingPlatform
          position={[0, 1, 6]}
          path={{type: 'circular', radius: 3, speed: 0.8, plane: 'xz'}}
          color={0x90d94a}
        />

        {/* Figure-8 platform */}
        <MovingPlatform
          position={[8, 1, 6]}
          path={{type: 'figure8', size: 2, speed: 0.6}}
          color={0xd94a90}
        />
      </group>

      {/* Conveyor belts */}
      <group position={[0, 0, 8]}>
        <ConveyorBelt position={[0, 0.1, 0]} velocity={[4, 0, 0]} />
        <ConveyorBelt position={[8, 0.1, 0]} velocity={[-4, 0, 0]} />

        <Suspense fallback={null}>
          <Text position={[4, 1, 0]} fontSize={0.4} color="#fff">
            Conveyor Belts
          </Text>
        </Suspense>
      </group>

      {/* Spinning platform */}
      <SpinningPlatform position={[-15, 0.5, 10]} speed={1.2} />

      {/* Trampoline */}
      <Trampoline position={[15, 0, -8]} />

      {/* Tower with ramps */}
      <Tower position={[-6, 0, 0]} />

      {/* Dynamic objects for interaction */}
      <DynamicBoxes position={[5, 0, 5]} />
    </>
  )
}

// ============================================
// Environment Components
// ============================================

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
      <RigidBody type="fixed" position={[-pos, y, 0]}>
        <CuboidCollider args={[thickness, height, area]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, y, pos]}>
        <CuboidCollider args={[area, height, thickness]} />
      </RigidBody>
      <RigidBody type="fixed" position={[0, y, -pos]}>
        <CuboidCollider args={[area, height, thickness]} />
      </RigidBody>
    </>
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

    entity.set(KinematicVelocity, {
      x: 0,
      y: 0,
      z: 0,
      ax: 0,
      ay: angularVelocity,
      az: 0,
    })

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
// Tower
// ============================================

function Tower(props: ComponentProps<'group'>) {
  return (
    <group {...props}>
      <RigidBody type="fixed">
        {/* Columns */}
        <Box args={[1, 7, 1]} position={[0.5, 3.5, 0.5]} color={0x9f9f9f} />
        <Box args={[1, 7, 1]} position={[0.5, 3.5, -2.5]} color={0x9f9f9f} />
        <Box args={[1, 7, 1]} position={[-2.5, 3.5, 0.5]} color={0x9f9f9f} />
        <Box args={[1, 7, 1]} position={[-2.5, 3.5, -2.5]} color={0x9f9f9f} />

        {/* Platforms */}
        <Box args={[2, 0.5, 2]} position={[-4, 1.75, 2]} />
        <Box args={[2, 0.5, 2]} position={[-4, 3.75, -4]} />
        <Box args={[2, 0.5, 2]} position={[2, 5.75, -4]} />
        <Box args={[2, 0.5, 4]} position={[2, 7.75, 3]} />
        <Box args={[6, 1, 8]} position={[-2, 7.5, 1]} />
      </RigidBody>
    </group>
  )
}

interface BoxProps {
  args?: [number, number, number]
  color?: number
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

// ============================================
// Dynamic Boxes
// ============================================

function DynamicBoxes(props: ComponentProps<'group'>) {
  return (
    <group {...props}>
      <RigidBody position={[0, 3, 0]}>
        <CuboidCollider args={[1, 1, 1]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <meshPhongMaterial color={0xff6666} />
          </mesh>
        </CuboidCollider>
      </RigidBody>
      <RigidBody position={[0, 5, 0]}>
        <CuboidCollider args={[0.8, 0.8, 0.8]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.8, 0.8, 0.8]} />
            <meshPhongMaterial color={0x66ff66} />
          </mesh>
        </CuboidCollider>
      </RigidBody>
      <RigidBody position={[0, 7, 0]}>
        <CuboidCollider args={[0.6, 0.6, 0.6]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.6, 0.6]} />
            <meshPhongMaterial color={0x6666ff} />
          </mesh>
        </CuboidCollider>
      </RigidBody>
    </group>
  )
}

// ============================================
// Player
// ============================================

interface PlayerProps {
  position?: [number, number, number]
  ref?: React.Ref<CharacterControllerApi | null>
}

function Player({position, ref}: PlayerProps) {
  const controllerRef = useRef<CharacterControllerApi | null>(null)

  // Forward ref
  useLayoutEffect(() => {
    if (typeof ref === 'function') {
      ref(controllerRef.current)
    } else if (ref) {
      (ref as React.MutableRefObject<CharacterControllerApi | null>).current =
        controllerRef.current
    }
  })

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

    const state = movement.grounded
      ? 'Grounded'
      : movement.sliding
        ? 'Sliding'
        : 'Airborne'
    // eslint-disable-next-line react-compiler/react-compiler
    kccDebug.current.state = state
    kccDebug.current.groundY = movement.groundNormalY
    kccDebug.current.groundDist = movement.groundDistance
    kccDebug.current.coyote = movement.coyoteCounter

    const fmt = (x: number, y: number, z: number) =>
      `${x.toFixed(2)} ${y.toFixed(2)} ${z.toFixed(2)}`
    kccDebug.current.inputVel = fmt(movement.vx, movement.vy, movement.vz)
    kccDebug.current.moveVel = fmt(movement.mx, movement.my, movement.mz)

    const bodyRef = controller.entity.get(RigidBodyRef)
    if (bodyRef?.body) {
      kccDebug.current.posY = bodyRef.body.translation().y
    }
  })

  // Add player traits
  useLayoutEffect(() => {
    const controller = controllerRef.current
    if (!controller) return

    const entity = controller.entity

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
