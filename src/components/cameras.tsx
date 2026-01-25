import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {PerspectiveCamera} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import type {Ref, RefObject} from 'react'
import {useImperativeHandle, useLayoutEffect, useRef} from 'react'
import type {Object3D, PerspectiveCamera as PerspectiveCameraImpl} from 'three'
import {CameraOrbit, IsCameraTarget} from '~/ecs/camera'
import {RenderTransform} from '~/ecs/physics'
import {getRapierWorld} from '~/ecs/physics/world'
import {useConstant} from '~/utils'
import {Vector3} from 'three'

// Scratch objects for ray casting (reused to avoid allocations)
const _rayOrigin = {x: 0, y: 0, z: 0}
const _rayDirection = {x: 0, y: 0, z: 0}
let _cachedRay: RAPIER.Ray | null = null

interface ThirdPersonCameraProps {
  ref?: Ref<PerspectiveCameraImpl>
  targetRef?: RefObject<Object3D | null>
  makeDefault?: boolean
  /** Height offset from target position */
  heightOffset?: number
  /** How smoothly the camera follows (higher = faster) */
  smoothness?: number
}

/**
 * GTA-style third person camera.
 * - Mouse controls yaw/pitch orbit around target
 * - Camera follows player with smooth lerping
 * - Camera collision prevents going through walls
 */
export function ThirdPersonCamera({
  ref: forwardedRef,
  makeDefault = true,
  heightOffset = 1.5,
  smoothness = 8,
}: ThirdPersonCameraProps) {
  const ref = useRef<PerspectiveCameraImpl>(null)
  const world = useWorld()
  const cameraEntityRef = useRef<Entity | null>(null)

  useImperativeHandle(forwardedRef, () => ref.current!)

  // Persistent vectors for smooth interpolation (reused to avoid allocations)
  const currentPosition = useConstant(() => new Vector3())
  const targetLookAt = useConstant(() => new Vector3())
  const lerpTarget = useConstant(() => new Vector3())

  // Create camera orbit entity on mount
  useLayoutEffect(() => {
    const entity = world.spawn(CameraOrbit)
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

    // Get camera orbit state
    const orbit = cameraEntity.get(CameraOrbit)
    if (!orbit) return

    // Find target entity (player with IsCameraTarget)
    let targetPos: {x: number; y: number; z: number} | null = null
    for (const entity of world.query(IsCameraTarget, RenderTransform)) {
      const transform = entity.get(RenderTransform)!
      targetPos = {x: transform.x, y: transform.y, z: transform.z}
      break
    }

    if (!targetPos) return

    // Calculate ideal camera position using spherical coordinates
    const {yaw, pitch, distance} = orbit
    const idealPosition = computeCameraPosition(
      targetPos,
      yaw,
      pitch,
      distance,
      heightOffset,
    )

    // Camera collision - cast from target to ideal position
    const collisionDistance = castCameraRay(
      targetPos,
      idealPosition,
      distance,
      heightOffset,
    )

    // If collision, pull camera closer
    if (collisionDistance < distance) {
      const collisionPos = computeCameraPosition(
        targetPos,
        yaw,
        pitch,
        collisionDistance - 0.1, // Small padding
        heightOffset,
      )
      idealPosition.x = collisionPos.x
      idealPosition.y = collisionPos.y
      idealPosition.z = collisionPos.z
    }

    // Smooth camera position
    const t = 1 - Math.exp(-smoothness * delta)
    lerpTarget.set(idealPosition.x, idealPosition.y, idealPosition.z)
    currentPosition.lerp(lerpTarget, t)

    // Update look at target (slightly above player center)
    targetLookAt.set(targetPos.x, targetPos.y + heightOffset * 0.5, targetPos.z)

    // Apply to camera
    camera.position.copy(currentPosition)
    camera.lookAt(targetLookAt)
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
  // Spherical to Cartesian conversion
  // pitch = 0 is horizontal, positive pitch looks down
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
 * Cast a ray from target to ideal camera position to detect collisions.
 * Returns the distance to first hit, or full distance if no hit.
 */
function castCameraRay(
  target: {x: number; y: number; z: number},
  idealPos: {x: number; y: number; z: number},
  maxDistance: number,
  heightOffset: number,
): number {
  const rapier = getRapierWorld()
  if (!rapier) return maxDistance

  // Ray origin slightly above target (reuse scratch object)
  _rayOrigin.x = target.x
  _rayOrigin.y = target.y + heightOffset
  _rayOrigin.z = target.z

  // Direction from origin to ideal camera position
  const dx = idealPos.x - _rayOrigin.x
  const dy = idealPos.y - _rayOrigin.y
  const dz = idealPos.z - _rayOrigin.z
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)

  if (len < 0.001) return maxDistance

  // Reuse direction scratch object
  _rayDirection.x = dx / len
  _rayDirection.y = dy / len
  _rayDirection.z = dz / len

  // Create or reuse Ray (Rapier Ray is mutable)
  if (!_cachedRay) {
    _cachedRay = new RAPIER.Ray(_rayOrigin, _rayDirection)
  } else {
    _cachedRay.origin = _rayOrigin
    _cachedRay.dir = _rayDirection
  }

  const hit = rapier.castRay(_cachedRay, maxDistance, true)

  if (hit) {
    return hit.timeOfImpact
  }

  return maxDistance
}
