import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {Line, PerspectiveCamera} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {Ref, RefObject} from 'react'
import {useImperativeHandle, useLayoutEffect, useRef} from 'react'
import type {
  Group,
  Object3D,
  PerspectiveCamera as PerspectiveCameraImpl,
} from 'three'
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
import {CharacterMovement, RigidBodyRef} from '~/ecs/physics'
import {RenderTransform} from '~/ecs/physics'
import {getRapierWorld} from '~/ecs/physics/world'
import {useConstant} from '~/utils'

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
const _shakeOffset = {x: 0, y: 0, z: 0}
const _shakeRotation = {x: 0, y: 0, z: 0}

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
// Camera Component
// ============================================

interface ThirdPersonCameraProps {
  ref?: Ref<PerspectiveCameraImpl>
  targetRef?: RefObject<Object3D | null>
  makeDefault?: boolean
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
    'Camera Orbit',
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
      // Follow
      followSmoothing: {value: 6.0, min: 0, max: 15, step: 0.5},
      followSmoothingY: {value: 2.0, min: 0, max: 10, step: 0.5},
      // Look-ahead
      lookAheadDist: {value: 1.0, min: 0, max: 4, step: 0.1},
      lookAheadSpeed: {value: 3, min: 0.5, max: 10, step: 0.5},
      // Framing
      aimOffsetX: {value: 0.3, min: -1, max: 1, step: 0.1},
      // Noise
      noiseEnabled: {value: true},
      noiseAmplitude: {value: 0.015, min: 0, max: 0.1, step: 0.005},
    },
    {expanded: false, index: 4},
  )

  const cameraMonitor = useMonitor(
    'Camera State',
    {
      distance: {label: 'Distance', format: (v) => v.toFixed(2)},
      collision: {label: 'Collision', type: 'string'},
      yaw: {label: 'Yaw°', format: (v) => v.toFixed(1)},
      pitch: {label: 'Pitch°', format: (v) => v.toFixed(1)},
    },
    {expanded: false, index: 5},
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
      o.followSmoothing = cameraSettings.followSmoothing
      o.followSmoothingY = cameraSettings.followSmoothingY
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
    let hasTarget = false
    let hasVelocity = false
    let targetRigidBody: RAPIER.RigidBody | null = null

    for (const entity of world.query(IsCameraTarget, RenderTransform)) {
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
    // 2. INTERPOLATE ORBIT RIGS (Cinemachine-style 3-rig system)
    // ========================================
    const {yaw, pitch} = orbit

    // Update scratch rig objects
    _topRig.distance = orbit.topDistance
    _topRig.height = orbit.topHeight
    _middleRig.distance = orbit.middleDistance
    _middleRig.height = orbit.middleHeight
    _bottomRig.distance = orbit.bottomDistance
    _bottomRig.height = orbit.bottomHeight

    // Interpolate between top/middle/bottom orbits based on pitch
    const interpolatedOrbit = interpolateOrbitRigsSmooth(
      pitch,
      orbit.minPitch,
      orbit.maxPitch,
      _topRig,
      _middleRig,
      _bottomRig,
    )

    const targetDistance = interpolatedOrbit.distance
    const effectiveHeightOffset = interpolatedOrbit.height

    // Apply aim offset in camera space
    _aimOffsetWorld.x = Math.cos(yaw) * orbit.aimOffsetX
    _aimOffsetWorld.z = -Math.sin(yaw) * orbit.aimOffsetX

    _orbitTarget.x = _effectiveTarget.x + _aimOffsetWorld.x
    _orbitTarget.y = _effectiveTarget.y
    _orbitTarget.z = _effectiveTarget.z + _aimOffsetWorld.z

    // ========================================
    // 3. WHISKER COLLISION DETECTION
    // ========================================
    const collisionDistance = castWhiskerRays(
      _effectiveTarget,
      computeCameraPosition(
        _orbitTarget,
        yaw,
        pitch,
        targetDistance,
        effectiveHeightOffset,
      ),
      yaw,
      pitch,
      targetDistance,
      effectiveHeightOffset,
      orbit.collisionPadding,
      targetRigidBody,
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
    const computedPos = computeCameraPosition(
      _orbitTarget,
      yaw,
      pitch,
      currentDist,
      effectiveHeightOffset,
    )
    _finalPosition.x = computedPos.x
    _finalPosition.y = computedPos.y
    _finalPosition.z = computedPos.z

    // ========================================
    // 6. CAMERA NOISE (subtle)
    // ========================================
    noiseOffset.set(0, 0, 0)

    if (noise?.enabled) {
      const time = elapsedTime.current
      // eslint-disable-next-line react-compiler/react-compiler
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
    _shakeOffset.x = 0
    _shakeOffset.y = 0
    _shakeOffset.z = 0
    _shakeRotation.x = 0
    _shakeRotation.y = 0
    _shakeRotation.z = 0

    if (shake && shake.trauma > 0) {
      const newTrauma = Math.max(0, shake.trauma - shake.traumaDecay * delta)
      cameraEntity.set(CameraShake, (s) => {
        s.trauma = newTrauma
        return s
      })

      const intensity = shake.trauma * shake.trauma
      const time = elapsedTime.current * shake.frequency

      _shakeOffset.x = noise2D(time, 0) * shake.maxOffset * intensity
      _shakeOffset.y = noise2D(time, 100) * shake.maxOffset * intensity
      _shakeOffset.z = noise2D(time, 200) * shake.maxOffset * intensity

      _shakeRotation.x = noise2D(time, 300) * shake.maxRotation * intensity
      _shakeRotation.y = noise2D(time, 400) * shake.maxRotation * intensity
      _shakeRotation.z = noise2D(time, 500) * shake.maxRotation * intensity
    }

    // ========================================
    // 8. APPLY FINAL TRANSFORM
    // ========================================
    camera.position.set(
      _finalPosition.x + noiseOffset.x + _shakeOffset.x,
      _finalPosition.y + noiseOffset.y + _shakeOffset.y,
      _finalPosition.z + noiseOffset.z + _shakeOffset.z,
    )

    // Look at target (use orbit center height for consistent framing)
    targetLookAt.set(
      _effectiveTarget.x,
      _targetPos.y + effectiveHeightOffset * 0.5,
      _effectiveTarget.z,
    )
    camera.lookAt(targetLookAt)

    // Apply shake rotation after lookAt
    if (shake && shake.trauma > 0) {
      camera.rotation.x += _shakeRotation.x
      camera.rotation.y += _shakeRotation.y
      camera.rotation.z += _shakeRotation.z
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

// ============================================
// Orbit Debug Visualizer (Standalone)
// ============================================

// Default orbit configuration matching CameraOrbit trait defaults
const DEFAULT_ORBIT_CONFIG = {
  topDistance: 4.5,
  topHeight: 2.5,
  middleDistance: 5.5,
  middleHeight: 1.5,
  bottomDistance: 3.0,
  bottomHeight: 0.5,
  minPitch: -0.5,
  maxPitch: 1.2,
}

const RING_SEGMENTS = 64
const PATH_SEGMENTS = 32
const PATH_YAW_COUNT = 8 // Number of vertical paths around the orbit

/**
 * Standalone debug visualization showing the 3-rig orbit system.
 * Can be rendered independently of ThirdPersonCamera.
 * Renders:
 * - Top ring (red) - camera path when looking down
 * - Middle ring (green) - camera path at horizontal
 * - Bottom ring (blue) - camera path when looking up
 * - Multiple interpolated paths (yellow) - actual camera paths across pitch range
 */
export function OrbitDebugVisualizer() {
  const world = useWorld()
  const groupRef = useRef<Group>(null)
  const config = DEFAULT_ORBIT_CONFIG

  // Generate ring points for a given distance/height at all yaw angles
  const generateRingPoints = (
    distance: number,
    height: number,
    pitch: number,
  ): [number, number, number][] => {
    const points: [number, number, number][] = []
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const yaw = (i / RING_SEGMENTS) * Math.PI * 2
      const pos = computeCameraPosition(
        {x: 0, y: 0, z: 0},
        yaw,
        pitch,
        distance,
        height,
      )
      points.push([pos.x, pos.y, pos.z])
    }
    return points
  }

  // Generate interpolated path points at a specific yaw across all pitches
  const generatePathPoints = (yaw: number): [number, number, number][] => {
    const points: [number, number, number][] = []
    for (let i = 0; i <= PATH_SEGMENTS; i++) {
      const t = i / PATH_SEGMENTS
      const pitch = config.minPitch + t * (config.maxPitch - config.minPitch)
      const interpolated = interpolateOrbitRigsSmooth(
        pitch,
        config.minPitch,
        config.maxPitch,
        {distance: config.topDistance, height: config.topHeight},
        {distance: config.middleDistance, height: config.middleHeight},
        {distance: config.bottomDistance, height: config.bottomHeight},
      )
      const pos = computeCameraPosition(
        {x: 0, y: 0, z: 0},
        yaw,
        pitch,
        interpolated.distance,
        interpolated.height,
      )
      points.push([pos.x, pos.y, pos.z])
    }
    return points
  }

  // Generate ring geometry
  const topRingPoints = generateRingPoints(
    config.topDistance,
    config.topHeight,
    config.maxPitch,
  )
  const middleRingPoints = generateRingPoints(
    config.middleDistance,
    config.middleHeight,
    0,
  )
  const bottomRingPoints = generateRingPoints(
    config.bottomDistance,
    config.bottomHeight,
    config.minPitch,
  )

  // Generate multiple vertical paths around the orbit
  const pathPointsArray: [number, number, number][][] = []
  for (let i = 0; i < PATH_YAW_COUNT; i++) {
    const yaw = (i / PATH_YAW_COUNT) * Math.PI * 2
    pathPointsArray.push(generatePathPoints(yaw))
  }

  // Follow target position
  useFrame(() => {
    let targetX = 0
    let targetY = 0
    let targetZ = 0
    for (const targetEntity of world.query(IsCameraTarget, RenderTransform)) {
      const transform = targetEntity.get(RenderTransform)!
      targetX = transform.x
      targetY = transform.y
      targetZ = transform.z
      break
    }

    if (groupRef.current) {
      groupRef.current.position.set(targetX, targetY, targetZ)
    }
  })

  return (
    <group ref={groupRef}>
      {/* Top ring - red (at max pitch / looking down) */}
      <Line
        points={topRingPoints}
        color="#ff4444"
        lineWidth={2}
        opacity={0.7}
        transparent
      />
      {/* Middle ring - green (at pitch = 0) */}
      <Line
        points={middleRingPoints}
        color="#44ff44"
        lineWidth={2}
        opacity={0.7}
        transparent
      />
      {/* Bottom ring - blue (at min pitch / looking up) */}
      <Line
        points={bottomRingPoints}
        color="#4444ff"
        lineWidth={2}
        opacity={0.7}
        transparent
      />
      {/* Interpolated paths - yellow */}
      {pathPointsArray.map((points, i) => (
        <Line
          key={i}
          points={points}
          color="#ffff00"
          lineWidth={2}
          opacity={0.8}
          transparent
        />
      ))}
    </group>
  )
}
