import type {BindingApi, ButtonApi, ButtonParams} from '@tweakpane/core'
import type {Entity, Trait} from 'koota'
import type {ReactNode, RefObject} from 'react'
import {
  createContext,
  startTransition,
  use,
  useEffect,
  useRef,
  useState,
} from 'react'
import type {Vector2Like, Vector2Tuple, Vector3Like, Vector3Tuple} from 'three'
import type {BindingParams, FolderApi, FolderParams} from 'tweakpane'
import {Pane} from 'tweakpane'

const TweakpaneContext = createContext<RefObject<
  () => Pane | FolderApi
> | null>(null)

interface DebugControlProps extends NonNullable<
  ConstructorParameters<typeof Pane>[0]
> {
  children: ReactNode
}

export function DebugControls({children, ...props}: DebugControlProps) {
  const guiRef = useRef<Pane>(null)

  const guiGetter = useRef(() => {
    if (guiRef.current === null) {
      guiRef.current = new Pane({title: 'Parameters', ...props})
    }
    return guiRef.current
  })

  useEffect(() => {
    guiGetter.current()

    return () => {
      if (guiRef.current !== null) {
        guiRef.current.dispose()
        guiRef.current = null
      }
    }
  }, [])

  return (
    <TweakpaneContext.Provider value={guiGetter}>
      {children}
    </TweakpaneContext.Provider>
  )
}

export function useDebugControls() {
  const context = use(TweakpaneContext)
  if (!context) {
    throw new Error('')
  }
  return context
}

type ControlValue =
  | string
  | boolean
  | number
  | Vector3Tuple
  | Vector2Tuple
  | Vector3Like
  | Vector2Like

type BindingItem = BindingParams & {value: ControlValue}
type ButtonItem = ButtonParams & {action: () => void; title: string}

type SchemaItem = BindingItem | ButtonItem
type Schema = Record<string, SchemaItem>

type ControlValues<T extends Schema> = {
  [K in keyof T]: T[K] extends {value: infer V} ? V : never
}

export function useControls<T extends Schema>(
  label: string,
  schema: T,
  params?: Omit<FolderParams, 'title'>,
): ControlValues<T> {
  const pane = useDebugControls()

  // Store initial config in ref - these are only used at setup time
  const configRef = useRef({label, schema, params})

  const initialState = {} as {
    [K in keyof T]: string | number | boolean | Vector3Like | Vector2Like
  }
  const transforms: Map<keyof T, '2d' | '3d'> = new Map()

  for (const key of Object.keys(schema) as Array<keyof T>) {
    const schemaItem = schema[key] as SchemaItem
    if ('action' in schemaItem) continue
    const {value} = schemaItem
    if (Array.isArray(value)) {
      if (value.length === 3) {
        transforms.set(key, '3d')
        initialState[key] = {x: value[0], y: value[1], z: value[2]}
      } else {
        transforms.set(key, '2d')
        initialState[key] = {x: value[0], y: value[1]}
      }
      continue
    }

    initialState[key] = value
  }

  const [state, setState] = useState(initialState)
  const initialStateRef = useRef(initialState)

  useEffect(() => {
    const {label: lbl, schema: sch, params: prm} = configRef.current
    const folder = pane.current().addFolder({title: lbl, ...prm})
    const bindings: Array<BindingApi | ButtonApi> = []
    const bindingState = {...initialStateRef.current}

    for (const key of Object.keys(sch) as Array<keyof T>) {
      const item = sch[key] as SchemaItem

      if ('action' in item) {
        const {action, ...opts} = item as ButtonItem
        const button = folder.addButton(opts)
        button.on('click', action)
        bindings.push(button)
        continue
      }

      const {value, ...opts} = item
      const binding = folder.addBinding(bindingState, key, opts)
      binding.on('change', (event) => {
        startTransition(() => {
          setState((prev) => ({...prev, [key]: event.value}))
        })
      })
      bindings.push(binding)
    }

    return () => {
      for (const binding of bindings) {
        binding.dispose()
      }
      folder.dispose()
    }
  }, [pane])

  const returnValue = {...state}
  for (const [key, type] of transforms) {
    const value = returnValue[key]

    if (type === '3d') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error l
      returnValue[key] = [value.x, value.y, value.z]
    }
    if (type === '2d') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error l
      returnValue[key] = [value.x, value.y]
    }
  }

  return returnValue as ControlValues<T>
}

// ============================================
// Monitor Hook - for read-only debug values
// ============================================

type MonitorValue = string | number | boolean

interface MonitorConfig {
  /** Display label override */
  label?: string
  /** Number format (e.g., '%.2f') */
  format?: (value: number) => string
  /** For numbers, show as graph */
  graph?: boolean
  /** Graph min value */
  min?: number
  /** Graph max value */
  max?: number
  /** Initial value type - 'string' for text, 'number' for numeric (default) */
  type?: 'string' | 'number'
}

type MonitorSchema = Record<string, MonitorConfig>

/**
 * Hook for displaying real-time debug values in the control panel.
 * Returns a ref object that you update each frame - values automatically sync to UI.
 *
 * @example
 * const monitor = useMonitor('KCC Debug', {
 *   grounded: {},
 *   velocity: { format: (v) => v.toFixed(2) },
 * })
 *
 * useFrame(() => {
 *   monitor.current.grounded = isGrounded
 *   monitor.current.velocity = vel.y
 * })
 */
export function useMonitor<T extends MonitorSchema>(
  label: string,
  schema: T,
  params?: Omit<FolderParams, 'title'>,
): {current: {[K in keyof T]: MonitorValue}} {
  const pane = useDebugControls()

  const configRef = useRef({label, schema, params})

  // Create the mutable values object
  const valuesRef = useRef<{[K in keyof T]: MonitorValue}>(
    {} as {[K in keyof T]: MonitorValue},
  )

  // Initialize with default values based on type
  for (const key of Object.keys(schema) as Array<keyof T>) {
    if (!(key in valuesRef.current)) {
      const config = schema[key] as MonitorConfig | undefined
      valuesRef.current[key] = config?.type === 'string' ? '' : 0
    }
  }

  useEffect(() => {
    const {label: lbl, schema: sch, params: prm} = configRef.current
    const folder = pane.current().addFolder({title: lbl, ...prm})
    const bindings: BindingApi[] = []

    for (const key of Object.keys(sch) as Array<keyof T>) {
      const config = sch[key] as MonitorConfig | undefined
      const bindingLabel = config?.label ?? String(key)

      const bindingParams: BindingParams = {
        readonly: true,
        label: bindingLabel,
      }

      if (config?.format) {
        bindingParams.format = config.format
      }

      if (config?.graph) {
        bindingParams.view = 'graph'
        if (config.min !== undefined) bindingParams.min = config.min
        if (config.max !== undefined) bindingParams.max = config.max
      }

      const binding = folder.addBinding(
        valuesRef.current,
        key as string,
        bindingParams,
      )
      bindings.push(binding)
    }

    // Refresh bindings periodically to show updated values
    const interval = setInterval(() => {
      for (const binding of bindings) {
        binding.refresh()
      }
    }, 1000 / 30) // 30fps refresh rate for UI

    return () => {
      clearInterval(interval)
      for (const binding of bindings) {
        binding.dispose()
      }
      folder.dispose()
    }
  }, [pane])

  return valuesRef
}

// ============================================
// Monitor 3D Hook - for read-only 3D vectors
// ============================================

interface Monitor3DConfig {
  /** Display label override */
  label?: string
}

type Monitor3DSchema = Record<string, Monitor3DConfig>

interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Hook for displaying real-time 3D vector values in the control panel.
 * Uses Tweakpane's point3d picker for visualization.
 */
export function useMonitor3D<T extends Monitor3DSchema>(
  label: string,
  schema: T,
  params?: Omit<FolderParams, 'title'>,
): {current: {[K in keyof T]: Vec3}} {
  const pane = useDebugControls()

  const configRef = useRef({label, schema, params})

  // Create the mutable values object with Vec3 for each key
  const valuesRef = useRef<{[K in keyof T]: Vec3}>({} as {[K in keyof T]: Vec3})

  // Initialize with zero vectors
  for (const key of Object.keys(schema) as Array<keyof T>) {
    if (!(key in valuesRef.current)) {
      valuesRef.current[key] = {x: 0, y: 0, z: 0}
    }
  }

  useEffect(() => {
    const {label: lbl, schema: sch, params: prm} = configRef.current
    const folder = pane.current().addFolder({title: lbl, ...prm})
    const bindings: BindingApi[] = []

    for (const key of Object.keys(sch) as Array<keyof T>) {
      const config = sch[key] as Monitor3DConfig | undefined
      const bindingLabel = config?.label ?? String(key)

      const binding = folder.addBinding(valuesRef.current, key as string, {
        readonly: true,
        label: bindingLabel,
        picker: 'inline',
        expanded: false,
      })
      bindings.push(binding)
    }

    // Refresh bindings periodically to show updated values
    const interval = setInterval(() => {
      for (const binding of bindings) {
        binding.refresh()
      }
    }, 1000 / 30) // 30fps refresh rate for UI

    return () => {
      clearInterval(interval)
      for (const binding of bindings) {
        binding.dispose()
      }
      folder.dispose()
    }
  }, [pane])

  return valuesRef
}

// ============================================
// Entity Inspector Hook - for inspecting ECS entities
// ============================================

interface TraitInspectorConfig {
  /** Display name for this trait */
  name: string
  /** The trait to inspect */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trait: Trait<any>
  /** Optional keys to show (shows all if not specified) */
  keys?: string[]
  /** Format functions for specific keys */
  format?: Record<string, (value: unknown) => string>
}

/**
 * Hook for inspecting all traits on a specific entity.
 * Automatically creates read-only bindings for each trait's data.
 *
 * @example
 * useEntityInspector('Player', () => playerEntityRef.current, [
 *   { name: 'State', trait: PlayerState },
 *   { name: 'Movement', trait: CharacterMovement, keys: ['grounded', 'sliding'] },
 * ])
 */
export function useEntityInspector(
  label: string,
  getEntity: () => Entity | null | undefined,
  traits: TraitInspectorConfig[],
  params?: Omit<FolderParams, 'title'>,
): void {
  const pane = useDebugControls()

  const configRef = useRef({label, getEntity, traits, params})

  // Create mutable values object for each trait
  const valuesRef = useRef<Record<string, Record<string, unknown>>>({})

  // Initialize values structure
  for (const traitConfig of traits) {
    if (!(traitConfig.name in valuesRef.current)) {
      valuesRef.current[traitConfig.name] = {}
    }
  }

  useEffect(() => {
    const {
      label: lbl,
      getEntity: getter,
      traits: traitConfigs,
      params: prm,
    } = configRef.current
    const folder = pane.current().addFolder({title: lbl, ...prm})
    const bindings: BindingApi[] = []
    const subFolders: FolderApi[] = []

    for (const traitConfig of traitConfigs) {
      const traitFolder = folder.addFolder({
        title: traitConfig.name,
        expanded: true,
      })
      subFolders.push(traitFolder)

      // Get initial trait data to determine keys
      const entity = getter()
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const traitData = entity?.get(traitConfig.trait)

      if (traitData && typeof traitData === 'object') {
        const data = traitData as Record<string, unknown>
        const keys = traitConfig.keys ?? Object.keys(data)

        for (const key of keys) {
          // Initialize value
          valuesRef.current[traitConfig.name]![key] = data[key]

          const bindingParams: BindingParams = {
            readonly: true,
            label: key,
          }

          // Apply format if provided
          const formatFn = traitConfig.format?.[key]
          if (formatFn) {
            bindingParams.format = formatFn as (value: number) => string
          }

          const binding = traitFolder.addBinding(
            valuesRef.current[traitConfig.name]!,
            key,
            bindingParams,
          )
          bindings.push(binding)
        }
      }
    }

    // Refresh values periodically
    const interval = setInterval(() => {
      const entity = getter()
      if (!entity) return

      for (const traitConfig of traitConfigs) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const traitData = entity.get(traitConfig.trait)
        if (traitData && typeof traitData === 'object') {
          const data = traitData as Record<string, unknown>
          const keys = traitConfig.keys ?? Object.keys(data)
          for (const key of keys) {
            valuesRef.current[traitConfig.name]![key] = data[key]
          }
        }
      }

      for (const binding of bindings) {
        binding.refresh()
      }
    }, 1000 / 30)

    return () => {
      clearInterval(interval)
      for (const binding of bindings) {
        binding.dispose()
      }
      for (const subFolder of subFolders) {
        subFolder.dispose()
      }
      folder.dispose()
    }
  }, [pane])
}

// ============================================
// Entity Browser Hook - for browsing entities by query
// ============================================

interface EntityBrowserConfig {
  /** Trait to display for each entity */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trait: Trait<any>
  /** Keys to show from the trait */
  keys: string[]
  /** Optional label function to identify each entity */
  getLabel?: (entity: Entity, index: number) => string
}

/**
 * Hook for browsing all entities matching a query.
 * Creates a folder for each entity with trait data.
 *
 * @example
 * useEntityBrowser(
 *   'Balls',
 *   () => world.query(IsBall, Transform),
 *   { trait: Transform, keys: ['x', 'y', 'z'] }
 * )
 */
export function useEntityBrowser(
  label: string,
  getEntities: () => Iterable<Entity>,
  config: EntityBrowserConfig,
  params?: Omit<FolderParams, 'title'>,
): void {
  const pane = useDebugControls()

  const configRef = useRef({label, getEntities, config, params})

  // Track folders and bindings for cleanup
  const stateRef = useRef<{
    folder: FolderApi | null
    entityFolders: FolderApi[]
    bindings: BindingApi[]
    values: Record<string, Record<string, unknown>>
  }>({
    folder: null,
    entityFolders: [],
    bindings: [],
    values: {},
  })

  useEffect(() => {
    const {
      label: lbl,
      getEntities: getter,
      config: cfg,
      params: prm,
    } = configRef.current
    const state = stateRef.current

    state.folder = pane
      .current()
      .addFolder({title: lbl, expanded: false, ...prm})

    // Rebuild entity list periodically
    const rebuildInterval = setInterval(() => {
      if (!state.folder) return

      // Clean up old folders and bindings
      for (const binding of state.bindings) {
        binding.dispose()
      }
      for (const entityFolder of state.entityFolders) {
        entityFolder.dispose()
      }
      state.bindings = []
      state.entityFolders = []
      state.values = {}

      // Build new folders
      const entities = [...getter()]
      const count = entities.length

      // Update folder title with count
      state.folder.title = `${lbl} (${count})`

      // Limit to first 20 entities to avoid performance issues
      const maxEntities = Math.min(count, 20)

      for (let i = 0; i < maxEntities; i++) {
        const entity = entities[i]!
        const entityLabel = cfg.getLabel?.(entity, i) ?? `Entity ${i}`

        const entityFolder = state.folder.addFolder({
          title: entityLabel,
          expanded: false,
        })
        state.entityFolders.push(entityFolder)

        // Initialize values for this entity
        state.values[entityLabel] = {}

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const traitData = entity.get(cfg.trait)
        if (traitData && typeof traitData === 'object') {
          const data = traitData as Record<string, unknown>
          for (const key of cfg.keys) {
            state.values[entityLabel][key] = data[key]

            const binding = entityFolder.addBinding(
              state.values[entityLabel],
              key,
              {
                readonly: true,
                label: key,
              },
            )
            state.bindings.push(binding)
          }
        }
      }
    }, 1000) // Rebuild every second

    // Refresh values more frequently
    const refreshInterval = setInterval(() => {
      const entities = [...getter()]
      const maxEntities = Math.min(entities.length, 20)

      for (let i = 0; i < maxEntities; i++) {
        const entity = entities[i]!
        const entityLabel = cfg.getLabel?.(entity, i) ?? `Entity ${i}`
        const values = state.values[entityLabel]
        if (!values) continue

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const traitData = entity.get(cfg.trait)
        if (traitData && typeof traitData === 'object') {
          const data = traitData as Record<string, unknown>
          for (const key of cfg.keys) {
            values[key] = data[key]
          }
        }
      }

      for (const binding of state.bindings) {
        binding.refresh()
      }
    }, 1000 / 15) // 15fps for browser (less critical)

    return () => {
      clearInterval(rebuildInterval)
      clearInterval(refreshInterval)
      for (const binding of state.bindings) {
        binding.dispose()
      }
      for (const entityFolder of state.entityFolders) {
        entityFolder.dispose()
      }
      state.folder?.dispose()
    }
  }, [pane])
}
