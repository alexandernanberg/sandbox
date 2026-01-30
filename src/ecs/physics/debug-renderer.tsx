// ============================================
// Jolt Physics Debug Renderer
// ============================================
// Renders physics debug visualization using Three.js
// Requires the debug build of jolt-physics

import {useFrame, useThree} from '@react-three/fiber'
import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import {hasDebugRenderer} from './loader'
import {getJolt, getPhysicsSystem} from './world'

// ============================================
// Types
// ============================================

interface DebugRendererState {
  // Line rendering
  lineGeometry: THREE.BufferGeometry
  lineMaterial: THREE.LineBasicMaterial
  lineSegments: THREE.LineSegments
  linePositions: Float32Array
  lineColors: Float32Array
  lineCount: number

  // Triangle rendering
  triangleGeometry: THREE.BufferGeometry
  triangleMaterial: THREE.MeshBasicMaterial
  triangleMesh: THREE.Mesh
  trianglePositions: Float32Array
  triangleColors: Float32Array
  triangleCount: number

  // Jolt debug renderer instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: any
  initialized: boolean
}

// Maximum vertices for debug rendering
const MAX_LINES = 100000
const MAX_TRIANGLES = 50000

// ============================================
// Debug Renderer Component
// ============================================

export interface PhysicsDebugRendererProps {
  /** Draw collision shapes */
  drawShapes?: boolean
  /** Draw bounding boxes */
  drawBoundingBoxes?: boolean
  /** Draw constraints */
  drawConstraints?: boolean
  /** Draw constraint limits */
  drawConstraintLimits?: boolean
  /** Draw velocity vectors */
  drawVelocities?: boolean
}

export function PhysicsDebugRenderer({
  drawShapes = true,
  drawBoundingBoxes = false,
  drawConstraints = false,
  drawConstraintLimits = false,
  drawVelocities = false,
}: PhysicsDebugRendererProps) {
  const {scene} = useThree()
  const stateRef = useRef<DebugRendererState | null>(null)

  // Initialize debug renderer
  useEffect(() => {
    if (!hasDebugRenderer()) {
      console.warn(
        '[PhysicsDebugRenderer] Debug build not loaded. Set debug={true} on PhysicsProvider.',
      )
      return
    }

    const Jolt = getJolt()

    // Create line geometry
    const lineGeometry = new THREE.BufferGeometry()
    const linePositions = new Float32Array(MAX_LINES * 6) // 2 vertices * 3 components
    const lineColors = new Float32Array(MAX_LINES * 6) // 2 vertices * 3 components
    lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(linePositions, 3),
    )
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3))
    lineGeometry.setDrawRange(0, 0)

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.8,
    })
    const lineSegments = new THREE.LineSegments(lineGeometry, lineMaterial)
    lineSegments.frustumCulled = false
    lineSegments.renderOrder = 999
    scene.add(lineSegments)

    // Create triangle geometry
    const triangleGeometry = new THREE.BufferGeometry()
    const trianglePositions = new Float32Array(MAX_TRIANGLES * 9) // 3 vertices * 3 components
    const triangleColors = new Float32Array(MAX_TRIANGLES * 9)
    triangleGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(trianglePositions, 3),
    )
    triangleGeometry.setAttribute(
      'color',
      new THREE.BufferAttribute(triangleColors, 3),
    )
    triangleGeometry.setDrawRange(0, 0)

    const triangleMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      transparent: true,
      opacity: 0.3,
    })
    const triangleMesh = new THREE.Mesh(triangleGeometry, triangleMaterial)
    triangleMesh.frustumCulled = false
    triangleMesh.renderOrder = 998
    scene.add(triangleMesh)

    // Create Jolt debug renderer
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const renderer = new (Jolt as any).DebugRendererJS()

    const state: DebugRendererState = {
      lineGeometry,
      lineMaterial,
      lineSegments,
      linePositions,
      lineColors,
      lineCount: 0,
      triangleGeometry,
      triangleMaterial,
      triangleMesh,
      trianglePositions,
      triangleColors,
      triangleCount: 0,
      renderer,
      initialized: true,
    }

    // Bind drawing callbacks
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    renderer.DrawLine = (
      fromX: number,
      fromY: number,
      fromZ: number,
      toX: number,
      toY: number,
      toZ: number,
      color: number,
    ) => {
      if (state.lineCount >= MAX_LINES) return

      const i = state.lineCount * 6

      // Positions
      state.linePositions[i] = fromX
      state.linePositions[i + 1] = fromY
      state.linePositions[i + 2] = fromZ
      state.linePositions[i + 3] = toX
      state.linePositions[i + 4] = toY
      state.linePositions[i + 5] = toZ

      // Color (convert from packed ARGB to RGB)
      const r = ((color >> 16) & 0xff) / 255
      const g = ((color >> 8) & 0xff) / 255
      const b = (color & 0xff) / 255

      state.lineColors[i] = r
      state.lineColors[i + 1] = g
      state.lineColors[i + 2] = b
      state.lineColors[i + 3] = r
      state.lineColors[i + 4] = g
      state.lineColors[i + 5] = b

      state.lineCount++
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    renderer.DrawTriangle = (
      v1x: number,
      v1y: number,
      v1z: number,
      v2x: number,
      v2y: number,
      v2z: number,
      v3x: number,
      v3y: number,
      v3z: number,
      color: number,
    ) => {
      if (state.triangleCount >= MAX_TRIANGLES) return

      const i = state.triangleCount * 9

      // Positions
      state.trianglePositions[i] = v1x
      state.trianglePositions[i + 1] = v1y
      state.trianglePositions[i + 2] = v1z
      state.trianglePositions[i + 3] = v2x
      state.trianglePositions[i + 4] = v2y
      state.trianglePositions[i + 5] = v2z
      state.trianglePositions[i + 6] = v3x
      state.trianglePositions[i + 7] = v3y
      state.trianglePositions[i + 8] = v3z

      // Color
      const r = ((color >> 16) & 0xff) / 255
      const g = ((color >> 8) & 0xff) / 255
      const b = (color & 0xff) / 255

      state.triangleColors[i] = r
      state.triangleColors[i + 1] = g
      state.triangleColors[i + 2] = b
      state.triangleColors[i + 3] = r
      state.triangleColors[i + 4] = g
      state.triangleColors[i + 5] = b
      state.triangleColors[i + 6] = r
      state.triangleColors[i + 7] = g
      state.triangleColors[i + 8] = b

      state.triangleCount++
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    renderer.DrawText3D = () => {
      // Text rendering not implemented (would need CSS3DRenderer or SDF text)
    }

    stateRef.current = state

    return () => {
      scene.remove(lineSegments)
      scene.remove(triangleMesh)
      lineGeometry.dispose()
      lineMaterial.dispose()
      triangleGeometry.dispose()
      triangleMaterial.dispose()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      Jolt.destroy(renderer)
      stateRef.current = null
    }
  }, [scene])

  // Render debug geometry each frame
  useFrame(() => {
    const state = stateRef.current
    if (!state?.initialized) return

    const physicsSystem = getPhysicsSystem()
    if (!physicsSystem) return

    const Jolt = getJolt()

    // Reset counts
    state.lineCount = 0
    state.triangleCount = 0

    // Configure what to draw
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any
    const bodyDrawSettings = new (Jolt as any).BodyManager_DrawSettings()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    bodyDrawSettings.mDrawShape = drawShapes
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    bodyDrawSettings.mDrawBoundingBox = drawBoundingBoxes
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    bodyDrawSettings.mDrawVelocity = drawVelocities

    // Draw bodies (debug-only methods not in types)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    ;(physicsSystem as any).DrawBodies(bodyDrawSettings, state.renderer)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    Jolt.destroy(bodyDrawSettings)

    // Draw constraints if enabled
    if (drawConstraints) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      ;(physicsSystem as any).DrawConstraints(state.renderer)
    }

    if (drawConstraintLimits) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      ;(physicsSystem as any).DrawConstraintLimits(state.renderer)
    }

    // Update line geometry
    const linePositionAttr = state.lineGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const lineColorAttr = state.lineGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute
    linePositionAttr.needsUpdate = true
    lineColorAttr.needsUpdate = true
    state.lineGeometry.setDrawRange(0, state.lineCount * 2)

    // Update triangle geometry
    const triPositionAttr = state.triangleGeometry.getAttribute(
      'position',
    ) as THREE.BufferAttribute
    const triColorAttr = state.triangleGeometry.getAttribute(
      'color',
    ) as THREE.BufferAttribute
    triPositionAttr.needsUpdate = true
    triColorAttr.needsUpdate = true
    state.triangleGeometry.setDrawRange(0, state.triangleCount * 3)
  })

  return null
}
