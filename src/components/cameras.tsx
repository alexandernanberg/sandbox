import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {PerspectiveCamera} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {Ref, RefObject} from 'react'
import {useImperativeHandle, useLayoutEffect, useRef} from 'react'
import type {Object3D, PerspectiveCamera as PerspectiveCameraImpl} from 'three'
import {Vector3} from 'three'
import {useControls, useMonitor} from '~/components/debug-controls'
import {
  CameraOrbit,
  CameraNoise,
  CameraShake,
  IsCameraTarget,
} from '~/ecs/camera'
import {
  noise2D,
  computeCameraPosition,
  exponentialSmoothing,
  interpolateOrbitRigsSmooth,
} from '~/ecs/camera/math'
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
 * - INSTANT mouse response (no position smoothing on rotation)
 * - Whisker-based collision detection
 * - Asymmetric collision smoothing (fast pull-in, slow ease-out)
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

  // Persistent vectors (reused to avoid allocations)
  const noiseOffset = useConstant(() => new Vector3())
  const targetLookAt = useConstant(() => new Vector3())

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

  // ========================================
  // DEBUG CONTROLS
  // ========================================

  const cameraSettings = useControls(
    'Camera',
    {
      sensitivity: {value: 0.003, min: 0.001, max: 0.01, step: 0.001},
      // 3-Rig Orbit System
      topDist: {value: 4.5, min: 1, max: 10, step: 0.5},
      topHeight: {value: 2.5, min: 0, max: 5, step: 0.1},
      middleDist: {value: 5.5, min: 1, max: 12, step: 0.5},
      middleHeight: {value: 1.5, min: 0, max: 4, step: 0.1},
      bottomDist: {value: 3.0, min: 1, max: 8, step: 0.5},
      bottomHeight: {value: 0.5, min: -1, max: 3, step: 0.1},
      // Collision
      minDistance: {value: 1.5, min: 0.5, max: 3, step: 0.1},
      pullInSpeed: {value: 25, min: 5, max: 50, step: 1},
      easeOutSpeed: {value: 5, min: 1, max: 20, step: 1},
      // Look-ahead
      lookAheadDist: {value: 1.5, min: 0, max: 4, step: 0.1},
      lookAheadSpeed: {value: 3, min: 0.5, max: 10, step: 0.5},
      // Framing
      aimOffsetX: {value: 0.3, min: -1, max: 1, step: 0.1},
      // Noise
      noiseEnabled: {value: true},
      noiseAmplitude: {value: 0.015, min: 0, max: 0.1, step: 0.005},
    },
    {expanded: false, index: 1},
  )

  const cameraMonitor = useMonitor(
    'Camera State',
    {
      distance: {label: 'Distance', format: (v) => v.toFixed(2)},
      collision: {label: 'Collision', type: 'string'},
      yaw: {label: 'Yaw°', format: (v) => v.toFixed(1)},
      pitch: {label: 'Pitch°', format: (v) => v.toFixed(1)},
    },
    {expanded: false, index: 2},
  )

  // Sync debug controls to ECS trait
  useLayoutEffect(() => {
    const entity = cameraEntityRef.current
    if (!entity?.isAlive()) return

    entity.set(CameraOrbit, (o) => {
      o.sensitivity = cameraSettings.sensitivity
      // 3-Rig orbit system
      o.topDistance = cameraSettings.topDist
      o.topHeight = cameraSettings.topHeight
      o.middleDistance = cameraSettings.middleDist
      o.middleHeight = cameraSettings.middleHeight
      o.bottomDistance = cameraSettings.bottomDist
      o.bottomHeight = cameraSettings.bottomHeight
      // Collision & smoothing
      o.minDistance = cameraSettings.minDistance
      o.pullInSmoothing = cameraSettings.pullInSpeed
      o.easeOutSmoothing = cameraSettings.easeOutSpeed
      o.lookAheadDistance = cameraSettings.lookAheadDist
      o.lookAheadSmoothing = cameraSettings.lookAheadSpeed
      o.aimOffsetX = cameraSettings.aimOffsetX
      return o
    })

    entity.set(CameraNoise, (n) => {
      n.enabled = cameraSettings.noiseEnabled
      n.positionAmplitude = cameraSettings.noiseAmplitude
      return n
    })
  }, [cameraSettings])

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

      if (entity.has(CharacterMovement)) {
        const movement = entity.get(CharacterMovement)!
        targetVelocity = {x: movement.mx, y: movement.my, z: movement.mz}
      }
      break
    }

    if (!targetPos) return

    // ========================================
    // 1. LOOK-AHEAD FRAMING (smoothed - intentionally gradual)
    // ========================================
    let lookAheadX = orbit.lookAheadX
    let lookAheadZ = orbit.lookAheadZ

    if (targetVelocity) {
      const speed = Math.sqrt(
        targetVelocity.x * targetVelocity.x +
          targetVelocity.z * targetVelocity.z,
      )

      if (speed > 0.01) {
        const lookAheadScale = Math.min(speed * 10, 1) * orbit.lookAheadDistance
        const targetLookAheadX = (targetVelocity.x / speed) * lookAheadScale
        const targetLookAheadZ = (targetVelocity.z / speed) * lookAheadScale

        const lookAheadT = exponentialSmoothing(orbit.lookAheadSmoothing, delta)
        lookAheadX += (targetLookAheadX - lookAheadX) * lookAheadT
        lookAheadZ += (targetLookAheadZ - lookAheadZ) * lookAheadT
      } else {
        // Decay when stationary
        const decayT = exponentialSmoothing(orbit.lookAheadSmoothing * 0.5, delta)
        lookAheadX *= 1 - decayT
        lookAheadZ *= 1 - decayT
      }

      cameraEntity.set(CameraOrbit, (o) => {
        o.lookAheadX = lookAheadX
        o.lookAheadZ = lookAheadZ
        return o
      })
    }

    // Effective target with look-ahead
    const effectiveTarget = {
      x: targetPos.x + lookAheadX,
      y: targetPos.y,
      z: targetPos.z + lookAheadZ,
    }

    // ========================================
    // 2. INTERPOLATE ORBIT RIGS (Cinemachine-style 3-rig system)
    // ========================================
    const {yaw, pitch} = orbit

    // Interpolate between top/middle/bottom orbits based on pitch
    const interpolatedOrbit = interpolateOrbitRigsSmooth(
      pitch,
      orbit.minPitch,
      orbit.maxPitch,
      {distance: orbit.topDistance, height: orbit.topHeight},
      {distance: orbit.middleDistance, height: orbit.middleHeight},
      {distance: orbit.bottomDistance, height: orbit.bottomHeight},
    )

    const targetDistance = interpolatedOrbit.distance
    const effectiveHeightOffset = interpolatedOrbit.height

    // Apply aim offset in camera space
    const aimOffsetWorld = {
      x: Math.cos(yaw) * orbit.aimOffsetX,
      z: -Math.sin(yaw) * orbit.aimOffsetX,
    }

    const orbitTarget = {
      x: effectiveTarget.x + aimOffsetWorld.x,
      y: effectiveTarget.y,
      z: effectiveTarget.z + aimOffsetWorld.z,
    }

    // ========================================
    // 3. WHISKER COLLISION DETECTION
    // ========================================
    const collisionDistance = castWhiskerRays(
      effectiveTarget,
      computeCameraPosition(orbitTarget, yaw, pitch, targetDistance, effectiveHeightOffset),
      yaw,
      pitch,
      targetDistance,
      effectiveHeightOffset,
      orbit.collisionPadding,
    )

    const clampedDistance = Math.max(collisionDistance, orbit.minDistance)

    // ========================================
    // 4. COLLISION DISTANCE SMOOTHING (asymmetric)
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
    // 5. FINAL CAMERA POSITION (instant rotation, smoothed distance only)
    // ========================================
    const finalPosition = computeCameraPosition(
      orbitTarget,
      yaw,
      pitch,
      currentDist,
      effectiveHeightOffset,
    )

    // ========================================
    // 6. CAMERA NOISE (subtle)
    // ========================================
    noiseOffset.set(0, 0, 0)

    if (noise?.enabled) {
      const time = elapsedTime.current
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
      const newTrauma = Math.max(0, shake.trauma - shake.traumaDecay * delta)
      cameraEntity.set(CameraShake, (s) => {
        s.trauma = newTrauma
        return s
      })

      const intensity = shake.trauma * shake.trauma
      const time = elapsedTime.current * shake.frequency

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
    // 8. APPLY FINAL TRANSFORM
    // ========================================
    camera.position.set(
      finalPosition.x + noiseOffset.x + shakeOffset.x,
      finalPosition.y + noiseOffset.y + shakeOffset.y,
      finalPosition.z + noiseOffset.z + shakeOffset.z,
    )

    // Look at target
    targetLookAt.set(
      effectiveTarget.x,
      targetPos.y + effectiveHeightOffset * 0.5,
      effectiveTarget.z,
    )
    camera.lookAt(targetLookAt)

    // Apply shake rotation after lookAt
    if (shake && shake.trauma > 0) {
      camera.rotation.x += shakeRotation.x
      camera.rotation.y += shakeRotation.y
      camera.rotation.z += shakeRotation.z
    }

    // ========================================
    // 9. UPDATE DEBUG MONITOR
    // ========================================
    cameraMonitor.current.distance = currentDist
    cameraMonitor.current.collision =
      currentDist < targetDistance - 0.1 ? 'Active' : 'Clear'
    cameraMonitor.current.yaw = (yaw * 180) / Math.PI
    cameraMonitor.current.pitch = (pitch * 180) / Math.PI
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

    const hit = rapier.castRay(_cachedRay, maxDistance + 1, true)

    if (hit) {
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
 * @example
 * addCameraTrauma(world, 0.3) // player hit
 * addCameraTrauma(world, 0.6) // explosion
 */
export function addCameraTrauma(
  world: ReturnType<typeof useWorld>,
  amount: number,
) {
  for (const entity of world.query(CameraShake)) {
    entity.set(CameraShake, (s) => {
      s.trauma = Math.min(1, s.trauma + amount)
      return s
    })
    break
  }
}
