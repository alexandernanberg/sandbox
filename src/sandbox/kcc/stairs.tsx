import {Text} from '@react-three/drei'
import type {ComponentProps} from 'react'
import {Suspense} from 'react'
import {RigidBody, CuboidCollider} from '~/ecs/physics'

// ============================================
// Stair Test Suite
// ============================================

interface StairTestSuiteProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Step heights to test */
  stepHeights?: number[]
  /** Number of steps per staircase */
  stepCount?: number
  /** Step depth */
  stepDepth?: number
  /** Step width */
  stepWidth?: number
  /** Show height labels */
  showLabels?: boolean
}

export function StairTestSuite({
  stepHeights = [0.1, 0.2, 0.3, 0.35, 0.4, 0.5],
  stepCount = 6,
  stepDepth = 0.4,
  stepWidth = 3,
  showLabels = true,
  ...props
}: StairTestSuiteProps) {
  const staircases = stepHeights.map((stepHeight, index) => {
    const spacing = stepWidth + 1
    const steps = []

    for (let i = 0; i < stepCount; i++) {
      const y = stepHeight / 2 + i * stepHeight
      const z = -i * stepDepth

      steps.push(
        <CuboidCollider
          key={i}
          args={[stepWidth, stepHeight, stepDepth]}
          position={[0, y, z]}
        >
          <mesh castShadow receiveShadow>
            <boxGeometry args={[stepWidth, stepHeight, stepDepth]} />
            <meshStandardMaterial
              color={i % 2 === 0 ? 0x808080 : 0x909090}
            />
          </mesh>
        </CuboidCollider>,
      )
    }

    return (
      <group key={stepHeight} position={[spacing * index, 0, 0]}>
        <RigidBody type="fixed">{steps}</RigidBody>

        {showLabels && (
          <Suspense fallback={null}>
            <Text
              position={[0, stepCount * stepHeight + 0.5, -stepCount * stepDepth / 2]}
              rotation={[0, 0, 0]}
              color="#333"
              fontSize={0.4}
              anchorX="center"
              anchorY="bottom"
            >
              {stepHeight}m
            </Text>
          </Suspense>
        )}
      </group>
    )
  })

  return <group {...props}>{staircases}</group>
}

// ============================================
// Spiral Staircase
// ============================================

interface SpiralStaircaseProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Number of steps */
  stepCount?: number
  /** Step height */
  stepHeight?: number
  /** Inner radius */
  innerRadius?: number
  /** Outer radius */
  outerRadius?: number
  /** Total rotation (radians) */
  totalRotation?: number
}

export function SpiralStaircase({
  stepCount = 16,
  stepHeight = 0.25,
  innerRadius = 1,
  outerRadius = 3,
  totalRotation = Math.PI * 2,
  ...props
}: SpiralStaircaseProps) {
  const steps = []
  const anglePerStep = totalRotation / stepCount
  const stepWidth = outerRadius - innerRadius
  const stepDepth = 0.8

  for (let i = 0; i < stepCount; i++) {
    const angle = i * anglePerStep
    const y = i * stepHeight + stepHeight / 2
    const midRadius = (innerRadius + outerRadius) / 2
    const x = Math.cos(angle) * midRadius
    const z = Math.sin(angle) * midRadius

    steps.push(
      <CuboidCollider
        key={i}
        args={[stepWidth, stepHeight, stepDepth]}
        position={[x, y, z]}
        rotation={[0, -angle + Math.PI / 2, 0]}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[stepWidth, stepHeight, stepDepth]} />
          <meshStandardMaterial color={i % 2 === 0 ? 0x707070 : 0x808080} />
        </mesh>
      </CuboidCollider>,
    )
  }

  // Center column
  const totalHeight = stepCount * stepHeight
  steps.push(
    <CuboidCollider
      key="column"
      args={[innerRadius * 0.8, totalHeight, innerRadius * 0.8]}
      position={[0, totalHeight / 2, 0]}
    >
      <mesh castShadow receiveShadow>
        <cylinderGeometry args={[innerRadius * 0.4, innerRadius * 0.4, totalHeight, 16]} />
        <meshStandardMaterial color={0x555555} />
      </mesh>
    </CuboidCollider>,
  )

  return (
    <group {...props}>
      <RigidBody type="fixed">{steps}</RigidBody>
    </group>
  )
}
