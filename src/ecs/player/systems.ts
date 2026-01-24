import {createQuery} from 'koota'
import type {World} from 'koota'
import {CameraOrbit, lerpAngle} from '../camera'
import {CharacterMovement} from '../physics/character'
import {Object3DRef} from '../physics/traits'
import {
  Input,
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  FacingDirection,
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

const cameraOrbitQuery = createQuery(CameraOrbit)

// ============================================
// Player Movement System
// ============================================

/**
 * Updates player velocity based on input and applies it to the character controller.
 * Movement is relative to camera yaw (GTA-style).
 * Run this before the physics step.
 */
export function playerMovementSystem(world: World, delta: number) {
  // Get input singleton - find first entity with Input trait
  const inputEntities = world.query(Input)
  let input = {movement: {x: 0, y: 0}, jump: false, sprint: false}

  for (const entity of inputEntities) {
    input = entity.get(Input)!
    break // Only need first (singleton)
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
    const velocity = entity.get(PlayerVelocity)!
    const movement = entity.get(CharacterMovement)!

    const isGrounded = movement.grounded
    const isSliding = movement.sliding
    // Can jump with coyote time (counter > 0 means we were recently grounded)
    const canJump = isGrounded || movement.coyoteCounter > 0
    const speed = input.sprint ? config.sprintSpeed : config.walkSpeed

    // Transform input by camera yaw (camera-relative movement)
    // Camera at yaw=0 is behind player looking at -Z, so forward = -Z
    const cos = Math.cos(cameraYaw)
    const sin = Math.sin(cameraYaw)
    // Input X = strafe (A/D), Input Y = forward/back (W/S)
    // Transform to world coordinates based on camera facing direction
    const worldX = normalizedX * cos - normalizedY * sin
    const worldZ = -normalizedX * sin - normalizedY * cos

    // Horizontal movement (reduced control when sliding)
    const slideMultiplier = isSliding ? 0.3 : 1.0
    const vx = worldX * speed * delta * slideMultiplier
    const vz = worldZ * speed * delta * slideMultiplier

    // Vertical movement (jump + gravity)
    let vy = velocity.y

    // Jumping - use coyote time and jump buffer
    // The actual jump execution happens if canJump AND (jumpRequested OR jumpBuffered)
    // We set jumpRequested here, the character controller handles the buffer
    if (canJump && input.jump) {
      vy = Math.sqrt(config.jumpHeight * -0.05 * config.gravity)
    }

    // Gravity handling:
    // - When grounded on walkable slope: zero downward velocity (but keep upward for jump)
    // - When sliding or airborne: apply gravity with terminal velocity
    const terminalVelocity = -20 // Max fall speed

    if (isGrounded && !isSliding) {
      // Grounded - zero downward velocity but preserve upward (jump) velocity
      if (vy < 0) vy = 0
    } else if (isSliding) {
      // Sliding - apply gravity but cap to slide speed (character is touching surface)
      // Use a lower cap since we're sliding along the surface, not free-falling
      const slideTerminal = -5
      vy += config.gravity * delta
      if (vy < slideTerminal) vy = slideTerminal
    } else {
      // Airborne - apply gravity with terminal velocity
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
