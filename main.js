import * as THREE from 'three';

import mediaRaw from './mediaList.json' assert { type: 'json' };
const media = mediaRaw.sort(() => Math.random() - 0.5);



let mouseX = 0;
let mouseY = 0;

const raycaster = new THREE.Raycaster();
const clickMouse = new THREE.Vector2();
let selectedCard = null;

const scene = new THREE.Scene();
//scene.fog = new THREE.Fog(0xa0a0a0, 0, 1);

const camera = new THREE.PerspectiveCamera(135, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.y = 20;
camera.position.z = 1;





const spotlight = new THREE.SpotLight(0xffffff, 200, 20, 1.65, .6);
spotlight.position.set(0, 10, 0);
spotlight.target.position.set(0, -2, -4);
spotlight.intensity = 0;
const targetIntensity = 500; // ✅ your desired final intensity
scene.add(spotlight);
scene.add(spotlight.target);



const textureLoader = new THREE.TextureLoader();
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
document.body.appendChild(renderer.domElement);

let scrollPosY = 0.0;
const rootNode = new THREE.Object3D();
scene.add(rootNode);

//add headerVideo
const section = document.querySelector('section.vid');
const vid = section.querySelector('video');
const vidHolder = section.querySelector('div.holder'); // ✅ query from section
vid.pause();


//add video
const container = document.getElementById('container');
const topVideo = document.getElementById('video');
topVideo.pause();

const topGeo = new THREE.BoxGeometry(6, 6, .01);

const topTexture = new THREE.VideoTexture(topVideo);
topTexture.colorSpace = THREE.SRGBColorSpace;
const vMat = new THREE.MeshBasicMaterial({ map: topTexture });

const topMesh = new THREE.Mesh(topGeo, vMat);
topMesh.position.z = -4;
//scene.add(topMesh);

//get size of image array

let mediaSize = media.length;
let rows = 4;
let count = Math.floor(mediaSize / rows);

const baseNodes = [];
//console.log(imgSize);
for (let j = 0; j < rows; j++) {
    for (let i = 0; i < count; i++) {

        const item = media[i + (j * count)];
        let texture, imgW, imgH;

        if (item.type === 'image') {
            texture = await textureLoader.loadAsync(item.src);
            imgW = texture.image.width;
            imgH = texture.image.height;
        } else {
            const videoEl = document.createElement('video');
            videoEl.src = item.src;
            videoEl.loop = true;
            videoEl.muted = true;
            videoEl.playsInline = true;
            videoEl.autoplay = true;
            videoEl.play();
            texture = new THREE.VideoTexture(videoEl);
            texture.colorSpace = THREE.SRGBColorSpace;
            await new Promise(resolve => videoEl.addEventListener('loadedmetadata', resolve, { once: true }));
            imgW = videoEl.videoWidth;
            imgH = videoEl.videoHeight;
        }

        const aspect = imgW / imgH;
        const maxSize = 3;
        let clampedW, clampedH;
        if (imgW > imgH) {
            clampedW = maxSize;
            clampedH = maxSize / aspect;
        } else {
            clampedH = maxSize;
            clampedW = maxSize * aspect;
        }

        const material = item.type === 'video'
            ? new THREE.MeshStandardMaterial({ map: texture })
            : new THREE.MeshStandardMaterial({ map: texture });

        const baseNode = new THREE.Object3D();
        let spacing = 5;
        baseNode.position.x = (i * spacing) - ((count / 2) * spacing);
        baseNode.position.y = (j * spacing) - ((rows / 2) * spacing);
        baseNode.originalX = baseNode.position.x;
        baseNode.originalY = baseNode.position.y;
        baseNodes.push(baseNode);
        rootNode.add(baseNode);

        const cardA = new THREE.Mesh(
            new THREE.BoxGeometry(clampedW, clampedH, .01),
            material
        );
        cardA.position.z = -4.0;
        baseNode.add(cardA);

    }
}
//framed index of card

function frameCard(clickedPos) {
    //camera.position = clickedPos;
}

function animate() {
    // Get the visible width at z = -4 (where cards sit)
    const fov = camera.fov * (Math.PI / 180);
    const distance = Math.abs(camera.position.z - (-4));
    const visibleWidth = 2 * Math.tan(fov / 2) * distance * camera.aspect;
    const visibleHeight = visibleWidth / camera.aspect;

    camera.position.y = THREE.MathUtils.lerp(camera.position.y, scrollPosY, 0.1);

    baseNodes.forEach((node) => {
        const card = node.children[0];
        const isSelected = card === selectedCard;

        const normalizedX = (node.originalX / (visibleWidth / 2)) - mouseX;
        const normalizedY = (node.position.y / (visibleHeight / 2)) - mouseY;
        const maxRotation = Math.PI / 6;

        if (isSelected) {
            // Lerp rotation to flat
            node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, 0, 0.1);
            node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, 0, 0.1);
            // Lerp position to center
            node.position.x = THREE.MathUtils.lerp(node.position.x, 0, 0.1);
            node.position.y = THREE.MathUtils.lerp(camera.position.y, 0, 0.1);
            card.position.z = THREE.MathUtils.lerp(card.position.z, 0.0, 0.1);
        } else {
            // Normal edge rotation behaviour
            node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, normalizedX * maxRotation, 0.1);
            node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, -normalizedY * maxRotation, 0.1);
            node.position.x = THREE.MathUtils.lerp(node.position.x, node.originalX - (node.originalX * Math.abs(normalizedX) * 0.3), 0.1);
            node.position.y = THREE.MathUtils.lerp(node.position.y, node.originalY, 0.1);
            card.position.z = THREE.MathUtils.lerp(card.position.z, -4.0, 0.1);
        }
    });
    //move camera according to scroll
    renderer.render(scene, camera, spotlight);
    //topVideo.duration


    



}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("click", (ev) => {
    const raycaster = new THREE.Raycaster();

    const mouseNDC = new THREE.Vector2(
        (ev.clientX/window.innerWidth)*2 -1,
        -(ev.clientY/window.innerHeight)*2 +1
    );

    raycaster.setFromCamera(mouseNDC, camera);
    const intersections = raycaster.intersectObject(rootNode, true);
    if (intersections.length > 0) {
        //get the position of intersection
        //frameCard(intersections[0].object.position);
        console.log(intersections[0].object.position);
    }
});

window.addEventListener("scroll", (event) => {
    const scrollY = window.scrollY;
    const sectionHeight = section.offsetHeight; // ✅ use section, not vidHolder
    const sectionTop = section.offsetTop;
    const total = document.body.clientHeight;

    // Scrub video
    const vidProgress = Math.min(Math.max(scrollY / total, 0), 1);
    vid.currentTime = vid.duration * vidProgress;

    // Fade holder
    const fadeStart = sectionTop + sectionHeight * 0.7;
    const fadeEnd = sectionTop + sectionHeight*.9;
    const fadeProgress = Math.min(Math.max((scrollY - fadeStart) / (fadeEnd - fadeStart), 0), 1);
    vidHolder.style.opacity = 1 - fadeProgress;

    const cameraStart = 0.5;  // start moving at 50% of page
    const cameraEnd = 1.0;    // stop moving at 100% of page

    const pageProgress = scrollY / total;
    const cameraProgress = Math.min(Math.max((pageProgress - cameraStart) / (cameraEnd - cameraStart), 0), 1);
    scrollPosY = 10+ (-cameraProgress * 20); // 50 = total units to travel

    const spotStart = 0.3;
    const spotEnd = 0.6;
    const spotProgress = Math.min(Math.max((pageProgress - spotStart) / (spotEnd - spotStart), 0), 1);
    spotlight.intensity = spotProgress * targetIntensity;

});

window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    mouseY = -(e.clientY / window.innerHeight) * 2 + 1;

    const lightRange = 20;
    spotlight.position.x = mouseX * lightRange;
    spotlight.position.y = mouseY * lightRange;
    spotlight.position.z = 10;
});

window.addEventListener('click', (e) => {
    clickMouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    clickMouse.y = -(e.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(clickMouse, camera);
    const intersects = raycaster.intersectObjects(rootNode.children, true);

    if (intersects.length > 0) {
        const clicked = intersects[0].object;
        // toggle — click again to send it back
        if (selectedCard === clicked) {
            selectedCard = null;
        } else {
            selectedCard = clicked;
        }
    } else {
        selectedCard = null;
    }
});
