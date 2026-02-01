import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import {useLayoutEffect, useRef} from 'react'
import type {Group, Mesh} from 'three'
import {IsPlayer, Transform} from '~/ecs'
import {
  IsCollectible,
  CollectibleData,
  CollectibleAnimation,
} from '~/ecs/collectible'
import {usePhysicsUpdate, Object3DRef} from '~/ecs/physics'

interface CollectibleProps {
  position: [number, number, number]
  value?: number
  color?: string
  id: number
  onCollect?: (id: number, value: number) => void
}

// Collection radius - how close player needs to be
const COLLECT_RADIUS = 1.2
const COLLECT_RADIUS_SQ = COLLECT_RADIUS * COLLECT_RADIUS

export function Collectible({
  position,
  value = 10,
  color = '#00ffff',
  id,
  onCollect,
}: CollectibleProps) {
  const world = useWorld()
  const meshRef = useRef<Mesh>(null)
  const groupRef = useRef<Group>(null)
  const entityRef = useRef<Entity | null>(null)
  const collectedRef = useRef(false)
  const animTime = useRef(Math.random() * Math.PI * 2) // Random start phase

  // Create the collectible entity with traits
  useLayoutEffect(() => {
    const entity = world.spawn(
      IsCollectible,
      CollectibleData({value, color, collected: false, id}),
      CollectibleAnimation({rotation: 0, bobOffset: 0, baseY: position[1]}),
      Object3DRef({object: groupRef.current}),
    )
    entityRef.current = entity

    return () => {
      if (entity.isAlive()) {
        entity.destroy()
      }
    }
  }, [world, value, color, id, position])

  // Animate the collectible and check for player proximity
  usePhysicsUpdate((delta) => {
    const entity = entityRef.current
    if (!entity || !entity.isAlive() || collectedRef.current) return

    const data = entity.get(CollectibleData)
    if (!data || data.collected) return

    const mesh = meshRef.current
    const group = groupRef.current
    if (!mesh || !group) return

    animTime.current += delta

    // Rotate the crystal
    mesh.rotation.y += delta * 2

    // Bob up and down
    const bobAmount = Math.sin(animTime.current * 2) * 0.15
    group.position.y = position[1] + bobAmount

    // Check for player proximity
    const players = world.query(IsPlayer, Transform)
    for (const player of players) {
      const playerTransform = player.get(Transform)
      if (!playerTransform) continue

      // Calculate squared distance (avoid sqrt for performance)
      const dx = playerTransform.x - position[0]
      const dy = playerTransform.y - position[1]
      const dz = playerTransform.z - position[2]
      const distSq = dx * dx + dy * dy + dz * dz

      if (distSq < COLLECT_RADIUS_SQ) {
        // Collect!
        collectedRef.current = true
        entity.set(CollectibleData, {...data, collected: true})
        onCollect?.(id, value)
        entity.destroy()
        return
      }
    }
  })

  if (collectedRef.current) return null

  return (
    <group ref={groupRef} position={position}>
      {/* Crystal mesh */}
      <mesh ref={meshRef} castShadow>
        <octahedronGeometry args={[0.4, 0]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.5}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>
      {/* Glow effect (simple transparent sphere) */}
      <mesh scale={1.5}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>
      {/* Point light for glow */}
      <pointLight color={color} intensity={2} distance={3} />
    </group>
  )
}
