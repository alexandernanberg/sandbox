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
} from '~/ecs/physics'

// ============================================
// Jump Pad Component
// ============================================

interface JumpPadProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Launch velocity [x, y, z] */
  launchVelocity?: [number, number, number]
  /** Size of the pad [width, height, depth] */
  size?: [number, number, number]
  /** Color of the pad */
  color?: number | string
  /** Cooldown between activations (ms) */
  cooldown?: number
}

export function JumpPad({
  launchVelocity = [0, 15, 0],
  size = [2, 0.2, 2],
  color = 0x00ff88,
  cooldown = 200,
  ...props
}: JumpPadProps) {
  const world = useWorld()
  const lastActivation = useRef(0)
  const entityRef = useRef<Entity | null>(null)

  // Set up collision callback
  useLayoutEffect(() => {
    const entity = entityRef.current
    if (!entity) return

    const handleCollision = ({other}: {other: Entity}) => {
      // Check cooldown
      const now = Date.now()
      if (now - lastActivation.current < cooldown) return

      // Only launch character controllers
      if (!other.has(IsCharacterController)) return

      // Apply launch velocity to character
      const movement = other.get(CharacterMovement)
      if (movement) {
        // Set velocity directly - this will be picked up by the KCC
        other.set(CharacterMovement, {
          ...movement,
          vx: movement.vx + launchVelocity[0],
          vy: launchVelocity[1], // Override Y for consistent launch
          vz: movement.vz + launchVelocity[2],
          grounded: false,
          coyoteCounter: 100, // Disable coyote time
        })
        lastActivation.current = now
      }
    }

    entity.add(CollisionCallbacks({onEnter: handleCollision, onExit: null}))

    return () => {
      if (entity.isAlive() && entity.has(CollisionCallbacks)) {
        entity.remove(CollisionCallbacks)
      }
    }
  }, [world, launchVelocity, cooldown])

  return (
    <group {...props}>
      {/* Base */}
      <RigidBody type="fixed" entityRef={entityRef}>
        <CuboidCollider args={size}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshPhongMaterial color={color} />
          </mesh>
        </CuboidCollider>
      </RigidBody>

      {/* Arrow indicator */}
      <mesh position={[0, size[1] / 2 + 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.3, 0.5, 8]} />
        <meshBasicMaterial color={0xffffff} transparent opacity={0.8} />
      </mesh>
    </group>
  )
}
