import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const Camera360View = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    // Create video elements for each direction (front, left, right, top, bottom)
    const videoFront = document.createElement("video");
    const videoLeft = document.createElement("video");
    const videoRight = document.createElement("video");
    const videoTop = document.createElement("video");
    const videoBottom = document.createElement("video");

    videoFront.autoplay = videoLeft.autoplay = videoRight.autoplay = videoTop.autoplay = videoBottom.autoplay = true;
    videoFront.muted = videoLeft.muted = videoRight.muted = videoTop.muted = videoBottom.muted = true;
    videoFront.playsInline = videoLeft.playsInline = videoRight.playsInline = videoTop.playsInline = videoBottom.playsInline = true;

    // Use getUserMedia to get camera feed
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, // Use rear camera
        });
        videoFront.srcObject = stream;
        videoLeft.srcObject = stream;
        videoRight.srcObject = stream;
        videoTop.srcObject = stream;
        videoBottom.srcObject = stream;
      } catch (err) {
        console.error("Error accessing camera: ", err);
      }
    };

    // Start the camera when the component mounts
    startCamera();

    // Create Video Textures
    const videoTextureFront = new THREE.VideoTexture(videoFront);
    const videoTextureLeft = new THREE.VideoTexture(videoLeft);
    const videoTextureRight = new THREE.VideoTexture(videoRight);
    const videoTextureTop = new THREE.VideoTexture(videoTop);
    const videoTextureBottom = new THREE.VideoTexture(videoBottom);

    // Create geometry (sphere) and map textures for each part
    const sphereGeometry = new THREE.SphereGeometry(500, 60, 40);
    sphereGeometry.scale(-1, 1, 1); // Invert the sphere to apply the texture inside

    // Create materials with different textures for each side of the sphere
    const materials = [
      new THREE.MeshBasicMaterial({ map: videoTextureFront }),  // Front
      new THREE.MeshBasicMaterial({ map: videoTextureBack }),   // Back
      new THREE.MeshBasicMaterial({ map: videoTextureLeft }),   // Left
      new THREE.MeshBasicMaterial({ map: videoTextureRight }),  // Right
      new THREE.MeshBasicMaterial({ map: videoTextureTop }),    // Top
      new THREE.MeshBasicMaterial({ map: videoTextureBottom })  // Bottom
    ];

    // Create a sphere with 6 materials (for the 6 sides)
    const sphere = new THREE.Mesh(sphereGeometry, materials);
    scene.add(sphere);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = true;
    camera.position.set(0, 0, 0.1);

    // Handle Window Resize
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onWindowResize);

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Cleanup
    return () => {
      mount.removeChild(renderer.domElement);
      window.removeEventListener("resize", onWindowResize);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

export default Camera360View;












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
