import * as RAPIER from '@dimforge/rapier3d-simd-compat'
import {useFrame} from '@react-three/fiber'
import {useWorld} from 'koota/react'
import type {ReactNode, RefObject} from 'react'
import {createContext, use, useEffect, useMemo, useRef} from 'react'
import type {Matrix4, Quaternion} from 'three'
import {BufferAttribute, Object3D, Vector3} from 'three'
import type {LineSegments} from 'three'
import {useConstant} from '~/utils'
import {
  createHandleToEntityMap,
  processCollisionEvents,
  clearCollisionEvents,
} from './events'
import {
  initializeTransformFromObject3D,
  createPhysicsBodies,
  createColliders,
  storePreviousTransforms,
  syncTransformFromPhysics,
  interpolateTransforms,
  syncToObject3D,
} from './systems'
import {RigidBodyRef, ColliderRef} from './traits'

// ============================================
// ECS Physics Context
// ============================================

export interface ECSPhysicsContextValue {
  worldRef: RefObject<() => RAPIER.World>
  eventQueueRef: RefObject<() => RAPIER.EventQueue>
  debug: boolean
  beforeStepCallbacks: Set<RefObject<(delta: number) => void>>
  afterStepCallbacks: Set<RefObject<(delta: number) => void>>
}

const ECSPhysicsContext = createContext<ECSPhysicsContextValue | null>(null)

export function useECSPhysicsContext() {
  const context = use(ECSPhysicsContext)
  if (context == null) {
    throw new Error(
      'useECSPhysicsContext() must be used within <ECSPhysicsProvider>',
    )
  }
  return context
}

// ============================================
// Legacy Physics Context (for backward compatibility)
// ============================================

interface CollisionEvent {
  target: Object3D
}
type CollisionEventCallback = (event: CollisionEvent) => void

interface ContactForceEvent {
  totalForce: () => RAPIER.Vector3
  totalForceMagnitude: () => number
  maxForceDirection: () => RAPIER.Vector3
  maxForceMagnitude: () => number
}
type ContactForceEventCallback = (event: ContactForceEvent) => void

interface PhysicsEvents {
  onCollisionEnter?: CollisionEventCallback
  onCollisionExit?: CollisionEventCallback
  onContactForce?: ContactForceEventCallback
}

type EventMap = Map<number, PhysicsEvents>

export interface LegacyPhysicsContextValue {
  worldRef: RefObject<() => RAPIER.World>
  debug: boolean
  colliderMeshes: Map<number, Object3D>
  colliderEvents: EventMap
  rigidBodyMeshes: Map<number, Object3D>
  rigidBodyEvents: EventMap
  rigidBodyInvertedWorldMatrices: Map<number, Matrix4>
  beforeStepCallbacks: Set<RefObject<(delta: number) => void>>
  afterStepCallbacks: Set<RefObject<(delta: number) => void>>
}

// Export the legacy context so physics.tsx can import it
export const LegacyPhysicsContext =
  createContext<LegacyPhysicsContextValue | null>(null)

// ============================================
// Provider
// ============================================

const DEFAULT_GRAVITY = new Vector3(0, -9.81, 0)
const FIXED_TIMESTEP = 1 / 60
const MAX_DELTA = 0.25

type Triplet = [number, number, number]

const init = RAPIER.init()

export interface ECSPhysicsProviderProps {
  children?: ReactNode
  debug?: boolean
  gravity?: Triplet | Vector3
}

export function ECSPhysicsProvider({
  children,
  debug = false,
  gravity = DEFAULT_GRAVITY,
}: ECSPhysicsProviderProps) {
  use(init)

  const ecsWorld = useWorld()
  const worldRef = useRef<RAPIER.World>(null)
  const eventQueueRef = useRef<RAPIER.EventQueue>(null)
  const frameAccumulatorRef = useRef(0)
  const debugMeshRef = useRef<LineSegments>(null)

  const handleToEntity = useConstant(() => createHandleToEntityMap())

  const beforeStepCallbacks = useConstant(
    () => new Set<RefObject<(delta: number) => void>>(),
  )
  const afterStepCallbacks = useConstant(
    () => new Set<RefObject<(delta: number) => void>>(),
  )

  // Legacy physics maps for backward compatibility
  const colliderMeshes = useConstant(() => new Map<number, Object3D>())
  const colliderEvents = useConstant(() => new Map<number, PhysicsEvents>())
  const rigidBodyMeshes = useConstant(() => new Map<number, Object3D>())
  const rigidBodyEvents = useConstant(() => new Map<number, PhysicsEvents>())
  const rigidBodyInvertedWorldMatrices = useConstant(
    () => new Map<number, Matrix4>(),
  )
  const rigidBodyPrevPositions = useConstant(
    () => new Map<number, RAPIER.Vector3>(),
  )
  const rigidBodyPrevRotations = useConstant(
    () => new Map<number, RAPIER.Rotation>(),
  )

  const worldGetter = useRef(() => {
    if (worldRef.current === null) {
      worldRef.current = new RAPIER.World(
        Array.isArray(gravity) ? new Vector3().fromArray(gravity) : gravity,
      )
      worldRef.current.timestep = FIXED_TIMESTEP
    }
    return worldRef.current
  })

  const eventQueueGetter = useRef(() => {
    if (eventQueueRef.current === null) {
      eventQueueRef.current = new RAPIER.EventQueue(true)
    }
    return eventQueueRef.current
  })

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (worldRef.current !== null) {
        worldRef.current.free()
        worldRef.current = null
      }
      if (eventQueueRef.current !== null) {
        eventQueueRef.current.free()
        eventQueueRef.current = null
      }
    }
  }, [])

  // Update gravity when it changes
  useEffect(() => {
    const rapierWorld = worldGetter.current()
    rapierWorld.gravity = Array.isArray(gravity)
      ? new Vector3().fromArray(gravity)
      : gravity
  }, [gravity])

  // Set up automatic cleanup when physics traits are removed
  useEffect(() => {
    const unsubCollider = ecsWorld.onRemove(ColliderRef, (entity) => {
      const rapierWorld = worldGetter.current()
      const colliderRef = entity.get(ColliderRef)
      if (colliderRef?.collider != null && colliderRef.handle != null) {
        try {
          if (rapierWorld.getCollider(colliderRef.handle)) {
            rapierWorld.removeCollider(colliderRef.collider, true)
          }
        } catch {
          // Collider may already be removed
        }
        handleToEntity.delete(colliderRef.handle)
      }
    })

    const unsubRigidBody = ecsWorld.onRemove(RigidBodyRef, (entity) => {
      const rapierWorld = worldGetter.current()
      const bodyRef = entity.get(RigidBodyRef)
      if (bodyRef?.body != null && bodyRef.handle != null) {
        try {
          if (rapierWorld.getRigidBody(bodyRef.handle)) {
            rapierWorld.removeRigidBody(bodyRef.body)
          }
        } catch {
          // Body may already be removed
        }
      }
    })

    return () => {
      unsubCollider()
      unsubRigidBody()
    }
  }, [ecsWorld, handleToEntity])

  // Temporary objects for legacy interpolation
  const _object3d = useConstant(() => new Object3D())

  // Main physics loop
  useFrame((_state, delta) => {
    const rapierWorld = worldGetter.current()
    const eventQueue = eventQueueGetter.current()

    // Clamp delta to prevent spiral of death
    if (delta > MAX_DELTA) {
      delta = MAX_DELTA
    }

    // Initialize transforms from Object3D world matrices (ECS)
    initializeTransformFromObject3D(ecsWorld)

    // Create any new physics bodies/colliders (ECS)
    createPhysicsBodies(ecsWorld, rapierWorld)
    createColliders(ecsWorld, rapierWorld, handleToEntity)

    frameAccumulatorRef.current += delta

    // Fixed timestep loop
    while (frameAccumulatorRef.current >= FIXED_TIMESTEP) {
      // Run before-step callbacks (character controllers, force application)
      for (const cb of beforeStepCallbacks) {
        cb.current?.(FIXED_TIMESTEP)
      }

      // Store previous transforms for interpolation (ECS)
      storePreviousTransforms(ecsWorld)

      // Store previous transforms for legacy rigid bodies
      rigidBodyPrevPositions.clear()
      rigidBodyPrevRotations.clear()
      rapierWorld.forEachRigidBody((body) => {
        rigidBodyPrevPositions.set(body.handle, body.translation())
        rigidBodyPrevRotations.set(body.handle, body.rotation())
      })

      // Step the physics simulation
      rapierWorld.step(eventQueue)

      // Sync physics state back to ECS
      syncTransformFromPhysics(ecsWorld)

      // Process collision events (ECS)
      processCollisionEvents(ecsWorld, rapierWorld, eventQueue, handleToEntity)

      // Process legacy collision events
      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        handleLegacyCollisionEvent(
          rapierWorld,
          handle1,
          colliderEvents,
          colliderMeshes,
          rigidBodyEvents,
          rigidBodyMeshes,
          started,
        )
        handleLegacyCollisionEvent(
          rapierWorld,
          handle2,
          colliderEvents,
          colliderMeshes,
          rigidBodyEvents,
          rigidBodyMeshes,
          started,
        )
      })

      // Run after-step callbacks
      for (const cb of afterStepCallbacks) {
        cb.current?.(FIXED_TIMESTEP)
      }

      frameAccumulatorRef.current -= FIXED_TIMESTEP
    }

    // Calculate interpolation alpha
    const alpha = frameAccumulatorRef.current / FIXED_TIMESTEP

    // Interpolate transforms for smooth rendering (ECS)
    interpolateTransforms(ecsWorld, alpha)

    // Sync to Three.js Object3Ds (ECS)
    syncToObject3D(ecsWorld)

    // Interpolate legacy rigid bodies
    rapierWorld.forEachRigidBody((rigidBody) => {
      if (rigidBody.isSleeping() || rigidBody.isFixed()) return

      const mesh = rigidBodyMeshes.get(rigidBody.handle)
      if (mesh == null) return

      const t = rigidBody.translation()
      const r = rigidBody.rotation()

      const invertedWorldMatrix = rigidBodyInvertedWorldMatrices.get(
        rigidBody.handle,
      )
      const prevPosition = rigidBodyPrevPositions.get(rigidBody.handle)
      const prevRotation = rigidBodyPrevRotations.get(rigidBody.handle)

      if (prevPosition && prevRotation) {
        mesh.position.copy(prevPosition as unknown as Vector3)
        mesh.quaternion.copy(
          prevRotation as unknown as Quaternion,
        )

        if (invertedWorldMatrix) {
          mesh.applyMatrix4(invertedWorldMatrix)
        }
      }

      _object3d.position.copy(t as unknown as Vector3)
      _object3d.quaternion.copy(r as unknown as Quaternion)

      if (invertedWorldMatrix) {
        _object3d.applyMatrix4(invertedWorldMatrix)
      }

      mesh.position.lerp(_object3d.position, alpha)
      mesh.quaternion.slerp(_object3d.quaternion, alpha)
    })

    // Clear collision events at end of frame (ECS)
    clearCollisionEvents(ecsWorld)

    // Debug rendering
    if (debug && debugMeshRef.current) {
      const mesh = debugMeshRef.current
      const buffers = rapierWorld.debugRender()

      mesh.geometry.setAttribute(
        'position',
        new BufferAttribute(buffers.vertices, 3),
      )
      mesh.geometry.setAttribute(
        'color',
        new BufferAttribute(buffers.colors, 4),
      )
    }
  })

  // Helper for legacy collision events
  function handleLegacyCollisionEvent(
    world: RAPIER.World,
    colliderHandle: number,
    colliderEventsMap: EventMap,
    colliderMeshesMap: Map<number, Object3D>,
    rigidBodyEventsMap: EventMap,
    rigidBodyMeshesMap: Map<number, Object3D>,
    started: boolean,
  ) {
    const collider = world.getCollider(colliderHandle)
    if (!collider) return

    const colliderMesh = colliderMeshesMap.get(colliderHandle)
    const colliderEvt = colliderEventsMap.get(colliderHandle)

    const rigidBodyHandle = collider.parent()?.handle
    const rigidBodyMesh = rigidBodyHandle
      ? rigidBodyMeshesMap.get(rigidBodyHandle)
      : undefined
    const rigidBodyEvt = rigidBodyHandle
      ? rigidBodyEventsMap.get(rigidBodyHandle)
      : undefined

    if (started) {
      if (colliderMesh) colliderEvt?.onCollisionEnter?.({target: colliderMesh})
      if (rigidBodyMesh)
        rigidBodyEvt?.onCollisionEnter?.({target: rigidBodyMesh})
    } else {
      if (colliderMesh) colliderEvt?.onCollisionExit?.({target: colliderMesh})
      if (rigidBodyMesh)
        rigidBodyEvt?.onCollisionExit?.({target: rigidBodyMesh})
    }
  }

  const ecsContext = useMemo<ECSPhysicsContextValue>(
    () => ({
      worldRef: worldGetter,
      eventQueueRef: eventQueueGetter,
      debug,
      beforeStepCallbacks,
      afterStepCallbacks,
    }),
    [debug, beforeStepCallbacks, afterStepCallbacks],
  )

  const legacyContext = useMemo<LegacyPhysicsContextValue>(
    () => ({
      worldRef: worldGetter,
      debug,
      colliderMeshes,
      colliderEvents,
      rigidBodyMeshes,
      rigidBodyEvents,
      rigidBodyInvertedWorldMatrices,
      beforeStepCallbacks,
      afterStepCallbacks,
    }),
    [
      debug,
      colliderMeshes,
      colliderEvents,
      rigidBodyMeshes,
      rigidBodyEvents,
      rigidBodyInvertedWorldMatrices,
      beforeStepCallbacks,
      afterStepCallbacks,
    ],
  )

  return (
    <ECSPhysicsContext.Provider value={ecsContext}>
      <LegacyPhysicsContext.Provider value={legacyContext}>
        {children}
        {debug && (
          <lineSegments ref={debugMeshRef}>
            <lineBasicMaterial color={0xffffff} vertexColors />
            <bufferGeometry />
          </lineSegments>
        )}
      </LegacyPhysicsContext.Provider>
    </ECSPhysicsContext.Provider>
  )
}
