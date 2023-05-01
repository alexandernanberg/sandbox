import {
  FixedStage as BaseFixedStage,
  Stage,
  Stages as Standard,
} from '@react-three/fiber'

const InputStage = new Stage()
const FixedStage = new BaseFixedStage(1 / 60)
const PhysicsStage = new BaseFixedStage(1 / 60)

export const lifecycle = [
  Standard.Early,
  InputStage,
  FixedStage,
  PhysicsStage,
  Standard.Update,
  Standard.Late,
  Standard.Render,
  Standard.After,
]

export const Stages = {
  Early: Standard.Early,
  Input: InputStage,
  Fixed: FixedStage,
  Physics: PhysicsStage,
  Update: Standard.Update,
  Late: Standard.Late,
  Render: Standard.Render,
  After: Standard.After,
}
