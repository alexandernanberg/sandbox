import {useFrame} from '@react-three/fiber'
import initJolt from 'jolt-physics/wasm-compat'
import {useWorld} from 'koota/react'
import type {ReactNode} from 'react'
import {createContext, use, useLayoutEffect, useMemo} from 'react'
import type {Vector3} from 'three'
import {setupContactListener} from './events'
import {stepPhysics} from './step'
import {
  physicsWorld,
  initPhysicsWorld,
  destroyPhysicsWorld,
  setGravity,
  getPhysicsSystem,
  setJoltModule,
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

// Initialize Jolt module
const joltPromise = initJolt().then((Jolt) => {
  setJoltModule(Jolt)
  return Jolt
})

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
  // Wait for Jolt to initialize
  use(joltPromise)

  const ecsWorld = useWorld()

  // Initialize physics world in effect, cleanup on unmount
  useLayoutEffect(() => {
    if (!physicsWorld.initialized) {
      initPhysicsWorld(ecsWorld)

      // Set up contact listener for collision events
      const physicsSystem = getPhysicsSystem()
      if (physicsSystem) {
        setupContactListener(physicsSystem)
      }
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
    const physicsSystem = getPhysicsSystem()
    if (!physicsSystem) return

    // Step physics
    stepPhysics(ecsWorld, delta)

    // Note: Jolt doesn't have built-in debug rendering like Rapier
    // Debug visualization would require custom implementation
  })

  const ecsContext = useMemo<PhysicsContextValue>(() => ({debug}), [debug])

  return (
    <PhysicsContext.Provider value={ecsContext}>
      {children}
    </PhysicsContext.Provider>
  )
}
