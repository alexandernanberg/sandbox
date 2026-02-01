import {useActions} from 'koota/react'
import {useEffect, useRef, useState} from 'react'
import {useControls, useMonitor} from '~/components/debug-controls'
import {sandboxActions} from '../actions'
import {DEFAULT_SPAWN_CONFIG, SPAWNABLE_TYPES, type SpawnableType} from '../traits'

// ============================================
// Stress Test Panel
// ============================================

interface StressTestPreset {
  name: string
  objectCount: number
  spawnRate: number // per second
  areaSize: number
  types: SpawnableType[]
}

const PRESETS: StressTestPreset[] = [
  {name: 'Light', objectCount: 50, spawnRate: 10, areaSize: 15, types: ['ball', 'box']},
  {name: 'Medium', objectCount: 150, spawnRate: 20, areaSize: 20, types: ['ball', 'box', 'cylinder']},
  {name: 'Heavy', objectCount: 300, spawnRate: 30, areaSize: 25, types: SPAWNABLE_TYPES},
  {name: 'Extreme', objectCount: 500, spawnRate: 50, areaSize: 30, types: SPAWNABLE_TYPES},
]

export function StressTestPanel() {
  const {spawnRainDrop, clearSpawnedObjects, getSpawnedCount} = useActions(sandboxActions)

  const [isRunning, setIsRunning] = useState(false)
  const [currentPreset, setCurrentPreset] = useState<StressTestPreset | null>(null)
  const intervalRef = useRef<number | null>(null)
  const spawnedRef = useRef(0)

  // Stress test controls
  const controls = useControls(
    'Stress Test',
    {
      preset: {
        value: 'Medium',
        options: PRESETS.reduce(
          (acc, p) => ({...acc, [p.name]: p.name}),
          {} as Record<string, string>,
        ),
      },
      _start: {
        title: 'Start Test',
        action: () => {
          const preset = PRESETS.find((p) => p.name === controls.preset)
          if (preset) {
            setCurrentPreset(preset)
            setIsRunning(true)
            spawnedRef.current = 0
          }
        },
      },
      _stop: {
        title: 'Stop Test',
        action: () => {
          setIsRunning(false)
          setCurrentPreset(null)
        },
      },
      _clear: {
        title: 'Clear All',
        action: () => {
          setIsRunning(false)
          setCurrentPreset(null)
          clearSpawnedObjects()
          spawnedRef.current = 0
        },
      },
    },
    {expanded: false, index: 20},
  )

  // Monitor stats
  const monitor = useMonitor(
    'Stress Stats',
    {
      targetCount: {label: 'Target'},
      currentCount: {label: 'Current'},
      spawnRate: {label: 'Spawn/sec'},
      status: {label: 'Status', type: 'string'},
    },
    {expanded: false, index: 21},
  )

  // Update monitor
  useEffect(() => {
    const interval = setInterval(() => {
      monitor.current.targetCount = currentPreset?.objectCount ?? 0
      monitor.current.currentCount = getSpawnedCount()
      monitor.current.spawnRate = currentPreset?.spawnRate ?? 0
      monitor.current.status = isRunning
        ? spawnedRef.current >= (currentPreset?.objectCount ?? 0)
          ? 'Complete'
          : 'Spawning...'
        : 'Idle'
    }, 100)
    return () => clearInterval(interval)
  }, [currentPreset, isRunning, getSpawnedCount, monitor])

  // Spawning loop
  useEffect(() => {
    if (!isRunning || !currentPreset) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const intervalMs = 1000 / currentPreset.spawnRate

    intervalRef.current = window.setInterval(() => {
      if (spawnedRef.current >= currentPreset.objectCount) {
        setIsRunning(false)
        return
      }

      // Pick random type from preset types
      const type = currentPreset.types[
        Math.floor(Math.random() * currentPreset.types.length)
      ]!

      spawnRainDrop(
        {
          ...DEFAULT_SPAWN_CONFIG,
          type,
          color: 'random',
        },
        currentPreset.areaSize,
      )

      spawnedRef.current++
    }, intervalMs)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isRunning, currentPreset, spawnRainDrop])

  return null
}
