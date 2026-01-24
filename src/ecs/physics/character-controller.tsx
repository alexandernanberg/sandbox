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
  getMovement(): {mx: number; my: number; mz: number; grounded: boolean}
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
  /** Collision offset */
  offset?: number
  /** Max height for auto-stepping */
  autostepMaxHeight?: number
  /** Min width for auto-stepping */
  autostepMinWidth?: number
  /** Whether auto-step includes dynamic bodies */
  autostepIncludesDynamicBodies?: boolean
  /** Distance to snap to ground */
  snapToGroundDistance?: number
  /** Character mass */
  mass?: number
  /** Whether to apply impulses to dynamic bodies */
  applyImpulsesToDynamicBodies?: boolean
  /** Whether sliding is enabled */
  slideEnabled?: boolean
  /** Ref to get the imperative API */
  ref?: React.Ref<CharacterControllerApi | null>
}

export function CharacterController({
  children,
  height = 1.0,
  radius = 0.5,
  offset = 0.01,
  autostepMaxHeight = 0.5,
  autostepMinWidth = 0.1,
  autostepIncludesDynamicBodies = true,
  snapToGroundDistance = 0.3,
  mass = 75,
  applyImpulsesToDynamicBodies = true,
  slideEnabled = true,
  ref,
  ...props
}: CharacterControllerProps) {
  const rigidBodyRef = useRef<RigidBodyApi | null>(null)

  // Store initial config
  const initialConfig = useRef({
    offset,
    autostepMaxHeight,
    autostepMinWidth,
    autostepIncludesDynamicBodies,
    snapToGroundDistance,
    mass,
    applyImpulsesToDynamicBodies,
    slideEnabled,
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
        offset: config.offset,
        autostepMaxHeight: config.autostepMaxHeight,
        autostepMinWidth: config.autostepMinWidth,
        autostepIncludesDynamicBodies: config.autostepIncludesDynamicBodies,
        snapToGroundDistance: config.snapToGroundDistance,
        mass: config.mass,
        applyImpulsesToDynamicBodies: config.applyImpulsesToDynamicBodies,
        slideEnabled: config.slideEnabled,
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
          return {mx: 0, my: 0, mz: 0, grounded: false}
        }
        const m = entity.get(CharacterMovement)!
        return {mx: m.mx, my: m.my, mz: m.mz, grounded: m.grounded}
      },
    }
  }, [])

  return (
    <RigidBody ref={rigidBodyRef} type="kinematic-position-based" {...props}>
      <CapsuleCollider args={[radius, height]}>{children}</CapsuleCollider>
    </RigidBody>
  )
}
