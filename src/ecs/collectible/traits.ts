import {trait} from 'koota'

// ============================================
// Collectible Traits
// ============================================

/** Tag for collectible entities */
export const IsCollectible = trait()

/** Collectible properties */
export const CollectibleData = trait(() => ({
  /** Point value when collected */
  value: 10,
  /** Color of the collectible */
  color: 'cyan' as string,
  /** Whether this collectible has been collected */
  collected: false,
  /** Unique ID for tracking */
  id: 0,
}))

/** Visual animation state */
export const CollectibleAnimation = trait(() => ({
  /** Rotation angle (radians) */
  rotation: 0,
  /** Bob offset (for floating effect) */
  bobOffset: 0,
  /** Initial Y position */
  baseY: 0,
}))
