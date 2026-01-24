# React Three Fiber (R3F)

React Three Fiber is a React renderer for Three.js, allowing declarative 3D scene composition with React components.

## Core Concepts

### Canvas

The root component that creates a Three.js renderer, scene, and camera:

```tsx
import {Canvas} from '@react-three/fiber'

;<Canvas
  camera={{position: [0, 5, 10], fov: 75}}
  shadows
  dpr={[1, 2]} // Device pixel ratio range
  gl={{antialias: true}}
>
  <Scene />
</Canvas>
```

### Canvas Props

| Prop        | Description                                     |
| ----------- | ----------------------------------------------- |
| `camera`    | Camera configuration (position, fov, near, far) |
| `shadows`   | Enable shadow mapping                           |
| `dpr`       | Device pixel ratio (number or [min, max])       |
| `gl`        | WebGL renderer settings                         |
| `frameloop` | `'always'` \| `'demand'` \| `'never'`           |
| `flat`      | Disable tone mapping                            |
| `linear`    | Disable sRGB color space                        |

### JSX Elements

Three.js classes are available as JSX elements in camelCase:

```tsx
// THREE.Mesh → <mesh>
// THREE.BoxGeometry → <boxGeometry>
// THREE.MeshStandardMaterial → <meshStandardMaterial>

<mesh position={[0, 1, 0]} rotation={[0, Math.PI / 4, 0]}>
  <boxGeometry args={[1, 1, 1]} />
  <meshStandardMaterial color="hotpink" />
</mesh>
```

### Props Mapping

- **Constructor args**: `args={[...]}` passed to constructor
- **Properties**: Set directly as props (`position`, `color`, etc.)
- **Nested properties**: Use dash notation (`rotation-x={0.5}`)
- **Attach**: Control parent attachment (`attach="material"`)

```tsx
<mesh castShadow receiveShadow>
  <sphereGeometry args={[1, 32, 32]} />
  <meshPhongMaterial color="#ff0000" shininess={100} side={THREE.DoubleSide} />
</mesh>
```

## Essential Hooks

### useFrame

Subscribe to the render loop for animations:

```tsx
import {useFrame} from '@react-three/fiber'

function RotatingBox() {
  const meshRef = useRef<THREE.Mesh>(null)

  useFrame((state, delta) => {
    // state: { clock, camera, scene, gl, ... }
    // delta: time since last frame in seconds
    if (meshRef.current) {
      meshRef.current.rotation.y += delta
    }
  })

  return <mesh ref={meshRef}>...</mesh>
}
```

**Priority**: Control execution order (lower runs first)

```tsx
useFrame(callback, -1) // Run before default (0)
useFrame(callback, 1) // Run after default
```

### useThree

Access Three.js context:

```tsx
import {useThree} from '@react-three/fiber'

function MyComponent() {
  const {
    camera, // Active camera
    scene, // Scene object
    gl, // WebGL renderer
    size, // Canvas { width, height }
    viewport, // Viewport in Three.js units
    clock, // THREE.Clock
    pointer, // Normalized pointer position
    raycaster, // Raycaster for picking
  } = useThree()

  return null
}
```

### useLoader

Load assets with caching and suspense:

```tsx
import {useLoader} from '@react-three/fiber'
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader'

function Model() {
  const gltf = useLoader(GLTFLoader, '/model.glb')
  return <primitive object={gltf.scene} />
}

// With Suspense
;<Suspense fallback={<LoadingSpinner />}>
  <Model />
</Suspense>
```

### useGraph

Traverse and find objects in a loaded scene:

```tsx
import {useGraph} from '@react-three/fiber'

const {nodes, materials} = useGraph(gltf.scene)
// nodes: { MeshName: THREE.Mesh, ... }
// materials: { MaterialName: THREE.Material, ... }
```

## Events

Three.js objects support pointer events via raycasting:

```tsx
<mesh
  onClick={(e) => console.log('click', e.point)}
  onContextMenu={(e) => console.log('right-click')}
  onDoubleClick={(e) => console.log('double-click')}
  onPointerOver={(e) => setHovered(true)}
  onPointerOut={(e) => setHovered(false)}
  onPointerEnter={(e) => console.log('enter')}
  onPointerLeave={(e) => console.log('leave')}
  onPointerMove={(e) => console.log('move', e.point)}
  onPointerDown={(e) => console.log('down')}
  onPointerUp={(e) => console.log('up')}
  onWheel={(e) => console.log('wheel', e.deltaY)}
>
  ...
</mesh>
```

### Event Object (ThreeEvent)

| Property            | Type       | Description                          |
| ------------------- | ---------- | ------------------------------------ |
| `point`             | `Vector3`  | Intersection point in world coords   |
| `distance`          | `number`   | Distance from camera to intersection |
| `face`              | `Face`     | Intersected triangle face            |
| `object`            | `Object3D` | The Three.js object hit              |
| `eventObject`       | `Object3D` | The object with the event handler    |
| `ray`               | `Ray`      | The ray used for intersection        |
| `camera`            | `Camera`   | Camera used for raycasting           |
| `pointer`           | `Vector2`  | Normalized pointer coords (-1 to 1)  |
| `delta`             | `number`   | Distance moved since pointer down    |
| `nativeEvent`       | `Event`    | Original DOM event                   |
| `stopPropagation()` | `function` | Stop event from bubbling             |

**Stop propagation**:

```tsx
onClick={(e) => {
  e.stopPropagation()
  // Handle click
}}
```

## @react-three/drei Helpers

Common utilities and components:

```tsx
import {
  OrbitControls,      // Camera orbit controls
  PerspectiveCamera,  // Managed perspective camera
  Sky,                // Procedural sky
  Environment,        // HDR environment maps
  Stats,              // FPS counter
  Html,               // HTML overlays in 3D
  Loader,             // Loading progress indicator
  useGLTF,            // GLTF loader hook
  useAnimations,      // Animation controls for GLTF
  useTexture,         // Texture loader hook
  useHelper,          // Visualize lights/cameras
} from '@react-three/drei'

// Usage
<OrbitControls makeDefault />
<Environment preset="sunset" />
<Html position={[0, 2, 0]}>
  <div>3D Label</div>
</Html>
```

## Performance Patterns

### Instancing

For many identical objects:

```tsx
import {Instances, Instance} from '@react-three/drei'

;<Instances limit={1000}>
  <boxGeometry />
  <meshStandardMaterial />
  {positions.map((pos, i) => (
    <Instance key={i} position={pos} />
  ))}
</Instances>
```

### Dispose Resources

Clean up geometries and materials:

```tsx
useEffect(() => {
  return () => {
    geometry.dispose()
    material.dispose()
  }
}, [])
```

### Conditional Rendering

Use `visible` prop instead of unmounting:

```tsx
// Good - no remount cost
;<mesh visible={isVisible}>...</mesh>

// Expensive - causes remount
{
  isVisible && <mesh>...</mesh>
}
```

## Common Patterns

### Refs for Imperative Control

```tsx
const meshRef = useRef<THREE.Mesh>(null)

useEffect(() => {
  meshRef.current?.lookAt(0, 0, 0)
}, [])

<mesh ref={meshRef}>...</mesh>
```

### Forward Refs to Parent

```tsx
interface Props {
  object3DRef?: React.Ref<THREE.Object3D>
}

function MyComponent({object3DRef}: Props) {
  return <group ref={object3DRef}>...</group>
}
```

## Documentation

- R3F Docs: https://r3f.docs.pmnd.rs/
- Drei GitHub: https://github.com/pmndrs/drei
- Three.js Docs: https://threejs.org/docs/
