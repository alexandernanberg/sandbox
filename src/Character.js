import { useAnimations, useGLTF } from "@react-three/drei";
import { useGraph } from "@react-three/fiber";
import { forwardRef, useEffect, useMemo, useRef } from "react";
import { SkeletonUtils } from "three-stdlib";

// import { createMachine } from "@xstate/fsm";
// const characterMachine = createMachine({
//   id: "character",
//   initial: "idle",
//   states: {
//     idle: { on: { WALK: "walk" } },
//     walk: { on: { RUN: "run" } },
//     run: { on: { WALK: "walk" } },
//   },
// });

const Character = forwardRef(function Character(props, forwardedRef) {
  const ref = useRef();
  const characterRef = forwardedRef || ref;
  const { scene, materials, animations } = useGLTF("/ybot.gltf");
  const clone = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { nodes } = useGraph(clone);

  const { actions } = useAnimations(animations, characterRef);

  const state = "Idle";
  useEffect(() => {
    actions[state].reset().play();
    return () => actions[state].stop();
  });

  return (
    <group ref={characterRef}>
      <group
        {...props}
        dispose={null}
        scale={0.01}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <primitive object={nodes.mixamorigHips} />
        <skinnedMesh
          geometry={nodes.Alpha_Joints.geometry}
          material={materials.Alpha_Joints_MAT}
          skeleton={nodes.Alpha_Joints.skeleton}
          frustumCulled={false}
        />
        <skinnedMesh
          geometry={nodes.Alpha_Surface.geometry}
          material={materials.Alpha_Body_MAT}
          skeleton={nodes.Alpha_Surface.skeleton}
          frustumCulled={false}
        />
      </group>
    </group>
  );
});

export default Character;

useGLTF.preload("/ybot.gltf");
