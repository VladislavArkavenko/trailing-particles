import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import {GLTFLoader} from "three/examples/jsm/loaders/GLTFLoader";
import {TessellateModifier} from "three/examples/jsm/modifiers/TessellateModifier";

(async () => {
function isSafari() {
    return !!navigator.userAgent.match( /Safari/i ) && !navigator.userAgent.match( /Chrome/i );
}

/* TEXTURE WIDTH FOR SIMULATION */
const WIDTH = 562;

/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene();

const loader = new GLTFLoader();
const model = await new Promise((resolve) => {
    loader.load(
        '/models/face.glb',
        (gltf) => resolve(gltf.scene.children[0].children[1])
    )
})
const faceVertices = model.geometry.attributes.position.array;

/**
 * Objects
 */
const material = new THREE.ShaderMaterial({
    // wireframe: true,
    uniforms: {
        time: { value: 0 },
        texturePosition: { value: null },
    },
    vertexShader: `
        #define PI 3.1415926538
        
        attribute vec2 reference; 
        
        uniform sampler2D texturePosition; 
        uniform float time; 
    
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
        
         vec3 mod289(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec2 mod289(vec2 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec3 permute(vec3 x) {
            return mod289(((x*34.0)+1.0)*x);
        }

        float noise(vec2 v) {
            const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                                0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                               -0.577350269189626,  // -1.0 + 2.0 * C.x
                                0.024390243902439); // 1.0 / 41.0
            // First corner
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);

            // Other corners
            vec2 i1;
            //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
            //i1.y = 1.0 - i1.x;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            // x0 = x0 - 0.0 + 0.0 * C.xx ;
            // x1 = x0 - i1 + 1.0 * C.xx ;
            // x2 = x0 - 1.0 + 2.0 * C.xx ;
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;

            // Permutations
            i = mod289(i); // Avoid truncation effects in permutation
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                + i.x + vec3(0.0, i1.x, 1.0 ));

            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m ;
            m = m*m ;

            // Gradients: 41 points uniformly over a line, mapped onto a diamond.
            // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;

            // Normalise gradients implicitly by scaling m
            // Approximation of: m *= inversesqrt( a0*a0 + h*h );
            m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

            // Compute final noise value at P
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        vec3 curl(float x, float y, float z) {
            float eps = 1., eps2 = 2. * eps;
            float n1, n2, a, b;

            x += time * .05;
            y += time * .05;
            z += time * .05;

            vec3 curl = vec3(0.);

            n1 = noise(vec2( x, y + eps ));
            n2 = noise(vec2( x, y - eps ));
            a = (n1 - n2)/eps2;

            n1 = noise(vec2( x, z + eps));
            n2 = noise(vec2( x, z - eps));
            b = (n1 - n2)/eps2;

            curl.x = a - b;

            n1 = noise(vec2( y, z + eps));
            n2 = noise(vec2( y, z - eps));
            a = (n1 - n2)/eps2;

            n1 = noise(vec2( x + eps, z));
            n2 = noise(vec2( x + eps, z));
            b = (n1 - n2)/eps2;

            curl.y = a - b;

            n1 = noise(vec2( x + eps, y));
            n2 = noise(vec2( x - eps, y));
            a = (n1 - n2)/eps2;

            n1 = noise(vec2(  y + eps, z));
            n2 = noise(vec2(  y - eps, z));
            b = (n1 - n2)/eps2;

            curl.z = a - b;

            return curl;
        } 
        
        void main()
        {   
            
            vec3 newPos = position;
            float frequency = 20.;
            float amplitude = 0.1;
            float maxDistance = 0.2;
            vec3 target = position + amplitude * curl(frequency * newPos.x, frequency * newPos.y, frequency * newPos.z);
            float d = length(position - target) / maxDistance;
            newPos = mix(position, target, pow(d, 5.));
            
            vec4 modelPosition = modelMatrix * vec4(newPos, 1.0);
            vec4 modelViewPosition = viewMatrix * modelPosition;
            
            gl_PointSize = 0.5 / - modelViewPosition.z;
            gl_Position = projectionMatrix * modelViewPosition;
            
            vUv = reference;
            vNormal = normal;
            vPosition = position;
            vWorldPosition = modelPosition.xyz;         
        }
    `,
    fragmentShader: `
        #define PI 3.1415926538
        
        uniform float uTime;
    
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec3 vWorldPosition;
    
        void main()
        {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
    `
})
// const tessellateModifier = new TessellateModifier( 0.01, 6 ); // To see more points
// const geometry = tessellateModifier.modify( model.geometry );
const geometry = new THREE.IcosahedronBufferGeometry(0.1, 32, 32);
const particles = new THREE.Points(geometry, material);
scene.add(particles)

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
camera.position.set(0, -0.25, 0)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    antialias: true
})
renderer.setClearColor(0xffffff)
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

/**
 * Fill initial positions for GPGPU simulation
 */
const fillInitialPositions = (dataTexture) => {
    const arr = dataTexture.image.data;
    const faceVerticesCount = faceVertices.length / 3;
    for (let i = 0; i < arr.length; i+=4) {
        const faceVertexNumber = Math.floor(Math.random() * faceVerticesCount);

        const x = faceVertices[3*faceVertexNumber];
        const y = faceVertices[3*faceVertexNumber+1];
        const z = faceVertices[3*faceVertexNumber+2];

        arr[i] = x;
        arr[i+1] = y;
        arr[i+2] = z;
        arr[i+3] = 1; // Not used
    }
}

/**
 * GPGPU Init
 */
const gpuCompute = new GPUComputationRenderer( WIDTH, WIDTH, renderer );
if ( isSafari() ) {
    gpuCompute.setDataType( THREE.HalfFloatType );
}
const dtPosition = gpuCompute.createTexture();
fillInitialPositions(dtPosition);
const positionVariable = gpuCompute.addVariable(
    'texturePosition',
    `
        uniform float time;
        uniform sampler2D texturePosition;
        
        vec3 mod289(vec3 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec2 mod289(vec2 x) {
            return x - floor(x * (1.0 / 289.0)) * 289.0;
        }

        vec3 permute(vec3 x) {
            return mod289(((x*34.0)+1.0)*x);
        }

        float noise(vec2 v) {
            const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                                0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                               -0.577350269189626,  // -1.0 + 2.0 * C.x
                                0.024390243902439); // 1.0 / 41.0
            // First corner
            vec2 i  = floor(v + dot(v, C.yy) );
            vec2 x0 = v -   i + dot(i, C.xx);

            // Other corners
            vec2 i1;
            //i1.x = step( x0.y, x0.x ); // x0.x > x0.y ? 1.0 : 0.0
            //i1.y = 1.0 - i1.x;
            i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
            // x0 = x0 - 0.0 + 0.0 * C.xx ;
            // x1 = x0 - i1 + 1.0 * C.xx ;
            // x2 = x0 - 1.0 + 2.0 * C.xx ;
            vec4 x12 = x0.xyxy + C.xxzz;
            x12.xy -= i1;

            // Permutations
            i = mod289(i); // Avoid truncation effects in permutation
            vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
                + i.x + vec3(0.0, i1.x, 1.0 ));

            vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
            m = m*m ;
            m = m*m ;

            // Gradients: 41 points uniformly over a line, mapped onto a diamond.
            // The ring size 17*17 = 289 is close to a multiple of 41 (41*7 = 287)

            vec3 x = 2.0 * fract(p * C.www) - 1.0;
            vec3 h = abs(x) - 0.5;
            vec3 ox = floor(x + 0.5);
            vec3 a0 = x - ox;

            // Normalise gradients implicitly by scaling m
            // Approximation of: m *= inversesqrt( a0*a0 + h*h );
            m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );

            // Compute final noise value at P
            vec3 g;
            g.x  = a0.x  * x0.x  + h.x  * x0.y;
            g.yz = a0.yz * x12.xz + h.yz * x12.yw;
            return 130.0 * dot(m, g);
        }

        vec3 curl(float x, float y, float z) {
            float eps = 1., eps2 = 2. * eps;
            float n1, n2, a, b;

            x += time * .05;
            y += time * .05;
            z += time * .05;

            vec3 curl = vec3(0.);

            n1 = noise(vec2( x, y + eps ));
            n2 = noise(vec2( x, y - eps ));
            a = (n1 - n2)/eps2;

            n1 = noise(vec2( x, z + eps));
            n2 = noise(vec2( x, z - eps));
            b = (n1 - n2)/eps2;

            curl.x = a - b;

            n1 = noise(vec2( y, z + eps));
            n2 = noise(vec2( y, z - eps));
            a = (n1 - n2)/eps2;

            n1 = noise(vec2( x + eps, z));
            n2 = noise(vec2( x + eps, z));
            b = (n1 - n2)/eps2;

            curl.y = a - b;

            n1 = noise(vec2( x + eps, y));
            n2 = noise(vec2( x - eps, y));
            a = (n1 - n2)/eps2;

            n1 = noise(vec2(  y + eps, z));
            n2 = noise(vec2(  y - eps, z));
            b = (n1 - n2)/eps2;

            curl.z = a - b;

            return curl;
        } 

        void main() {
            vec2 uv = gl_FragCoord.xy / resolution.xy;
            vec4 tmpPos = texture2D( texturePosition, uv );
            vec3 position = tmpPos.xyz;
            
            float frequency = 3.5;
            float amplitude = 0.002;
            vec3 target = position + amplitude * curl(frequency * position.x, frequency * position.y, frequency * position.z);

            gl_FragColor = vec4(target, 1.0);
        }
    `,
    dtPosition
);
positionVariable.wrapS = THREE.RepeatWrapping;
positionVariable.wrapT = THREE.RepeatWrapping;
positionVariable.material.uniforms.time = { value: 0  }
const error = gpuCompute.init();
if (error) {
    console.error(error);
}

/**
 * Animate
 */
const clock = new THREE.Clock();
clock.start();
const tick = () =>
{
    // Update controls
    controls.update()

    // Update uniforms
    material.uniforms.time.value = clock.getElapsedTime();
    positionVariable.material.uniforms.time.value = clock.getElapsedTime();

    // Compute GPGPU
    gpuCompute.compute();
    material.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;

    // Render
    renderer.render(scene, camera);

    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}

tick()
})()