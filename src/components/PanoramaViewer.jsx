import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const SceneView = () => {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 0.1;
    controls.maxDistance = 100;
    controls.enablePan = true;
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;

    // Add grid helpers on all axes
    const size = 10;
    const divisions = 10;

    const gridXY = new THREE.GridHelper(size, divisions);
    scene.add(gridXY);

    const gridYZ = new THREE.GridHelper(size, divisions);
    gridYZ.rotation.z = Math.PI / 2;
    scene.add(gridYZ);

    const gridZX = new THREE.GridHelper(size, divisions);
    gridZX.rotation.x = Math.PI / 2;
    scene.add(gridZX);

    // Axes helper
    const axesHelper = new THREE.AxesHelper(10);
    scene.add(axesHelper);

    // Create a large transparent sphere
    const sphereGeometry = new THREE.SphereGeometry(5, 64, 64);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aa88,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Create a video element for the camera feed
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.autoplay = true;
    video.muted = true;

    // Request user media from the device's back camera
    navigator.mediaDevices
      .getUserMedia({ 
        video: { facingMode: { exact: 'environment' } }, 
        audio: false 
      })
      .then((stream) => {
        video.srcObject = stream;
        video.play();
      })
      .catch((err) => {
        console.error('Error accessing back camera: ', err);
      });

    // Create a texture from the video
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;

    // Create a small plane geometry to display the camera feed
    const planeWidth = 1;
    const planeHeight = 0.75; 
    const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
    const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Place the plane on the inner surface of the sphere
    const sphereRadius = 5;
    const offsetFromSurface = 0.01; 
    videoPlane.position.set(0, 0, -sphereRadius + offsetFromSurface);

    // Rotate plane 180 degrees on Y to face inward toward the camera
    videoPlane.rotation.y = Math.PI; 
    scene.add(videoPlane);

    // Handle window resize
    const onWindowResize = () => {
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', onWindowResize, false);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', onWindowResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}
    >
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
    </div>
  );
};

export default SceneView;









// import React, { useRef, useEffect } from "react";
// import * as THREE from "three";
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// const MultiImageSphere = () => {
//   const mountRef = useRef(null);

//   useEffect(() => {
//     const mount = mountRef.current;

//     // Scene, Camera, Renderer
//     const scene = new THREE.Scene();
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       window.innerWidth / window.innerHeight,
//       0.1,
//       1000
//     );
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     mount.appendChild(renderer.domElement);

//     // Create Canvas
//     const canvas = document.createElement("canvas");
//     const canvasSize = 1024; // Canvas size
//     const gridSize = 6; // Lower grid size for larger images
//     canvas.width = canvasSize;
//     canvas.height = canvasSize;
//     const ctx = canvas.getContext("2d");

//     // Helper function to load images
//     const loadImage = (src) => {
//       return new Promise((resolve) => {
//         const img = new Image();
//         img.crossOrigin = "anonymous"; // Avoid CORS issues
//         img.onload = () => resolve(img);
//         img.src = src;
//       });
//     };

//     // Draw Images on Canvas
//     const drawImagesOnCanvas = async () => {
//       const image = await loadImage("https://images.pexels.com/photos/290595/pexels-photo-290595.jpeg");

//       const imageWidth = canvas.width / gridSize;
//       const imageHeight = canvas.height / gridSize;

//       // You can adjust the image size here directly by scaling the image width and height
//       const scaledWidth = imageWidth * 1.5; // Increase size by 1.5 times
//       const scaledHeight = imageHeight * 1.5; // Increase size by 1.5 times

//       // Fill the canvas with larger images in a grid pattern
//       for (let row = 0; row < gridSize; row++) {
//         for (let col = 0; col < gridSize; col++) {
//           ctx.drawImage(
//             image,
//             col * imageWidth, // X position
//             row * imageHeight, // Y position
//             scaledWidth, // Image width (scaled)
//             scaledHeight // Image height (scaled)
//           );
//         }
//       }
//     };

//     // Sphere with canvas texture
//     const sphereGeometry = new THREE.SphereGeometry(500, 60, 40);
//     sphereGeometry.scale(-1, 1, 1); // Invert the sphere
//     const sphereMaterial = new THREE.MeshBasicMaterial({
//       map: new THREE.CanvasTexture(canvas),
//     });
//     const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//     scene.add(sphere);

//     // Orbit Controls
//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableZoom = true;
//     camera.position.set(0, 0, 0.1);

//     // Draw images and update texture
//     drawImagesOnCanvas().then(() => {
//       sphereMaterial.map.needsUpdate = true;
//     });

//     // Handle Window Resize
//     const onWindowResize = () => {
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(window.innerWidth, window.innerHeight);
//     };
//     window.addEventListener("resize", onWindowResize);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);
//     };
//     animate();

//     // Cleanup
//     return () => {
//       mount.removeChild(renderer.domElement);
//       window.removeEventListener("resize", onWindowResize);
//     };
//   }, []);

//   return (
//     <div style={{ position: "relative", width: "100%", height: "100vh" }}>
//       <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
//     </div>
//   );
// };

// export default MultiImageSphere;











// import React, { useRef, useEffect } from "react";
// import * as THREE from "three";
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// const Teleport360Camera = () => {
//   const mountRef = useRef(null);

//   useEffect(() => {
//     const mount = mountRef.current;

//     // Scene, Camera, Renderer
//     const scene = new THREE.Scene();
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       window.innerWidth / window.innerHeight,
//       0.1,
//       1000
//     );
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     mount.appendChild(renderer.domElement);

//     // Main panoramic sphere
//     const textureLoader = new THREE.TextureLoader();
//     const panoramaTexture = textureLoader.load("https://img.freepik.com/free-vector/elegant-white-background-with-shiny-lines_1017-17580.jpg");
//     const panoramaGeometry = new THREE.SphereGeometry(500, 60, 40);
//     panoramaGeometry.scale(-1, 1, 1); // Invert the sphere
//     const panoramaMaterial = new THREE.MeshBasicMaterial({ map: panoramaTexture });
//     const panoramaSphere = new THREE.Mesh(panoramaGeometry, panoramaMaterial);
//     scene.add(panoramaSphere);

//     // Overlay smaller sphere for texture
//     const overlayTexture = textureLoader.load("https://img.freepik.com/free-vector/elegant-white-background-with-shiny-lines_1017-17580.jpg");
//     const overlayGeometry = new THREE.SphereGeometry(100, 32, 32); // Smaller sphere
//     const overlayMaterial = new THREE.MeshBasicMaterial({
//       map: overlayTexture,
//       transparent: true, // Allows transparency if the image has an alpha channel
//     });
//     const overlaySphere = new THREE.Mesh(overlayGeometry, overlayMaterial);
//     overlaySphere.position.set(0, 0, 300); // Position in front of the camera
//     scene.add(overlaySphere);

//     // Hotspots for Navigation
//     const createHotspot = (position, newTexture) => {
//       const hotspot = new THREE.Mesh(
//         new THREE.SphereGeometry(2, 32, 32),
//         new THREE.MeshBasicMaterial({ color: 0xff0000 }) // Red color
//       );
//       hotspot.position.set(...position);
//       scene.add(hotspot);

//       hotspot.callback = () => {
//         const texture = textureLoader.load(newTexture);
//         overlayMaterial.map = texture;
//         overlayMaterial.needsUpdate = true;
//       };
//       return hotspot;
//     };

//     const hotspots = [
//       createHotspot([50, 20, 400], "https://images.pexels.com/photos/290595/pexels-photo-290595.jpeg"),
//       createHotspot([-100, 50, -400], "https://c8.alamy.com/comp/B9J677/panaro-river-vignola-modena-italy-B9J677.jpg"),
//     ];

//     // Add Interaction for Hotspots
//     const raycaster = new THREE.Raycaster();
//     const mouse = new THREE.Vector2();

//     const onMouseClick = (event) => {
//       mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
//       mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

//       raycaster.setFromCamera(mouse, camera);
//       const intersects = raycaster.intersectObjects(hotspots);
//       if (intersects.length > 0) {
//         intersects[0].object.callback();
//       }
//     };
//     window.addEventListener("click", onMouseClick);

//     // Orbit Controls
//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableZoom = false;
//     controls.enablePan = false;
//     camera.position.set(0, 0, 0.1);

//     // Handle Window Resize
//     const onWindowResize = () => {
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(window.innerWidth, window.innerHeight);
//     };
//     window.addEventListener("resize", onWindowResize);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);
//     };
//     animate();

//     // Cleanup
//     return () => {
//       mount.removeChild(renderer.domElement);
//       window.removeEventListener("resize", onWindowResize);
//       window.removeEventListener("click", onMouseClick);
//     };
//   }, []);

//   return (
//     <div style={{ position: "relative", width: "100%", height: "100vh" }}>
//       <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
//     </div>
//   );
// };

// export default Teleport360Camera;













// import React, { useRef, useEffect, useState } from "react";
// import * as THREE from "three";
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// const Teleport360Camera = () => {
//   const mountRef = useRef(null);
//   const [currentTexture, setCurrentTexture] = useState("/360-image-1.jpg");

//   useEffect(() => {
//     const mount = mountRef.current;

//     // Scene, Camera, Renderer
//     const scene = new THREE.Scene();
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       window.innerWidth / window.innerHeight,
//       0.1,
//       1000
//     );
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     mount.appendChild(renderer.domElement);

//     // Load Initial Panorama
//     const textureLoader = new THREE.TextureLoader();
//     const geometry = new THREE.SphereGeometry(500, 60, 40);
//     geometry.scale(-1, 1, 1); // Invert sphere

//     let sphereMaterial = new THREE.MeshBasicMaterial({
//       map: textureLoader.load(currentTexture),
//     });
//     const sphere = new THREE.Mesh(geometry, sphereMaterial);
//     scene.add(sphere);

//     // Hotspots for Navigation
//     const createHotspot = (position, newTexture) => {
//       const hotspot = new THREE.Mesh(
//         new THREE.SphereGeometry(2, 32, 32),
//         new THREE.MeshBasicMaterial({ color: 0xff0000 }) // Red color
//       );
//       hotspot.position.set(...position);
//       scene.add(hotspot);

//       hotspot.callback = () => {
//         const texture = textureLoader.load(newTexture);
//         sphereMaterial.map = texture;
//         sphereMaterial.needsUpdate = true;
//       };
//       return hotspot;
//     };

//     const hotspots = [
//       createHotspot([50, 20, 400], "https://images.pexels.com/photos/290595/pexels-photo-290595.jpeg"),
//       createHotspot([-100, 50, -400], "/360-image-3.jpg"),
//     ];

//     // Add Interaction for Hotspots
//     const raycaster = new THREE.Raycaster();
//     const mouse = new THREE.Vector2();

//     const onMouseClick = (event) => {
//       mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
//       mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

//       raycaster.setFromCamera(mouse, camera);
//       const intersects = raycaster.intersectObjects(hotspots);
//       if (intersects.length > 0) {
//         intersects[0].object.callback();
//       }
//     };
//     window.addEventListener("click", onMouseClick);

//     // Orbit Controls
//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableZoom = false;
//     controls.enablePan = false;
//     camera.position.set(0, 0, 0.1);

//     // Handle Window Resize
//     const onWindowResize = () => {
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(window.innerWidth, window.innerHeight);
//     };
//     window.addEventListener("resize", onWindowResize);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);
//     };
//     animate();

//     // Cleanup
//     return () => {
//       mount.removeChild(renderer.domElement);
//       window.removeEventListener("resize", onWindowResize);
//       window.removeEventListener("click", onMouseClick);
//     };
//   }, [currentTexture]);

//   const captureScreenshot = () => {
//     const renderer = new THREE.WebGLRenderer();
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     const screenshot = renderer.domElement.toDataURL("image/png");
//     const link = document.createElement("a");
//     link.href = screenshot;
//     link.download = "360-capture.png";
//     link.click();
//   };

//   return (
//     <div style={{ position: "relative", width: "100%", height: "100vh" }}>
//       <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
//       <button
//         onClick={captureScreenshot}
//         style={{
//           position: "absolute",
//           top: "10px",
//           left: "10px",
//           zIndex: 1,
//           padding: "10px 20px",
//           background: "#ffa500",
//           color: "#fff",
//           border: "none",
//           borderRadius: "5px",
//           cursor: "pointer",
//         }}
//       >
//         Capture Screenshot
//       </button>
//     </div>
//   );
// };

// export default Teleport360Camera;














// import React, { useRef, useEffect } from "react";
// import * as THREE from "three";
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// const PanoramaViewerWithDots = () => {
//   const mountRef = useRef(null);

//   useEffect(() => {
//     const mount = mountRef.current;

//     // Scene, Camera, Renderer
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x000000); // Black background

//     const camera = new THREE.PerspectiveCamera(
//       75,
//       window.innerWidth / window.innerHeight,
//       0.1,
//       1000
//     );
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     mount.appendChild(renderer.domElement);

//     // Sphere Geometry with Dots
//     const geometry = new THREE.SphereGeometry(500, 60, 40);
//     geometry.scale(-1, 1, 1); // Invert the sphere for inside view

//     const dotMaterial = new THREE.PointsMaterial({
//       color: 0xffa500, // Orange dots
//       size: 2, // Size of the dots
//     });

//     const dots = new THREE.Points(geometry, dotMaterial);
//     scene.add(dots);

//     // Hotspot for teleportation
//     const hotspotGeometry = new THREE.SphereGeometry(5, 16, 16);
//     const hotspotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//     const hotspot = new THREE.Mesh(hotspotGeometry, hotspotMaterial);
//     hotspot.position.set(50, 0, -100); // Adjust position
//     scene.add(hotspot);

//     // Texture Loader
//     const textureLoader = new THREE.TextureLoader();

//     // Raycaster for detecting clicks
//     const raycaster = new THREE.Raycaster();
//     const mouse = new THREE.Vector2();

//     const onMouseClick = (event) => {
//       mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
//       mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

//       raycaster.setFromCamera(mouse, camera);
//       const intersects = raycaster.intersectObjects(scene.children);

//       if (intersects.length > 0 && intersects[0].object === hotspot) {
//         // Load new panorama texture on click
//         const newTexture = textureLoader.load("https://images.pexels.com/photos/290595/pexels-photo-290595.jpeg");
//         dots.material.map = newTexture;
//         dots.material.needsUpdate = true;
//       }
//     };

//     window.addEventListener("click", onMouseClick);

//     // Camera Controls
//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableZoom = false; // Disable zoom
//     controls.enablePan = false; // Disable panning
//     camera.position.set(0, 0, 0.1);

//     // Handle Window Resize
//     const onWindowResize = () => {
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(window.innerWidth, window.innerHeight);
//     };
//     window.addEventListener("resize", onWindowResize);

//     // Capture Screenshot
//     const captureScreenshot = () => {
//       const dataURL = renderer.domElement.toDataURL("image/png");
//       const link = document.createElement("a");
//       link.href = dataURL;
//       link.download = "panorama-view.png";
//       link.click();
//     };

//     // Add Capture Button
//     const captureButton = document.createElement("button");
//     captureButton.textContent = "Capture Screenshot";
//     captureButton.style.position = "absolute";
//     captureButton.style.top = "10px";
//     captureButton.style.left = "10px";
//     captureButton.style.zIndex = "1000";
//     captureButton.style.padding = "10px";
//     captureButton.style.backgroundColor = "#ff8c00";
//     captureButton.style.color = "white";
//     captureButton.style.border = "none";
//     captureButton.style.borderRadius = "5px";
//     captureButton.style.cursor = "pointer";
//     captureButton.addEventListener("click", captureScreenshot);
//     document.body.appendChild(captureButton);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);
//     };
//     animate();

//     // Cleanup
//     return () => {
//       mount.removeChild(renderer.domElement);
//       document.body.removeChild(captureButton);
//       window.removeEventListener("resize", onWindowResize);
//       window.removeEventListener("click", onMouseClick);
//     };
//   }, []);

//   return <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />;
// };

// export default PanoramaViewerWithDots;



















// import React, { useRef, useEffect } from "react";
// import * as THREE from "three";
// import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

// const PanoramaViewer = () => {
//   const mountRef = useRef(null);

//   useEffect(() => {
//     const mount = mountRef.current;

//     // Scene, Camera, Renderer
//     const scene = new THREE.Scene();
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       window.innerWidth / window.innerHeight,
//       0.1,
//       1000
//     );
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(window.innerWidth, window.innerHeight);
//     mount.appendChild(renderer.domElement);

//     // Sphere Geometry with Panorama Texture
//     const geometry = new THREE.SphereGeometry(500, 60, 40);
//     geometry.scale(-1, 1, 1); // Invert the sphere for inside view

//     // Load Texture
//     const textureLoader = new THREE.TextureLoader();
//     const texture = textureLoader.load("/360-image.jpg"); // Path to your 360 image
//     const material = new THREE.MeshBasicMaterial({ map: texture });

//     const sphere = new THREE.Mesh(geometry, material);
//     scene.add(sphere);

//     // Camera Controls
//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableZoom = false; // Disable zoom
//     controls.enablePan = false; // Disable panning
//     camera.position.set(0, 0, 0.1);

//     // Handle Window Resize
//     const onWindowResize = () => {
//       camera.aspect = window.innerWidth / window.innerHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(window.innerWidth, window.innerHeight);
//     };
//     window.addEventListener("resize", onWindowResize);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);
//     };
//     animate();

//     // Cleanup
//     return () => {
//       mount.removeChild(renderer.domElement);
//       window.removeEventListener("resize", onWindowResize);
//     };
//   }, []);

//   return <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />;
// };

// export default PanoramaViewer;
