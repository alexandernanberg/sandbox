import {useThree} from '@react-three/fiber'
import {useActions} from 'koota/react'
import {useCallback, useEffect, useRef, useState} from 'react'
import {Raycaster, Vector2, Vector3, Plane} from 'three'
import {useControls, useMonitor} from '~/components/debug-controls'
import {sandboxActions} from './actions'
import {
  DEFAULT_SPAWN_CONFIG,
  SPAWNABLE_TYPES,
  type SpawnConfig,
  type SpawnableType,
} from './traits'

// ============================================
// Spawner Component
// ============================================

export function Spawner() {
  const {spawnObject, spawnBurst, spawnRainDrop, clearSpawnedObjects, getSpawnedCount} =
    useActions(sandboxActions)

  const {camera, gl} = useThree()
  const raycaster = useRef(new Raycaster())
  const mouse = useRef(new Vector2())
  const groundPlane = useRef(new Plane(new Vector3(0, 1, 0), 0))
  const intersectPoint = useRef(new Vector3())

  // Rain state
  const [isRaining, setIsRaining] = useState(false)
  const rainIntervalRef = useRef<number | null>(null)

  // Spawn config from controls
  const spawnControls = useControls(
    'Spawn Settings',
    {
      type: {
        value: DEFAULT_SPAWN_CONFIG.type,
        options: SPAWNABLE_TYPES.reduce(
          (acc, t) => ({...acc, [t]: t}),
          {} as Record<SpawnableType, SpawnableType>,
        ),
      },
      scale: {value: 1, min: 0.25, max: 3, step: 0.25},
      friction: {value: 0.5, min: 0, max: 2, step: 0.1},
      restitution: {value: 0.3, min: 0, max: 2, step: 0.1},
      mass: {value: 1, min: 0.1, max: 50, step: 0.1},
      linearDamping: {value: 0, min: 0, max: 5, step: 0.1},
      angularDamping: {value: 0.05, min: 0, max: 5, step: 0.05},
      burstCount: {value: 10, min: 1, max: 50, step: 1},
      rainRate: {value: 5, min: 1, max: 30, step: 1},
    },
    {expanded: true, index: 3},
  )

  // Build config from controls
  const getSpawnConfig = useCallback((): SpawnConfig => {
    return {
      type: spawnControls.type as SpawnableType,
      scale: spawnControls.scale,
      friction: spawnControls.friction,
      restitution: spawnControls.restitution,
      mass: spawnControls.mass,
      linearDamping: spawnControls.linearDamping,
      angularDamping: spawnControls.angularDamping,
      color: 'random',
    }
  }, [spawnControls])

  // Spawn actions
  const _spawnActions = useControls(
    'Spawn Actions',
    {
      _spawnAbove: {
        title: 'Spawn Above Player',
        action: () => {
          spawnObject(0, 8, 0, getSpawnConfig())
        },
      },
      _spawnBurst: {
        title: 'Spawn Burst',
        action: () => {
          spawnBurst(0, 10, 0, spawnControls.burstCount, getSpawnConfig())
        },
      },
      _toggleRain: {
        title: 'Toggle Rain',
        action: () => {
          setIsRaining((prev) => !prev)
        },
      },
      _clear: {
        title: 'Clear All',
        action: () => {
          clearSpawnedObjects()
        },
      },
    },
    {expanded: true, index: 4},
  )

  // Monitor spawned count
  const monitor = useMonitor(
    'Sandbox Stats',
    {
      spawnedCount: {label: 'Spawned Objects'},
      raining: {label: 'Raining', type: 'string'},
    },
    {expanded: true, index: 5},
  )

  // Update monitor
  useEffect(() => {
    const interval = setInterval(() => {
      monitor.current.spawnedCount = getSpawnedCount()
      monitor.current.raining = isRaining ? 'Yes' : 'No'
    }, 100)
    return () => clearInterval(interval)
  }, [getSpawnedCount, isRaining, monitor])

  // Rain effect
  useEffect(() => {
    if (isRaining) {
      const intervalMs = 1000 / spawnControls.rainRate
      rainIntervalRef.current = window.setInterval(() => {
        spawnRainDrop(getSpawnConfig(), 25)
      }, intervalMs)
    } else if (rainIntervalRef.current) {
      clearInterval(rainIntervalRef.current)
      rainIntervalRef.current = null
    }

    return () => {
      if (rainIntervalRef.current) {
        clearInterval(rainIntervalRef.current)
      }
    }
  }, [isRaining, spawnControls.rainRate, spawnRainDrop, getSpawnConfig])

  // Click to spawn
  useEffect(() => {
    const canvas = gl.domElement

    const handleClick = (event: MouseEvent) => {
      // Only spawn on middle click or shift+click
      if (!(event.button === 1 || (event.button === 0 && event.shiftKey))) {
        return
      }

      event.preventDefault()

      // Get mouse position in normalized device coordinates
      const rect = canvas.getBoundingClientRect()
      mouse.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      // Raycast to ground plane
      raycaster.current.setFromCamera(mouse.current, camera)
      raycaster.current.ray.intersectPlane(groundPlane.current, intersectPoint.current)

      if (intersectPoint.current) {
        // Spawn slightly above ground
        spawnObject(
          intersectPoint.current.x,
          intersectPoint.current.y + 3,
          intersectPoint.current.z,
          getSpawnConfig(),
        )
      }
    }

    canvas.addEventListener('mousedown', handleClick)
    return () => canvas.removeEventListener('mousedown', handleClick)
  }, [camera, gl, spawnObject, getSpawnConfig])

  return null
}
