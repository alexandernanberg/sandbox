import {Text} from '@react-three/drei'
import type {ComponentProps} from 'react'
import {Suspense} from 'react'
import {RigidBody, CuboidCollider} from '~/ecs/physics'
import Slope from '~/models/slope'

// ============================================
// Slope Test Suite
// ============================================

interface SlopeTestSuiteProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Angles to test (degrees) */
  angles?: number[]
  /** Height of each slope */
  height?: number
  /** Show angle labels */
  showLabels?: boolean
}

function runFromAngleAndRaise(angle: number, rise: number) {
  if (angle >= 90) return 0.001 // Avoid division by zero
  const radians = (angle * Math.PI) / 180
  return rise / Math.tan(radians)
}

export function SlopeTestSuite({
  angles = [15, 30, 45, 50, 55, 60, 75, 89],
  height = 2,
  showLabels = true,
  ...props
}: SlopeTestSuiteProps) {
  const slopes = angles.map((angle, index) => {
    const run = runFromAngleAndRaise(angle, height)
    const spacing = 2.5

    return (
      <group key={angle} position={[0, 0, spacing * index]}>
        {/* Back wall with label */}
        <CuboidCollider args={[2, height * 2, 2]} position={[0, height, 0]}>
          {showLabels && (
            <Suspense fallback={null}>
              <Text
                position={[-1.01, 0, 0]}
                rotation={[0, -Math.PI / 2, 0]}
                color="#000"
                fontSize={0.75}
                anchorX="center"
                anchorY="middle"
              >
                {angle}°
              </Text>
            </Suspense>
          )}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[2, height * 2, 2]} />
            <meshPhongMaterial color={0xfffff0} />
          </mesh>
        </CuboidCollider>

        {/* Slope ramp */}
        <Slope
          position={[-1.001 - run / 2, height / 2, 0]}
          scale={[run, height, 2]}
          rotation={[0, Math.PI, 0]}
        />
      </group>
    )
  })

  return (
    <group {...props}>
      <RigidBody type="fixed">{slopes}</RigidBody>
    </group>
  )
}

// ============================================
// Curved Slope
// ============================================

interface CurvedSlopeProps extends Omit<ComponentProps<'group'>, 'ref'> {
  /** Start angle (degrees) */
  startAngle?: number
  /** End angle (degrees) */
  endAngle?: number
  /** Number of segments */
  segments?: number
  /** Total length */
  length?: number
}

export function CurvedSlope({
  startAngle = 0,
  endAngle = 60,
  segments = 8,
  length = 8,
  ...props
}: CurvedSlopeProps) {
  const segmentLength = length / segments
  const segmentParts = []

  let currentX = 0
  let currentY = 0

  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1)
    const angle = startAngle + (endAngle - startAngle) * t
    const radians = (angle * Math.PI) / 180

    // Calculate segment rise based on angle
    const rise = Math.tan(radians) * segmentLength
    const segmentHyp = Math.sqrt(segmentLength * segmentLength + rise * rise)

    segmentParts.push(
      <CuboidCollider
        key={i}
        args={[segmentHyp, 0.1, 2]}
        position={[currentX + segmentLength / 2, currentY + rise / 2, 0]}
        rotation={[0, 0, -radians]}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[segmentHyp, 0.1, 2]} />
          <meshPhongMaterial color={0xcccccc} />
        </mesh>
      </CuboidCollider>,
    )

    currentX += segmentLength
    currentY += rise
  }

  return (
    <group {...props}>
      <RigidBody type="fixed">{segmentParts}</RigidBody>
    </group>
  )
}
