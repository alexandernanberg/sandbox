import type {Entity} from 'koota'
import {useEffect, useRef} from 'react'
import {useControls} from '~/components/debug-controls'
import {CharacterControllerConfig} from '~/ecs/physics'

// ============================================
// KCC Tuning Panel
// ============================================

interface KCCTuningPanelProps {
  /** Entity to tune */
  entity: Entity | null
  /** Whether tuning is enabled */
  enabled?: boolean
}

export function KCCTuningPanel({entity, enabled = true}: KCCTuningPanelProps) {
  const prevValuesRef = useRef<Record<string, number>>({})

  // Ground detection controls
  const groundControls = useControls(
    'KCC: Ground',
    {
      groundCheckDistance: {value: 0.5, min: 0.1, max: 2.0, step: 0.05},
      groundedThreshold: {value: 0.15, min: 0.01, max: 0.5, step: 0.01},
      groundSnapDistance: {value: 0.2, min: 0.0, max: 0.5, step: 0.02},
      skinWidth: {value: 0.02, min: 0.001, max: 0.1, step: 0.005},
    },
    {expanded: false, index: 10},
  )

  // Slope/step controls
  const slopeControls = useControls(
    'KCC: Slope/Step',
    {
      maxSlopeAngle: {value: 45, min: 0, max: 89, step: 1},
      stepHeight: {value: 0.35, min: 0, max: 1.0, step: 0.05},
      stepMinWidth: {value: 0.1, min: 0, max: 0.5, step: 0.02},
    },
    {expanded: false, index: 11},
  )

  // Movement controls
  const moveControls = useControls(
    'KCC: Movement',
    {
      maxBounces: {value: 12, min: 1, max: 20, step: 1},
      anglePower: {value: 2.0, min: 0.5, max: 5.0, step: 0.1},
    },
    {expanded: false, index: 12},
  )

  // Jump controls
  const jumpControls = useControls(
    'KCC: Jump',
    {
      jumpAngleWeight: {value: 0.4, min: 0, max: 1, step: 0.1},
      coyoteFrames: {value: 6, min: 0, max: 20, step: 1},
      jumpBufferFrames: {value: 6, min: 0, max: 20, step: 1},
    },
    {expanded: false, index: 13},
  )

  // Platform controls
  const platformControls = useControls(
    'KCC: Platform',
    {
      maxLaunchVelocity: {value: 10, min: 0, max: 30, step: 1},
      momentumTransferWeight: {value: 0.8, min: 0, max: 1, step: 0.1},
    },
    {expanded: false, index: 14},
  )

  // Apply controls to entity
  useEffect(() => {
    if (!entity || !entity.isAlive() || !enabled) return

    const config = entity.get(CharacterControllerConfig)
    if (!config) return

    // Collect all current values
    const currentValues = {
      ...groundControls,
      ...slopeControls,
      ...moveControls,
      ...jumpControls,
      ...platformControls,
    }

    // Check if any value changed
    let hasChanges = false
    for (const key of Object.keys(currentValues)) {
      if (prevValuesRef.current[key] !== currentValues[key as keyof typeof currentValues]) {
        hasChanges = true
        break
      }
    }

    if (!hasChanges) return

    // Update config
    entity.set(CharacterControllerConfig, {
      ...config,
      groundCheckDistance: groundControls.groundCheckDistance,
      groundedThreshold: groundControls.groundedThreshold,
      groundSnapDistance: groundControls.groundSnapDistance,
      skinWidth: groundControls.skinWidth,
      maxSlopeAngle: (slopeControls.maxSlopeAngle * Math.PI) / 180, // Convert to radians
      stepHeight: slopeControls.stepHeight,
      stepMinWidth: slopeControls.stepMinWidth,
      maxBounces: moveControls.maxBounces,
      anglePower: moveControls.anglePower,
      jumpAngleWeight: jumpControls.jumpAngleWeight,
      coyoteFrames: jumpControls.coyoteFrames,
      jumpBufferFrames: jumpControls.jumpBufferFrames,
      maxLaunchVelocity: platformControls.maxLaunchVelocity,
      momentumTransferWeight: platformControls.momentumTransferWeight,
    })

    // Store current values
    prevValuesRef.current = {...currentValues}
  }, [
    entity,
    enabled,
    groundControls,
    slopeControls,
    moveControls,
    jumpControls,
    platformControls,
  ])

  return null
}
