import {useFrame} from '@react-three/fiber'
import {useWorld} from 'koota/react'
import type {ReactNode} from 'react'
import {createContext, use, useLayoutEffect, useMemo, useState} from 'react'
import type {Vector3} from 'three'
import {setupContactListener} from './events'
import {loadJolt} from './loader'
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

// Cache for Jolt loading promises by debug mode
const joltPromiseCache = new Map<boolean, Promise<unknown>>()

function getJoltPromise(debug: boolean) {
  let promise = joltPromiseCache.get(debug)
  if (!promise) {
    promise = loadJolt(debug).then((Jolt) => {
      setJoltModule(Jolt)
      return Jolt
    })
    joltPromiseCache.set(debug, promise)
  }
  return promise
}

export interface PhysicsProviderProps {
  children?: ReactNode
  /** Enable debug rendering (loads larger debug build) */
  debug?: boolean
  gravity?: Triplet | Vector3
}

export function PhysicsProvider({
  children,
  debug = false,
  gravity,
}: PhysicsProviderProps) {
  // Wait for Jolt to initialize (debug param determines which build to load)
  use(getJoltPromise(debug))

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
