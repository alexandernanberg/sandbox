import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {ComponentProps} from 'react'
import {useLayoutEffect, useRef} from 'react'
import {
  RigidBody,
  CuboidCollider,
  CharacterMovement,
  CollisionCallbacks,
  IsCharacterController,
  usePhysicsUpdate,
} from '~/ecs/physics'

// ============================================
// Conveyor Belt
// ============================================

interface ConveyorBeltProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Conveyor velocity [x, y, z] - adds to character movement */
  velocity?: [number, number, number]
  /** Size [width, height, depth] */
  size?: [number, number, number]
  /** Color */
  color?: number | string
}

export function ConveyorBelt({
  velocity = [3, 0, 0],
  size = [6, 0.2, 2],
  color = 0xffaa00,
  ...props
}: ConveyorBeltProps) {
  const world = useWorld()
  const entityRef = useRef<Entity | null>(null)
  const charactersOnBelt = useRef<Set<Entity>>(new Set())

  // Set up collision callbacks
  useLayoutEffect(() => {
    const entity = entityRef.current
    if (!entity) return

    const handleEnter = ({other}: {other: Entity}) => {
      if (other.has(IsCharacterController)) {
        charactersOnBelt.current.add(other)
      }
    }

    const handleExit = ({other}: {other: Entity}) => {
      charactersOnBelt.current.delete(other)
    }

    entity.add(CollisionCallbacks({onEnter: handleEnter, onExit: handleExit}))

    return () => {
      if (entity.isAlive() && entity.has(CollisionCallbacks)) {
        entity.remove(CollisionCallbacks)
      }
    }
  }, [world])

  // Apply conveyor velocity to characters on belt
  usePhysicsUpdate(() => {
    for (const charEntity of charactersOnBelt.current) {
      if (!charEntity.isAlive()) {
        charactersOnBelt.current.delete(charEntity)
        continue
      }

      const movement = charEntity.get(CharacterMovement)
      if (movement && movement.grounded) {
        // Add conveyor velocity to character velocity
        charEntity.set(CharacterMovement, {
          ...movement,
          vx: movement.vx + velocity[0] * 0.016, // Scale by fixed timestep
          vz: movement.vz + velocity[2] * 0.016,
        })
      }
    }
  })

  return (
    <group {...props}>
      <RigidBody type="fixed" entityRef={entityRef}>
        <CuboidCollider args={size}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={color} />
          </mesh>
          {/* Direction indicator stripes */}
          <mesh position={[0, size[1] / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[size[0] * 0.8, size[2] * 0.3]} />
            <meshBasicMaterial color={0x333333} />
          </mesh>
        </CuboidCollider>
      </RigidBody>

      {/* Arrow indicators */}
      {[-1, 0, 1].map((offset) => (
        <mesh
          key={offset}
          position={[offset * (size[0] / 3), size[1] + 0.05, 0]}
          rotation={[-Math.PI / 2, 0, velocity[0] > 0 ? 0 : Math.PI]}
        >
          <coneGeometry args={[0.15, 0.3, 3]} />
          <meshBasicMaterial color={0xffffff} />
        </mesh>
      ))}
    </group>
  )
}
