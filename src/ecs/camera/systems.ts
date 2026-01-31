import * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {createQuery} from 'koota'
import type {World} from 'koota'
import {CharacterMovement, RigidBodyRef, RenderTransform} from '../physics'
import {getRapierWorld} from '../physics/world'
import {
  noise2D,
  computeCameraPosition,
  exponentialSmoothing,
  interpolateOrbitRigsSmooth,
  _cameraPos,
  _orbitRig,
} from './math'
import {
  CameraOrbit,
  CameraInput,
  CameraNoise,
  CameraShake,
  CameraState,
  IsCameraTarget,
} from './traits'

// ============================================
// Cached Queries
// ============================================

const cameraOrbitQuery = createQuery(CameraOrbit)
const cameraInputQuery = createQuery(CameraInput)
const cameraFullQuery = createQuery(
  CameraOrbit,
  CameraState,
  CameraNoise,
  CameraShake,
)
const cameraTargetQuery = createQuery(IsCameraTarget, RenderTransform)

// ============================================
// Scratch Objects (reused to avoid allocations)
// ============================================

const _rayOrigin = {x: 0, y: 0, z: 0}
const _rayDirection = {x: 0, y: 0, z: 0}
let _cachedRay: RAPIER.Ray | null = null

// Camera frame scratch objects
const _targetPos = {x: 0, y: 0, z: 0}
const _targetVelocity = {x: 0, y: 0, z: 0}
const _effectiveTarget = {x: 0, y: 0, z: 0}
const _aimOffsetWorld = {x: 0, z: 0}
const _orbitTarget = {x: 0, y: 0, z: 0}
const _finalPosition = {x: 0, y: 0, z: 0}

// Reusable orbit rig objects
const _topRig = {distance: 0, height: 0}
const _middleRig = {distance: 0, height: 0}
const _bottomRig = {distance: 0, height: 0}

// Whisker offsets for multi-ray collision (normalized offsets in camera space)
const WHISKER_OFFSETS = [
  {x: 0, y: 0}, // Center
  {x: 0.4, y: 0}, // Right
  {x: -0.4, y: 0}, // Left
  {x: 0, y: 0.3}, // Up
  {x: 0, y: -0.25}, // Down
  {x: 0.25, y: 0.2}, // Upper-right
  {x: -0.25, y: 0.2}, // Upper-left
]

// ============================================
// Camera Input System
// ============================================

/**
 * Updates camera orbit state from mouse input.
 * Call this before rendering but after input is captured.
 */
export function cameraInputSystem(world: World): void {
  // Get camera input singleton and consume delta
  let deltaX = 0
  let deltaY = 0
  let locked = false

  for (const entity of world.query(cameraInputQuery)) {
    const input = entity.get(CameraInput)!
    deltaX = input.delta.x
    deltaY = input.delta.y
    locked = input.locked
    entity.set(CameraInput, (i) => {
      i.delta.x = 0
      i.delta.y = 0
      return i
    })
    break
  }

  if (!locked) return

  // Apply mouse delta to camera orbit
  for (const entity of world.query(cameraOrbitQuery)) {
    const orbit = entity.get(CameraOrbit)!
    const newYaw = orbit.yaw - deltaX * orbit.sensitivity
    const newPitch = Math.max(
      orbit.minPitch,
      Math.min(orbit.maxPitch, orbit.pitch + deltaY * orbit.sensitivity),
    )

    entity.set(CameraOrbit, (o) => {
      o.yaw = newYaw
      o.pitch = newPitch
      return o
    })
    break
  }
}

// ============================================
// Camera Update System (main logic)
// ============================================

/**
 * Main camera update system - computes camera position, handles collision,
 * noise, and shake. Writes final output to CameraState trait.
 *
 * This runs after physics interpolation so RenderTransform is up-to-date.
 */
export function cameraUpdateSystem(world: World, delta: number) {
  // Get camera entity with all required traits
  // Camera must have CameraOrbit, CameraState, CameraNoise, and CameraShake
  for (const cameraEntity of world.query(cameraFullQuery)) {
    const orbit = cameraEntity.get(CameraOrbit)!
    const state = cameraEntity.get(CameraState)!
    const noise = cameraEntity.get(CameraNoise)
    const shake = cameraEntity.get(CameraShake)
    // Update elapsed time
    const elapsedTime = state.elapsedTime + delta
    cameraEntity.set(CameraState, (s) => {
      s.elapsedTime = elapsedTime
      return s
    })

    // Find target entity (player with IsCameraTarget)
    let hasTarget = false
    let hasVelocity = false
    let targetRigidBody: RAPIER.RigidBody | null = null

    for (const entity of world.query(cameraTargetQuery)) {
      const transform = entity.get(RenderTransform)!
      _targetPos.x = transform.x
      _targetPos.y = transform.y
      _targetPos.z = transform.z
      hasTarget = true

      if (entity.has(CharacterMovement)) {
        const movement = entity.get(CharacterMovement)!
        _targetVelocity.x = movement.mx
        _targetVelocity.y = movement.my
        _targetVelocity.z = movement.mz
        hasVelocity = true
      }

      // Get rigid body to exclude from collision checks
      if (entity.has(RigidBodyRef)) {
        const bodyRef = entity.get(RigidBodyRef)!
        targetRigidBody = bodyRef.body
      }
      break
    }

    if (!hasTarget) return

    // ========================================
    // 1. SMOOTH FOLLOW (camera lags behind player)
    // ========================================
    let followX = orbit.followX
    let followY = orbit.followY
    let followZ = orbit.followZ

    // Horizontal follow (XZ)
    if (orbit.followSmoothing > 0) {
      const followT = exponentialSmoothing(orbit.followSmoothing, delta)
      followX += (_targetPos.x - followX) * followT
      followZ += (_targetPos.z - followZ) * followT
    } else {
      followX = _targetPos.x
      followZ = _targetPos.z
    }

    // Vertical follow (Y) - separate, slower smoothing to reduce motion sickness
    if (orbit.followSmoothingY > 0) {
      const followTY = exponentialSmoothing(orbit.followSmoothingY, delta)
      followY += (_targetPos.y - followY) * followTY
    } else {
      followY = _targetPos.y
    }

    // ========================================
    // 2. LOOK-AHEAD (offset in movement direction)
    // ========================================
    let lookAheadX = orbit.lookAheadX
    let lookAheadZ = orbit.lookAheadZ

    if (hasVelocity) {
      const speed = Math.sqrt(
        _targetVelocity.x * _targetVelocity.x +
          _targetVelocity.z * _targetVelocity.z,
      )

      if (speed > 0.01) {
        const lookAheadScale = Math.min(speed * 10, 1) * orbit.lookAheadDistance
        const targetLookAheadX = (_targetVelocity.x / speed) * lookAheadScale
        const targetLookAheadZ = (_targetVelocity.z / speed) * lookAheadScale

        const lookAheadT = exponentialSmoothing(orbit.lookAheadSmoothing, delta)
        lookAheadX += (targetLookAheadX - lookAheadX) * lookAheadT
        lookAheadZ += (targetLookAheadZ - lookAheadZ) * lookAheadT
      } else {
        // Decay when stationary
        const decayT = exponentialSmoothing(
          orbit.lookAheadSmoothing * 0.5,
          delta,
        )
        lookAheadX *= 1 - decayT
        lookAheadZ *= 1 - decayT
      }
    }

    // Update orbit state
    cameraEntity.set(CameraOrbit, (o) => {
      o.followX = followX
      o.followY = followY
      o.followZ = followZ
      o.lookAheadX = lookAheadX
      o.lookAheadZ = lookAheadZ
      return o
    })

    // Effective target = smooth follow + look-ahead
    _effectiveTarget.x = followX + lookAheadX
    _effectiveTarget.y = followY
    _effectiveTarget.z = followZ + lookAheadZ

    // ========================================
    // 3. INTERPOLATE ORBIT RIGS (Cinemachine-style 3-rig system)
    // ========================================
    const {yaw, pitch} = orbit

    // Update scratch rig objects
    _topRig.distance = orbit.topDistance
    _topRig.height = orbit.topHeight
    _middleRig.distance = orbit.middleDistance
    _middleRig.height = orbit.middleHeight
    _bottomRig.distance = orbit.bottomDistance
    _bottomRig.height = orbit.bottomHeight

    // Interpolate between top/middle/bottom orbits based on pitch (uses scratch object)
    interpolateOrbitRigsSmooth(
      pitch,
      orbit.minPitch,
      orbit.maxPitch,
      _topRig,
      _middleRig,
      _bottomRig,
      _orbitRig,
    )

    const targetDistance = _orbitRig.distance
    const effectiveHeightOffset = _orbitRig.height

    // Apply aim offset in camera space
    _aimOffsetWorld.x = Math.cos(yaw) * orbit.aimOffsetX
    _aimOffsetWorld.z = -Math.sin(yaw) * orbit.aimOffsetX

    _orbitTarget.x = _effectiveTarget.x + _aimOffsetWorld.x
    _orbitTarget.y = _effectiveTarget.y
    _orbitTarget.z = _effectiveTarget.z + _aimOffsetWorld.z

    // ========================================
    // 4. WHISKER COLLISION DETECTION
    // ========================================
    // Compute ideal position using scratch object for collision check
    computeCameraPosition(
      _orbitTarget,
      yaw,
      pitch,
      targetDistance,
      effectiveHeightOffset,
      _cameraPos,
    )
    const collisionDistance = castWhiskerRays(
      _effectiveTarget,
      _cameraPos,
      yaw,
      pitch,
      targetDistance,
      effectiveHeightOffset,
      orbit.collisionPadding,
      targetRigidBody,
    )

    const clampedDistance = Math.max(collisionDistance, orbit.minDistance)

    // ========================================
    // 5. COLLISION DISTANCE SMOOTHING (asymmetric)
    // ========================================
    let currentDist = orbit.currentDistance

    // Fast pull-in, slow ease-out
    const isPullingIn = clampedDistance < currentDist
    const smoothing = isPullingIn
      ? orbit.pullInSmoothing
      : orbit.easeOutSmoothing

    const distT = exponentialSmoothing(smoothing, delta)
    currentDist += (clampedDistance - currentDist) * distT

    cameraEntity.set(CameraOrbit, (o) => {
      o.currentDistance = currentDist
      return o
    })

    // ========================================
    // 6. FINAL CAMERA POSITION (instant rotation, smoothed distance only)
    // ========================================
    // Compute directly into _finalPosition to avoid allocation
    computeCameraPosition(
      _orbitTarget,
      yaw,
      pitch,
      currentDist,
      effectiveHeightOffset,
      _finalPosition,
    )

    // ========================================
    // 7. CAMERA NOISE (subtle)
    // ========================================
    let noiseX = 0
    let noiseY = 0
    let noiseZ = 0

    if (noise?.enabled) {
      noiseX =
        noise2D(elapsedTime * noise.positionFrequency, 0) *
        noise.positionAmplitude
      noiseY =
        noise2D(elapsedTime * noise.positionFrequency, 100) *
        noise.positionAmplitude
      noiseZ =
        noise2D(elapsedTime * noise.positionFrequency, 200) *
        noise.positionAmplitude
    }

    // ========================================
    // 8. CAMERA SHAKE
    // ========================================
    let shakeOffsetX = 0
    let shakeOffsetY = 0
    let shakeOffsetZ = 0
    let shakeRotationX = 0
    let shakeRotationY = 0
    let shakeRotationZ = 0

    if (shake && shake.trauma > 0) {
      const newTrauma = Math.max(0, shake.trauma - shake.traumaDecay * delta)
      cameraEntity.set(CameraShake, (s) => {
        s.trauma = newTrauma
        return s
      })

      const intensity = shake.trauma * shake.trauma
      const time = elapsedTime * shake.frequency

      shakeOffsetX = noise2D(time, 0) * shake.maxOffset * intensity
      shakeOffsetY = noise2D(time, 100) * shake.maxOffset * intensity
      shakeOffsetZ = noise2D(time, 200) * shake.maxOffset * intensity

      shakeRotationX = noise2D(time, 300) * shake.maxRotation * intensity
      shakeRotationY = noise2D(time, 400) * shake.maxRotation * intensity
      shakeRotationZ = noise2D(time, 500) * shake.maxRotation * intensity
    }

    // ========================================
    // 9. WRITE FINAL OUTPUT TO CameraState
    // ========================================
    cameraEntity.set(CameraState, (s) => {
      s.positionX = _finalPosition.x + noiseX + shakeOffsetX
      s.positionY = _finalPosition.y + noiseY + shakeOffsetY
      s.positionZ = _finalPosition.z + noiseZ + shakeOffsetZ

      // Look at target (use smoothed follow position for consistent framing)
      s.lookAtX = _effectiveTarget.x
      s.lookAtY = _effectiveTarget.y + effectiveHeightOffset * 0.5
      s.lookAtZ = _effectiveTarget.z

      s.shakeRotationX = shakeRotationX
      s.shakeRotationY = shakeRotationY
      s.shakeRotationZ = shakeRotationZ

      return s
    })

    break // Only process first camera entity
  }
}

// ============================================
// Whisker Collision
// ============================================

function castWhiskerRays(
  target: {x: number; y: number; z: number},
  idealPos: {x: number; y: number; z: number},
  yaw: number,
  pitch: number,
  maxDistance: number,
  heightOffset: number,
  padding: number,
  excludeRigidBody: RAPIER.RigidBody | null,
): number {
  const rapier = getRapierWorld()
  if (!rapier) return maxDistance

  // Camera basis vectors
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)

  const rightX = cosYaw
  const rightZ = -sinYaw
  const upX = -sinPitch * sinYaw
  const upY = cosPitch
  const upZ = -sinPitch * cosYaw

  const originX = target.x
  const originY = target.y + heightOffset
  const originZ = target.z

  let minDistance = maxDistance

  for (const whisker of WHISKER_OFFSETS) {
    const offsetX = rightX * whisker.x + upX * whisker.y
    const offsetY = upY * whisker.y
    const offsetZ = rightZ * whisker.x + upZ * whisker.y

    const whiskerTargetX = idealPos.x + offsetX
    const whiskerTargetY = idealPos.y + offsetY
    const whiskerTargetZ = idealPos.z + offsetZ

    const dx = whiskerTargetX - originX
    const dy = whiskerTargetY - originY
    const dz = whiskerTargetZ - originZ
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

    if (len < 0.001) continue

    _rayOrigin.x = originX
    _rayOrigin.y = originY
    _rayOrigin.z = originZ
    _rayDirection.x = dx / len
    _rayDirection.y = dy / len
    _rayDirection.z = dz / len

    if (!_cachedRay) {
      _cachedRay = new RAPIER.Ray(_rayOrigin, _rayDirection)
    } else {
      _cachedRay.origin = _rayOrigin
      _cachedRay.dir = _rayDirection
    }

    // Cast ray with filter to exclude the player's rigid body
    const hit = rapier.castRay(
      _cachedRay,
      maxDistance + 1,
      true, // solid
      undefined, // filterFlags
      undefined, // filterGroups
      undefined, // filterExcludeCollider
      excludeRigidBody ?? undefined, // filterExcludeRigidBody
    )

    if (hit) {
      const hitDistance = hit.timeOfImpact - padding
      if (hitDistance < minDistance) {
        minDistance = hitDistance
      }
    }
  }

  return Math.max(0, minDistance)
}

/**
 * Smoothly interpolate an angle, handling wraparound.
 */
export function lerpAngle(current: number, target: number, t: number): number {
  let diff = target - current
  while (diff > Math.PI) diff -= Math.PI * 2
  while (diff < -Math.PI) diff += Math.PI * 2
  return current + diff * t
}
