import {PerspectiveCamera} from '@react-three/drei'
import {useFrame} from '@react-three/fiber'
import type {Ref, RefObject} from 'react'
import {useImperativeHandle, useRef} from 'react'
import type {Object3D, PerspectiveCamera as PerspectiveCameraImpl} from 'three'
import {Quaternion, Vector3} from 'three'
import type {InputManagerRef} from '~/components/input-manager'
import {useConstant} from '~/utils'

interface ThirdPersonCameraProps {
  ref?: Ref<PerspectiveCameraImpl>
  targetRef: RefObject<Object3D | null>
  inputManagerRef: RefObject<InputManagerRef | null>
  makeDefault?: boolean
}

export function ThirdPersonCamera({
  targetRef,
  inputManagerRef,
  ref: forwardedRef,
  makeDefault = true,
}: ThirdPersonCameraProps) {
  const ref = useRef<PerspectiveCameraImpl>(null)
  const groupRef = useRef(null)

  useImperativeHandle(forwardedRef, () => ref.current!)

  const currentPosition = useConstant(() => new Vector3())
  const currentLookAt = useConstant(() => new Vector3())

  useFrame((_, delta) => {
    const camera = ref.current
    if (!camera) return

    const target = targetRef.current
    const inputManager = inputManagerRef.current

    if (!target || !inputManager) return
    // const group = groupRef.current;
    const input = inputManager.getInput()

    if (input.pointerLocked) {
      // console.log(input.lookAt)
    }

    const pos = new Vector3()
    const quat = new Quaternion()
    target.getWorldPosition(pos)
    target.getWorldQuaternion(quat)

    const idealOffset = new Vector3(0, 2.5, -3)
    idealOffset.applyQuaternion(quat)
    idealOffset.add(pos)

    const idealLookAt = new Vector3(0, 0, 5)
    idealLookAt.applyQuaternion(quat)
    idealLookAt.add(pos)

    const t = 1.05 - Math.pow(0.001, delta)
    currentPosition.lerp(idealOffset, t)
    currentLookAt.lerp(idealLookAt, t)

    camera.position.copy(currentPosition)
    camera.lookAt(currentLookAt)
  })

  return (
    <group>
      <PerspectiveCamera
        makeDefault={makeDefault}
        ref={ref}
        fov={90}
        position={[0, 4, 8]}
        zoom={1.2}
        near={0.1}
        far={1000}
      />
    </group>
  )
}
