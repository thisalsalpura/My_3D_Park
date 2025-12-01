import React, { useEffect, useRef, useState } from "react";
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(sizes.width, sizes.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    const hemi = new THREE.HemisphereLight(0xFFFFFF, 0x444444, 1.2);
    scene.add(hemi);

    const dir = new THREE.DirectionalLight(0xFFFFFF, 1.8);
    dir.castShadow = true;
    dir.position.set(50, 50, 0);
    dir.target.position.set(0, 0, 0);
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.camera.left = -100;
    dir.shadow.camera.right = 100;
    dir.shadow.camera.top = 100;
    dir.shadow.camera.bottom = -100;
    dir.shadow.normalBias = 0.25;
    scene.add(dir);

    const aspect = sizes.width / sizes.height;

    const camera = new THREE.OrthographicCamera(-aspect * 50, aspect * 50, 50, -50, 1, 1000);
    camera.position.set(24, 16, -50);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;

    let character = {
      instance: null,
      moveDistance: 3,
      jumpHeight: 1,
      isMoving: false,
      moveDuration: 0.2,
      bbox: new THREE.Box3(),
      footOffset: 0
    };

    let groundMesh = null;
    const colliders = [];

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
      if (wallpaper) setSelectedWallpaper(wallpaper);
    };

    const buildCollidersFromMergedMesh = (
      mesh,
      {
        cellSize = 0.5,
        minCellsPerCluster = 3,
        heightAboveGround = 0.05,
        expand = 0.1,
        debug = false
      } = {}
    ) => {
      mesh.updateWorldMatrix(true, false);

      const geom = mesh.geometry;
      if (!geom || !geom.attributes || !geom.attributes.position) return [];

      const posAttr = geom.attributes.position;
      const vertexCount = posAttr.count;

      const meshBox = new THREE.Box3().setFromObject(mesh);
      const minY = meshBox.min.y;

      const minX = meshBox.min.x;
      const minZ = meshBox.min.z;

      const grid = new Map();
      const worldPos = new THREE.Vector3();

      for (let i = 0; i < vertexCount; i++) {
        worldPos.set(
          posAttr.getX(i),
          posAttr.getY(i),
          posAttr.getZ(i)
        );

        mesh.localToWorld(worldPos);

        if (worldPos.y < minY + heightAboveGround) continue;

        const ix = Math.floor((worldPos.x - minX) / cellSize);
        const iz = Math.floor((worldPos.z - minZ) / cellSize);
        const key = `${ix},${iz}`;

        if (!grid.has(key)) grid.set(key, { pts: [], ix, iz });
        grid.get(key).pts.push(worldPos.clone());
      }

      if (grid.size === 0) return [];

      const visited = new Set();
      const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      const clusters = [];

      for (const [key, cell] of grid.entries()) {
        if (visited.has(key)) continue;
        visited.add(key);

        const queue = [cell];
        let clusterCells = [cell];

        while (queue.length) {
          const c = queue.shift();
          for (const n of neighbors) {
            const nk = `${c.ix + n[0]},${c.iz + n[1]}`;

            if (!visited.has(nk) && grid.has(nk)) {
              visited.add(nk);
              const nc = grid.get(nk);
              queue.push(nc);
              clusterCells.push(nc);
            }
          }
        }

        if (clusterCells.length >= minCellsPerCluster) {
          const box = new THREE.Box3();
          let first = true;
          for (const cc of clusterCells) {
            for (const p of cc.pts) {
              if (first) {
                box.min.copy(p); box.max.copy(p); first = false;
              } else {
                box.expandByPoint(p);
              }
            }
          }

          box.min.x -= expand; box.min.y -= expand; box.min.z -= expand;
          box.max.x += expand; box.max.y += expand; box.max.z += expand;

          clusters.push(box);
        }
      }

      return clusters;
    }

    const loader = new GLTFLoader();
    loader.load(myPortfolio, function (glb) {
      glb.scene.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (child.material) {
            child.material.needsUpdate = true;
            child.material.envMapIntensity = 0.5;
          }
        }

        if (intersectObjectNames.includes(child.name)) {
          intersectObjects.push(child);
          colliders.push(new THREE.Box3().setFromObject(child));
        }

        if (child.name === "Level_1") {
          groundMesh = child;

          const boxes = buildCollidersFromMergedMesh(child, {
            cellSize: 0.6,
            minCellsPerCluster: 2,
            heightAboveGround: 0.04,
            expand: 0.08,
            debug: true
          });

          for (const b of boxes) colliders.push(b);
        }

        if (child.name === "Man") {
          character.instance = child;
          child.updateWorldMatrix(true, true);
        }
      });

      scene.add(glb.scene);

      if (character.instance) {
        const charBox = new THREE.Box3().setFromObject(character.instance);
        character.bbox.copy(charBox);
        character.footOffset = charBox.min.y - character.instance.position.y;

        const start = character.instance.position.clone();
        start.y += 200;
        raycaster.set(start, new THREE.Vector3(0, -1, 0));

        if (groundMesh) {
          const hits = raycaster.intersectObject(groundMesh, true);
          if (hits.length > 0) {
            character.instance.position.y = hits[0].point.y - character.footOffset;
          } else {
            character.instance.position.y = -character.footOffset;
          }
        } else {
          character.instance.position.y = -character.footOffset;
        }

        character.bbox.setFromObject(character.instance);
      }
    }, undefined, function (err) {
      console.error(err);
    });

    const getGroundYAt = (x, z) => {
      if (!groundMesh) return null;

      const start = new THREE.Vector3(x, 1000, z);
      raycaster.set(start, new THREE.Vector3(0, -1, 0));

      const hits = raycaster.intersectObject(groundMesh, true);
      if (hits.length > 0) return hits[0].point.y;

      return null;
    };

    const handleMoveCharacter = (targetPosition, targetRotation) => {
      if (!character.instance) return;

      const groundY = getGroundYAt(targetPosition.x, targetPosition.z);
      if (groundY === null) {
        gsap.to(character.instance.position, { y: character.instance.position.y + 0.25, duration: 0.12, yoyo: true, repeat: 1 });
        return;
      }

      targetPosition.y = groundY - character.footOffset;

      const maxStep = 1.0;
      if (Math.abs(targetPosition.y - character.instance.position.y) > maxStep) {
        gsap.to(character.instance.position, { y: character.instance.position.y + 0.25, duration: 0.12, yoyo: true, repeat: 1 });
        return;
      }

      const currentBox = new THREE.Box3().setFromObject(character.instance);
      const translation = new THREE.Vector3(targetPosition.x - character.instance.position.x, targetPosition.y - character.instance.position.y, targetPosition.z - character.instance.position.z);
      const futureBox = currentBox.clone().translate(translation);

      const colliding = colliders.some(b => b instanceof THREE.Box3 ? futureBox.intersectsBox(b) : false);

      if (colliding) {
        gsap.to(character.instance.position, { y: character.instance.position.y + 0.25, duration: 0.12, yoyo: true, repeat: 1 });
        return;
      }

      character.isMoving = true;
      const rotationDiff = ((((targetRotation - character.instance.rotation.y) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      const finalRotation = character.instance.rotation.y + rotationDiff;

      const timeline = gsap.timeline({
        onComplete: () => {
          character.isMoving = false
        }
      });

      timeline.to(character.instance.position, {
        x: targetPosition.x,
        z: targetPosition.z,
        y: targetPosition.y,
        duration: character.moveDuration,
        onUpdate: () => { character.bbox.setFromObject(character.instance); }
      }, 0);

      timeline.to(character.instance.rotation, {
        y: finalRotation,
        duration: character.moveDuration
      }, 0);

      timeline.to(character.instance.position, {
        y: character.instance.position.y + character.jumpHeight,
        duration: character.moveDuration / 2,
        yoyo: true,
        repeat: 1
      }, 0);
    };

    const handleResize = () => {
      sizes.width = window.innerWidth; sizes.height = window.innerHeight;
      const aspect2 = sizes.width / sizes.height;
      camera.left = -aspect2 * 50; camera.right = aspect2 * 50;
      camera.updateProjectionMatrix();

      renderer.setSize(sizes.width, sizes.height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    const handlePointerMove = (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    const handleClick = () => {
      if (intersectObject) showModal(intersectObject);
    };

    const handleKeyDown = (event) => {
      if (!character.instance) return;
      if (character.isMoving) return;

      const targetPosition = character.instance.position.clone();
      let targetRotation = 0;

      switch (event.key.toLowerCase()) {
        case "w":
        case "arrowup":
          targetPosition.z += character.moveDistance; targetRotation = 0;
          break;
        case "a":
        case "arrowleft":
          targetPosition.x += character.moveDistance; targetRotation = -Math.PI / 2;
          break;
        case "s":
        case "arrowdown":
          targetPosition.z -= character.moveDistance; targetRotation = Math.PI;
          break;
        case "d":
        case "arrowright":
          targetPosition.x -= character.moveDistance; targetRotation = Math.PI / 2;
          break;
        default:
          return;
      }

      handleMoveCharacter(targetPosition, targetRotation);
    };

    window.addEventListener("resize", handleResize);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("click", handleClick);
    window.addEventListener("keydown", handleKeyDown);

    const animate = () => {
      raycaster.setFromCamera(pointer, camera);

      const intersects = raycaster.intersectObjects(intersectObjects, true);
      if (intersects.length > 0) {
        document.body.style.cursor = "pointer";

        let foundName = null;
        for (let i = 0; i < intersects.length; i++) {
          let obj = intersects[i].object;
          while (obj && !intersectObjectNames.includes(obj.name) && obj.parent) obj = obj.parent;
          if (obj && intersectObjectNames.includes(obj.name)) { foundName = obj.name; break; }
        }

        intersectObject = foundName;
      } else {
        document.body.style.cursor = "default";
        intersectObject = null;
      }

      if (character.instance) character.bbox.setFromObject(character.instance);

      controls.update();
      renderer.render(scene, camera);
    };

    renderer.setAnimationLoop(animate);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKeyDown);

      renderer.setAnimationLoop(null);
      controls.dispose();

      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach(m => {
                m.map?.dispose();
                m.dispose();
              });
            } else {
              obj.material.map?.dispose();
              obj.material.dispose();
            }
          }
        }
      });

      scene.clear();
      renderer.dispose();
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
