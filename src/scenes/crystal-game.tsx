import {Text, useTexture} from '@react-three/drei'
import type {Entity} from 'koota'
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import {RepeatWrapping} from 'three'
import {OrbitDebugVisualizer, ThirdPersonCamera} from '~/components/cameras'
import {Collectible} from '~/components/collectible'
import {useGame} from '~/components/game-manager'
import {
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  FacingDirection,
} from '~/ecs'
import {IsCameraTarget} from '~/ecs/camera'
import {
  RigidBody,
  CuboidCollider,
  CylinderCollider,
  usePhysicsUpdate,
  RigidBodyRef,
  CharacterController,
  KinematicVelocity,
  Transform,
} from '~/ecs/physics'
import type {CharacterControllerApi} from '~/ecs/physics'
import Ramp from '~/models/ramp'
import Slope from '~/models/slope'

// ============================================
// Crystal positions around the level
// ============================================

const CRYSTAL_POSITIONS: Array<{
  position: [number, number, number]
  color: string
  value: number
}> = [
  // Ground level - easy access
  {position: [5, 1, 5], color: '#00ffff', value: 10},
  {position: [-5, 1, 5], color: '#00ffff', value: 10},
  {position: [5, 1, -5], color: '#00ffff', value: 10},
  {position: [-5, 1, -5], color: '#00ffff', value: 10},

  // On the slopes
  {position: [6, 3.5, 3], color: '#ff00ff', value: 20},
  {position: [6, 3.5, 7], color: '#ff00ff', value: 20},

  // Tower ramps - requires climbing
  {position: [-8, 2.5, 2], color: '#ffff00', value: 30},
  {position: [-10, 4.5, -1], color: '#ffff00', value: 30},
  {position: [-10, 6.5, -4], color: '#ffff00', value: 30},
  {position: [-4, 8.5, 1], color: '#ff8800', value: 50},

  // Elevator area
  {position: [-6, 5, 6], color: '#00ff88', value: 25},

  // Spinning platforms - risky
  {position: [-12, 1.5, 8], color: '#ff4444', value: 40},
  {position: [-12, 1.5, -8], color: '#ff4444', value: 40},

  // Trampoline area
  {position: [12, 2, 8], color: '#88ff00', value: 25},
  {position: [14, 1, 10], color: '#00ffff', value: 10},

  // Near stairs
  {position: [2, 2.5, -12], color: '#00ffff', value: 10},

  // Rocking board challenge
  {position: [-8, 2, 12], color: '#ff00ff', value: 35},

  // Edge of map - risky
  {position: [20, 1, 0], color: '#ff8800', value: 30},
  {position: [-20, 1, 0], color: '#ff8800', value: 30},
  {position: [0, 1, 20], color: '#ff8800', value: 30},
]

// ============================================
// Game Scene
// ============================================

interface CrystalGameProps {
  debugCamera: boolean
  showOrbitRings: boolean
}

export function CrystalGame({debugCamera, showOrbitRings}: CrystalGameProps) {
  const game = useGame()
  const [collectedIds, setCollectedIds] = useState<Set<number>>(new Set())
  const gameStartedRef = useRef(false)

  // Set total collectibles when game starts
  useEffect(() => {
    game.setTotalCollectibles(CRYSTAL_POSITIONS.length)
  }, [game])

  // Reset collected when game restarts
  useEffect(() => {
    if (game.phase === 'main-menu') {
      setCollectedIds(new Set())
      gameStartedRef.current = false
    } else if (game.phase === 'playing') {
      gameStartedRef.current = true
    }
  }, [game.phase])

  const handleCollect = useCallback(
    (id: number, value: number) => {
      if (game.phase !== 'playing') return
      setCollectedIds((prev) => new Set([...prev, id]))
      game.collectItem(value)
    },
    [game],
  )

  // Only render gameplay elements when playing or paused
  const showGameplay = game.phase === 'playing' || game.phase === 'paused'

  return (
    <>
      {!debugCamera && <ThirdPersonCamera />}
      {showOrbitRings && <OrbitDebugVisualizer />}

      <Player
        position={[0, 2, 0]}
        onFall={game.triggerGameOver}
        isActive={showGameplay}
      />

      <Floor />
      <Walls />

      <Slopes position={[8, 0, 3]} />

      {/* Tower and elevator */}
      <group position={[-6, 0, 0]}>
        <Tower />
        <Elevator position={[0, 0.5, 6]} />
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
      <Stairs position={[4, 0, -10]} stepHeight={0.15} stepDepth={0.5} />

      {/* Rocking board */}
      <RockingBoard position={[-8, 0.5, 12]} />

      {/* Collectibles - only show uncollected during gameplay */}
      {showGameplay &&
        CRYSTAL_POSITIONS.map((crystal, index) => {
          if (collectedIds.has(index)) return null
          return (
            <Collectible
              key={index}
              id={index}
              position={crystal.position}
              color={crystal.color}
              value={crystal.value}
              onCollect={handleCollect}
            />
          )
        })}
    </>
  )
}

// ============================================
// Player with fall detection
// ============================================

interface PlayerProps {
  position: [number, number, number]
  onFall?: () => void
  isActive: boolean
}

function Player({position, onFall, isActive}: PlayerProps) {
  const controllerRef = useRef<CharacterControllerApi | null>(null)
  const hasFallenRef = useRef(false)

  // Reset fall state when not active
  useEffect(() => {
    if (!isActive) {
      hasFallenRef.current = false
    }
  }, [isActive])

  // Check for falling off the map
  usePhysicsUpdate(() => {
    if (!isActive) return
    const controller = controllerRef.current
    if (!controller || !controller.entity.isAlive()) return

    const transform = controller.entity.get(Transform)
    if (!transform) return

    // If player falls below -5, trigger game over
    if (transform.y < -5 && !hasFallenRef.current) {
      hasFallenRef.current = true
      onFall?.()
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

// ============================================
// Level Elements (simplified from playground)
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

function runFromAngleAndRaise(angle: number, rise: number) {
  const radians = (angle * Math.PI) / 180
  return rise / Math.tan(radians)
}

function Slopes(props: React.ComponentProps<'group'>) {
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

interface BoxProps {
  args?: [number, number, number]
  color?: number
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

    physicsTime.current += delta

    const vec = bodyRef.body.translation()
    const newY = clamp(3.875 + Math.sin(physicsTime.current) * 5, 0.25, 7.75)

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

interface TrampolineProps {
  position?: [number, number, number]
}

function Trampoline({position}: TrampolineProps) {
  return (
    <RigidBody type="fixed" position={position}>
      <CuboidCollider args={[3, 0.2, 3]} position={[0, -0.1, 0]}>
        <mesh castShadow receiveShadow position={[0, -0.1, 0]}>
          <boxGeometry args={[3, 0.2, 3]} />
          <meshStandardMaterial color={0x333333} />
        </mesh>
      </CuboidCollider>
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

function RockingBoard(props: React.ComponentProps<'group'>) {
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
        <Box args={[1, 1, 1]} friction={1} density={50} color={0x4444ff} />
      </RigidBody>
      <RigidBody position={[2.5, 0.5, 0]}>
        <Box
          args={[0.5, 0.5, 0.5]}
          friction={1}
          restitution={0}
          color={0x4444ff}
        />
      </RigidBody>
    </group>
  )
}
