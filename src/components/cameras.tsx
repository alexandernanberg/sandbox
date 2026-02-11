import {Line, PerspectiveCamera} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import type {Entity, World} from 'koota'
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
  CameraState,
  IsCameraTarget,
} from '~/ecs/camera'
import {
  computeCameraPosition,
  interpolateOrbitRigsSmooth,
} from '~/ecs/camera/math'
import {RenderTransform} from '~/ecs/physics'
import {useConstant} from '~/utils'

// ============================================
// Camera Component (Thin View Layer)
// ============================================

interface ThirdPersonCameraProps {
  ref?: Ref<PerspectiveCameraImpl>
  targetRef?: RefObject<Object3D | null>
  makeDefault?: boolean
}

/**
 * Third-person camera - thin React view layer.
 * All logic (follow, collision, noise, shake) is handled by ECS cameraUpdateSystem.
 * This component only reads CameraState and updates the Three.js camera.
 */
export function ThirdPersonCamera({
  ref: forwardedRef,
  makeDefault = true,
}: ThirdPersonCameraProps) {
  const ref = useRef<PerspectiveCameraImpl>(null)
  const world = useWorld()
  const cameraEntityRef = useRef<Entity | null>(null)

  useImperativeHandle(forwardedRef, () => ref.current!)

  // Persistent vector for lookAt (reused to avoid allocations)
  const targetLookAt = useConstant(() => new Vector3())

  // Create camera entity with all traits on mount
  useLayoutEffect(() => {
    const entity = world.spawn(
      CameraOrbit,
      CameraNoise,
      CameraShake,
      CameraState,
    )
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

  // Sync debug controls to ECS traits
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

  // ========================================
  // RENDER LOOP: Read ECS state, update Three.js camera
  // ========================================

  useFrame(() => {
    const camera = ref.current
    const cameraEntity = cameraEntityRef.current
    if (!camera || !cameraEntity || !cameraEntity.isAlive()) return

    // Read computed camera state from ECS
    const state = cameraEntity.get(CameraState)
    const orbit = cameraEntity.get(CameraOrbit)
    const shake = cameraEntity.get(CameraShake)
    if (!state || !orbit) return

    // Apply camera position
    camera.position.set(state.positionX, state.positionY, state.positionZ)

    // Look at target
    targetLookAt.set(state.lookAtX, state.lookAtY, state.lookAtZ)
    camera.lookAt(targetLookAt)

    // Apply shake rotation after lookAt
    if (shake && shake.trauma > 0) {
      camera.rotation.x += state.shakeRotationX
      camera.rotation.y += state.shakeRotationY
      camera.rotation.z += state.shakeRotationZ
    }

    // Update debug monitor
    const targetDistance = orbit.middleDistance // Approximate - could compute from interpolated orbit
    // eslint-disable-next-line react-compiler/react-compiler
    cameraMonitor.current.distance = orbit.currentDistance
    cameraMonitor.current.collision =
      orbit.currentDistance < targetDistance - 0.1 ? 'Active' : 'Clear'
    cameraMonitor.current.yaw = (orbit.yaw * 180) / Math.PI
    cameraMonitor.current.pitch = (orbit.pitch * 180) / Math.PI
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
// Camera Shake API
// ============================================

/**
 * Add trauma to the camera shake system.
 * @example
 * addCameraTrauma(world, 0.3) // player hit
 * addCameraTrauma(world, 0.6) // explosion
 */
export function addCameraTrauma(world: World, amount: number): void {
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
