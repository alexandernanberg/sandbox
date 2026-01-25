import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {PerspectiveCamera} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {Ref, RefObject} from 'react'
import {useImperativeHandle, useLayoutEffect, useRef} from 'react'
import type {Object3D, PerspectiveCamera as PerspectiveCameraImpl} from 'three'
import {Vector3} from 'three'
import {
  CameraOrbit,
  CameraNoise,
  CameraShake,
  IsCameraTarget,
} from '~/ecs/camera'
import {CharacterMovement} from '~/ecs/physics'
import {RenderTransform} from '~/ecs/physics'
import {getRapierWorld} from '~/ecs/physics/world'
import {useConstant} from '~/utils'

// ============================================
// Scratch Objects (reused to avoid allocations)
// ============================================

const _rayOrigin = {x: 0, y: 0, z: 0}
const _rayDirection = {x: 0, y: 0, z: 0}
let _cachedRay: RAPIER.Ray | null = null

// Whisker offsets for multi-ray collision (normalized screen-space offsets)
// Cast rays in a cross/plus pattern around the center
const WHISKER_OFFSETS = [
  {x: 0, y: 0}, // Center
  {x: 0.4, y: 0}, // Right
  {x: -0.4, y: 0}, // Left
  {x: 0, y: 0.3}, // Up
  {x: 0, y: -0.25}, // Down
  {x: 0.25, y: 0.2}, // Upper-right
  {x: -0.25, y: 0.2}, // Upper-left
]

// Simple 2D noise function (hand-rolled to avoid dependencies)
// Uses multiple sine waves for pseudo-random behavior
function noise2D(x: number, y: number): number {
  const n1 = Math.sin(x * 1.27 + y * 3.71) * 0.5
  const n2 = Math.sin(x * 2.31 + y * 1.43) * 0.3
  const n3 = Math.sin(x * 3.91 + y * 2.17) * 0.2
  return n1 + n2 + n3
}

// ============================================
// Camera Component
// ============================================

interface ThirdPersonCameraProps {
  ref?: Ref<PerspectiveCameraImpl>
  targetRef?: RefObject<Object3D | null>
  makeDefault?: boolean
  /** Height offset from target position */
  heightOffset?: number
}

/**
 * Professional third-person camera with:
 * - Whisker-based collision detection
 * - Asymmetric smoothing (fast pull-in, slow ease-out)
 * - Look-ahead framing based on player velocity
 * - Perlin noise for natural movement
 * - Trauma-based shake system
 */
export function ThirdPersonCamera({
  ref: forwardedRef,
  makeDefault = true,
  heightOffset = 1.5,
}: ThirdPersonCameraProps) {
  const ref = useRef<PerspectiveCameraImpl>(null)
  const world = useWorld()
  const cameraEntityRef = useRef<Entity | null>(null)
  const elapsedTime = useRef(0)

  useImperativeHandle(forwardedRef, () => ref.current!)

  // Persistent vectors for smooth interpolation (reused to avoid allocations)
  const currentPosition = useConstant(() => new Vector3())
  const targetLookAt = useConstant(() => new Vector3())
  const lerpTarget = useConstant(() => new Vector3())
  const noiseOffset = useConstant(() => new Vector3())

  // Track previous collision distance for asymmetric smoothing
  const prevCollisionDist = useRef<number | null>(null)

  // Create camera orbit entity on mount
  useLayoutEffect(() => {
    const entity = world.spawn(CameraOrbit, CameraNoise, CameraShake)
    cameraEntityRef.current = entity
    return () => {
      if (entity.isAlive()) {
        entity.destroy()
      }
    }
  }, [world])

  useFrame((_, delta) => {
    const camera = ref.current
    const cameraEntity = cameraEntityRef.current
    if (!camera || !cameraEntity || !cameraEntity.isAlive()) return

    elapsedTime.current += delta

    // Get camera components
    const orbit = cameraEntity.get(CameraOrbit)
    const noise = cameraEntity.get(CameraNoise)
    const shake = cameraEntity.get(CameraShake)
    if (!orbit) return

    // Find target entity (player with IsCameraTarget)
    let targetPos: {x: number; y: number; z: number} | null = null
    let targetVelocity: {x: number; y: number; z: number} | null = null

    for (const entity of world.query(IsCameraTarget, RenderTransform)) {
      const transform = entity.get(RenderTransform)!
      targetPos = {x: transform.x, y: transform.y, z: transform.z}

      // Get velocity for look-ahead (if character has movement component)
      if (entity.has(CharacterMovement)) {
        const movement = entity.get(CharacterMovement)!
        targetVelocity = {x: movement.mx, y: movement.my, z: movement.mz}
      }
      break
    }

    if (!targetPos) return

    // ========================================
    // 1. LOOK-AHEAD FRAMING
    // ========================================
    let lookAheadX = orbit.lookAheadX
    let lookAheadZ = orbit.lookAheadZ

    if (targetVelocity) {
      // Calculate target look-ahead based on velocity
      const speed = Math.sqrt(
        targetVelocity.x * targetVelocity.x +
          targetVelocity.z * targetVelocity.z,
      )

      if (speed > 0.01) {
        // Scale look-ahead by speed (capped)
        const lookAheadScale = Math.min(speed * 10, 1) * orbit.lookAheadDistance
        const targetLookAheadX = (targetVelocity.x / speed) * lookAheadScale
        const targetLookAheadZ = (targetVelocity.z / speed) * lookAheadScale

        // Smooth the look-ahead offset
        const lookAheadT = 1 - Math.exp(-orbit.lookAheadSmoothing * delta)
        lookAheadX += (targetLookAheadX - lookAheadX) * lookAheadT
        lookAheadZ += (targetLookAheadZ - lookAheadZ) * lookAheadT
      } else {
        // Decay look-ahead when stationary
        const decayT = 1 - Math.exp(-orbit.lookAheadSmoothing * 0.5 * delta)
        lookAheadX *= 1 - decayT
        lookAheadZ *= 1 - decayT
      }

      // Update orbit state
      cameraEntity.set(CameraOrbit, (o) => {
        o.lookAheadX = lookAheadX
        o.lookAheadZ = lookAheadZ
        return o
      })
    }

    // Apply look-ahead to effective target position
    const effectiveTarget = {
      x: targetPos.x + lookAheadX,
      y: targetPos.y,
      z: targetPos.z + lookAheadZ,
    }

    // ========================================
    // 2. CALCULATE IDEAL CAMERA POSITION
    // ========================================
    const {yaw, pitch, distance} = orbit

    // Apply aim offset (shift target in camera space)
    const aimOffsetWorld = {
      x: Math.cos(yaw) * orbit.aimOffsetX,
      z: -Math.sin(yaw) * orbit.aimOffsetX,
    }

    const idealPosition = computeCameraPosition(
      {
        x: effectiveTarget.x + aimOffsetWorld.x,
        y: effectiveTarget.y,
        z: effectiveTarget.z + aimOffsetWorld.z,
      },
      yaw,
      pitch,
      distance,
      heightOffset,
    )

    // ========================================
    // 3. WHISKER COLLISION DETECTION
    // ========================================
    const collisionDistance = castWhiskerRays(
      effectiveTarget,
      idealPosition,
      yaw,
      pitch,
      distance,
      heightOffset,
      orbit.collisionPadding,
    )

    // Clamp to minimum distance
    const clampedDistance = Math.max(collisionDistance, orbit.minDistance)

    // ========================================
    // 4. ASYMMETRIC COLLISION SMOOTHING
    // ========================================
    let currentDist = orbit.currentDistance

    // Determine if we're pulling in or easing out
    const isPullingIn = clampedDistance < currentDist
    const smoothing = isPullingIn
      ? orbit.pullInSmoothing
      : orbit.easeOutSmoothing

    // Smooth the collision distance
    const distT = 1 - Math.exp(-smoothing * delta)
    currentDist += (clampedDistance - currentDist) * distT

    // Update current distance in orbit state
    cameraEntity.set(CameraOrbit, (o) => {
      o.currentDistance = currentDist
      return o
    })

    prevCollisionDist.current = currentDist

    // Compute final camera position with smoothed distance
    const finalIdealPosition = computeCameraPosition(
      {
        x: effectiveTarget.x + aimOffsetWorld.x,
        y: effectiveTarget.y,
        z: effectiveTarget.z + aimOffsetWorld.z,
      },
      yaw,
      pitch,
      currentDist,
      heightOffset,
    )

    // ========================================
    // 5. POSITION SMOOTHING
    // ========================================
    const posT = 1 - Math.exp(-orbit.positionSmoothing * delta)
    lerpTarget.set(
      finalIdealPosition.x,
      finalIdealPosition.y,
      finalIdealPosition.z,
    )
    currentPosition.lerp(lerpTarget, posT)

    // ========================================
    // 6. CAMERA NOISE
    // ========================================
    noiseOffset.set(0, 0, 0)

    if (noise?.enabled) {
      const time = elapsedTime.current

      // Position noise (different seeds for each axis)
      noiseOffset.x =
        noise2D(time * noise.positionFrequency, 0) * noise.positionAmplitude
      noiseOffset.y =
        noise2D(time * noise.positionFrequency, 100) * noise.positionAmplitude
      noiseOffset.z =
        noise2D(time * noise.positionFrequency, 200) * noise.positionAmplitude
    }

    // ========================================
    // 7. CAMERA SHAKE
    // ========================================
    let shakeOffset = {x: 0, y: 0, z: 0}
    let shakeRotation = {x: 0, y: 0, z: 0}

    if (shake && shake.trauma > 0) {
      // Decay trauma
      const newTrauma = Math.max(0, shake.trauma - shake.traumaDecay * delta)
      cameraEntity.set(CameraShake, (s) => {
        s.trauma = newTrauma
        return s
      })

      // Shake intensity = trauma^2 for snappier feel
      const intensity = shake.trauma * shake.trauma
      const time = elapsedTime.current * shake.frequency

      // Random offsets using noise
      shakeOffset = {
        x: noise2D(time, 0) * shake.maxOffset * intensity,
        y: noise2D(time, 100) * shake.maxOffset * intensity,
        z: noise2D(time, 200) * shake.maxOffset * intensity,
      }

      shakeRotation = {
        x: noise2D(time, 300) * shake.maxRotation * intensity,
        y: noise2D(time, 400) * shake.maxRotation * intensity,
        z: noise2D(time, 500) * shake.maxRotation * intensity,
      }
    }

    // ========================================
    // 8. APPLY FINAL CAMERA TRANSFORM
    // ========================================
    camera.position.set(
      currentPosition.x + noiseOffset.x + shakeOffset.x,
      currentPosition.y + noiseOffset.y + shakeOffset.y,
      currentPosition.z + noiseOffset.z + shakeOffset.z,
    )

    // Look at target (slightly above player center, with look-ahead)
    targetLookAt.set(
      effectiveTarget.x,
      targetPos.y + heightOffset * 0.5,
      effectiveTarget.z,
    )
    camera.lookAt(targetLookAt)

    // Apply shake rotation after lookAt
    if (shake && shake.trauma > 0) {
      camera.rotation.x += shakeRotation.x
      camera.rotation.y += shakeRotation.y
      camera.rotation.z += shakeRotation.z
    }
  })

  return (
    <PerspectiveCamera
      makeDefault={makeDefault}
      ref={ref}
      fov={75}
      position={[0, 4, 8]}
      near={0.1}
      far={1000}
    />
  )
}

// ============================================
// Helper Functions
// ============================================

/**
 * Compute camera position in spherical coordinates around target.
 */
function computeCameraPosition(
  target: {x: number; y: number; z: number},
  yaw: number,
  pitch: number,
  distance: number,
  heightOffset: number,
): {x: number; y: number; z: number} {
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  return {
    x: target.x + distance * cosPitch * sinYaw,
    y: target.y + heightOffset + distance * sinPitch,
    z: target.z + distance * cosPitch * cosYaw,
  }
}

/**
 * Cast multiple "whisker" rays from target to camera to detect collisions.
 * Returns the minimum safe distance across all whiskers.
 */
function castWhiskerRays(
  target: {x: number; y: number; z: number},
  idealPos: {x: number; y: number; z: number},
  yaw: number,
  pitch: number,
  maxDistance: number,
  heightOffset: number,
  padding: number,
): number {
  const rapier = getRapierWorld()
  if (!rapier) return maxDistance

  // Calculate camera's right and up vectors for whisker offsets
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  // Camera forward (from target to camera)
  const forwardX = cosPitch * sinYaw
  const forwardY = sinPitch
  const forwardZ = cosPitch * cosYaw

  // Camera right (perpendicular to forward in XZ plane)
  const rightX = cosYaw
  const rightZ = -sinYaw

  // Camera up (cross product of forward and right)
  const upX = -sinPitch * sinYaw
  const upY = cosPitch
  const upZ = -sinPitch * cosYaw

  // Origin for all rays (target + height offset)
  const originX = target.x
  const originY = target.y + heightOffset
  const originZ = target.z

  let minDistance = maxDistance

  // Cast each whisker ray
  for (const whisker of WHISKER_OFFSETS) {
    // Calculate whisker endpoint offset from ideal position
    // Offset is in camera-space (right/up relative to camera direction)
    const offsetX = rightX * whisker.x + upX * whisker.y
    const offsetY = upY * whisker.y
    const offsetZ = rightZ * whisker.x + upZ * whisker.y

    // Whisker target position
    const whiskerTargetX = idealPos.x + offsetX
    const whiskerTargetY = idealPos.y + offsetY
    const whiskerTargetZ = idealPos.z + offsetZ

    // Ray direction
    const dx = whiskerTargetX - originX
    const dy = whiskerTargetY - originY
    const dz = whiskerTargetZ - originZ
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (len < 0.001) continue

    // Set ray origin and direction
    _rayOrigin.x = originX
    _rayOrigin.y = originY
    _rayOrigin.z = originZ
    _rayDirection.x = dx / len
    _rayDirection.y = dy / len
    _rayDirection.z = dz / len

    // Create or reuse Ray
    if (!_cachedRay) {
      _cachedRay = new RAPIER.Ray(_rayOrigin, _rayDirection)
    } else {
      _cachedRay.origin = _rayOrigin
      _cachedRay.dir = _rayDirection
    }

    // Cast ray
    const hit = rapier.castRay(_cachedRay, maxDistance + 1, true)

    if (hit) {
      // Convert hit distance to camera distance (accounting for whisker spread)
      // Use conservative estimate - if any whisker hits, pull camera in
      const hitDistance = hit.timeOfImpact - padding
      if (hitDistance < minDistance) {
        minDistance = hitDistance
      }
    }
  }

  return Math.max(0, minDistance)
}

// ============================================
// Camera Shake API
// ============================================

/**
 * Add trauma to the camera shake system.
 * Call this from game code when impacts occur.
 *
 * @example
 * // On player hit
 * addCameraTrauma(world, 0.3)
 *
 * // On explosion
 * addCameraTrauma(world, 0.6)
 */
export function addCameraTrauma(world: ReturnType<typeof useWorld>, amount: number) {
  for (const entity of world.query(CameraShake)) {
    entity.set(CameraShake, (s) => {
      s.trauma = Math.min(1, s.trauma + amount)
      return s
    })
    break
  }
}
