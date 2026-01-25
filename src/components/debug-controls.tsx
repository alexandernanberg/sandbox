import type {BindingApi, ButtonApi, ButtonParams} from '@tweakpane/core'
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
