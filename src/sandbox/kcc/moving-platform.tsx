import type {Entity} from 'koota'
import type {ComponentProps} from 'react'
import {useLayoutEffect, useRef} from 'react'
import {
  RigidBody,
  CuboidCollider,
  usePhysicsUpdate,
  RigidBodyRef,
  KinematicVelocity,
} from '~/ecs/physics'

// ============================================
// Platform Path Types
// ============================================

export type PlatformPath =
  | {type: 'linear'; axis: 'x' | 'y' | 'z'; distance: number; speed: number}
  | {type: 'circular'; radius: number; speed: number; plane: 'xz' | 'xy' | 'yz'}
  | {type: 'figure8'; size: number; speed: number}
  | {type: 'waypoints'; points: [number, number, number][]; speed: number; loop?: boolean}

// ============================================
// Moving Platform Component
// ============================================

interface MovingPlatformProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Movement path configuration */
  path: PlatformPath
  /** Size of the platform [width, height, depth] */
  size?: [number, number, number]
  /** Color of the platform */
  color?: number | string
  /** Whether to pause at endpoints (linear only) */
  pauseAtEnds?: boolean
  /** Pause duration in seconds */
  pauseDuration?: number
}

export function MovingPlatform({
  path,
  size = [3, 0.3, 3],
  color = 0x4a90d9,
  pauseAtEnds = false,
  pauseDuration = 0.5,
  ...props
}: MovingPlatformProps) {
  const entityRef = useRef<Entity | null>(null)
  const timeRef = useRef(0)
  const pauseTimeRef = useRef(0)
  const isPausedRef = useRef(false)
  const prevPosRef = useRef<{x: number; y: number; z: number} | null>(null)
  const waypointIndexRef = useRef(0)
  const waypointProgressRef = useRef(0)

  // Add KinematicVelocity trait on mount
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

    const body = bodyRef.body
    const currentPos = body.translation()

    // Handle pause
    if (isPausedRef.current) {
      pauseTimeRef.current += delta
      if (pauseTimeRef.current >= pauseDuration) {
        isPausedRef.current = false
        pauseTimeRef.current = 0
      }
      // Set zero velocity while paused
      entity.set(KinematicVelocity, {x: 0, y: 0, z: 0, ax: 0, ay: 0, az: 0})
      return
    }

    timeRef.current += delta
    let newX = currentPos.x
    let newY = currentPos.y
    let newZ = currentPos.z

    switch (path.type) {
      case 'linear': {
        const t = Math.sin(timeRef.current * path.speed)
        const offset = t * path.distance

        // Check for direction change (pause at ends)
        if (pauseAtEnds && prevPosRef.current) {
          const prevT = Math.sin((timeRef.current - delta) * path.speed)
          if (Math.sign(t) !== Math.sign(prevT)) {
            isPausedRef.current = true
          }
        }

        switch (path.axis) {
          case 'x':
            newX = (props.position as number[])?.[0] ?? 0 + offset
            break
          case 'y':
            newY = (props.position as number[])?.[1] ?? 0 + offset
            break
          case 'z':
            newZ = (props.position as number[])?.[2] ?? 0 + offset
            break
        }
        break
      }

      case 'circular': {
        const angle = timeRef.current * path.speed
        const basePos = props.position as [number, number, number] ?? [0, 0, 0]

        switch (path.plane) {
          case 'xz':
            newX = basePos[0] + Math.cos(angle) * path.radius
            newZ = basePos[2] + Math.sin(angle) * path.radius
            newY = basePos[1]
            break
          case 'xy':
            newX = basePos[0] + Math.cos(angle) * path.radius
            newY = basePos[1] + Math.sin(angle) * path.radius
            newZ = basePos[2]
            break
          case 'yz':
            newY = basePos[1] + Math.cos(angle) * path.radius
            newZ = basePos[2] + Math.sin(angle) * path.radius
            newX = basePos[0]
            break
        }
        break
      }

      case 'figure8': {
        const angle = timeRef.current * path.speed
        const basePos = props.position as [number, number, number] ?? [0, 0, 0]
        newX = basePos[0] + Math.sin(angle) * path.size
        newZ = basePos[2] + Math.sin(angle * 2) * (path.size / 2)
        newY = basePos[1]
        break
      }

      case 'waypoints': {
        if (path.points.length < 2) break

        const currentIndex = waypointIndexRef.current
        const nextIndex = (currentIndex + 1) % path.points.length
        const current = path.points[currentIndex]!
        const next = path.points[nextIndex]!

        // Calculate distance and direction
        const dx = next[0] - current[0]
        const dy = next[1] - current[1]
        const dz = next[2] - current[2]
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

        // Update progress
        waypointProgressRef.current += (path.speed * delta) / dist

        if (waypointProgressRef.current >= 1) {
          waypointProgressRef.current = 0
          waypointIndexRef.current = nextIndex

          // Stop at end if not looping
          if (!path.loop && nextIndex === 0) {
            waypointIndexRef.current = path.points.length - 1
            waypointProgressRef.current = 1
          }
        }

        const t = waypointProgressRef.current
        newX = current[0] + dx * t
        newY = current[1] + dy * t
        newZ = current[2] + dz * t
        break
      }
    }

    // Calculate velocity for KCC platform tracking
    if (prevPosRef.current) {
      entity.set(KinematicVelocity, {
        x: newX - prevPosRef.current.x,
        y: newY - prevPosRef.current.y,
        z: newZ - prevPosRef.current.z,
        ax: 0,
        ay: 0,
        az: 0,
      })
    }

    prevPosRef.current = {x: newX, y: newY, z: newZ}
    body.setNextKinematicTranslation({x: newX, y: newY, z: newZ})
  })

  return (
    <group {...props}>
      <RigidBody
        entityRef={entityRef}
        type="kinematic-position-based"
        position={[0, 0, 0]}
      >
        <CuboidCollider args={size}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={size} />
            <meshStandardMaterial color={color} />
          </mesh>
        </CuboidCollider>
      </RigidBody>
    </group>
  )
}
