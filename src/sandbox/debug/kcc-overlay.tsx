import {useFrame} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useRef} from 'react'
import {
  BufferGeometry,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  ArrowHelper,
  Group,
  ConeGeometry,
  CylinderGeometry,
} from 'three'
import {CharacterMovement, RigidBodyRef, CharacterControllerConfig} from '~/ecs/physics'

// ============================================
// KCC Debug Overlay
// ============================================

interface KCCDebugOverlayProps {
  /** Entity to visualize */
  entity: Entity | null
  /** Show ground detection ray */
  showGroundRay?: boolean
  /** Show ground normal */
  showGroundNormal?: boolean
  /** Show velocity vectors */
  showVelocity?: boolean
  /** Show capsule shape */
  showCapsule?: boolean
  /** Show max slope angle cone */
  showSlopeCone?: boolean
}

export function KCCDebugOverlay({
  entity,
  showGroundRay = true,
  showGroundNormal = true,
  showVelocity = true,
  showCapsule = false,
  showSlopeCone = false,
}: KCCDebugOverlayProps) {
  const groupRef = useRef<Group>(null)
  const groundRayRef = useRef<Line | null>(null)
  const groundNormalRef = useRef<ArrowHelper | null>(null)
  const velocityArrowRef = useRef<ArrowHelper | null>(null)
  const inputArrowRef = useRef<ArrowHelper | null>(null)
  const groundPointRef = useRef<Mesh | null>(null)
  const capsuleMeshRef = useRef<Group | null>(null)

  // Create debug geometry on mount
  useFrame(() => {
    if (!entity || !entity.isAlive() || !groupRef.current) return

    const movement = entity.get(CharacterMovement)
    const bodyRef = entity.get(RigidBodyRef)
    const config = entity.get(CharacterControllerConfig)

    if (!movement || !bodyRef?.body) return

    const pos = bodyRef.body.translation()
    const group = groupRef.current

    // Update group position
    group.position.set(pos.x, pos.y, pos.z)

    // Ground ray
    if (showGroundRay) {
      if (!groundRayRef.current) {
        const geometry = new BufferGeometry()
        geometry.setAttribute(
          'position',
          new Float32BufferAttribute([0, 0, 0, 0, -1, 0], 3),
        )
        const material = new LineBasicMaterial({color: 0xffff00})
        groundRayRef.current = new Line(geometry, material)
        group.add(groundRayRef.current)
      }

      // Update ray length based on ground distance
      const rayLength = config?.groundCheckDistance ?? 0.5
      const positions = groundRayRef.current.geometry.attributes['position']!
      ;(positions.array as Float32Array)[4] = -rayLength
      positions.needsUpdate = true

      // Color based on grounded state
      const mat = groundRayRef.current.material as LineBasicMaterial
      mat.color.setHex(movement.grounded ? 0x00ff00 : movement.sliding ? 0xff8800 : 0xff0000)
    }

    // Ground point
    if (showGroundRay && movement.grounded) {
      if (!groundPointRef.current) {
        const geometry = new SphereGeometry(0.05, 8, 8)
        const material = new MeshBasicMaterial({color: 0x00ff00})
        groundPointRef.current = new Mesh(geometry, material)
        group.add(groundPointRef.current)
      }
      groundPointRef.current.visible = true
      groundPointRef.current.position.set(0, -movement.groundDistance, 0)
    } else if (groundPointRef.current) {
      groundPointRef.current.visible = false
    }

    // Ground normal arrow
    if (showGroundNormal && movement.grounded) {
      const normalDir = new Vector3(
        movement.groundNormalX,
        movement.groundNormalY,
        movement.groundNormalZ,
      )

      if (!groundNormalRef.current) {
        groundNormalRef.current = new ArrowHelper(
          normalDir,
          new Vector3(0, -movement.groundDistance, 0),
          1,
          0x00ffff,
          0.2,
          0.1,
        )
        group.add(groundNormalRef.current)
      }

      groundNormalRef.current.visible = true
      groundNormalRef.current.position.set(0, -movement.groundDistance, 0)
      groundNormalRef.current.setDirection(normalDir)

      // Color based on walkable
      const maxSlope = config?.maxSlopeAngle ?? Math.PI / 4
      const slopeAngle = Math.acos(movement.groundNormalY)
      const isWalkable = slopeAngle <= maxSlope
      groundNormalRef.current.setColor(isWalkable ? 0x00ff00 : 0xff0000)
    } else if (groundNormalRef.current) {
      groundNormalRef.current.visible = false
    }

    // Velocity arrows
    if (showVelocity) {
      // Input velocity (blue)
      const inputVel = new Vector3(movement.vx, movement.vy, movement.vz)
      const inputLen = inputVel.length()

      if (inputLen > 0.01) {
        if (!inputArrowRef.current) {
          inputArrowRef.current = new ArrowHelper(
            inputVel.normalize(),
            new Vector3(0, 0, 0),
            inputLen,
            0x0088ff,
            0.15,
            0.08,
          )
          group.add(inputArrowRef.current)
        }
        inputArrowRef.current.visible = true
        inputArrowRef.current.setDirection(inputVel.normalize())
        inputArrowRef.current.setLength(Math.min(inputLen * 0.5, 3), 0.15, 0.08)
      } else if (inputArrowRef.current) {
        inputArrowRef.current.visible = false
      }

      // Movement velocity (green)
      const moveVel = new Vector3(movement.mx, movement.my, movement.mz)
      const moveLen = moveVel.length()

      if (moveLen > 0.01) {
        if (!velocityArrowRef.current) {
          velocityArrowRef.current = new ArrowHelper(
            moveVel.normalize(),
            new Vector3(0, 0.1, 0),
            moveLen,
            0x00ff88,
            0.15,
            0.08,
          )
          group.add(velocityArrowRef.current)
        }
        velocityArrowRef.current.visible = true
        velocityArrowRef.current.position.set(0, 0.1, 0)
        velocityArrowRef.current.setDirection(moveVel.normalize())
        velocityArrowRef.current.setLength(Math.min(moveLen * 0.5, 3), 0.15, 0.08)
      } else if (velocityArrowRef.current) {
        velocityArrowRef.current.visible = false
      }
    }

    // Capsule wireframe
    if (showCapsule && config) {
      if (!capsuleMeshRef.current) {
        const capsuleGroup = new Group()

        // Cylinder body
        const cylinderGeo = new CylinderGeometry(
          config.capsuleRadius,
          config.capsuleRadius,
          config.capsuleHalfHeight * 2,
          16,
          1,
          true,
        )
        const material = new MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          transparent: true,
          opacity: 0.3,
        })
        const cylinder = new Mesh(cylinderGeo, material)
        capsuleGroup.add(cylinder)

        // Top hemisphere
        const topSphere = new SphereGeometry(
          config.capsuleRadius,
          16,
          8,
          0,
          Math.PI * 2,
          0,
          Math.PI / 2,
        )
        const topMesh = new Mesh(topSphere, material)
        topMesh.position.y = config.capsuleHalfHeight
        capsuleGroup.add(topMesh)

        // Bottom hemisphere
        const bottomSphere = new SphereGeometry(
          config.capsuleRadius,
          16,
          8,
          0,
          Math.PI * 2,
          Math.PI / 2,
          Math.PI / 2,
        )
        const bottomMesh = new Mesh(bottomSphere, material)
        bottomMesh.position.y = -config.capsuleHalfHeight
        capsuleGroup.add(bottomMesh)

        capsuleMeshRef.current = capsuleGroup
        group.add(capsuleGroup)
      }
    }

    // Slope cone
    if (showSlopeCone && config) {
      // This would show the maximum walkable slope as a cone
      // Implementation left as enhancement
    }
  })

  return <group ref={groupRef} />
}
