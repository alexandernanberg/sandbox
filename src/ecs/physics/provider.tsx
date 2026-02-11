import * as RAPIER from '@alexandernanberg/rapier3d/compat-simd'
import {useFrame} from '@react-three/fiber'
import {useWorld} from 'koota/react'
import type {ReactNode} from 'react'
import {createContext, use, useLayoutEffect, useMemo, useRef} from 'react'
import type {Vector3} from 'three'
import {BufferAttribute} from 'three'
import type {LineSegments} from 'three'
import {stepPhysics} from './step'
import {
  physicsWorld,
  initPhysicsWorld,
  destroyPhysicsWorld,
  setGravity,
  getRapierWorld,
} from './world'

// ============================================
// Physics Context
// ============================================

export interface PhysicsContextValue {
  debug: boolean
}

const PhysicsContext = createContext<PhysicsContextValue | null>(null)

export function usePhysicsContext() {
  const context = use(PhysicsContext)
  if (context == null) {
    throw new Error('usePhysicsContext() must be used within <PhysicsProvider>')
  }
  return context
}

// ============================================
// Provider
// ============================================

type Triplet = [number, number, number]

const init = RAPIER.init()

export interface PhysicsProviderProps {
  children?: ReactNode
  debug?: boolean
  gravity?: Triplet | Vector3
}

export function PhysicsProvider({
  children,
  debug = false,
  gravity,
}: PhysicsProviderProps) {
  // Wait for RAPIER to initialize
  use(init)

  const ecsWorld = useWorld()
  const debugMeshRef = useRef<LineSegments>(null)

  // Initialize physics world in effect, cleanup on unmount
  useLayoutEffect(() => {
    if (!physicsWorld.initialized) {
      initPhysicsWorld(ecsWorld)
    }
    return () => {
      destroyPhysicsWorld(ecsWorld)
    }
  }, [ecsWorld])

  // Update gravity when it changes
  useLayoutEffect(() => {
    if (!gravity) return

    const gravityVec = Array.isArray(gravity)
      ? {x: gravity[0], y: gravity[1], z: gravity[2]}
      : {x: gravity.x, y: gravity.y, z: gravity.z}

    setGravity(gravityVec)
  }, [gravity])

  // Main physics loop
  useFrame((_state, delta) => {
    const rapier = getRapierWorld()
    if (!rapier) return

    // Step physics
    stepPhysics(ecsWorld, delta)

    // Debug rendering
    if (debug && debugMeshRef.current) {
      const mesh = debugMeshRef.current
      const buffers = rapier.debugRender()
      const geometry = mesh.geometry

      // Reuse existing BufferAttributes when possible to avoid allocations
      const posAttr = geometry.getAttribute('position')
      const colorAttr = geometry.getAttribute('color')

      if (
        posAttr instanceof BufferAttribute &&
        posAttr.array.length === buffers.vertices.length
      ) {
        posAttr.set(buffers.vertices)
        posAttr.needsUpdate = true
      } else {
        geometry.setAttribute(
          'position',
          new BufferAttribute(buffers.vertices, 3),
        )
      }

      if (
        colorAttr instanceof BufferAttribute &&
        colorAttr.array.length === buffers.colors.length
      ) {
        colorAttr.set(buffers.colors)
        colorAttr.needsUpdate = true
      } else {
        geometry.setAttribute('color', new BufferAttribute(buffers.colors, 4))
      }
    }
  })

  const ecsContext = useMemo<PhysicsContextValue>(() => ({debug}), [debug])

  return (
    <PhysicsContext.Provider value={ecsContext}>
      {children}
      {debug && (
        <lineSegments ref={debugMeshRef}>
          <lineBasicMaterial color={0xffffff} vertexColors />
          <bufferGeometry />
        </lineSegments>
      )}
    </PhysicsContext.Provider>
  )
}
