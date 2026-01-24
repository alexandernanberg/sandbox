# Rapier Physics Engine (JavaScript/WASM)

Rapier is a high-performance physics engine used for 3D physics simulation. This project uses `@dimforge/rapier3d-simd-compat` for WASM with SIMD support.

## Core Concepts

### World
The central physics simulation container that manages gravity and all bodies/colliders.
```javascript
import RAPIER from '@dimforge/rapier3d-simd-compat'
const gravity = { x: 0, y: -9.81, z: 0 }
const world = new RAPIER.World(gravity)

// Advance simulation
world.step()
```

### RigidBody Types

| Type | Description |
|------|-------------|
| `dynamic` | Affected by forces and contacts (default) |
| `fixed` | Immobile, infinite mass (ground, walls) |
| `kinematicPositionBased` | User controls position, velocity computed |
| `kinematicVelocityBased` | User controls velocity, position computed |

```javascript
// Create rigid body
const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
  .setTranslation(0, 5, 0)
  .setLinvel(0, 0, 0)
  .setGravityScale(1.0)
const body = world.createRigidBody(bodyDesc)
```

### RigidBody Configuration Options

| Property | Description |
|----------|-------------|
| `gravityScale` | Multiplier for gravity (0 = no gravity) |
| `linearDamping` | Slows linear movement over time |
| `angularDamping` | Slows rotation over time |
| `ccd` | Continuous collision detection for fast objects |
| `canSleep` | Allow body to sleep when at rest |
| `dominanceGroup` | Higher groups are immune to lower group forces |
| `lockPosition` | Prevent position changes |
| `lockRotation` | Prevent rotation changes |

### Controlling RigidBodies

```javascript
// Forces (applied over time)
body.addForce({ x: 0, y: 100, z: 0 }, true)
body.addTorque({ x: 0, y: 10, z: 0 }, true)

// Impulses (instant velocity change)
body.applyImpulse({ x: 0, y: 50, z: 0 }, true)

// Kinematic bodies
body.setNextKinematicTranslation({ x: 0, y: 5, z: 0 })
body.setLinvel({ x: 0, y: 2, z: 0 }, true)

// Read state
const pos = body.translation() // { x, y, z }
const rot = body.rotation()    // { x, y, z, w } quaternion
const vel = body.linvel()      // { x, y, z }
```

## Colliders

Colliders define collision geometry attached to rigid bodies.

### Collider Shapes

| Shape | Constructor | Description |
|-------|-------------|-------------|
| Ball | `ColliderDesc.ball(radius)` | Sphere |
| Cuboid | `ColliderDesc.cuboid(hx, hy, hz)` | Box (half-extents) |
| Capsule | `ColliderDesc.capsule(halfHeight, radius)` | Cylinder with rounded caps |
| Cylinder | `ColliderDesc.cylinder(halfHeight, radius)` | Cylinder |
| Cone | `ColliderDesc.cone(halfHeight, radius)` | Cone |
| ConvexHull | `ColliderDesc.convexHull(points)` | Convex mesh from points |
| Trimesh | `ColliderDesc.trimesh(vertices, indices)` | Arbitrary triangle mesh |
| Heightfield | `ColliderDesc.heightfield(...)` | Terrain |

### Collider Properties

```javascript
const colliderDesc = RAPIER.ColliderDesc.cuboid(1, 1, 1)
  .setFriction(0.5)        // 0.0 = no friction, higher = more
  .setRestitution(0.5)     // 0.0 = no bounce, 1.0 = full bounce
  .setDensity(1.0)         // Affects mass
  .setSensor(false)        // true = trigger only, no physics

const collider = world.createCollider(colliderDesc, body)
```

### Collision Groups & Filtering

```javascript
// 16-bit membership mask and filter mask
colliderDesc.setCollisionGroups(membershipBits << 16 | filterBits)

// Only collides if: (a.membership & b.filter) != 0 && (b.membership & a.filter) != 0
```

### Sensors

Sensors detect intersections without generating contact forces:
```javascript
colliderDesc.setSensor(true)

// Query intersections
world.intersectionsWith(collider, (otherCollider) => {
  console.log('Intersecting with:', otherCollider)
})
```

## Character Controller

For player characters that need precise control over movement.

```javascript
// Create controller with skin offset
const controller = world.createCharacterController(0.01)

// Configure
controller.setMaxSlopeClimbAngle(45 * Math.PI / 180)
controller.setMinSlopeSlideAngle(30 * Math.PI / 180)
controller.enableAutostep(0.5, 0.2, true)  // maxHeight, minWidth, allowDynamic
controller.enableSnapToGround(0.5)
controller.setApplyImpulsesToDynamicBodies(true)

// Each frame: compute and apply movement
const desiredMovement = { x: 0, y: -0.1, z: 1 }  // includes gravity
controller.computeColliderMovement(characterCollider, desiredMovement)

const correctedMovement = controller.computedMovement()
// Apply to kinematic body or collider position
```

### Character Controller Options

| Method | Description |
|--------|-------------|
| `setMaxSlopeClimbAngle(angle)` | Max slope the character can walk up |
| `setMinSlopeSlideAngle(angle)` | Min slope that causes sliding |
| `enableAutostep(height, width, dynamic)` | Auto-climb small steps |
| `enableSnapToGround(distance)` | Keep grounded on slopes |
| `setApplyImpulsesToDynamicBodies(bool)` | Push dynamic objects |

## Performance Tips

1. **Use SIMD build**: `@dimforge/rapier3d-simd-compat` for better performance
2. **Enable sleeping**: Let static bodies sleep to reduce computation
3. **Use CCD sparingly**: Only for fast-moving objects that might tunnel
4. **Collision groups**: Filter unnecessary collision pairs
5. **Fixed timestep**: Use consistent `world.step()` timing for stability

## Documentation

- Official docs: https://rapier.rs/docs/
- JavaScript API: https://rapier.rs/docs/api/javascript/JavaScript3D
