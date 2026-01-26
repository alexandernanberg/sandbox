# Jolt Physics Integration

This document covers patterns and gotchas for using jolt-physics in this codebase.

## Initialization

Use `JoltInterface` with `JoltSettings`, not low-level C++ API classes:

```typescript
const settings = new Jolt.JoltSettings()
settings.mMaxBodies = 10240
settings.mMaxBodyPairs = 65536
settings.mMaxContactConstraints = 10240

// Configure collision filtering on settings
settings.mObjectLayerPairFilter = objectFilter
settings.mBroadPhaseLayerInterface = bpInterface
settings.mObjectVsBroadPhaseLayerFilter = objectVsBPFilter

const joltInterface = new Jolt.JoltInterface(settings)
Jolt.destroy(settings)

const physicsSystem = joltInterface.GetPhysicsSystem()
const tempAllocator = joltInterface.GetTempAllocator()
```

## Collision Filtering

`BroadPhaseLayer` must be created as objects, not raw numbers:

```typescript
const bpInterface = new Jolt.BroadPhaseLayerInterfaceTable(
  NUM_OBJECT_LAYERS,
  NUM_BROAD_PHASE_LAYERS,
)

// Create BroadPhaseLayer objects (required by TypeScript types)
const bpLayerNonMoving = new Jolt.BroadPhaseLayer(0)
const bpLayerMoving = new Jolt.BroadPhaseLayer(1)

bpInterface.MapObjectToBroadPhaseLayer(LAYER_NON_MOVING, bpLayerNonMoving)
bpInterface.MapObjectToBroadPhaseLayer(LAYER_MOVING, bpLayerMoving)

// Clean up - values are copied internally
Jolt.destroy(bpLayerNonMoving)
Jolt.destroy(bpLayerMoving)
```

## Shape Creation

Use direct shape constructors, not `ShapeSettings.Create().Get()`:

```typescript
// Correct - direct constructors
const sphere = new Jolt.SphereShape(radius)
const box = new Jolt.BoxShape(halfExtent, convexRadius)
const capsule = new Jolt.CapsuleShape(halfHeight, radius)
const cylinder = new Jolt.CylinderShape(halfHeight, radius)

// Don't pass null for optional parameters - omit them instead
new Jolt.SphereShape(radius) // correct
new Jolt.SphereShape(radius, null) // wrong - causes WASM errors
```

For compound shapes, use `AddShapeShape` (takes `Shape`) not `AddShape` (takes `ShapeSettings`):

```typescript
const compoundSettings = new Jolt.StaticCompoundShapeSettings()
compoundSettings.AddShapeShape(offset, rotation, subShape, userData)
const shape = compoundSettings.Create().Get()
```

For mesh shapes, use the `TriangleList` constructor:

```typescript
const triList = new Jolt.TriangleList()
// Triangle constructor takes Vec3, not Float3
const tri = new Jolt.Triangle(v0, v1, v2, materialIndex)
triList.push_back(tri)

const settings = new Jolt.MeshShapeSettings(triList)
const shape = settings.Create().Get()
```

## Body Validity Checks

`BodyID` has no `IsInvalid()` method. Check validity using:

```typescript
// Invalid body IDs have index 0xFFFFFFFF
if (bodyId.GetIndex() === 0xffffffff) {
  // Invalid body
}

// Or check if body is in the physics system
if (bodyInterface.IsAdded(bodyId)) {
  // Body is valid and added
}
```

## Contact Listeners

`ContactListenerJS` callbacks receive raw WASM pointers (numbers), not typed objects:

```typescript
const listener = new Jolt.ContactListenerJS()

listener.OnContactAdded = (
  body1Ptr: number, // Raw pointer, not BodyID
  body2Ptr: number,
  manifoldPtr: number,
  settingsPtr: number,
) => {
  // Wrap pointers to get typed objects
  const body1 = Jolt.wrapPointer(body1Ptr, Jolt.BodyID)
  const body2 = Jolt.wrapPointer(body2Ptr, Jolt.BodyID)
}

listener.OnContactValidate = (
  body1Ptr: number,
  body2Ptr: number,
  baseOffsetPtr: number,
  collisionResultPtr: number,
) => {
  return Jolt.ValidateResult_AcceptAllContactsForThisBodyPair
}
```

## CharacterVirtual

Constructor takes 4 arguments (no userData parameter):

```typescript
const character = new Jolt.CharacterVirtual(
  settings, // CharacterVirtualSettings
  position, // RVec3
  rotation, // Quat
  physicsSystem, // PhysicsSystem
)
```

### Velocity and Gravity Handling

**Critical**: `Update()` applies gravity to the character's velocity. To preserve gravity accumulation across frames, you must:

1. Read current velocity from character (includes accumulated gravity)
2. Override horizontal components with player input
3. For vertical: preserve character's vy unless jumping
4. Set the combined velocity back
5. Call Update()

```typescript
// 1. Read current velocity (includes gravity from previous Update)
const currentVel = character.GetLinearVelocity()
const charVy = currentVel.GetY()

// 2. Build final velocity
const finalVx = inputVx // player input
const finalVz = inputVz // player input

// 3. Vertical: preserve gravity, but apply jump if jumping
let finalVy: number
if (isJumping) {
  finalVy = jumpVelocity // override with jump impulse
} else if (isGrounded) {
  finalVy = Math.max(charVy, 0) // zero out downward, keep upward
} else {
  finalVy = charVy // keep accumulated gravity
}

// 4. Set velocity
const joltVel = new Jolt.Vec3(finalVx, finalVy, finalVz)
character.SetLinearVelocity(joltVel)
Jolt.destroy(joltVel)

// 5. Update applies delta and gravity
character.Update(
  deltaTime, // seconds
  gravity, // Vec3 - applied by Update
  broadPhaseFilter,
  objectLayerFilter,
  bodyFilter,
  shapeFilter,
  tempAllocator,
)
```

**Common mistake**: Overwriting velocity each frame without reading the current velocity first will cause gravity to not work (character floats).

### Character Filters

Create filters from the stored filter objects:

```typescript
const broadPhaseFilter = new Jolt.DefaultBroadPhaseLayerFilter(
  objectVsBroadPhaseLayerFilter,
  LAYER_MOVING,
)
const objectLayerFilter = new Jolt.DefaultObjectLayerFilter(
  objectLayerPairFilter,
  LAYER_MOVING,
)
const bodyFilter = new Jolt.BodyFilter()
const shapeFilter = new Jolt.ShapeFilter()
```

## Memory Management

Always destroy WASM objects when done:

```typescript
const vec = new Jolt.Vec3(x, y, z)
// ... use vec ...
Jolt.destroy(vec)
```

Temporary objects created for API calls should be destroyed immediately:

```typescript
const impulse = new Jolt.Vec3(0, 10, 0)
bodyInterface.AddImpulse(bodyId, impulse)
Jolt.destroy(impulse)
```

## TypeScript Types

Re-export types from `jolt-physics` package instead of custom definitions:

```typescript
import type Jolt from 'jolt-physics'

export type JoltModule = typeof Jolt
export type JoltVec3 = Jolt.Vec3
export type JoltBodyID = Jolt.BodyID
export type JoltShape = Jolt.Shape
// etc.
```

## Physics Step

Use `JoltInterface.Step()` for the physics update:

```typescript
joltInterface.Step(deltaTime, collisionSteps)
```

## Common Pitfalls

1. **WASM signature mismatch**: Don't pass `null` for optional constructor parameters
2. **Double delta**: Don't multiply velocity by delta before `SetLinearVelocity`
3. **Double gravity**: Don't manually apply gravity if using `CharacterVirtual.Update`
4. **Pointer callbacks**: Contact listener callbacks receive numbers, wrap with `Jolt.wrapPointer`
5. **BroadPhaseLayer**: Must be objects, not raw numbers for `MapObjectToBroadPhaseLayer`
6. **Memory leaks**: Always call `Jolt.destroy()` on WASM objects
