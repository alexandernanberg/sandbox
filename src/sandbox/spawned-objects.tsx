import type {Entity} from 'koota'
import {useQuery, useTrait} from 'koota/react'
import {useLayoutEffect, useRef} from 'react'
import type {Mesh} from 'three'
import {
  RenderTransform,
  Object3DRef,
  RigidBodyRef,
  IsPhysicsEntity,
} from '~/ecs/physics'
import {
  IsSpawnedObject,
  ObjectVisual,
  IsSelected,
  type SpawnableType,
} from './traits'

// ============================================
// Spawned Objects Renderer
// ============================================

export function SpawnedObjects() {
  const spawnedEntities = useQuery(IsSpawnedObject, IsPhysicsEntity)

  return (
    <>
      {spawnedEntities.map((entity) => (
        <SpawnedObject key={entity.id()} entity={entity} />
      ))}
    </>
  )
}

// ============================================
// Individual Spawned Object
// ============================================

interface SpawnedObjectProps {
  entity: Entity
}

function SpawnedObject({entity}: SpawnedObjectProps) {
  const meshRef = useRef<Mesh>(null)

  // Get visual config reactively
  const visual = useTrait(entity, ObjectVisual)
  const color = visual?.color ?? '#ff6b6b'
  const type = visual?.type ?? 'box'

  // Check if selected
  const isSelected = entity.has(IsSelected)

  // Link the mesh to the entity's Object3DRef so physics can update it
  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return

    // Set initial position from RenderTransform
    const renderTransform = entity.get(RenderTransform)
    if (renderTransform) {
      mesh.position.set(renderTransform.x, renderTransform.y, renderTransform.z)
      mesh.quaternion.set(
        renderTransform.qx,
        renderTransform.qy,
        renderTransform.qz,
        renderTransform.qw,
      )
    }

    // Link to Object3DRef so syncToObject3D can update position each frame
    entity.set(Object3DRef, (ref) => {
      ref.object = mesh
      return ref
    })
  }, [entity])

  // Handle destroyed entities
  if (!visual) return null

  // Handle click for impulse
  const handlePointerDown = () => {
    const bodyRef = entity.get(RigidBodyRef)
    if (bodyRef?.body) {
      bodyRef.body.applyImpulse({x: 0, y: 8, z: 0}, true)
    }
  }

  return (
    <mesh
      ref={meshRef}
      castShadow
      receiveShadow
      onPointerDown={handlePointerDown}
    >
      <ShapeGeometry type={type} />
      <meshPhongMaterial
        color={isSelected ? '#ffffff' : color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
    </mesh>
  )
}

// ============================================
// Shape Geometry Component
// ============================================

interface ShapeGeometryProps {
  type: SpawnableType
}

function ShapeGeometry({type}: ShapeGeometryProps) {
  switch (type) {
    case 'ball':
      return <sphereGeometry args={[0.5, 16, 16]} />
    case 'box':
      return <boxGeometry args={[1, 1, 1]} />
    case 'capsule':
      return <capsuleGeometry args={[0.25, 1, 8, 16]} />
    case 'cylinder':
      return <cylinderGeometry args={[0.35, 0.35, 1, 16]} />
    case 'cone':
      return <coneGeometry args={[0.4, 1, 16]} />
  }
}
