# Sandbox

> Game development sandbox

## Roadmap

### Character controller

- [ ] Movement (sprint, crouch, jump)
- [ ] Jump buffer
- [ ] Jump forgiveness
- [ ] State machine
- [ ] Animations

### Camera

- [ ] Orbiting 3rd person camera (similar to GTA)
- [ ] Collision avoidance
  - Use ray casts between camera and player (whiskers, 7 casts)

### World prototyping

- [ ] Add more obstacles, ramps, and surfaces to test movement
- [ ] Experiment with lighting, shadows, and basic environmental effects

### ECS Migration

- [x] Player movement - move from `usePhysicsUpdate` to ECS system with `PlayerInput`, `PlayerMovement` traits
- [ ] Elevator/Oscillator - generic oscillation trait + system for kinematic bodies
- [x] Input state - singleton trait for input so ECS systems can read directly

### Misc

- [ ] Replace `useAsset`/`useTexture` with `use(loadAsset("/path"))` https://github.com/pmndrs/react-three-fiber/issues/3411
- [ ] Nicer skybox (Sky3D?)
