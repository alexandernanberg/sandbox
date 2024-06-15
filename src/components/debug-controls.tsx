import type { BindingApi, ButtonApi, ButtonParams } from '@tweakpane/core'
import type { MutableRefObject, ReactNode } from 'react'
import {
  createContext,
  startTransition,
  use,
  useEffect,
  useRef,
  useState,
} from 'react'
import type {
  Vector2Like,
  Vector2Tuple,
  Vector3Like,
  Vector3Tuple,
} from 'three'
import type { BindingParams, FolderApi, FolderParams } from 'tweakpane'
import { Pane } from 'tweakpane'

const TweakpaneContext = createContext<MutableRefObject<
  () => Pane | FolderApi
> | null>(null)

interface DebugControlProps
  extends NonNullable<ConstructorParameters<typeof Pane>[0]> {
  children: ReactNode
}

export function DebugControls({ children, ...props }: DebugControlProps) {
  const guiRef = useRef<Pane | null>(null)

  const guiGetter = useRef(() => {
    if (guiRef.current === null) {
      guiRef.current = new Pane({ title: 'Parameters', ...props })
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

type BindingItem = BindingParams & { value: ControlValue }
type ButtonItem = ButtonParams & { action: () => void; title: string }

type SchemaItem = BindingItem | ButtonItem
type Schema = Record<string, SchemaItem>

type ControlValues<T extends Schema> = {
  [K in keyof T]: T[K] extends { value: infer V } ? V : never
}

export function useControls<T extends Schema>(
  label: string,
  schema: T,
  params?: Omit<FolderParams, 'title'>,
): ControlValues<T> {
  const pane = useDebugControls()

  const initialState = {} as {
    [K in keyof T]: string | number | boolean | Vector3Like | Vector2Like
  }
  const transforms: Map<keyof T, '2d' | '3d'> = new Map()

  for (const key of Object.keys(schema) as Array<keyof T>) {
    if ('action' in schema[key]) continue
    const { value } = schema[key]
    if (Array.isArray(value)) {
      if (value.length === 3) {
        transforms.set(key, '3d')
        initialState[key] = { x: value[0], y: value[1], z: value[2] }
      } else {
        transforms.set(key, '2d')
        initialState[key] = { x: value[0], y: value[1] }
      }
      continue
    }

    initialState[key] = value
  }

  const [state, setState] = useState(initialState)

  useEffect(() => {
    const folder = pane.current().addFolder({ title: label, ...params })
    const bindings: Array<BindingApi | ButtonApi> = []
    const bindingState = { ...state }

    for (const key of Object.keys(schema) as Array<keyof T>) {
      const item = schema[key]

      if ('action' in item) {
        const { action, ...opts } = item
        const button = folder.addButton(opts)
        button.on('click', action)
        bindings.push(button)
        continue
      }

      const { value, ...opts } = item
      const binding = folder.addBinding(bindingState, key, opts)
      binding.on('change', (event) => {
        startTransition(() => {
          setState((prev) => ({ ...prev, [key]: event.value }))
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

  const returnValue = { ...state }
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
