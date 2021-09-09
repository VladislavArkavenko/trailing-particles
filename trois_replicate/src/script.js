import * as THREE from 'three'
import Stats from 'stats.js';
import SimplexNoise from 'simplex-noise';
import { SubsurfaceScatteringShader } from "three/examples/jsm/shaders/SubsurfaceScatteringShader";
import { EffectComposer, RenderPass, EffectPass, GodRaysEffect, BloomEffect, SMAAEffect, SMAAImageLoader } from "postprocessing";

import './style.css';

// Improvements
// TODO: When fps is bigger animation is faster
// TODO: Use three native effect composer (mb it will fix bug on borders)

// Optimisation
// TODO: Optimise camera frustum
// TODO: Geometries with same segments count can be reused
// TODO: Instanced mesh can be used
// TODO: GPGPU can be used

/* Helpers */
// Random float from <-range/2, range/2> interval
const randFloatSpread = range => {
    return range * ( 0.5 - Math.random() );
}
// Random integer from <low, high> interval
const randInt = ( low, high ) => {
    return low + Math.floor( Math.random() * ( high - low + 1 ) );
}
// Random float from <low, high> interval
const randFloat = ( low, high ) => {
    return low + Math.random() * ( high - low );
}

// Random cool color
const randColor = (saturation = 100, lightness = 50) => {
    return new THREE.Color().setHSL(
        Math.random(),
        saturation / 100,
        lightness / 100
    );
}

// Compute curl based on simplex noise
const simplex = new SimplexNoise(Math.random);
const computeCurl = (x, y, z) => {
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

/**
 * Global config
 */
const COLOR = new THREE.Color(1, 0.5, 0);
const ROUNDED_TUBES_COUNT = 100;

let IS_TRAIL_MODE = false;

/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl')
// Scene
const scene = new THREE.Scene();
// Render
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

const renderer = new THREE.WebGLRenderer({
    canvas,
    powerPreference: "high-performance", // prefer better GPU if available
    antialias: true,
    stencil: false,
    depth: false
})
renderer.setClearColor(0x000000)
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
// Composer
const composer = new EffectComposer(renderer, {
    multisampling: renderer.capabilities.isWebGL2
});

/**
 * Event listeners
 */
// Helpers
const checkIfMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

let clickTimer = null;
const doubleTapEventHandlerWrapper = (doubleTapCb, singleTapCb) => {
    if (clickTimer === null) {
        clickTimer = setTimeout(() => {
            clickTimer = null
            if (singleTapCb) {
                singleTapCb()
            }
        }, 300);
    } else {
        clearTimeout(clickTimer);
        clickTimer = null;
        if (doubleTapCb) {
            doubleTapCb();
        }
    }
}

const toggleTrailMode = (newState) => {
    IS_TRAIL_MODE = newState;
    pointLight.visible = newState;
    sun.visible = newState;
}

const handleColorChange = () => {
    const newColor = randColor();

    // Update rounded tubes color
    roundedTubeMaterial.uniforms.diffuse.value = newColor;
    roundedTubeMaterial.needsUpdate = true;

    // Update lights
    pointLight.color.set(newColor);
    pointLightBackground.color.set(newColor);

    // Update postprocessing
    sun.material.color = newColor;
    sun.material.needsUpdate = true;
}

const handleToggleFullscreen = () => {
    if (!window.document.fullscreenElement) {
        window.document.documentElement.requestFullscreen();
    } else {
        if (window.document.exitFullscreen) {
            window.document.exitFullscreen();
        }
    }
}

const notifications = checkIfMobileDevice()
    ? [{
        text: 'Touch the screen to create a light',
        width: 320
    }, {
        text: 'While holding move light around the screen',
        width: 372
    }, {
        text: 'To change color double tap',
        width: 264
    }]
    : [{
        text: 'To toggle full screen mode press "f"',
        width: 315
    }, {
        text: 'Click and hold to create a light',
        width: 284
    },{
        text: 'While holding move light around the screen',
        width: 372
    }, {
        text: 'To change color press "c"',
        width: 244
    }];

const notificationElement = document.createElement('div');
notificationElement.classList.add('notification');
document.body.appendChild(notificationElement);

let currentStep = 0;

const showNotificationStep = () => {
    const notificationConfig = notifications[currentStep];
    notificationElement.innerText = notificationConfig.text;
    notificationElement.style.width = `${notificationConfig.width}px`;
}
const finishNotificationStep = (stepIndex) => {
    if (currentStep === stepIndex) {
        if (stepIndex === notifications.length - 1) {
            notificationElement.remove();
        } else {
            currentStep++;
            showNotificationStep();
        }
    }
}


showNotificationStep();


/* Resize */
window.addEventListener('resize', () => {
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    // Update effect composer
    composer.setSize(sizes.width, sizes.height)
})

/* Toggle trail mode */
// Mobile
window.addEventListener('touchstart', () => {
    doubleTapEventHandlerWrapper(
        () => {
            handleColorChange();
            finishNotificationStep(2);
        },
        () => {
            toggleTrailMode(true);
            finishNotificationStep(0);
        }
    )
})
window.addEventListener('touchmove', () => {
    toggleTrailMode(true);
    setTimeout(() => finishNotificationStep(1), 1000);
})
window.addEventListener('touchend', () => toggleTrailMode(false))
window.addEventListener('touchcancel', () => toggleTrailMode(false))

// Desktop
let isHolding = false;
window.addEventListener('mousedown', () => {
    toggleTrailMode(true);
    finishNotificationStep(1);
    isHolding = true;
})
window.addEventListener('mousemove', () => {
    if(isHolding) {
        setTimeout(() => finishNotificationStep(2), 1000);
    }
})
window.addEventListener('mouseup', () => {
    toggleTrailMode(false);
    isHolding = false;
    if (currentStep === 2) {
        currentStep = 1;
        showNotificationStep();
    }
})

// Mobile
/* Full screen */
window.addEventListener("keypress", (e) => {
    if (e.key === 'f') {
        handleToggleFullscreen();
        finishNotificationStep(0);
    }
    if (e.key === 'c') {
        handleColorChange();
        finishNotificationStep(3);
    }
}, false);

/**
 * Objects
 */
/* Rounded tubes */
const roundedTubeMaterial = new THREE.ShaderMaterial( {
    uniforms: {
        ...THREE.UniformsUtils.clone(SubsurfaceScatteringShader.uniforms),
        diffuse: { value: COLOR },  // color of lighted material
        thicknessColor: { value: new THREE.Color(0xffffff) }, // color of translucency
        thicknessDistortion: { value: 0.1 }, // subsurface distortion, shifts the surface normals
        thicknessAmbient: { value: 0.1 }, // translucency that is always visible
        thicknessAttenuation: { value: 0.1 }, // attenuate the translucency  (define per material)
        thicknessPower: { value: 2 }, // value of direct translucency, breaks continuity
        thicknessScale: { value: 10 } // strengthened the translucency (define per light)
    },
    vertexShader: SubsurfaceScatteringShader.vertexShader,
    fragmentShader: SubsurfaceScatteringShader.fragmentShader.replace( // We don't want to use thicknessMap
        'vec3 thickness = thicknessColor * texture2D(thicknessMap, uv).r;',
        `vec3 thickness = thicknessColor;`
    ),
    lights: true // Use scene lights
});

class RoundedTubeMesh {
    constructor(props) {
        const {
            points,
            tubularSegments,
            radius
        } = props;

        this.points = points;
        this.tubularSegments = tubularSegments;
        this.radius = radius;
        this.radialSegments = 12;
        this.attraction = 0.001 + randFloat(0,0.006);
        this.vlimit = 0.025 + randFloat(0, 0.025);
        this.velocity = new THREE.Vector3();
        this.curve = new THREE.CatmullRomCurve3(points);

        this.material = roundedTubeMaterial;
        this.geometry = new THREE.TubeBufferGeometry(
            this.curve,
            tubularSegments,
            radius,
            this.radialSegments,
            false
        );
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;

        // For round ends of tube
        const sphereGeometry = new THREE.SphereGeometry(this.radius, 16, 16);

        this.sphereFirst = new THREE.Mesh(sphereGeometry, this.material);
        this.sphereFirst.position.copy(this.points[0])
        this.sphereFirst.frustumCulled = false;

        this.sphereLast = new THREE.Mesh(sphereGeometry, this.material);
        this.sphereLast.position.copy(this.points[points.length - 1]);
        this.sphereLast.frustumCulled = false;

        this.meshesGroup = new THREE.Object3D();
        this.meshesGroup.add(this.mesh);
        this.meshesGroup.add(this.sphereFirst);
        this.meshesGroup.add(this.sphereLast);
    }
    animate(target, deltaTime) {
        for (let i = this.points.length - 1; i > 0; i--) { // Set for each point previous point position 1 --> 0
            this.points[i].copy(this.points[i - 1]);
        }

        // Make speed independent of fps
        const delta = deltaTime * 60;
        const attraction = this.attraction * delta;
        const vlimit = this.vlimit * delta;

        // Calculate velocity
        let velocity;
        if (IS_TRAIL_MODE) {
            velocity = target.clone().sub(this.points[0]); // target position - first point position vector
        } else {
            const scale = 2;
            velocity = computeCurl(this.points[0].x * scale, this.points[0].y * scale, this.points[0].z * scale);
        }
        velocity.length()
        velocity.normalize(); // Get only direction
        velocity.multiplyScalar(attraction) // Add strength
        this.velocity.add(velocity);
        this.velocity.clampScalar(-vlimit, vlimit);
        this.points[0].add(this.velocity);

        this.update();
    }
    update() {
        // Place spheres on the start and the end of the tube
        this.sphereFirst.position.copy(this.curve.getPoint(0));
        this.sphereLast.position.copy(this.curve.getPoint(1));

        // This is exactly what TubeGeometry constructor does,
        // but we have to recalculate it in order to not recreate geometry from scratch every render
        this.frames = this.curve.computeFrenetFrames(this.tubularSegments, false);
        this.geometry.tangents = this.frames.tangents;
        this.geometry.normals = this.frames.normals;
        this.geometry.binormals = this.frames.binormals;

        this.pArray = this.geometry.attributes.position.array;
        this.nArray = this.geometry.attributes.normal.array;

        // generateBufferData
        for (let i = 0; i < this.tubularSegments + 1; i++) {
            this.updateSegment(i);
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.normal.needsUpdate = true;
    }
    updateSegment(i) {
        // generateSegment
        let P = new THREE.Vector3();
        const normal = new THREE.Vector3();
        const vertex = new THREE.Vector3();

        P = this.curve.getPointAt(i / this.tubularSegments, P);

        const N = this.frames.normals[i];
        const B = this.frames.binormals[i];

        for (let j = 0; j <= this.radialSegments; j++) {
            const v = j / this.radialSegments * Math.PI * 2;

            const sin = Math.sin( v );
            const cos = -Math.cos( v );

            normal.x = ( cos * N.x + sin * B.x );
            normal.y = ( cos * N.y + sin * B.y );
            normal.z = ( cos * N.z + sin * B.z );
            normal.normalize();

            const offset = 3 * (i * (this.radialSegments + 1) + j);

            this.nArray[offset] = normal.x;
            this.nArray[offset + 1] = normal.y;
            this.nArray[offset + 2] = normal.z;

            vertex.x = P.x + this.radius * normal.x;
            vertex.y = P.y + this.radius * normal.y;
            vertex.z = P.z + this.radius * normal.z;

            this.pArray[offset] = vertex.x;
            this.pArray[offset + 1] = vertex.y;
            this.pArray[offset + 2] = vertex.z;
        }
    }
}

const initRoundedTubes = () => {
    const roundedTubes = [];

    for (let t = 0; t < ROUNDED_TUBES_COUNT; t++) {
        const randomPoint = new THREE.Vector3(
            randFloatSpread(10),
            randFloatSpread(10),
            randFloatSpread(5)
        );

        const points = [];
        const tubeSegmentsCount = randInt(10, 35);
        for (let i = 0; i < tubeSegmentsCount; i++) {
            points.push(new THREE.Vector3(
                randomPoint.x,
                randomPoint.y,
                randomPoint.z - 0.05 * i // Add all point for tube along z axis
            ));
        }

        const roundedTube = new RoundedTubeMesh({
            points : points,
            tubularSegments : points.length - 1,
            radius : randFloat(0.01, 0.05)
        });
        roundedTubes.push(roundedTube);

        scene.add(roundedTube.meshesGroup);
    }
    return roundedTubes;
};
const roundedTubes = initRoundedTubes();

/**
 * Camera
 */
const camera = new THREE.PerspectiveCamera(90, sizes.width / sizes.height, 0.1, 100)
camera.position.set(0, 0, 4)
scene.add(camera)

/**
 * Raycaster
 */
const cursor = new THREE.Vector3();

const raycaster = new THREE.Raycaster();
const raycastPlane = new THREE.Mesh(
    new THREE.PlaneBufferGeometry(15, 15)
);

const pointerMove = e => {
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
    } else {
        clientX = e.clientX
        clientY = e.clientY
    }

    const mouse = {
        x: (clientX / window.innerWidth) * 2 - 1,
        y: -(clientY / window.innerHeight) * 2 + 1
    }

    raycaster.setFromCamera( mouse, camera );

    const intersects = raycaster.intersectObjects([raycastPlane]);
    if (intersects.length) {
        const intersectionPoint = intersects[0].point;

        cursor.x = intersectionPoint.x;
        cursor.y = intersectionPoint.y;
    }
}
document.addEventListener('touchmove', pointerMove);
document.addEventListener('mousemove', pointerMove);

/**
 * Lights
 */
const ambientLight = new THREE.AmbientLight(COLOR, 0.25)
scene.add(ambientLight);

const pointLight = new THREE.PointLight(COLOR, 0.8)
pointLight.visible = IS_TRAIL_MODE; // Only once on start
scene.add(pointLight);

/**
 * Postprocessing
 */
composer.addPass(new RenderPass(scene, camera));

const sun = new THREE.Mesh(
    new THREE.SphereBufferGeometry(0.03, 16, 16),
    new THREE.MeshBasicMaterial({ color: COLOR })
)
sun.visible = IS_TRAIL_MODE; // Only once on start
const godRaysPassParams = {
    density : 1.5,
    decay : 0.98,
    weight : .1
}
composer.addPass(new EffectPass(camera, new GodRaysEffect(camera, sun, godRaysPassParams)));

if (!renderer.capabilities.isWebGL2) {
    const smaaImageLoader = new SMAAImageLoader(new THREE.LoadingManager());
    smaaImageLoader.load((ssmaaPassParams) => {
        composer.addPass(new EffectPass(camera, new SMAAEffect(...ssmaaPassParams)));
    });
}

const bloomPassParams = {
    luminanceThreshold : 0.2,
    luminanceSmoothing : 0.1,
    intensity : 1.5
};
composer.addPass(new EffectPass(camera, new BloomEffect(bloomPassParams)));

/**
 * Animate
 */
const clock = new THREE.Clock();
clock.start();

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild( stats.dom );

const tick = () => {
    stats.begin();
    // Lights
    if (IS_TRAIL_MODE) {
        pointLight.position.x = cursor.x;
        pointLight.position.y = cursor.y;

        sun.position.x = cursor.x;
        sun.position.y = cursor.y;
        sun.position.z = -0.1;

        sun.updateMatrix();
    }

    // Tubes
    const deltaTime = clock.getDelta();
    roundedTubes.forEach(tube => {
        tube.animate(cursor, deltaTime);
    })

    // Render
    composer.render();

    stats.end();
    // Call tick again on the next frame
    window.requestAnimationFrame(tick)
}
tick()