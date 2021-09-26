/*eslint-disable */
import { PerspectiveCamera, Stats, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { Euler, Quaternion, Spherical, Vector2, Vector3 } from "three";
import Car from "./Car";

useGLTF.preload("/car.glb");

export function App() {
  const cameraRef = useRef();
  const characterRef = useRef();
  const inputRef = useRef();

  return (
    <>
      <Canvas shadows mode="concurrent">
        <Stats />
        <fog attach="fog" args={["#171720", 10, 50]} />
        <gridHelper args={[100, 100]} />
        <axesHelper args={[1]} />
        <ambientLight intensity={0.1} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.5}
          intensity={1}
          castShadow
          penumbra={1}
        />
        <Suspense fallback={null}>
          <InputControls ref={inputRef} cameraRef={cameraRef} />
          <Character ref={characterRef} inputRef={inputRef} />
          <ThirdPersonCamera
            ref={cameraRef}
            targetRef={characterRef}
            inputRef={inputRef}
          />
        </Suspense>
      </Canvas>
    </>
  );
}

const ThirdPersonCamera = forwardRef(function ThirdPersonCamera(
  { targetRef, inputRef },
  forwardedRef
) {
  const ref = useRef();
  const cameraRef = forwardedRef || ref;
  const groupRef = useRef();

  const currentPosition = useConstant(() => new Vector3());
  const currentLookAt = useConstant(() => new Vector3());
  const targetRotation = useConstant(() => new Vector3());

  const spherical = new Spherical();
  const sphericalDelta = new Spherical();

  useFrame((_, delta) => {
    const camera = cameraRef.current;
    const group = groupRef.current;
    const target = targetRef.current;
    const input = inputRef.current.getInput();

    // sphericalDelta.theta -= 0.01;
    targetRotation.x = input.lookAt.y * -0.002;
    targetRotation.y = input.lookAt.x * -0.002;

    // const rot = new Euler().setFromVector3(targetRotation)
    // const quat =new Quaternion()

    group.rotation.setFromVector3(targetRotation);

    // group.rotation.x = input.lookAt.y * delta;
    // group.rotation.y = input.lookAt.x * delta;
    // group.rotation.z = input.lookAt.y;

    // console.log(targetRotation);

    // const idealOffset = new Vector3(0, 4, -10);
    // // idealOffset.applyQuaternion(target.quaternion);
    // idealOffset.add(target.position);

    // const idealLookAt = new Vector3(0, 0, 20);
    // idealLookAt.applyQuaternion(target.quaternion);
    // idealLookAt.add(target.position);

    // const t = 1.05 - Math.pow(0.001, delta);
    // currentPosition.lerp(idealOffset, t);
    // currentLookAt.lerp(idealLookAt, t);

    // camera.position.copy(currentPosition);
    // camera.lookAt(currentLookAt);

    // camera.lookAt(target.position);
  });

  return (
    <group rotate={[1, 1, 1]} ref={groupRef}>
      <PerspectiveCamera
        makeDefault
        ref={cameraRef}
        fov={75}
        position={[0, 4, 8]}
        near={1.0}
        far={1000}
      />
    </group>
  );
});

function applyDeadzone(number, threshold) {
  let percentage = (Math.abs(number) - threshold) / (1 - threshold);

  if (percentage < 0) {
    percentage = 0;
  }

  return percentage * (number > 0 ? 1 : -1);
}

const InputControls = forwardRef(function InputControls(
  { cameraRef },
  forwardedRef
) {
  const gl = useThree((state) => state.gl);

  const state = useConstant(() => ({
    movement: new Vector2(0, 0),
    lookAt: new Vector2(0, 0),
    keyboard: {},
    gamepadIndex: null,
    pointerLocked: false,
  }));

  const getInput = () => {
    const input = state;

    if (state.gamepadIndex !== null) {
      const gamepad = navigator.getGamepads()[state.gamepadIndex];
      input.movement.x = applyDeadzone(gamepad.axes[0], 0.25) * -1;
      input.movement.y = applyDeadzone(gamepad.axes[1], 0.25) * -1;
    }

    return state;
  };

  useImperativeHandle(forwardedRef, () => ({ getInput }));

  useEffect(() => {
    const updateMovementFromKeyboard = () => {
      let x = 0;
      let y = 0;

      if (state.keyboard.KeyW || state.keyboard.ArrowUp) {
        y += 1;
      }
      if (state.keyboard.KeyA || state.keyboard.ArrowLeft) {
        x += 1;
      }
      if (state.keyboard.KeyS || state.keyboard.ArrowDown) {
        y -= 1;
      }
      if (state.keyboard.KeyD || state.keyboard.ArrowRight) {
        x -= 1;
      }

      state.movement.set(x, y);
    };

    const onKeyDown = (event) => {
      state.keyboard[event.code] = true;
      updateMovementFromKeyboard();
    };

    const onKeyUp = (event) => {
      state.keyboard[event.code] = false;
      updateMovementFromKeyboard();
    };

    document.addEventListener("keydown", onKeyDown, false);
    document.addEventListener("keyup", onKeyUp, false);

    return () => {
      document.removeEventListener("keydown", onKeyDown, false);
      document.removeEventListener("keyup", onKeyUp, false);
    };
  }, [state.keyboard, state.movement]);

  useEffect(() => {
    const domElement = gl.domElement;

    const onPointerMove = (event) => {
      const { movementX, movementY } = event;

      state.lookAt.x -= movementX;
      state.lookAt.y -= movementY;
    };

    const onClick = () => {
      domElement.requestPointerLock();
    };

    const onPointerLockChange = () => {
      state.pointerLocked = document.pointerLockElement === domElement;
    };

    domElement.addEventListener("click", onClick, false);
    domElement.addEventListener("pointerlockchange", onPointerLockChange);
    domElement.addEventListener("pointerlockerror", (e) => {
      console.log("err", e);
    });

    document.addEventListener("pointermove", onPointerMove, false);

    return () => {
      document.removeEventListener("pointermove", onPointerMove, false);
    };
  }, [cameraRef, gl.domElement, state, state.lookAt]);

  useEffect(() => {
    const onConnect = (event) => {
      console.log(
        "Gamepad connected at index %d: %s. %d buttons, %d axes.",
        event.gamepad.index,
        event.gamepad.id,
        event.gamepad.buttons,
        event.gamepad.axes
      );
      if (state.gamepadIndex === null) {
        state.gamepadIndex = event.gamepad.index;
      }
    };

    const onDisconnect = (event) => {
      if (event.gamepad.id === state.gamepadIndex) {
        state.gamepadIndex = null;
      }
    };

    window.addEventListener("gamepadconnected", onConnect, true);
    window.addEventListener("gamepaddisconnected", onDisconnect, true);

    return () => {
      window.removeEventListener("gamepadconnected", onConnect, true);
      window.removeEventListener("gamepaddisconnected", onDisconnect, true);
    };
  });

  useFrame(() => {
    // console.log(state.gamepadIndex?.axes);
    // console.log(state.movement);
  });

  return null;
});

const Character = forwardRef(function Character({ inputRef }, forwardedRef) {
  const ref = useRef();
  const meshRef = forwardedRef || ref;

  const decceleration = useConstant(() => new Vector3(-0.0005, 1, -5));
  const acceleration = useConstant(() => new Vector3(0.25, 75, 50));
  const velocity = useConstant(() => new Vector3(0, 0, 0));

  useFrame((state, delta) => {
    // console.group("frame");
    const input = inputRef.current.getInput();
    const mesh = meshRef.current;

    const frameDecceleration = new Vector3(
      velocity.x * decceleration.x,
      velocity.y * decceleration.y,
      velocity.z * decceleration.z
    );
    frameDecceleration.multiplyScalar(delta);
    frameDecceleration.z =
      Math.sign(frameDecceleration.z) *
      Math.min(Math.abs(frameDecceleration.z), Math.abs(velocity.z));

    velocity.add(frameDecceleration);

    const axis = new Vector3();
    const quat = new Quaternion();
    const meshQuat = mesh.quaternion.clone();
    const acc = acceleration.clone();

    if (input.keyboard.ShiftLeft) {
      acc.setZ(100);
    }

    velocity.z += input.movement.y * acc.z * delta;

    axis.set(0, 1, 0);
    quat.setFromAxisAngle(
      axis,
      4.0 * input.movement.x * Math.PI * delta * acc.x
    );
    meshQuat.multiply(quat);

    // if (controls.space && mesh.position.y === 2) {
    //   velocity.y = 100;
    // }

    mesh.quaternion.copy(meshQuat);

    const forward = new Vector3(0, 0, 1);
    forward.applyQuaternion(mesh.quaternion);
    forward.normalize();

    const sideways = new Vector3(1, 0, 0);
    sideways.applyQuaternion(mesh.quaternion);
    sideways.normalize();

    const upwards = new Vector3(0, 0, 0);
    upwards.applyQuaternion(mesh.quaternion);
    upwards.normalize();

    // console.log(velocity.y, velocity.y + acc.y * -0.5);
    // upwards.y += delta * (velocity.y + acc.y * 0.5);
    // upwards.y = Math.max(upwards.y, 0.0);

    velocity.y += acc.y;
    velocity.y = Math.max(velocity.y, -100);

    // console.log(velocity.y, upwards.y);

    sideways.multiplyScalar(velocity.x * delta);
    forward.multiplyScalar(velocity.z * delta);
    upwards.multiplyScalar(velocity.y * delta);

    // console.log(mesh.position);
    mesh.position.add(forward);
    // console.log(mesh.position);
    mesh.position.add(sideways);
    // console.log(mesh.position);
    mesh.position.add(upwards);
    // console.log(mesh.position);

    // console.groupEnd();
  });

  return (
    <group ref={meshRef}>
      <Car />
    </group>
  );
});

/**
 * Create constant only once.
 * @template T
 * @param {() => T} fn
 * @return {T}
 */
function useConstant(fn) {
  const ref = useRef();

  if (!ref.current) {
    ref.current = { v: fn() };
  }

  return ref.current.v;
}
