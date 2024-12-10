import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

const PanoramaViewerWithDots = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); // Black background

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    // Sphere Geometry with Dots
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1); // Invert the sphere for inside view

    const dotMaterial = new THREE.PointsMaterial({
      color: 0xffa500, // Orange dots
      size: 2, // Size of the dots
    });

    const dots = new THREE.Points(geometry, dotMaterial);
    scene.add(dots);

    // Hotspot for teleportation
    const hotspotGeometry = new THREE.SphereGeometry(5, 16, 16);
    const hotspotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const hotspot = new THREE.Mesh(hotspotGeometry, hotspotMaterial);
    hotspot.position.set(50, 0, -100); // Adjust position
    scene.add(hotspot);

    // Texture Loader
    const textureLoader = new THREE.TextureLoader();

    // Raycaster for detecting clicks
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onMouseClick = (event) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children);

      if (intersects.length > 0 && intersects[0].object === hotspot) {
        // Load new panorama texture on click
        const newTexture = textureLoader.load("https://images.pexels.com/photos/290595/pexels-photo-290595.jpeg");
        dots.material.map = newTexture;
        dots.material.needsUpdate = true;
      }
    };

    window.addEventListener("click", onMouseClick);

    // Camera Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false; // Disable zoom
    controls.enablePan = false; // Disable panning
    camera.position.set(0, 0, 0.1);

    // Handle Window Resize
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onWindowResize);

    // Capture Screenshot
    const captureScreenshot = () => {
      const dataURL = renderer.domElement.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataURL;
      link.download = "panorama-view.png";
      link.click();
    };

    // Add Capture Button
    const captureButton = document.createElement("button");
    captureButton.textContent = "Capture Screenshot";
    captureButton.style.position = "absolute";
    captureButton.style.top = "10px";
    captureButton.style.left = "10px";
    captureButton.style.zIndex = "1000";
    captureButton.style.padding = "10px";
    captureButton.style.backgroundColor = "#ff8c00";
    captureButton.style.color = "white";
    captureButton.style.border = "none";
    captureButton.style.borderRadius = "5px";
    captureButton.style.cursor = "pointer";
    captureButton.addEventListener("click", captureScreenshot);
    document.body.appendChild(captureButton);

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
      document.body.removeChild(captureButton);
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("click", onMouseClick);
    };
  }, []);

  return <div ref={mountRef} style={{ width: "100%", height: "100vh" }} />;
};

export default PanoramaViewerWithDots;



















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
