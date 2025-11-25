import React, { useEffect, useRef, useState } from "react";
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { Octree } from "three/addons/math/Octree.js";
import { Capsule } from "three/addons/math/Capsule.js";
import myPortfolio from "./assets/glbs/My-Portfolio.glb";
import { wallpapers } from "./constants";
import gsap from "gsap";
import './style.css';

export default function App() {

  const canvasRef = useRef(null);

  const [selectedWallpaper, setSelectedWallpaper] = useState(null);

  useEffect(() => {
    const scene = new THREE.Scene();

    const canvas = canvasRef.current;
    if (!canvas) return;

    const sizes = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    const raycaster = new THREE.Raycaster();

    const pointer = new THREE.Vector2();

    THREE.ColorManagement.enabled = true;

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    // new RGBELoader().load("/hdr/studio.hdr", (hdr) => {
    //   const pmrem = new THREE.PMREMGenerator(renderer);
    //   const envMap = pmrem.fromEquirectangular(hdr).texture;

    //   scene.environment = envMap;
    //   scene.background = new THREE.Color(0x0d0d0d);

    //   scene.environmentIntensity = 0.5;

    //   hdr.dispose();
    //   pmrem.dispose();
    // });

    const GRAVITY = 30;
    const CAPSULE_RADIUS = 0.35;
    const CAPSULE_HEIGHT = 1;
    const JUMP_HEIGHT = 10;
    const MOVE_SPEED = 5;

    let character = {
      instance: null,
      isMoving: false
    };

    const colliderOctree = new Octree();
    const playerCollider = new Capsule(
      new THREE.Vector3(0, CAPSULE_RADIUS, 0),
      new THREE.Vector3(0, CAPSULE_HEIGHT, 0),
      CAPSULE_RADIUS
    );

    let targetRotation = 0;
    let playerVelocity = new THREE.Vector3();
    let playerOnFloor = false;

    let intersectObject = null;
    const intersectObjects = [];
    const intersectObjectNames = [
      "Board_1",
      "Board_2",
      "Board_3",
      "Board_4",
      "Board_5",
      "Board_6"
    ];

    const showModal = (name) => {
      const wallpaper = wallpapers[name];
      if (wallpaper) {
        setSelectedWallpaper(wallpaper);
      }
    };

    const loader = new GLTFLoader();
    loader.load(myPortfolio, function (glb) {
      glb.scene.traverse((child) => {
        if (intersectObjectNames.includes(child.name)) {
          intersectObjects.push(child);
        }

        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.material) {
            child.material.needsUpdate = true;
          }
        }

        if (child.name === "Man") {
          character.instance = child;
          playerCollider.start.copy(child.position).add(new THREE.Vector3(0, CAPSULE_RADIUS, 0));
          playerCollider.end.copy(child.position).add(new THREE.Vector3(0, CAPSULE_HEIGHT, 0));
        }

        if (child.name === "Level_1") {
          colliderOctree.fromGraphNode(child);
        }
      });

      scene.add(glb.scene);
    }, undefined, function (error) {
      console.error(error);
    });

    const hemi = new THREE.HemisphereLight(0xFFFFFF, 0x444444, 1.2);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xFFFFFF, 1.8);
    dir.castShadow = true;
    dir.position.set(50, 50, 0);
    dir.target.position.set(0, 0, 0);
    dir.shadow.mapSize.width = 4096;
    dir.shadow.mapSize.height = 4096;
    dir.shadow.camera.left = -100;
    dir.shadow.camera.right = 100;
    dir.shadow.camera.top = 100;
    dir.shadow.camera.bottom = -100;
    dir.shadow.normalBias = 0.25;
    scene.add(dir);

    const dirHelper = new THREE.DirectionalLightHelper(dir, 5);
    scene.add(dirHelper);

    const shadowHelper = new THREE.CameraHelper(dir.shadow.camera);
    scene.add(shadowHelper);

    const aspect = sizes.width / sizes.height;

    const camera = new THREE.OrthographicCamera(-aspect * 50, aspect * 50, 50, -50, 1, 1000);
    camera.position.x = 24;
    camera.position.y = 16;
    camera.position.z = -50;

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    const handleResize = () => {
      sizes.width = window.innerWidth;
      sizes.height = window.innerHeight;

      const aspect = sizes.width / sizes.height;
      camera.left = -aspect * 50;
      camera.right = aspect * 50;
      camera.updateProjectionMatrix();

      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    const handlePointerMove = (event) => {
      pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };

    const handleClick = () => {
      if (intersectObject != null) {
        showModal(intersectObject);
      }
    };

    const handleKeyDown = (event) => {
      if (character.isMoving) return;

      switch (event.key.toLowerCase()) {
        case "w":
        case "arrowup":
          playerVelocity.z += MOVE_SPEED;
          targetRotation = 0;
          break;
        case "a":
        case "arrowleft":
          playerVelocity.x += MOVE_SPEED;
          targetRotation = -Math.PI / 2;
          break;
        case "s":
        case "arrowdown":
          playerVelocity.z -= MOVE_SPEED;
          targetRotation = Math.PI;
          break;
        case "d":
        case "arrowright":
          playerVelocity.x -= MOVE_SPEED;
          targetRotation = Math.PI / 2;
          break;
        default:
          return;
      };

      playerVelocity.y = JUMP_HEIGHT;
      character.isMoving = true;
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);

    const playerCollisions = () => {
      const result = colliderOctree.capsuleIntersect(playerCollider);
      playerOnFloor = false;

      if (result) {
        playerOnFloor = result.normal.y > 0;
        playerCollider.translate(result.normal.multiplyScalar(result.depth));

        if (playerOnFloor) {
          character.isMoving = false;
          playerVelocity.x = 0;
          playerVelocity.z = 0;
        }
      }
    };

    const updatePlayer = () => {
      if (!character.instance) return;

      if (!playerOnFloor) {
        playerVelocity.y -= GRAVITY * 0.035;
      }

      playerCollider.translate(playerVelocity.clone().multiplyScalar(0.035));

      playerCollisions();

      character.instance.position.copy(playerCollider.start);
      character.instance.position.y -= CAPSULE_RADIUS;

      let rotationDiff = ((((targetRotation - character.instance.rotation.y) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      let finalRotation = character.instance.rotation.y + rotationDiff;

      character.instance.rotation.y = THREE.MathUtils.lerp(
        character.instance.rotation.y,
        finalRotation,
        0.4
      );
    };

    const animate = () => {
      updatePlayer();

      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(intersectObjects);

      if (intersects.length > 0) {
        document.body.style.cursor = "pointer";
      } else {
        document.body.style.cursor = "default";
        intersectObject = null;
      }

      for (let i = 0; i < intersects.length; i++) {
        intersectObject = intersects[0].object.parent.name;
      }

      controls.update();

      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      scene.clear();
    };
  }, []);

  return (
    <>
      <div className="fixed h-screen w-screen top-0 left-0 overflow-hidden">
        <canvas ref={canvasRef} className="h-screen w-screen"></canvas>
      </div>

      {selectedWallpaper && (
        <div key={selectedWallpaper.id} className="absolute bg-amber-800 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-auto w-full max-w-[700px] border-2 border-white z-50">
          <div className="h-full w-full flex flex-col justify-between items-center p-4 gap-10">
            <div className="h-auto w-full flex flex-row justify-between items-center gap-4">
              <h1 className="text-black text-2xl">{selectedWallpaper.title}</h1>
              <button className="bg-white text-black px-2 py-0.5 border-2 border-black cursor-pointer" onClick={() => setSelectedWallpaper(null)}>Exit</button>
            </div>

            <div className="h-auto w-full flex flex-col justify-center items-center gap-4">
              <p className="text-black text-center">{selectedWallpaper.description}</p>
              <a href={selectedWallpaper.link} target="_blank" rel="noopener noreferrer" className="h-auto w-full bg-white text-black text-center text-lg px-2 py-1 border-2 border-black cursor-pointer">View Wallpaper</a>
            </div>
          </div>
        </div>
      )};
    </>
  );
}
