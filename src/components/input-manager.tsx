import {useFrame, useThree} from '@react-three/fiber'
import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import {useEffect, useLayoutEffect, useRef} from 'react'
import {CameraInput} from '~/ecs/camera'
import {Input} from '~/ecs/player'
import type {Vec2} from '~/lib/math'
import {useConstant} from '~/utils'

interface InputManagerState {
  movement: Vec2
  lookDelta: Vec2
  keyboard: {[key in EventCode]?: boolean}
  gamepadIndex: null | number
  pointerLocked: boolean
}

interface InputManagerProps {
  /** When true, disables pointer lock (for debug camera mode) */
  disablePointerLock?: boolean
}

// TODO: support QWERTY and AZERTY

export function InputManager({disablePointerLock = false}: InputManagerProps) {
  const gl = useThree((state) => state.gl)
  const world = useWorld()
  const inputEntityRef = useRef<Entity | null>(null)
  const cameraInputEntityRef = useRef<Entity | null>(null)

  const state = useConstant<InputManagerState>(() => ({
    movement: {x: 0, y: 0},
    lookDelta: {x: 0, y: 0},
    keyboard: {},
    gamepadIndex: null,
    pointerLocked: false,
  }))

  // Create Input singleton entity
  useLayoutEffect(() => {
    const entity = world.spawn(Input)
    inputEntityRef.current = entity
    return () => {
      if (entity.isAlive()) {
        entity.destroy()
      }
    }
  }, [world])

  // Create CameraInput singleton entity
  useLayoutEffect(() => {
    const entity = world.spawn(CameraInput)
    cameraInputEntityRef.current = entity
    return () => {
      if (entity.isAlive()) {
        entity.destroy()
      }
    }
  }, [world])

  // Sync input state to ECS once per frame (before physics)
  useFrame(
    () => {
      const entity = inputEntityRef.current
      if (!entity) return

      // Poll gamepad if connected (only override if gamepad has actual input)
      if (state.gamepadIndex !== null) {
        const gamepad = navigator.getGamepads()[state.gamepadIndex]
        if (gamepad) {
          const gx = applyDeadzone(gamepad.axes[0]!) * -1
          const gy = applyDeadzone(gamepad.axes[1]!) * -1
          if (gx !== 0 || gy !== 0) {
            // eslint-disable-next-line react-compiler/react-compiler -- intentional mutable state
            state.movement.x = gx
            state.movement.y = gy
          }
          // Right stick for camera (axes 2 and 3)
          const rx = applyDeadzone(gamepad.axes[2]!) * 10
          const ry = applyDeadzone(gamepad.axes[3]!) * 10
          if (rx !== 0 || ry !== 0) {
            state.lookDelta.x = rx
            state.lookDelta.y = ry
          }
        }
      }

      entity.set(Input, {
        movement: state.movement,
        jump: state.keyboard.Space ?? false,
        sprint: state.keyboard.ShiftLeft ?? false,
      })

      // Sync camera input
      const cameraEntity = cameraInputEntityRef.current
      if (cameraEntity) {
        cameraEntity.set(CameraInput, {
          delta: {x: state.lookDelta.x, y: state.lookDelta.y},
          locked: state.pointerLocked,
        })
        // Clear delta after syncing (consumed once per frame)
        state.lookDelta.x = 0
        state.lookDelta.y = 0
      }
    },
    -1, // negative priority = runs before physics
  )

  // Update keyboard state
  useEffect(() => {
    const updateMovementFromKeyboard = () => {
      let x = 0
      let y = 0

      // KCC faces +Z: W=+Z (forward), S=-Z (back), A=-X (left), D=+X (right)
      if (state.keyboard.KeyW || state.keyboard.ArrowUp) {
        y += 1
      }
      if (state.keyboard.KeyS || state.keyboard.ArrowDown) {
        y -= 1
      }
      if (state.keyboard.KeyA || state.keyboard.ArrowLeft) {
        x -= 1
      }
      if (state.keyboard.KeyD || state.keyboard.ArrowRight) {
        x += 1
      }

      state.movement.x = x
      state.movement.y = y
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      state.keyboard[event.code] = true
      updateMovementFromKeyboard()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      state.keyboard[event.code] = false
      updateMovementFromKeyboard()
    }

    const handleBlur = () => {
      state.keyboard = {}
      state.movement.x = 0
      state.movement.y = 0
    }

    window.addEventListener('keydown', handleKeyDown, {passive: true})
    window.addEventListener('keyup', handleKeyUp, {passive: true})
    window.addEventListener('blur', handleBlur, {passive: true})

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [state])

  // Update look at (pointer lock for camera control)
  useEffect(() => {
    const domElement = gl.domElement

    const handleClick = () => {
      if (disablePointerLock) return
      if (!state.pointerLocked) {
        void domElement.requestPointerLock()
      }
    }

    const handlePointerMove = (event: MouseEvent) => {
      if (state.pointerLocked) {
        // Accumulate delta (may have multiple events per frame)
        state.lookDelta.x += event.movementX
        state.lookDelta.y += event.movementY
      }
    }

    const handlePointerLockChange = () => {
      state.pointerLocked = document.pointerLockElement === domElement
    }

    const handlePointerLockError = () => {
      console.error('Pointer lock error')
    }

    domElement.addEventListener('click', handleClick, {passive: true})
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    document.addEventListener('pointerlockerror', handlePointerLockError)
    document.addEventListener('mousemove', handlePointerMove, {passive: true})

    return () => {
      domElement.removeEventListener('click', handleClick)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
      document.removeEventListener('pointerlockerror', handlePointerLockError)
      document.removeEventListener('mousemove', handlePointerMove)
    }
  }, [gl.domElement, state, disablePointerLock])

  useEffect(() => {
    const handleConnect = (event: GamepadEvent) => {
      console.log(
        'Gamepad connected at index %d: %s. %d buttons, %d axes.',
        event.gamepad.index,
        event.gamepad.id,
        event.gamepad.buttons,
        event.gamepad.axes,
      )
      if (state.gamepadIndex === null) {
        state.gamepadIndex = event.gamepad.index
      }
    }

    const handleDisconnect = (event: GamepadEvent) => {
      if (event.gamepad.index === state.gamepadIndex) {
        state.gamepadIndex = null
      }
    }

    window.addEventListener('gamepadconnected', handleConnect, {
      passive: true,
    })
    window.addEventListener('gamepaddisconnected', handleDisconnect, {
      passive: true,
    })

    return () => {
      window.removeEventListener('gamepadconnected', handleConnect)
      window.removeEventListener('gamepaddisconnected', handleDisconnect)
    }
  }, [state])

  return null
}

function applyDeadzone(number: number, threshold = 0.1) {
  let percentage = (Math.abs(number) - threshold) / (1 - threshold)

  if (percentage < 0) {
    percentage = 0
  }

  return percentage * (number > 0 ? 1 : -1)
}

type EventCode =
  | 'Abort'
  | 'Again'
  | 'AltLeft'
  | 'AltRight'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'ArrowUp'
  | 'AudioVolumeDown'
  | 'AudioVolumeMute'
  | 'AudioVolumeUp'
  | 'Backquote'
  | 'Backslash'
  | 'Backspace'
  | 'BracketLeft'
  | 'BracketRight'
  | 'BrowserBack'
  | 'BrowserFavorites'
  | 'BrowserForward'
  | 'BrowserHome'
  | 'BrowserRefresh'
  | 'BrowserSearch'
  | 'BrowserStop'
  | 'CapsLock'
  | 'Comma'
  | 'ContextMenu'
  | 'ControlLeft'
  | 'ControlRight'
  | 'Convert'
  | 'Copy'
  | 'Cut'
  | 'Delete'
  | 'Digit0'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9'
  | 'Eject'
  | 'End'
  | 'Enter'
  | 'Equal'
  | 'Escape'
  | 'F1'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'F13'
  | 'F14'
  | 'F15'
  | 'F16'
  | 'F17'
  | 'F18'
  | 'F19'
  | 'F2'
  | 'F20'
  | 'F21'
  | 'F22'
  | 'F23'
  | 'F24'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'Find'
  | 'Help'
  | 'Home'
  | 'Insert'
  | 'IntlBackslash'
  | 'IntlRo'
  | 'IntlYen'
  | 'KeyA'
  | 'KeyB'
  | 'KeyC'
  | 'KeyD'
  | 'KeyE'
  | 'KeyF'
  | 'KeyG'
  | 'KeyH'
  | 'KeyI'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyL'
  | 'KeyM'
  | 'KeyN'
  | 'KeyO'
  | 'KeyP'
  | 'KeyQ'
  | 'KeyR'
  | 'KeyS'
  | 'KeyT'
  | 'KeyU'
  | 'KeyV'
  | 'KeyW'
  | 'KeyX'
  | 'KeyY'
  | 'KeyZ'
  | 'Lang1'
  | 'Lang2'
  | 'Lang3'
  | 'Lang4'
  | 'Lang5'
  | 'Lang6'
  | 'Lang7'
  | 'Lang8'
  | 'Lang9'
  | 'LaunchApp1'
  | 'LaunchApp2'
  | 'LaunchMail'
  | 'LaunchMediaPlayer'
  | 'MediaPlayPause'
  | 'MediaSelect'
  | 'MediaStop'
  | 'MediaTrackNext'
  | 'MediaTrackPrevious'
  | 'MetaLeft'
  | 'MetaRight'
  | 'Minus'
  | 'NonConvert'
  | 'NumLock'
  | 'Numpad0'
  | 'Numpad1'
  | 'Numpad2'
  | 'Numpad3'
  | 'Numpad4'
  | 'Numpad5'
  | 'Numpad6'
  | 'Numpad7'
  | 'Numpad8'
  | 'Numpad9'
  | 'NumpadAdd'
  | 'NumpadComma'
  | 'NumpadDecimal'
  | 'NumpadDivide'
  | 'NumpadEnter'
  | 'NumpadEqual'
  | 'NumpadMultiply'
  | 'NumpadParenLeft'
  | 'NumpadParenRight'
  | 'NumpadSubtract'
  | 'Open'
  | 'PageDown'
  | 'PageUp'
  | 'Paste'
  | 'Pause'
  | 'Period'
  | 'Power'
  | 'PrintScreen'
  | 'Props'
  | 'Quote'
  | 'ScrollLock'
  | 'Select'
  | 'Semicolon'
  | 'ShiftLeft'
  | 'ShiftRight'
  | 'Slash'
  | 'Sleep'
  | 'Space'
  | 'Tab'
  | 'Undo'
  | 'WakeUp'
  | ({} & string)
