import type {Entity} from 'koota'
import type {ReactNode} from 'react'
import {useImperativeHandle, useLayoutEffect, useRef} from 'react'
import type {RigidBodyApi, RigidBodyProps} from './components'
import {
  CharacterControllerConfig,
  CharacterMovement,
  IsCharacterController,
} from './character'
import {RigidBody, CapsuleCollider} from './components'
import {RigidBodyRef} from './traits'

// ============================================
// CharacterController Component
// ============================================

export interface CharacterControllerApi {
  /** The ECS entity */
  readonly entity: Entity
  /** The Rapier rigid body */
  readonly body: RigidBodyApi['body']
  /** Set movement velocity for this frame */
  setVelocity(x: number, y: number, z: number): void
  /** Get current movement state */
  getMovement(): {
    mx: number
    my: number
    mz: number
    grounded: boolean
    groundNormalX: number
    groundNormalY: number
    groundNormalZ: number
    groundDistance: number
  }
}

export interface CharacterControllerProps extends Omit<
  RigidBodyProps,
  'type' | 'ref'
> {
  children?: ReactNode
  /** Height of the capsule (not including rounded ends) */
  height?: number
  /** Radius of the capsule */
  radius?: number
  /** Collision skin width */
  skinWidth?: number
  /** Distance to check for ground below character */
  groundCheckDistance?: number
  /** Distance to snap to ground when grounded */
  groundSnapDistance?: number
  /** Max slope angle (radians) that can be walked on */
  maxSlopeAngle?: number
  /** Max height for auto-stepping */
  stepHeight?: number
  /** Min width for auto-stepping */
  stepMinWidth?: number
  /** Character mass */
  mass?: number
  /** Ref to get the imperative API */
  ref?: React.Ref<CharacterControllerApi | null>
}

export function CharacterController({
  children,
  height = 1.0,
  radius = 0.5,
  skinWidth = 0.02,
  groundCheckDistance = 0.5,
  groundSnapDistance = 0.1,
  maxSlopeAngle = Math.PI / 4,
  stepHeight = 0.5,
  stepMinWidth = 0.1,
  mass = 75,
  ref,
  ...props
}: CharacterControllerProps) {
  const rigidBodyRef = useRef<RigidBodyApi | null>(null)

  // Compute capsule half-height from height prop
  // Height is the total height of the cylindrical part (not including caps)
  // So halfHeight = height / 2
  const capsuleHalfHeight = height / 2

  // Store initial config
  const initialConfig = useRef({
    capsuleHalfHeight,
    capsuleRadius: radius,
    skinWidth,
    groundCheckDistance,
    groundSnapDistance,
    maxSlopeAngle,
    stepHeight,
    stepMinWidth,
    mass,
  })

  // Add character controller traits to the entity after RigidBody creates it
  useLayoutEffect(() => {
    const rbApi = rigidBodyRef.current
    if (!rbApi) return

    const entity = rbApi.entity
    const config = initialConfig.current

    // Add character controller traits
    entity.add(IsCharacterController)
    entity.add(CharacterMovement)
    entity.add(
      CharacterControllerConfig({
        capsuleHalfHeight: config.capsuleHalfHeight,
        capsuleRadius: config.capsuleRadius,
        skinWidth: config.skinWidth,
        groundCheckDistance: config.groundCheckDistance,
        groundSnapDistance: config.groundSnapDistance,
        maxSlopeAngle: config.maxSlopeAngle,
        stepHeight: config.stepHeight,
        stepMinWidth: config.stepMinWidth,
        mass: config.mass,
      }),
    )

    return () => {
      if (entity.isAlive()) {
        entity.remove(IsCharacterController)
        entity.remove(CharacterMovement)
        entity.remove(CharacterControllerConfig)
      }
    }
  }, [])

  // Expose imperative API
  useImperativeHandle<
    CharacterControllerApi | null,
    CharacterControllerApi | null
  >(ref, () => {
    const rbApi = rigidBodyRef.current
    if (!rbApi) return null

    const entity = rbApi.entity

    return {
      entity,
      get body() {
        return entity.get(RigidBodyRef)?.body ?? null
      },
      setVelocity(x: number, y: number, z: number) {
        if (!entity.isAlive() || !entity.has(CharacterMovement)) return
        entity.set(CharacterMovement, (m) => {
          m.vx = x
          m.vy = y
          m.vz = z
          return m
        })
      },
      getMovement() {
        if (!entity.isAlive() || !entity.has(CharacterMovement)) {
          return {
            mx: 0,
            my: 0,
            mz: 0,
            grounded: false,
            groundNormalX: 0,
            groundNormalY: 1,
            groundNormalZ: 0,
            groundDistance: 0,
          }
        }
        const m = entity.get(CharacterMovement)!
        return {
          mx: m.mx,
          my: m.my,
          mz: m.mz,
          grounded: m.grounded,
          groundNormalX: m.groundNormalX,
          groundNormalY: m.groundNormalY,
          groundNormalZ: m.groundNormalZ,
          groundDistance: m.groundDistance,
        }
      },
    }
  }, [])

  return (
    <RigidBody ref={rigidBodyRef} type="kinematic-position-based" {...props}>
      {/* friction=0 prevents objects from launching off the capsule's curved surfaces */}
      <CapsuleCollider args={[radius, height]} friction={0}>
        {children}
      </CapsuleCollider>
    </RigidBody>
  )
}
