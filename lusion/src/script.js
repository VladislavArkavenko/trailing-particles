import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import SimplexNoise from 'simplex-noise';
const simplex = new SimplexNoise(Math.random);

/**
 * Base
 */
// Debug
const debugObject = {}

// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()
const backgroundScene = new THREE.Scene()

// Compute curl
function computeCurl(x, y, z){
    const eps = 0.0001;
    const curl = new THREE.Vector3();

    /* Find rate of change in YZ plane */
    // Find rate of change in Y direction
    let n1 = simplex.noise3D(x, y + eps, z);
    let n2 = simplex.noise3D(x, y - eps, z);

    // Average to find approximate derivative
    let a = (n1 - n2)/(2 * eps);

    //Find rate of change in Z direction
    n1 = simplex.noise3D(x, y, z + eps);
    n2 = simplex.noise3D(x, y, z - eps);

    //Average to find approximate derivative
    let b = (n1 - n2)/(2 * eps);
    curl.x = a - b;

    /* Find rate of change in XZ plane */
    // Find rate of change in Y direction
    n1 = simplex.noise3D(x, y, z + eps);
    n2 = simplex.noise3D(x, y, z - eps);

    // Average to find approximate derivative
    a = (n1 - n2)/(2 * eps);

    //Find rate of change in Z direction
    n1 = simplex.noise3D(x + eps, y, z);
    n2 = simplex.noise3D(x - eps, y, z);

    //Average to find approximate derivative
    b = (n1 - n2)/(2 * eps);
    curl.y = a - b;

    /* Find rate of change in XY plane */
    // Find rate of change in Y direction
    n1 = simplex.noise3D(x + eps, y, z);
    n2 = simplex.noise3D(x - eps, y, z);

    // Average to find approximate derivative
    a = (n1 - n2)/(2 * eps);

    //Find rate of change in Z direction
    n1 = simplex.noise3D(x, y + eps, z);
    n2 = simplex.noise3D(x, y - eps, z);

    //Average to find approximate derivative
    b = (n1 - n2)/(2 * eps);
    curl.z = a - b;

    return curl;
}

const scale = 3;
const getCurve = (start) => {
    let points = [];

    points.push(start);
    const currentPoint = start.clone();

    for (let i = 0; i < 500; i++) {
        const velocity = computeCurl(currentPoint.x / scale, currentPoint.y / scale, currentPoint.z / scale);
        currentPoint.addScaledVector(velocity, 0.001);

        points.push(currentPoint.clone())
    }

    return points;
}

/**
 * Objects
 */
const backgroundMaterial = new THREE.ShaderMaterial({
    uniforms: {
        uLight: { value: new THREE.Vector3() }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        
        void main()
        {   
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
            
            vUv = uv;
            vNormal = normal;
            vPosition = position;
            vWorldPosition = worldPosition.xyz;         
        }
    `,
    fragmentShader: `
        uniform vec3 uLight;
    
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        
        float getScatter(vec3 cameraPos, vec3 cameraToPointDir, vec3 lightPos, float cameraToPointDistance) {
            // Light to ray origin
            vec3 q = cameraPos - lightPos;
            
            // Coefficients
            float b = dot(cameraToPointDir, q);
            float c = dot(q, q);
            
            // Evaluate integral
            float t = c - b * b;
            float s = 1.0 / sqrt(max(0.0001, t));
            float l = s * (atan( (cameraToPointDistance + b) * s ) - atan(b*s));
            
            return pow(max(0.0, l / 150.), 0.4);
        }
    
        void main()
        {
            vec3 cameraToWorld = vWorldPosition - cameraPosition;
            vec3 cameraToWorldDir = normalize(cameraToWorld);
            float cameraToWorldDistance = length(cameraToWorld);
            
            vec3 lightToWorld = normalize(uLight - vWorldPosition);
            float diffusionLight = max(0.0, dot(vNormal, lightToWorld));
            float dist = length(uLight - vPosition);
            
            float scatter = getScatter(cameraPosition, cameraToWorldDir, uLight, cameraToWorldDistance);
            
            gl_FragColor = vec4(scatter, 0.0, 0.0, 1.0);
        }
    `
})
const tubesMaterial = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
        uTime: { value: 0 },
        uLight: { value: new THREE.Vector3() }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        
        void main()
        {   
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
            
            vUv = uv;
            vNormal = normal;
            vPosition = position;
            vWorldPosition = worldPosition.xyz;         
        }
    `,
    fragmentShader: `
        #define PI 3.1415926538
    
        uniform vec3 uLight;
        uniform float uTime;
    
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        
        float getScatter(vec3 cameraPos, vec3 cameraToPointDir, vec3 lightPos, float cameraToPointDistance) {
            // Light to ray origin
            vec3 q = cameraPos - lightPos;
            
            // Coefficients
            float b = dot(cameraToPointDir, q);
            float c = dot(q, q);
            
            // Evaluate integral
            float t = c - b * b;
            float s = 1.0 / sqrt(max(0.0001, t));
            float l = s * (atan( (cameraToPointDistance + b) * s ) - atan(b*s));
            
            return pow(max(0.0, l / 15.), 0.4);
        }
    
        void main()
        {
            float dash = sin(vUv.x * (PI * 2.) + uTime);
            if (dash < 0.0) discard;
        
            vec3 cameraToWorld = vWorldPosition - cameraPosition;
            vec3 cameraToWorldDir = normalize(cameraToWorld);
            float cameraToWorldDistance = length(cameraToWorld);
            
            vec3 lightToWorld = normalize(uLight - vWorldPosition);
            float diffusionLight = max(0.0, dot(vNormal, lightToWorld));
            float dist = length(uLight - vPosition);
            
            float scatter = getScatter(cameraPosition, cameraToWorldDir, uLight, cameraToWorldDistance);
            
            gl_FragColor = vec4(scatter, 0.0, 0.0, 1.0);
        }
    `
})
for (let i = 0; i < 100; i++) {
    const startPoint = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5,
    )
    const path = new THREE.CatmullRomCurve3(getCurve(startPoint));
    const geometry = new THREE.TubeBufferGeometry(path, 500, 0.005, 16, false);

    const curve = new THREE.Mesh(geometry, tubesMaterial)
    scene.add(curve)
}

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(75, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 0, 4)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Raycaster
 */
const raycaster = new THREE.Raycaster();
const lightPosition = new THREE.Vector2();
const elasticLightPosition = new THREE.Vector2();
const elasticLightVelocity = new THREE.Vector2();

const raycastPlane = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(10, 10),
    backgroundMaterial
);
backgroundScene.add(raycastPlane);
const raycastLight = new THREE.Mesh(
    new THREE.SphereBufferGeometry(0.02, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
);
scene.add(raycastLight);

document.addEventListener('mousemove', (event) => {
    const mouse = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: -(event.clientY / window.innerHeight) * 2 + 1
    }

    raycaster.setFromCamera( mouse, camera );

    const intersects = raycaster.intersectObjects([raycastPlane]);
    if (intersects.length) {
        const intersectionPoint = intersects[0].point;

        lightPosition.x = intersectionPoint.x;
        lightPosition.y = intersectionPoint.y;

        raycastLight.position.copy(intersectionPoint);
    }
})

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.setClearColor(0x000000)
renderer.autoClear = false;
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

/**
 * Animate
 */
const clock = new THREE.Clock();
clock.start();
const temp = new THREE.Vector2();
const tick = () =>
{
    // Update controls
    controls.update()

    // Calculate elastic light
    temp.copy(lightPosition).sub(elasticLightPosition).multiplyScalar(0.15);
    elasticLightVelocity.add(temp).multiplyScalar(0.8);
    elasticLightPosition.add(elasticLightVelocity);

    raycastLight.position.x = elasticLightPosition.x;
    raycastLight.position.y = elasticLightPosition.y;

    // Update uniforms
    tubesMaterial.uniforms.uTime.value = clock.getElapsedTime();
    tubesMaterial.uniforms.uLight.value = raycastLight.position;
    backgroundMaterial.uniforms.uLight.value = raycastLight.position;

    // Render
    renderer.clear()
    renderer.render(backgroundScene, camera);
    renderer.clearDepth();
    renderer.render(scene, camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()