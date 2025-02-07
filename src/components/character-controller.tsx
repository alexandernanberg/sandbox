import type {ReactNode, Ref, RefObject} from 'react'
import {useLayoutEffect, useRef} from 'react'
import type {KinematicCharacterController} from '@dimforge/rapier3d-compat'
import type {Object3D} from 'three'
import {Vector3} from 'three'
import {useConstant} from '~/utils'
import type {ColliderProps, RigidBodyApi, RigidBodyProps} from './physics'
import {
  CapsuleCollider,
  RigidBody,
  usePhysics,
  usePhysicsUpdate,
} from './physics'
import {useControls} from './debug-controls'
import type {InputManagerRef} from './input-manager'

export interface CharacterControllerProps extends RigidBodyProps {
  children?: ReactNode
  ref?: RefObject<RigidBodyApi>
  debug?: boolean
  friction?: ColliderProps['friction']
  capsuleHeight?: number
  capsuleRadius?: number
  floatHeight?: number
}

export function CharacterController({
  ref: forwardedRef,
  children,
  friction = -0.5,
  capsuleHeight = 1.75,
  capsuleRadius = 0.5,
  π = 0.3,
  userData,
  debug = false,
  ...props
}: CharacterControllerProps) {
  const {worldRef} = usePhysics()
  const rigidBodyRef = useRef<RigidBodyApi>(null)
  const characterControllerRef = useCharacterController({offset: 0.01})

  const playerVelocity = useConstant(() => new THREE.Vector3())

  const walkingSpeed = 5
  const sprintingSpeed = 8
  const jumpHeight = 1
  const gravity = -1

  usePhysicsUpdate((delta) => {
    const rigidBody = rigidBodyRef.current
    const inputManager = inputManagerRef.current

    if (!rigidBody || !inputManager) return

    const world = worldRef.current()
    const characterController = characterControllerRef.current()

    const input = inputManager.getInput()
    const inputMovement = input.movement.normalize()
    const nextPos = rigidBody.translation()

    const isGrounded = characterController.computedGrounded()

    const isSprinting = input.keyboard.ShiftLeft
    const speed = isSprinting ? sprintingSpeed : walkingSpeed

    playerVelocity.x = inputMovement.x * speed * delta
    playerVelocity.z = inputMovement.y * speed * delta

    if (isGrounded && playerVelocity.y < 0) {
      playerVelocity.y = 0
    }

    if (isGrounded && input.keyboard.Space) {
      playerVelocity.y = Math.sqrt(jumpHeight * -0.05 * gravity)
    }

    playerVelocity.y += gravity * delta

    characterController.computeColliderMovement(
      rigidBody.collider(0),
      playerVelocity,
    )

    const movement = characterController.computedMovement()
    nextPos.x += movement.x
    nextPos.y += movement.y
    nextPos.z += movement.z

    rigidBody.setNextKinematicTranslation(nextPos)
  })

  return (
    <RigidBody ref={rigidBodyRef} type="kinematic-position-based" {...props}>
      <object3D>
        <CapsuleCollider args={[0.5, 1.75]}>
          <mesh castShadow receiveShadow>
            <capsuleGeometry args={[0.5, 1.75, 10, 20]} />
            <meshPhongMaterial color={0xf0f0f0} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 1.15, 0.3]}>
            <boxGeometry args={[0.5, 0.25, 0.5]} />
            <meshPhongMaterial color={0xf0f0f0} />
          </mesh>
        </CapsuleCollider>
      </object3D>
    </RigidBody>
  )
}

interface CharacterControllerParams {
  offset: number
}

export function useCharacterController(params: CharacterControllerParams) {
  const {worldRef} = usePhysics()
  const characterControllerRef = useRef<KinematicCharacterController>(null)

  const characterControllerGetter = useRef(() => {
    if (characterControllerRef.current === null) {
      const world = worldRef.current()

      const characterController = world.createCharacterController(params.offset)

      characterController.enableAutostep(0.5, 0.1, true)
      characterController.enableSnapToGround(0.3)
      characterController.setCharacterMass(75)
      characterController.setApplyImpulsesToDynamicBodies(true)
      characterController.setSlideEnabled(true)

      characterControllerRef.current = characterController
    }

    return characterControllerRef.current
  })

  useLayoutEffect(() => {
    const world = worldRef.current()
    const characterController = characterControllerGetter.current()

    return () => {
      world.removeCharacterController(characterController)
      characterControllerRef.current = null
    }
  }, [worldRef])

  return characterControllerGetter
}

interface PlayerProps extends Omit<CharacterControllerProps, 'ref'> {
  ref: Ref<Object3D>
  inputManagerRef: RefObject<InputManagerRef | null>
}

export function Player({inputManagerRef, ref, ...props}: PlayerProps) {
  const rigidBodyRef = useRef<RigidBodyApi>(null)
  const characterControllerRef = useCharacterController({offset: 0.01})

  useControls('Character controller', {
    debug: {value: true},
  })

  const vel = useConstant(() => new Vector3())
  const pos = useConstant(() => new Vector3())

  const walkingSpeed = 5
  const sprintingSpeed = 8
  const jumpHeight = 1
  const gravity = -1

  // TODO: read camera rotation and apply if movement

  usePhysicsUpdate((delta) => {
    const rigidBody = rigidBodyRef.current
    const inputManager = inputManagerRef.current

    if (!rigidBody || !inputManager) return

    const characterController = characterControllerRef.current()

    const input = inputManager.getInput()
    const inputMovement = input.movement.normalize()
    const t = rigidBody.translation()
    pos.copy(t)

    const isGrounded = characterController.computedGrounded()

    const isSprinting = input.keyboard.ShiftLeft
    const speed = isSprinting ? sprintingSpeed : walkingSpeed

    // eslint-disable-next-line react-compiler/react-compiler
    vel.x = inputMovement.x * speed * delta
    vel.z = inputMovement.y * speed * delta

    if (isGrounded && input.keyboard.Space) {
      vel.y = Math.sqrt(jumpHeight * -0.05 * gravity)
    }

    if (isGrounded && vel.y < 0) {
      vel.y = 0
    } else {
      vel.y += gravity * delta
    }

    characterController.computeColliderMovement(rigidBody.collider(0), vel)

    const computedMovement = characterController.computedMovement()
    pos.add(computedMovement)

    rigidBody.setNextKinematicTranslation(pos)
  })

  return (
    <RigidBody ref={rigidBodyRef} type="kinematic-position-based" {...props}>
      <object3D ref={ref}>
        <CapsuleCollider args={[0.5, 1.75]}>
          <mesh castShadow receiveShadow>
            <capsuleGeometry args={[0.5, 1.75, 10, 20]} />
            <meshPhongMaterial color={0xf0f0f0} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 1.15, 0.3]}>
            <boxGeometry args={[0.5, 0.25, 0.5]} />
            <meshPhongMaterial color={0xf0f0f0} />
          </mesh>
        </CapsuleCollider>
      </object3D>
    </RigidBody>
  )
}
