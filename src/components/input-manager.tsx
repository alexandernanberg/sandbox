import {useThree} from '@react-three/fiber'
import type {Ref} from 'react'
import {useEffect, useImperativeHandle, useRef} from 'react'
import {Vector2} from 'three'
import {useConstant} from '~/utils'

interface InputManagerProps {
  ref: Ref<InputManagerRef>
  // cameraRef: RefObject<Camera>
}

interface InputManagerState {
  movement: Vector2
  lookAt: Vector2
  keyboard: {[key in EventCode]?: boolean}
  gamepadIndex: null | number
  pointerLocked: boolean
}

export interface InputManagerRef {
  getInput: () => InputManagerState
}

// TODO: support QWERTY and AZERTY

export function InputManager({
  ref: forwardedRef,
  // cameraRef,
}: InputManagerProps) {
  const gl = useThree((state) => state.gl)

  const state = useConstant<InputManagerState>(() => ({
    movement: new Vector2(0, 0),
    lookAt: new Vector2(0, 0),
    keyboard: {},
    gamepadIndex: null,
    pointerLocked: false,
  }))

  const getInput = () => {
    const input = state

    if (state.gamepadIndex !== null) {
      const gamepad = navigator.getGamepads()[state.gamepadIndex]
      if (gamepad) {
        input.movement.set(
          applyDeadzone(gamepad.axes[0]!) * -1,
          applyDeadzone(gamepad.axes[1]!) * -1,
        )
      }
    }

    return state
  }

  useImperativeHandle(forwardedRef, () => ({getInput}))

  // Update keyboard state
  useEffect(() => {
    // TODO: move to getInput?
    const updateMovementFromKeyboard = () => {
      let x = 0
      let y = 0

      if (state.keyboard.KeyW || state.keyboard.ArrowUp) {
        y += 1
      }
      if (state.keyboard.KeyA || state.keyboard.ArrowLeft) {
        x += 1
      }
      if (state.keyboard.KeyS || state.keyboard.ArrowDown) {
        y -= 1
      }
      if (state.keyboard.KeyD || state.keyboard.ArrowRight) {
        x -= 1
      }

      state.movement.set(x, y)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      state.keyboard[event.code] = true
      updateMovementFromKeyboard()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      state.keyboard[event.code] = false
      updateMovementFromKeyboard()
    }

    window.addEventListener('keydown', handleKeyDown, {passive: true})
    window.addEventListener('keyup', handleKeyUp, {passive: true})

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [state])

  // Update look at
  useEffect(() => {
    const domElement = gl.domElement

    const handleClick = () => {
      // domElement.requestPointerLock()
    }

    const handlePointerMove = (event: PointerEvent) => {
      const {movementX, movementY} = event
      state.lookAt.x = movementX
      state.lookAt.y = movementY
    }

    const handlePointerLockChange = () => {
      state.pointerLocked = document.pointerLockElement === domElement
    }

    const handlePointerLockError = (event: Event) => {
      console.error(event)
    }

    domElement.addEventListener('click', handleClick, {passive: true})

    // document.addEventListener('pointerlockchange', handlePointerLockChange)
    // document.addEventListener('pointerlockerror', handlePointerLockError)
    // document.addEventListener('pointermove', handlePointerMove, {
    //   passive: true,
    // })

    return () => {
      domElement.removeEventListener('click', handleClick)
      document.removeEventListener('pointermove', handlePointerMove)
      // document.removeEventListener('pointerlockchange', handlePointerLockChange)
      // document.removeEventListener('pointerlockerror', handlePointerLockError)
    }
  }, [gl.domElement, state])

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
