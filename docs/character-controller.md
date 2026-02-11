# Kinematic Character Controller Design

Research compiled from: [OpenKCC](https://github.com/nicholas-maltbie/OpenKCC), [DigitalRune](https://digitalrune.github.io/DigitalRune-Documentation/html/7cc27ced-9a65-4ddd-8b8e-fa817b7fe6b7.htm), [Roystan's Super Character Controller](https://roystanross.wordpress.com/downloads/), [Photon Quantum KCC](https://doc.photonengine.com/quantum/current/manual/physics/kcc), and [Unity Character Controller](https://docs.unity3d.com/Packages/com.unity.charactercontroller@1.3/manual/moving-platforms.html).

---

## Overview

A Kinematic Character Controller (KCC) moves a character through the world using its own rules rather than physics forces. Key characteristics:

- **Can push** other objects
- **Cannot be pushed** by other objects
- **Full control** over movement (no physics "floatiness")
- **Predictable** behavior for platforming/action games

---

## Core Algorithm: Move and Slide

The fundamental KCC movement loop uses an iterative "bounce" or "slide" approach:

```
function MoveAndSlide(position, velocity, maxIterations = 4):
    remainingVelocity = velocity

    for i in 0..maxIterations:
        if length(remainingVelocity) < epsilon:
            break

        // 1. Cast shape in movement direction
        hit = ShapeCast(position, direction(remainingVelocity), length(remainingVelocity))

        if no hit:
            // No collision - apply full movement
            position += remainingVelocity
            break

        // 2. Move to contact point (with small offset)
        safeDistance = hit.distance - skinWidth
        position += normalize(remainingVelocity) * safeDistance

        // 3. Calculate remaining movement
        remainingDistance = length(remainingVelocity) - safeDistance

        // 4. Project remaining velocity onto collision plane (slide)
        remainingVelocity = remainingVelocity - dot(remainingVelocity, hit.normal) * hit.normal

        // Optionally: attempt step-up here

    return position
```

### Key Points

1. **Iterative approach** - Handle multiple collisions per frame (corners, etc.)
2. **Slide along surfaces** - Project velocity onto collision plane
3. **Skin width** - Small offset to prevent floating point penetration
4. **Max iterations** - Prevent infinite loops (typically 3-5)

---

## Ground Detection

Ground detection determines if the character is standing on a surface. Uses a **shape cast downward** (not raycast).

### Why ShapeCast over Raycast

- Raycast is a thin line - misses ground at edges
- ShapeCast matches the character's shape (capsule bottom)
- Provides accurate contact point regardless of surface angle

### Algorithm

```
function DetectGround(position, shape, maxDistance):
    hit = ShapeCast(position, DOWN, shape, maxDistance)

    if no hit:
        return { grounded: false }

    // Check if surface is walkable (not too steep)
    slopeAngle = acos(dot(hit.normal, UP))
    isWalkable = slopeAngle <= maxSlopeAngle

    // Check if close enough to be "grounded"
    isGrounded = hit.distance <= groundedThreshold AND isWalkable

    return {
        grounded: isGrounded,
        distance: hit.distance,
        normal: hit.normal,
        point: hit.point,
        collider: hit.collider
    }
```

### Edge Detection Issue

When SphereCast contacts a collider edge (not face), the returned normal is **interpolated** between the two face normals. This causes:

- Incorrect slope angle calculation
- Character sliding off edges unexpectedly

**Solution**: Secondary raycast along the slope to find the actual ground beneath.

---

## Slope Handling

### Slope Limiting

Prevent walking up slopes steeper than `maxSlopeAngle`:

```
function HandleSlope(velocity, groundNormal):
    slopeAngle = acos(dot(groundNormal, UP))

    if slopeAngle > maxSlopeAngle:
        // Treat as wall - slide along it horizontally only
        horizontalNormal = normalize(groundNormal.x, 0, groundNormal.z)
        return velocity - dot(velocity, horizontalNormal) * horizontalNormal
    else:
        // Walkable slope - project movement onto surface
        return ProjectOnPlane(velocity, groundNormal)
```

### Slope Projection

When walking on slopes, project horizontal movement onto the slope surface:

```
function ProjectOnSlope(horizontalVelocity, groundNormal):
    // Project onto the plane defined by groundNormal
    right = cross(horizontalVelocity, UP)
    slopeDirection = cross(groundNormal, right)
    return normalize(slopeDirection) * length(horizontalVelocity)
```

This ensures:

- Walking **down** slopes doesn't cause bunny-hopping
- Walking **up** slopes costs appropriate movement
- Walking **across** slopes follows the contour

---

## Step Handling

Allow character to walk up small steps without jumping.

### Step-Up Algorithm

```
function AttemptStepUp(position, velocity, hit, stepHeight):
    // Only attempt if collision is at "feet" level
    if hit.point.y > position.y + stepHeight:
        return null  // Hit is too high

    // 1. Check if there's space above
    raisedPosition = position + UP * stepHeight
    if ShapeOverlap(raisedPosition):
        return null  // No room above

    // 2. Try to move forward at raised height
    forwardHit = ShapeCast(raisedPosition, velocity.direction, velocity.magnitude)
    if forwardHit and forwardHit.distance < minStepWidth:
        return null  // Blocked at step height too

    newPosition = raisedPosition + velocity.direction * min(velocity.magnitude, forwardHit.distance)

    // 3. Snap down to find the step surface
    downHit = ShapeCast(newPosition, DOWN, stepHeight + skinWidth)
    if no downHit:
        return null  // No ground found

    // 4. Verify the step surface is walkable
    if acos(dot(downHit.normal, UP)) > maxSlopeAngle:
        return null  // Too steep

    return newPosition - DOWN * downHit.distance
```

### Step-Down (Ground Snapping)

Keep character attached to ground when walking down slopes or steps:

```
function SnapToGround(position, velocity, snapDistance):
    // Only snap if:
    // - Was grounded last frame
    // - Not jumping (velocity.y <= 0)
    // - Horizontal movement occurred

    hit = ShapeCast(position, DOWN, snapDistance)

    if hit and isWalkable(hit.normal):
        return position - DOWN * (hit.distance - skinWidth)

    return position  // No snapping
```

**Important**: Skip ground snapping on moving platforms (see below).

---

## Moving Platform Support

Moving platforms require special handling because:

1. Platform moves via `setNextKinematicTranslation` (applied during physics step)
2. Character controller runs **before** physics step
3. Ground detection finds platform at **old** position

### Platform Velocity Tracking

Platforms must expose their velocity (per-frame delta or velocity vector):

```
// On the platform entity
KinematicVelocity {
    linear: { x, y, z },   // Linear velocity
    angular: { x, y, z }   // Angular velocity (radians/frame)
}
```

### Applying Platform Velocity

```
function GetPlatformVelocity(groundCollider, characterPosition):
    body = groundCollider.parentBody

    if not body.isKinematic:
        return ZERO

    platformVelocity = body.linearVelocity

    // Add tangential velocity from rotation
    if body.angularVelocity != ZERO:
        relativePos = characterPosition - body.position
        tangential = cross(body.angularVelocity, relativePos)
        platformVelocity += tangential

    return platformVelocity
```

### Integration into Movement

```
function CharacterUpdate():
    groundInfo = DetectGround()

    platformVelocity = ZERO
    if groundInfo.grounded:
        platformVelocity = GetPlatformVelocity(groundInfo.collider, position)

    // Add platform velocity to character's desired velocity
    totalVelocity = characterVelocity + platformVelocity

    // Move and slide
    newPosition = MoveAndSlide(position, totalVelocity)

    // IMPORTANT: Skip ground snapping on moving platforms
    if platformVelocity == ZERO:
        newPosition = SnapToGround(newPosition, ...)
```

### Why Skip Ground Snapping on Moving Platforms

Ground snapping casts down and finds the platform at its **old** position (physics hasn't stepped yet). It then snaps the character down, **canceling** the platform's upward velocity.

**Solutions**:

1. Skip ground snapping when `platformVelocity != 0`
2. Or: Account for platform movement in snap calculation

---

## Collision Response with Dynamic Bodies

KCC should push dynamic bodies but not be pushed by them.

### Pushing Dynamic Bodies

When movement shapecast hits a dynamic body:

```
function HandleDynamicBodyCollision(hit, velocity, characterMass):
    body = hit.collider.parentBody

    if not body.isDynamic:
        return  // Only push dynamic bodies

    // Calculate push impulse based on character velocity
    pushDirection = normalize(velocity)
    pushStrength = characterMass * length(velocity) * pushMultiplier

    impulse = pushDirection * pushStrength
    body.applyImpulseAtPoint(impulse, hit.point)
```

### Options for Dynamic Body Collisions

1. **Pass through + push**: Character ignores collision, just pushes the body
2. **Slide + push**: Character slides around, also pushes
3. **Block + push**: Character is blocked (like walls)

Option 1 is common for "powerful" characters. Option 2/3 for more realistic interactions.

---

## Depenetration (Pushback)

Handles cases where character ends up inside geometry (teleport, spawn, fast-moving objects).

### Position-Based Approach

```
function Depenetrate(position, shape, maxIterations = 4):
    for i in 0..maxIterations:
        overlaps = ShapeOverlapAll(position, shape)

        if no overlaps:
            break

        for overlap in overlaps:
            // Skip dynamic bodies
            if overlap.body.isDynamic:
                continue

            // Find closest point on surface
            closestPoint = overlap.closestPoint

            // Calculate push direction (away from surface)
            pushDir = normalize(position - closestPoint)

            // Calculate penetration depth
            penetration = shape.radius - distance(position, closestPoint)

            // Push out
            position += pushDir * (penetration + skinWidth)

    return position
```

### When to Run Depenetration

- After all movement resolution
- But **skip on moving platforms** (can cause ejection from platform edges)

---

## Complete Frame Update Order

Based on OpenKCC's actual implementation order:

```
function CharacterControllerUpdate(deltaTime):
    // 1. GROUND DETECTION
    groundInfo = DetectGround(position, shape, groundCheckDistance)

    // 2. PLATFORM VELOCITY
    platformVelocity = ZERO
    if groundInfo.grounded:
        platformVelocity = GetPlatformVelocity(groundInfo.collider, position)

    // 3. DEPENETRATION (BEFORE movement, skip on moving platforms)
    //    OpenKCC: "Push player out of overlapping objects" first
    if not onMovingPlatform:
        position = Depenetrate(position, shape)
        // Re-detect ground if we moved
        groundInfo = DetectGround(position, ...)

    // 4. APPLY FORCES TO DYNAMIC GROUND
    if groundInfo.grounded and groundInfo.body.isDynamic:
        ApplyCharacterWeight(groundInfo.body, groundInfo.point)

    // 5. BUILD TOTAL VELOCITY
    totalVelocity = inputVelocity + platformVelocity

    // 6. SLOPE PROJECTION (if grounded)
    if groundInfo.grounded:
        totalVelocity = ProjectOnSlope(totalVelocity, groundInfo.normal)

    // 7. MOVE AND SLIDE (handles step-up internally)
    newPosition = MoveAndSlide(position, totalVelocity)

    // 8. GROUND SNAPPING (skip on moving platforms)
    onMovingPlatform = length(platformVelocity) > epsilon
    if groundInfo.grounded and not jumping and not onMovingPlatform:
        newPosition = SnapToGround(newPosition)

    // 9. APPLY FINAL POSITION
    body.setNextKinematicTranslation(newPosition)
```

---

## Configuration Parameters

| Parameter             | Typical Value | Description                                        |
| --------------------- | ------------- | -------------------------------------------------- |
| `skinWidth`           | 0.01 - 0.02   | Small offset to prevent floating-point penetration |
| `groundCheckDistance` | 0.1 - 0.5     | How far below to check for ground                  |
| `groundSnapDistance`  | 0.05 - 0.2    | Max distance to snap down to ground                |
| `maxSlopeAngle`       | 45° - 60°     | Steeper slopes become walls                        |
| `stepHeight`          | 0.3 - 0.5     | Max height of auto-climbable steps                 |
| `stepMinWidth`        | 0.1           | Min horizontal depth for valid step                |
| `maxBounces`          | 3 - 5         | Max collision iterations per frame                 |
| `pushMultiplier`      | 0.1 - 1.0     | How hard character pushes dynamic bodies           |

---

## Common Pitfalls

1. **Ground snapping cancels platform velocity** - Skip snapping on moving platforms
2. **Depenetration ejects from platform edges** - Skip depenetration on moving platforms
3. **Edge normals are interpolated** - Use secondary raycast for verification
4. **Recursive depenetration can oscillate** - Limit iterations, handle opposing normals
5. **Dynamic bodies push character** - Filter them from collision response
6. **Step-up triggers on walls** - Check collision height is at "feet" level
7. **Steep slopes detected as ground** - Check slope angle before grounded flag

---

## Implementation Notes (Our KCC)

### Frame Update Order

Our implementation matches OpenKCC's order:

1. Ground detection
2. Platform velocity detection
3. **Depenetration** (BEFORE movement, skipped on moving platforms)
4. Re-detect ground if depenetration moved us
5. Coyote time & jump buffer update
6. Momentum transfer (when leaving platforms)
7. Apply weight to dynamic ground
8. Build total velocity
9. Slope projection
10. **Move and slide** (with dynamic body push, step-up)
11. **Ground snapping** (skipped on moving platforms)
12. Apply final position

### Dynamic Body Handling

- **Movement**: Filters out dynamic bodies from collision shapecast (pass through)
- **Push**: Separate shapecast detects dynamic bodies and applies horizontal impulse
- **Depenetration**: Pushes dynamic bodies away, KCC doesn't move in response
- **Friction**: Character collider has `friction=0` to prevent launching objects off capsule curves

### Key Implementation Decisions

| Feature                  | Our Approach                                                    |
| ------------------------ | --------------------------------------------------------------- |
| Depenetration            | Overlap query (`intersectionsWithShape` + `contactPair`)        |
| Edge normal verification | Secondary shapecast offset toward edge normal                   |
| Push impulse             | Horizontal-only, `mass * speed * 0.02` (like OpenKCC ForceMode) |
| Dynamic body collisions  | Pass through + push (Option 1 from design)                      |
| Coyote time              | 6 frames (~100ms)                                               |
| Jump buffer              | 6 frames (~100ms)                                               |
| Momentum transfer        | 80% platform velocity inherited when leaving                    |

### Current Config Values

```typescript
skinWidth: 0.02
groundCheckDistance: 0.5
groundedThreshold: 0.15  // Higher for fast platforms
groundSnapDistance: 0.2
maxSlopeAngle: π/4 (45°)
stepHeight: 0.35
stepMinWidth: 0.1
maxBounces: 5
mass: 75
```

### Known Issues / TODO

- [ ] Objects on KCC head can still affect movement in edge cases
- [ ] Step-up could be smoother
- [ ] No ceiling detection for crouching
- [ ] No ladder/climbing support

---

## References

- [OpenKCC Documentation](https://nickmaltbie.com/OpenKCC/docs/)
- [Roystan's Character Controller Series](https://roystanross.wordpress.com/2014/05/07/custom-character-controller-in-unity-part-1-collision-resolution/)
- [DigitalRune Character Controller](https://digitalrune.github.io/DigitalRune-Documentation/html/7cc27ced-9a65-4ddd-8b8e-fa817b7fe6b7.htm)
- [Photon Quantum KCC](https://doc.photonengine.com/quantum/current/manual/physics/kcc)
- [Unity ECS Character Controller](https://docs.unity3d.com/Packages/com.unity.charactercontroller@1.3/manual/moving-platforms.html)
- [Rapier Character Controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
