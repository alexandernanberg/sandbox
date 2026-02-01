import {trait} from 'koota'

// ============================================
// Sandbox Entity Tags
// ============================================

/** Tag for all sandbox-spawned objects (for easy cleanup) */
export const IsSpawnedObject = trait()

/** Tag for selected objects */
export const IsSelected = trait()

/** Tag for hovered objects */
export const IsHovered = trait()

// ============================================
// Spawnable Object Types
// ============================================

export type SpawnableType =
  | 'ball'
  | 'box'
  | 'capsule'
  | 'cylinder'
  | 'cone'

export const SPAWNABLE_TYPES: SpawnableType[] = [
  'ball',
  'box',
  'capsule',
  'cylinder',
  'cone',
]

// ============================================
// Spawn Configuration
// ============================================

export interface SpawnConfig {
  type: SpawnableType
  // Physics properties
  mass: number
  friction: number
  restitution: number
  linearDamping: number
  angularDamping: number
  // Visual
  color: string
  scale: number
}

export const DEFAULT_SPAWN_CONFIG: SpawnConfig = {
  type: 'box',
  mass: 1,
  friction: 0.5,
  restitution: 0.3,
  linearDamping: 0,
  angularDamping: 0.05,
  color: '#ff6b6b',
  scale: 1,
}

// ============================================
// Sandbox State (singleton)
// ============================================

export const SandboxState = trait(() => ({
  spawnConfig: {...DEFAULT_SPAWN_CONFIG},
  selectedEntityId: null as number | null,
  spawnMode: 'single' as 'single' | 'burst' | 'rain',
  burstCount: 10,
  rainRate: 5, // per second
  isRaining: false,
  isPaused: false,
}))

// ============================================
// Object Visual Data
// ============================================

export const ObjectVisual = trait(() => ({
  color: '#ff6b6b',
  type: 'box' as SpawnableType,
}))
