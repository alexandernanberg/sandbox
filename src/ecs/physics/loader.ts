// ============================================
// Centralized Jolt Physics Loader
// ============================================
// Handles dynamic loading of either production or debug Jolt build

import type {JoltModule} from './jolt-types'

// Cached module and loading state
let joltModule: JoltModule | null = null
let loadingPromise: Promise<JoltModule> | null = null
let isDebugBuild = false

/**
 * Load the Jolt Physics module
 * @param debug - If true, loads the debug build with DebugRenderer support
 * @returns Promise resolving to the Jolt module
 */
export async function loadJolt(debug = false): Promise<JoltModule> {
  // If already loaded with same build type, return cached
  if (joltModule && isDebugBuild === debug) {
    return joltModule
  }

  // If currently loading same build type, return existing promise
  if (loadingPromise && isDebugBuild === debug) {
    return loadingPromise
  }

  // If switching build types, we need to reload
  // Note: This is a rare case - typically you'd restart the app
  if (joltModule && isDebugBuild !== debug) {
    console.warn(
      `[Jolt] Switching from ${isDebugBuild ? 'debug' : 'production'} to ${debug ? 'debug' : 'production'} build requires page reload for full effect`,
    )
  }

  isDebugBuild = debug

  // Dynamic import based on build type
  loadingPromise = (async () => {
    if (debug) {
      // Debug build includes DebugRendererJS
      const initJolt = (await import('jolt-physics/debug-wasm-compat')).default
      joltModule = await initJolt()
    } else {
      // Production build (smaller, faster)
      const initJolt = (await import('jolt-physics/wasm-compat')).default
      joltModule = await initJolt()
    }
    return joltModule
  })()

  return loadingPromise
}

/**
 * Get the loaded Jolt module (throws if not loaded)
 */
export function getJoltModule(): JoltModule {
  if (!joltModule) {
    throw new Error(
      '[Jolt] Module not loaded. Call loadJolt() first and await the result.',
    )
  }
  return joltModule
}

/**
 * Check if the debug build is loaded
 */
export function isDebugBuildLoaded(): boolean {
  return isDebugBuild && joltModule !== null
}

/**
 * Check if Jolt has been loaded
 */
export function isJoltLoaded(): boolean {
  return joltModule !== null
}

/**
 * Check if DebugRenderer is available
 */
export function hasDebugRenderer(): boolean {
  return isDebugBuild && joltModule !== null && 'DebugRendererJS' in joltModule
}
