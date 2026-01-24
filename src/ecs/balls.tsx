import type {Entity} from 'koota'
import {useQuery, useTrait} from 'koota/react'
import {useLayoutEffect, useRef} from 'react'
import type {Mesh} from 'three'
import {BallColor, IsBall, RenderTransform, Object3DRef} from './index'

// This component queries for all ball entities and renders them
export function Balls() {
  // useQuery reactively updates when entities with IsBall are added/removed
  const balls = useQuery(IsBall, RenderTransform, BallColor)

  return (
    <>
      {balls.map((entity) => (
        <Ball key={entity.id()} entity={entity} />
      ))}
    </>
  )
}

// Individual ball component - physics system updates position directly
function Ball({entity}: {entity: Entity}) {
  const ballColor = useTrait(entity, BallColor)
  const meshRef = useRef<Mesh>(null)

  // Link the mesh to the entity's Object3DRef so physics can update it
  // Also set initial position from RenderTransform
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
    // Use set callback for proper mutation
    entity.set(Object3DRef, (ref) => {
      ref.object = mesh
      return ref
    })
  }, [entity])

  // Handle case where entity was destroyed (traits return undefined)
  if (!ballColor) return null

  // Don't set position/quaternion via props - let syncToObject3D handle it
  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <sphereGeometry args={[0.5]} />
      <meshPhongMaterial color={ballColor.color} />
    </mesh>
  )
}
