import {createQuery} from 'koota'
import type {World} from 'koota'
import type {PlayerStateType} from './traits'
import {CameraOrbit, lerpAngle} from '../camera'
import {CharacterMovement} from '../physics/character'
import {Object3DRef} from '../physics/traits'
import {syncStateTags} from '../state-machine'
import {
  Input,
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  FacingDirection,
  PlayerState,
  IsGrounded,
  IsAirborne,
  IsSliding,
} from './traits'

// ============================================
// Cached Queries
// ============================================

const playerMovementQuery = createQuery(
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  CharacterMovement,
)

const playerFacingQuery = createQuery(IsPlayer, FacingDirection, Object3DRef)

const playerStateQuery = createQuery(IsPlayer, PlayerState, CharacterMovement)

const cameraOrbitQuery = createQuery(CameraOrbit)

const inputQuery = createQuery(Input)

// State to tag mapping for fast ECS queries
const playerStateToTag: Record<PlayerStateType, typeof IsGrounded> = {
  idle: IsGrounded,
  walking: IsGrounded,
  running: IsGrounded,
  jumping: IsAirborne,
  falling: IsAirborne,
  sliding: IsSliding,
}

// ============================================
// Player Movement System
// ============================================

/**
 * Updates player velocity based on input and applies it to the character controller.
 * Movement is relative to camera yaw (GTA-style).
 * Run this before the physics step.
 */
export function playerMovementSystem(world: World, delta: number) {
  // Get input singleton
  let input = {movement: {x: 0, y: 0}, jump: false, sprint: false}
  for (const entity of world.query(inputQuery)) {
    input = entity.get(Input)!
    break
  }

  // Get camera yaw for camera-relative movement
  let cameraYaw = 0
  for (const entity of world.query(cameraOrbitQuery)) {
    const orbit = entity.get(CameraOrbit)!
    cameraYaw = orbit.yaw
    break
  }

  // Normalize input movement
  const {x: inputX, y: inputY} = input.movement
  const inputLen = Math.sqrt(inputX * inputX + inputY * inputY)
  const normalizedX = inputLen > 0 ? inputX / inputLen : 0
  const normalizedY = inputLen > 0 ? inputY / inputLen : 0

  // Process all player entities
  for (const entity of world.query(playerMovementQuery)) {
    const config = entity.get(PlayerMovementConfig)!
    const prevVelocity = entity.get(PlayerVelocity)!
    const movement = entity.get(CharacterMovement)!

    const isGrounded = movement.grounded
    const isSliding = movement.sliding
    const canJump = isGrounded || movement.coyoteCounter > 0
    const speed = input.sprint ? config.sprintSpeed : config.walkSpeed

    // Transform input by camera yaw (camera-relative movement)
    const cos = Math.cos(cameraYaw)
    const sin = Math.sin(cameraYaw)
    const worldX = normalizedX * cos - normalizedY * sin
    const worldZ = -normalizedX * sin - normalizedY * cos

    // Horizontal movement (reduced control when sliding)
    const slideMultiplier = isSliding ? 0.3 : 1.0
    const vx = worldX * speed * delta * slideMultiplier
    const vz = worldZ * speed * delta * slideMultiplier

    // Vertical movement - start from previous Y velocity
    let vy = prevVelocity.y

    // Apply jump velocity (character controller handles jump buffering)
    if (canJump && input.jump) {
      vy = Math.sqrt(config.jumpHeight * -0.05 * config.gravity)
    }

    // Apply gravity based on state
    const terminalVelocity = -20
    const slideTerminalVelocity = -5

    if (isGrounded && !isSliding) {
      // Grounded: zero downward velocity but preserve upward (jump) velocity
      if (vy < 0) vy = 0
    } else if (isSliding) {
      // Sliding: apply gravity with lower terminal velocity
      vy += config.gravity * delta
      if (vy < slideTerminalVelocity) vy = slideTerminalVelocity
    } else {
      // Airborne: apply gravity with terminal velocity
      vy += config.gravity * delta
      if (vy < terminalVelocity) vy = terminalVelocity
    }

    // Update velocity trait
    entity.set(PlayerVelocity, {x: vx, y: vy, z: vz})

    // Set velocity on character movement (this is read by characterControllerSystem)
    entity.set(CharacterMovement, (m) => {
      m.vx = vx
      m.vy = vy
      m.vz = vz
      // Signal jump request for buffering (even if we can't jump right now)
      m.jumpRequested = input.jump
      return m
    })

    // Update facing direction if moving
    if (inputLen > 0.1 && entity.has(FacingDirection)) {
      // Calculate target yaw from movement direction
      // atan2(z, x) gives angle in world space
      const targetYaw = Math.atan2(worldZ, worldX)
      entity.set(FacingDirection, (f) => {
        f.targetYaw = targetYaw
        return f
      })
    }
  }
}

/**
 * Updates player facing direction (visual mesh rotation).
 * Run this after movement system, before rendering.
 */
export function playerFacingSystem(world: World, delta: number) {
  for (const entity of world.query(playerFacingQuery)) {
    const facing = entity.get(FacingDirection)!
    const objRef = entity.get(Object3DRef)!

    if (!objRef.object) continue

    // Smoothly interpolate current yaw toward target
    const t = Math.min(1, facing.turnSpeed * delta)
    const newYaw = lerpAngle(facing.currentYaw, facing.targetYaw, t)

    entity.set(FacingDirection, (f) => {
      f.currentYaw = newYaw
      return f
    })

    // Apply rotation to mesh (rotate around Y axis)
    // Offset by -PI/2 to align with forward direction
    objRef.object.rotation.y = -newYaw + Math.PI / 2
  }
}

// ============================================
// Player State Machine System
// ============================================

/**
 * Updates player state machine based on movement/physics state.
 * Determines current state from CharacterMovement flags and input.
 * Run this after physics step to reflect actual state.
 */
export function playerStateMachineSystem(
  world: World,
  delta: number,
  input: {movement: {x: number; y: number}; sprint: boolean},
) {
  const inputLen = Math.sqrt(
    input.movement.x * input.movement.x + input.movement.y * input.movement.y,
  )
  const hasMovementInput = inputLen > 0.1

  world.query(playerStateQuery).updateEach(([state, movement], entity) => {
    // Determine new state based on physics flags
    let newState: PlayerStateType

    if (movement.sliding) {
      newState = 'sliding'
    } else if (movement.grounded) {
      // Grounded states
      if (!hasMovementInput) {
        newState = 'idle'
      } else if (input.sprint) {
        newState = 'running'
      } else {
        newState = 'walking'
      }
    } else {
      // Airborne states
      // Check if we're rising (jumping) or falling
      if (movement.vy > 0.1) {
        newState = 'jumping'
      } else {
        newState = 'falling'
      }
    }

    // Update time in state
    state.timeInState += delta

    // Transition if state changed
    if (newState !== state.current) {
      state.previous = state.current
      state.current = newState
      state.timeInState = 0
      // Only sync tags when state actually changes
      syncStateTags(entity, PlayerState, playerStateToTag)
    }
  })
}
