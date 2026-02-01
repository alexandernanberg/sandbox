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
// Boost Zone Types
// ============================================

export type BoostType = 'speed' | 'slow' | 'ice' | 'wind' | 'gravity'

// ============================================
// Boost Zone Component
// ============================================

interface BoostZoneProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Type of boost effect */
  type?: BoostType
  /** Strength of the effect (multiplier or force) */
  strength?: number
  /** Direction for wind type [x, y, z] */
  direction?: [number, number, number]
  /** Size [width, height, depth] */
  size?: [number, number, number]
  /** Whether to show the zone visually */
  visible?: boolean
}

const ZONE_COLORS: Record<BoostType, number> = {
  speed: 0x00ff00,
  slow: 0xff0000,
  ice: 0x88ddff,
  wind: 0xaaaaff,
  gravity: 0x8800ff,
}

export function BoostZone({
  type = 'speed',
  strength = 1.5,
  direction = [0, 0, 1],
  size = [4, 3, 4],
  visible = true,
  ...props
}: BoostZoneProps) {
  const world = useWorld()
  const entityRef = useRef<Entity | null>(null)
  const charactersInZone = useRef<Set<Entity>>(new Set())

  // Set up collision callbacks
  useLayoutEffect(() => {
    const entity = entityRef.current
    if (!entity) return

    const handleEnter = ({other}: {other: Entity}) => {
      if (other.has(IsCharacterController)) {
        charactersInZone.current.add(other)
      }
    }

    const handleExit = ({other}: {other: Entity}) => {
      charactersInZone.current.delete(other)
    }

    entity.add(CollisionCallbacks({onEnter: handleEnter, onExit: handleExit}))

    return () => {
      if (entity.isAlive() && entity.has(CollisionCallbacks)) {
        entity.remove(CollisionCallbacks)
      }
    }
  }, [world])

  // Apply zone effects
  usePhysicsUpdate((delta) => {
    for (const charEntity of charactersInZone.current) {
      if (!charEntity.isAlive()) {
        charactersInZone.current.delete(charEntity)
        continue
      }

      const movement = charEntity.get(CharacterMovement)
      if (!movement) continue

      switch (type) {
        case 'speed': {
          // Multiply velocity
          charEntity.set(CharacterMovement, {
            ...movement,
            vx: movement.vx * (1 + (strength - 1) * delta * 2),
            vz: movement.vz * (1 + (strength - 1) * delta * 2),
          })
          break
        }

        case 'slow': {
          // Reduce velocity
          const factor = 1 - (1 - 1 / strength) * delta * 3
          charEntity.set(CharacterMovement, {
            ...movement,
            vx: movement.vx * factor,
            vz: movement.vz * factor,
          })
          break
        }

        case 'ice': {
          // Already handled by lower friction - just visual
          break
        }

        case 'wind': {
          // Apply constant force in direction
          charEntity.set(CharacterMovement, {
            ...movement,
            vx: movement.vx + direction[0] * strength * delta,
            vy: movement.vy + direction[1] * strength * delta,
            vz: movement.vz + direction[2] * strength * delta,
          })
          break
        }

        case 'gravity': {
          // Modify vertical velocity (low gravity effect)
          if (!movement.grounded) {
            charEntity.set(CharacterMovement, {
              ...movement,
              vy: movement.vy + (9.81 * (1 - 1 / strength)) * delta,
            })
          }
          break
        }
      }
    }
  })

  const color = ZONE_COLORS[type]

  return (
    <group {...props}>
      <RigidBody type="fixed" entityRef={entityRef}>
        <CuboidCollider args={size} sensor>
          {visible && (
            <mesh>
              <boxGeometry args={size} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.2}
                depthWrite={false}
              />
            </mesh>
          )}
        </CuboidCollider>
      </RigidBody>

      {/* Zone border wireframe */}
      {visible && (
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.5}
          />
        </mesh>
      )}
    </group>
  )
}
