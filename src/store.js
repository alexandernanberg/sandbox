import { proxy } from "valtio";

export const gameState = proxy({
  dpr: 1,
  ready: false,
  controls: {
    forward: false,
    backward: false,
    left: false,
    right: false,
    cursorY: 0,
    cursorX: 0,
    pointerLocked: false,
  },
});

export const mutation = {};

export const reset = () => {};
