/*
Auto-generated by: https://github.com/pmndrs/gltfjsx
*/

import { useGLTF } from '@react-three/drei'
import type { Mesh, MeshStandardMaterial } from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader'
import type { RigidBodyProps } from '../components/Physics'
import { ConvexHullCollider, RigidBody } from '../components/Physics'

type GLTFResult = GLTF & {
  nodes: {
    Stone: Mesh
  }
  materials: {
    Stone: MeshStandardMaterial
  }
}

export default function Stone(props: RigidBodyProps) {
  const { nodes, materials } = useGLTF('/stone.gltf') as GLTFResult
  const { position } = nodes.Stone.geometry.attributes

  return (
    <RigidBody {...props}>
      <ConvexHullCollider args={[position.array as Float32Array]} density={4}>
        <mesh
          castShadow
          receiveShadow
          geometry={nodes.Stone.geometry}
          material={materials.Stone}
        />
      </ConvexHullCollider>
    </RigidBody>
  )
}

useGLTF.preload('/stone.gltf')
