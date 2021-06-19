import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { gameState } from "./store";

export function useKeyPress(target, event) {
  const savedTarget = useRef();
  const savedEvent = useRef();

  useEffect(() => {
    savedEvent.current = event;
    savedTarget.current = target;
  });

  useEffect(() => {
    const downHandler = ({ key }) => {
      savedTarget.current.indexOf(key) !== -1 && savedEvent.current(true);
    };
    const upHandler = ({ key }) => {
      savedTarget.current.indexOf(key) !== -1 && savedEvent.current(false);
    };

    window.addEventListener("keydown", downHandler);
    window.addEventListener("keyup", upHandler);

    return () => {
      window.removeEventListener("keydown", downHandler);
      window.removeEventListener("keyup", upHandler);
    };
  }, []);
}

export function useControls() {
  useKeyPress(["ArrowUp", "w", "W"], (pressed) => {
    gameState.controls.forward = pressed;
  });
  useKeyPress(["ArrowDown", "s", "S"], (pressed) => {
    gameState.controls.backward = pressed;
  });
  useKeyPress(["ArrowLeft", "a", "A"], (pressed) => {
    gameState.controls.left = pressed;
  });
  useKeyPress(["ArrowRight", "d", "D"], (pressed) => {
    gameState.controls.right = pressed;
  });
  useKeyPress(
    ["Shift"],
    (pressed) => void (gameState.controls.shift = pressed)
  );
  useKeyPress([" "], (pressed) => void (gameState.controls.space = pressed));

  const gamepadsRef = useRef(new Map());

  useFrame(() => {
    // console.log(navigator.getGamepads());
  });

  useEffect(() => {
    const gamepads = gamepadsRef.current;

    const onConnect = (event) => {
      console.log(
        "Gamepad connected at index %d: %s. %d buttons, %d axes.",
        event.gamepad.index,
        event.gamepad.id,
        event.gamepad.buttons,
        event.gamepad.axes
      );
      gamepads.set(event.gamepad.index, event.gamepad);
    };

    const onDisconnect = (event) => {
      gamepads.delete(event.gamepad.index);
    };

    window.addEventListener("gamepadconnected", onConnect, true);
    window.addEventListener("gamepaddisconnected", onDisconnect, true);

    return () => {
      window.removeEventListener("gamepadconnected", onConnect, true);
      window.removeEventListener("gamepaddisconnected", onDisconnect, true);
    };
  });
}
