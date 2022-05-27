/*
Auto-generated by: https://github.com/pmndrs/gltfjsx
*/

import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three-stdlib'
import type { ConvexHullColliderProps } from '../components/physics'
import { ConvexHullCollider } from '../components/physics'

type GLTFResult = GLTF & {
  nodes: {
    Stone: Mesh
  }
  materials: {
    Stone: MeshStandardMaterial
  }
}

export default function Stone(props: Omit<ConvexHullColliderProps, 'args'>) {
  const { nodes } = useGLTF('/stone.gltf') as GLTFResult
  const { geometry } = nodes.Stone
  const vertices = geometry.attributes.position.array as Float32Array

  return (
    <ConvexHullCollider args={[vertices]} density={4} {...props}>
      <mesh castShadow receiveShadow geometry={nodes.Stone.geometry}>
        <meshStandardMaterial color={0x625b4e} roughness={0.9} metalness={0} />
      </mesh>
    </ConvexHullCollider>
  )
}

useGLTF.preload('/stone.gltf')
