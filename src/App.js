import { PerspectiveCamera, Stats } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import React, { forwardRef, Suspense, useEffect, useRef } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import { gameState } from "./store";
import { useControls } from "./useControls";

export function App() {
  const characterRef = useRef();

  return (
    <>
      <Canvas shadows mode="concurrent">
        <Stats />
        <fog attach="fog" args={["#171720", 10, 50]} />
        <gridHelper args={[100, 100]} />
        <axesHelper />
        <ambientLight intensity={0.1} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.5}
          intensity={1}
          castShadow
          penumbra={1}
        />
        <Suspense fallback={null}>
          <InputControls />
          <Character ref={characterRef} />
          <ThirdPersonCamera targetRef={characterRef} />
        </Suspense>
      </Canvas>
    </>
  );
}

const _euler = new Euler(0, 0, 0, "YXZ");
const _vector = new Vector3();
const _PI_2 = Math.PI / 2;

function ThirdPersonCamera({ targetRef }) {
  const cameraRef = useRef();
  const currentPosition = useConstant(() => new Vector3());
  const currentLookAt = useConstant(() => new Vector3());

  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const domElement = gl.domElement;
    const camera = cameraRef.current;

    let minPolarAngle = 0;
    let maxPolarAngle = Math.PI;

    const onMouseMove = (event) => {
      if (!gameState.controls.pointerLocked) {
        return;
      }

      const { movementX, movementY } = event;

      _euler.setFromQuaternion(camera.quaternion);
      _euler.y -= movementX * 0.002;
      _euler.x -= movementY * 0.002;

      _euler.x = Math.max(
        _PI_2 - maxPolarAngle,
        Math.min(_PI_2 - minPolarAngle, _euler.x)
      );
    };

    // TODO: store x and y state

    const onClick = () => {
      domElement.requestPointerLock();
    };

    const onPointerLockChange = () => {
      gameState.controls.pointerLocked =
        document.pointerLockElement === domElement;
    };

    domElement.addEventListener("click", onClick, false);
    domElement.addEventListener("pointermove", onMouseMove, false);
    document.addEventListener("pointerlockchange", onPointerLockChange, false);

    return () => {
      domElement.removeEventListener("click", onClick, false);
      domElement.removeEventListener("pointermove", onMouseMove, false);
      document.removeEventListener(
        "pointerlockchange",
        onPointerLockChange,
        false
      );
    };
  }, []);

  useFrame((_, delta) => {
    const camera = cameraRef.current;
    const target = targetRef.current;

    const idealOffset = new Vector3(0, 4, -10);
    idealOffset.applyQuaternion(target.quaternion);
    idealOffset.add(target.position);

    const idealLookAt = new Vector3(0, 0, 20);
    idealLookAt.applyQuaternion(target.quaternion);
    idealLookAt.add(target.position);

    const t = 1.05 - Math.pow(0.001, delta);
    currentPosition.lerp(idealOffset, t);
    currentLookAt.lerp(idealLookAt, t);

    camera.position.copy(currentPosition);
    camera.lookAt(currentLookAt);

    // console.log(_euler);
    // camera.quaternion.setFromEuler(_euler);
  });

  return (
    <>
      <PerspectiveCamera
        makeDefault
        ref={cameraRef}
        fov={75}
        position={[0, 8, -15]}
        near={1.0}
        far={1000}
      />
      {/* <PointerLockControls key={camera?.id ?? "fallback"} camera={camera} /> */}
    </>
  );
}

function InputControls() {
  useControls();
  return null;
}

const Character = forwardRef(function Character(props, forwardedRef) {
  const ref = useRef();
  const meshRef = forwardedRef || ref;

  const decceleration = useConstant(() => new Vector3(-0.0005, 1, -5));
  const acceleration = useConstant(() => new Vector3(0.25, 75, 50));
  const velocity = useConstant(() => new Vector3(0, 0, 0));

  // const v = new Vector3(0, 0, 2);
  // v.add(new Vector3(1, 0, 0));
  // v.add(new Vector3(-1, 1, 0));
  // console.log(v);

  useFrame((state, delta) => {
    // console.group("frame");
    const mesh = meshRef.current;
    const { controls } = gameState;

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

    if (controls.forward) {
      if (controls.shift) {
        acc.setZ(100);
      }
      velocity.z += acc.z * delta;
    }
    if (controls.backward) {
      velocity.z -= acc.z * delta;
    }
    if (controls.left) {
      axis.set(0, 1, 0);
      quat.setFromAxisAngle(axis, 4.0 * Math.PI * delta * acc.x);
      meshQuat.multiply(quat);
    }
    if (controls.right) {
      axis.set(0, 1, 0);
      quat.setFromAxisAngle(axis, 4.0 * -Math.PI * delta * acc.x);
      meshQuat.multiply(quat);
    }

    if (controls.space && mesh.position.y === 2) {
      velocity.y = 100;
    }

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
    <mesh ref={meshRef} position={[0, 2, 0]}>
      <boxGeometry args={[1, 4, 1]} />
      <meshNormalMaterial />
    </mesh>
  );
});

function useConstant(fn) {
  const ref = React.useRef();

  if (!ref.current) {
    ref.current = { v: fn() };
  }

  return ref.current.v;
}
