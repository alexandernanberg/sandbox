import {createQuery} from 'koota'
import type {World} from 'koota'
import {CharacterMovement} from '../physics/character'
import {Input, IsPlayer, PlayerMovementConfig, PlayerVelocity} from './traits'

// ============================================
// Cached Queries
// ============================================

const playerMovementQuery = createQuery(
  IsPlayer,
  PlayerMovementConfig,
  PlayerVelocity,
  CharacterMovement,
)

// ============================================
// Player Movement System
// ============================================

/**
 * Updates player velocity based on input and applies it to the character controller.
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
    const speed = input.sprint ? config.sprintSpeed : config.walkSpeed

    // Horizontal movement
    const vx = normalizedX * speed * delta
    const vz = normalizedY * speed * delta

    // Vertical movement (jump + gravity)
    let vy = velocity.y

    // Jumping
    if (isGrounded && input.jump) {
      vy = Math.sqrt(config.jumpHeight * -0.05 * config.gravity)
    }

    // Gravity
    if (isGrounded && vy < 0) {
      vy = 0
    } else {
      vy += config.gravity * delta
    }

    // Update velocity trait
    entity.set(PlayerVelocity, {x: vx, y: vy, z: vz})

    // Set velocity on character movement (this is read by characterControllerSystem)
    entity.set(CharacterMovement, (m) => {
      m.vx = vx
      m.vy = vy
      m.vz = vz
      return m
    })
  }
}
