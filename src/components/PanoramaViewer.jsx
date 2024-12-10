// src/components/PanoramaViewer.jsx

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { DeviceOrientationControls } from 'three-stdlib';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PanoramaViewer = () => {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const sceneRef = useRef(null);

  const videoPlaneRef = useRef(null);
  const videoTextureRef = useRef(null);
  const markerRef = useRef(null);

  // Sphere and placement settings
  const sphereRadius = 5;
  const offsetFromSurface = 0.01;

  const [instructions, setInstructions] = useState("Press 'Capture' to take the first image.");
  const [firstCaptureDone, setFirstCaptureDone] = useState(false);
  const [captureCount, setCaptureCount] = useState(0);
  const maxCaptures = 36; // e.g., 36 captures for 360° (every 10 degrees)

  const angleInfoRef = useRef({
    angleIncrement: 0,
    angleRef: { currentAngle: 0 },
    placeObjectOnSphere: () => {}
  });

  useEffect(() => {
    // Create the scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Setup camera at the center of the sphere
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

    // Choose controls based on device
    let controls;
    if (window.DeviceOrientationEvent) {
      // Use DeviceOrientationControls for mobile devices
      controls = new DeviceOrientationControls(camera);
      controls.connect();
    } else {
      // Use OrbitControls for desktop
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 1;
      controls.maxDistance = 100;
      controls.enablePan = false;
      controls.enableZoom = true;
    }

    // Add a semi-transparent sphere as a reference (visible from inside)
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aa88,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide // Ensures visibility from inside
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Setup video feed from the back camera
    const video = document.createElement('video');
    video.setAttribute('playsinline', '');
    video.autoplay = true;
    video.muted = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        video.srcObject = stream;
        video.play();
      })
      .catch((err) => {
        console.error('Error accessing back camera: ', err);
        setInstructions("Unable to access the camera. Please check permissions.");
      });

    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTextureRef.current = videoTexture;

    // Dimensions for the video and captured planes
    const planeWidth = 2;
    const planeHeight = 3;
    const angleIncrement = (planeWidth * 0.95) / sphereRadius; // Slight overlap to prevent gaps

    // Create the video plane and add to scene
    const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
    const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(videoPlane);
    videoPlaneRef.current = videoPlane;

    // Helper function to place objects on the inner surface of the sphere
    const placeObjectOnSphere = (obj, angle) => {
      const r = sphereRadius - offsetFromSurface;
      const x = r * Math.sin(angle);
      const z = r * Math.cos(angle);
      obj.position.set(x, 0, -z);
      obj.rotation.set(0, Math.PI - angle, 0);
    };

    // Initial angle and placement
    const angleRef = { currentAngle: 0 };
    placeObjectOnSphere(videoPlane, angleRef.currentAngle);

    // Add a marker (red dot) to guide the user for next captures
    const marker = createMarker();
    scene.add(marker);
    markerRef.current = marker;
    placeObjectOnSphere(marker, angleRef.currentAngle);

    // Store references for later use
    angleInfoRef.current = {
      angleIncrement,
      angleRef,
      placeObjectOnSphere
    };

    // Handle window resizing
    const onWindowResize = () => {
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', onWindowResize, false);

    let capturing = false;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);

      // After the first capture, auto-capture when aligned
      if (firstCaptureDone && !capturing && captureCount < maxCaptures && isMarkerCentered(camera, marker)) {
        capturing = true;
        autoCaptureImage().then(() => {
          capturing = false;
        });
      }
    };
    animate();

    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', onWindowResize);
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (controls instanceof DeviceOrientationControls) {
        controls.disconnect();
      } else if (controls instanceof OrbitControls) {
        controls.dispose();
      }
      stopVideoStream(video);
    };
  }, [firstCaptureDone, captureCount]);

  // First manual capture via button
  const captureImage = () => {
    performCapture(false);
  };

  // Subsequent captures happen automatically once aligned
  const autoCaptureImage = async () => {
    return performCapture(true);
  };

  const performCapture = (isAuto) => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const videoPlane = videoPlaneRef.current;
    const marker = markerRef.current;

    if (!renderer || !scene || !videoPlane || !marker) return;

    const { angleIncrement, angleRef, placeObjectOnSphere } = angleInfoRef.current;
    const dataURL = renderer.domElement.toDataURL('image/png');

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const capturedTexture = new THREE.Texture(img);
        capturedTexture.needsUpdate = true;

        const planeWidth = 2;
        const planeHeight = 3;
        const capturedPlane = createCapturedPlane(capturedTexture, planeWidth, planeHeight);

        scene.add(capturedPlane);
        placeObjectOnSphere(capturedPlane, angleRef.currentAngle);
        console.log(`Captured image placed at angle: ${(angleRef.currentAngle * (180 / Math.PI)).toFixed(2)}°`);

        // Move to next angle
        angleRef.currentAngle += angleIncrement;
        placeObjectOnSphere(videoPlane, angleRef.currentAngle);
        placeObjectOnSphere(marker, angleRef.currentAngle);

        setCaptureCount((prev) => prev + 1);

        if (angleRef.currentAngle >= Math.PI * 2) {
          setInstructions("360° capture completed. Explore your panorama!");
        } else if (!isAuto) {
          setInstructions("Rotate the device to align the red dot with the center. Once aligned, image capture will happen automatically.");
          setFirstCaptureDone(true);
        } else {
          setInstructions(`Image ${captureCount + 1} captured. Rotate to align and auto-capture again.`);
        }

        resolve();
      };
      img.src = dataURL;
    });
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
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
      {/* Center Reticle */}
      <div 
        style={{
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)',
          zIndex: 2, 
          width: '30px', 
          height: '30px', 
          border: '3px solid white', 
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.1)'
        }}
      />
      {/* Instructions and (initial) Capture Button */}
      <div 
        style={{ 
          position: 'absolute', 
          top: '10px', 
          left: '10px', 
          zIndex: 1, 
          color: 'white', 
          background: 'rgba(0,0,0,0.5)', 
          padding: '10px',
          borderRadius: '5px',
          maxWidth: '300px'
        }}
      >
        {!firstCaptureDone && captureCount < maxCaptures && (
          <button
            onClick={captureImage}
            style={{
              padding: '10px 20px',
              background: '#ffffffee',
              border: '1px solid #ccc',
              cursor: 'pointer',
              marginBottom: '10px',
              borderRadius: '5px',
              fontWeight: 'bold'
            }}
          >
            Capture
          </button>
        )}
        <div>{instructions}</div>
        <div style={{ marginTop: '10px' }}>
          Captures: {captureCount} / {maxCaptures}
        </div>
      </div>
    </div>
  );
};

/** Helper Functions **/

function createMarker() {
  const markerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  return new THREE.Mesh(markerGeometry, markerMaterial);
}

function createCapturedPlane(texture, width, height) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
  return new THREE.Mesh(geometry, material);
}

function stopVideoStream(video) {
  if (video.srcObject) {
    const tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
  }
}

function isMarkerCentered(camera, marker) {
  const vector = new THREE.Vector3().copy(marker.position).project(camera);
  const dx = vector.x;
  const dy = vector.y;
  const threshold = 0.05;
  return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
}

export default PanoramaViewer;












// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// import { DeviceOrientationControls } from 'three-stdlib';

// const SceneView = () => {
//   const mountRef = useRef(null);
//   const rendererRef = useRef(null);
//   const cameraRef = useRef(null);
//   const sceneRef = useRef(null);

//   const videoPlaneRef = useRef(null);
//   const videoTextureRef = useRef(null);
//   const markerRef = useRef(null);

//   // Sphere and placement settings
//   const sphereRadius = 5;
//   const offsetFromSurface = 0.01;

//   const [instructions, setInstructions] = useState("Press 'Capture' to take the first image.");
//   const [firstCaptureDone, setFirstCaptureDone] = useState(false);

//   const angleInfoRef = useRef({
//     angleIncrement: 0,
//     angleRef: { currentAngle: 0 },
//     placeObjectOnSphere: () => {}
//   });

//   useEffect(() => {
//     // Create the scene
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x000000);
//     sceneRef.current = scene;

//     // Setup camera in the center of the sphere
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       mountRef.current.clientWidth / mountRef.current.clientHeight,
//       0.1,
//       1000
//     );
//     camera.position.set(0, 0, 0);
//     cameraRef.current = camera;

//     // Setup renderer
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     mountRef.current.appendChild(renderer.domElement);
//     rendererRef.current = renderer;

//     // Add device orientation controls
//     const controls = new DeviceOrientationControls(camera);
//     controls.connect();

//     // Add grid helpers and axes to visualize rotation
//     addVisualReferences(scene);

//     // Add a semi-transparent sphere as a reference
//     const sphere = new THREE.Mesh(
//       new THREE.SphereGeometry(sphereRadius, 64, 64),
//       new THREE.MeshBasicMaterial({
//         color: 0x44aa88,
//         transparent: true,
//         opacity: 0.3,
//         side: THREE.DoubleSide
//       })
//     );
//     scene.add(sphere);

//     // Setup video feed from the back camera
//     const video = document.createElement('video');
//     video.setAttribute('playsinline', '');
//     video.autoplay = true;
//     video.muted = true;

//     navigator.mediaDevices
//       .getUserMedia({ video: { facingMode: { exact: 'environment' } }, audio: false })
//       .then((stream) => {
//         video.srcObject = stream;
//         video.play();
//       })
//       .catch(console.error);

//     const videoTexture = new THREE.VideoTexture(video);
//     videoTextureRef.current = videoTexture;

//     // Dimensions for the video and captured planes
//     const planeWidth = 2;
//     const planeHeight = 3;
//     const angleIncrement = (planeWidth * 0.95) / sphereRadius; // Slight overlap for no gap

//     // Create the video plane and add to scene
//     const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//     const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
//     const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
//     scene.add(videoPlane);
//     videoPlaneRef.current = videoPlane;

//     // Helper function to place objects on the inner surface of the sphere
//     const placeObjectOnSphere = (obj, angle) => {
//       const r = sphereRadius - offsetFromSurface;
//       const x = r * Math.sin(angle);
//       const z = r * Math.cos(angle);
//       obj.position.set(x, 0, -z);
//       obj.rotation.set(0, Math.PI - angle, 0);
//     };

//     // Initial angle and placement
//     const angleRef = { currentAngle: 0 };
//     placeObjectOnSphere(videoPlane, angleRef.currentAngle);

//     // Add a marker (red dot) to guide the user for next captures
//     const marker = createMarker();
//     scene.add(marker);
//     markerRef.current = marker;
//     placeObjectOnSphere(marker, angleRef.currentAngle);

//     // Store references for later use
//     angleInfoRef.current = {
//       angleIncrement,
//       angleRef,
//       placeObjectOnSphere
//     };

//     // Handle window resizing
//     const onWindowResize = () => {
//       camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     };
//     window.addEventListener('resize', onWindowResize, false);

//     let capturing = false;

//     // Animation loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);

//       // After the first capture, auto-capture when aligned
//       if (firstCaptureDone && !capturing && isMarkerCentered(camera, marker)) {
//         capturing = true;
//         autoCaptureImage().then(() => {
//           capturing = false;
//         });
//       }
//     };
//     animate();

//     // Cleanup on unmount
//     return () => {
//       window.removeEventListener('resize', onWindowResize);
//       if (mountRef.current && renderer.domElement) {
//         mountRef.current.removeChild(renderer.domElement);
//       }
//       renderer.dispose();
//       stopVideoStream(video);
//     };
//   }, [firstCaptureDone]);

//   // First manual capture via button
//   const captureImage = () => {
//     performCapture(false);
//   };

//   // Subsequent captures happen automatically once aligned
//   const autoCaptureImage = async () => {
//     return performCapture(true);
//   };

//   const performCapture = (isAuto) => {
//     const renderer = rendererRef.current;
//     const scene = sceneRef.current;
//     const videoPlane = videoPlaneRef.current;
//     const marker = markerRef.current;

//     if (!renderer || !scene || !videoPlane || !marker) return;

//     const { angleIncrement, angleRef, placeObjectOnSphere } = angleInfoRef.current;
//     const dataURL = renderer.domElement.toDataURL('image/png');

//     return new Promise((resolve) => {
//       const img = new Image();
//       img.onload = () => {
//         const capturedTexture = new THREE.Texture(img);
//         capturedTexture.needsUpdate = true;

//         const planeWidth = 2;
//         const planeHeight = 3;
//         const capturedPlane = createCapturedPlane(capturedTexture, planeWidth, planeHeight);

//         scene.add(capturedPlane);
//         placeObjectOnSphere(capturedPlane, angleRef.currentAngle);
//         console.log(`Captured image placed at angle: ${angleRef.currentAngle.toFixed(2)}`);

//         // Move to next angle
//         angleRef.currentAngle += angleIncrement;
//         placeObjectOnSphere(videoPlane, angleRef.currentAngle);
//         placeObjectOnSphere(marker, angleRef.currentAngle);

//         if (!isAuto) {
//           setInstructions("Rotate the device to align the red dot with the center. Once aligned, image capture will happen automatically.");
//           setFirstCaptureDone(true);
//         } else {
//           setInstructions("Next dot placed. Rotate to align and auto-capture again.");
//         }

//         resolve();
//       };
//       img.src = dataURL;
//     });
//   };

//   return (
//     <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
//       <div
//         ref={mountRef}
//         style={{
//           width: '100%',
//           height: '100%',
//           display: 'block',
//           position: 'absolute',
//           top: 0,
//           left: 0
//         }}
//       />
//       {/* Center Reticle */}
//       <div 
//         style={{
//           position: 'absolute', 
//           top: '50%', 
//           left: '50%', 
//           transform: 'translate(-50%, -50%)',
//           zIndex: 2, 
//           width: '30px', 
//           height: '30px', 
//           border: '3px solid white', 
//           borderRadius: '50%',
//           background: 'rgba(255,255,255,0.1)'
//         }}
//       />
//       {/* Instructions and (initial) Capture Button */}
//       <div 
//         style={{ 
//           position: 'absolute', 
//           top: '10px', 
//           left: '10px', 
//           zIndex: 1, 
//           color: 'white', 
//           background: 'rgba(0,0,0,0.5)', 
//           padding: '10px',
//           borderRadius: '5px'
//         }}
//       >
//         {!firstCaptureDone && (
//           <button
//             onClick={captureImage}
//             style={{
//               padding: '10px 20px',
//               background: '#ffffffee',
//               border: '1px solid #ccc',
//               cursor: 'pointer',
//               marginBottom: '10px',
//               borderRadius: '5px',
//               fontWeight: 'bold'
//             }}
//           >
//             Capture
//           </button>
//         )}
//         <div>{instructions}</div>
//       </div>
//     </div>
//   );
// };

// /** Helper Functions **/

// function addVisualReferences(scene) {
//   const size = 10;
//   const divisions = 10;

//   const gridXY = new THREE.GridHelper(size, divisions, 0xff0000, 0x444444);
//   scene.add(gridXY);

//   const gridYZ = new THREE.GridHelper(size, divisions, 0x00ff00, 0x444444);
//   gridYZ.rotation.z = Math.PI / 2;
//   scene.add(gridYZ);

//   const gridZX = new THREE.GridHelper(size, divisions, 0x0000ff, 0x444444);
//   gridZX.rotation.x = Math.PI / 2;
//   scene.add(gridZX);

//   const axesHelper = new THREE.AxesHelper(5);
//   scene.add(axesHelper);
// }

// function createMarker() {
//   const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
//   const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//   return new THREE.Mesh(markerGeometry, markerMaterial);
// }

// function createCapturedPlane(texture, width, height) {
//   const geometry = new THREE.PlaneGeometry(width, height);
//   const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });
//   return new THREE.Mesh(geometry, material);
// }

// function stopVideoStream(video) {
//   if (video.srcObject) {
//     const tracks = video.srcObject.getTracks();
//     tracks.forEach(track => track.stop());
//   }
// }

// function isMarkerCentered(camera, marker) {
//   const vector = new THREE.Vector3().copy(marker.position).project(camera);
//   const dx = vector.x;
//   const dy = vector.y;
//   const threshold = 0.05;
//   return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
// }

// export default SceneView;











// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// const SceneView = () => {
//   const mountRef = useRef(null);
//   const rendererRef = useRef(null);
//   const cameraRef = useRef(null);
//   const sceneRef = useRef(null);
//   const videoPlaneRef = useRef(null);
//   const videoTextureRef = useRef(null);
//   const markerRef = useRef(null);

//   const angleInfoRef = useRef({
//     angleIncrement: 0,
//     angleRef: { currentAngle: 0 },
//     placeObjectOnSphere: () => {}
//   });

//   const sphereRadius = 5;
//   const offsetFromSurface = 0.01;

//   const [instructions, setInstructions] = useState("Align camera with the dot and press Capture");

//   // We'll track camera angles ourselves
//   // Angle=0 means camera faces the initial angle (negative Z direction)
//   const currentCameraAngleRef = useRef(0);
//   const targetCameraAngleRef = useRef(0);

//   useEffect(() => {
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x202020);
//     sceneRef.current = scene;

//     // Setup camera at center
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       mountRef.current.clientWidth / mountRef.current.clientHeight,
//       0.1,
//       1000
//     );
//     camera.position.set(0, 0, 0);
//     cameraRef.current = camera;

//     // By default, angle=0 means looking at negative Z inside the sphere.
//     // Let's set initial camera direction:
//     currentCameraAngleRef.current = 0;
//     targetCameraAngleRef.current = 0;
//     lookAtAngle(camera, currentCameraAngleRef.current);

//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     mountRef.current.appendChild(renderer.domElement);
//     rendererRef.current = renderer;

//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableDamping = true;
//     controls.dampingFactor = 0.05;

//     // Grids and sphere
//     const size = 10;
//     const divisions = 10;
//     scene.add(new THREE.GridHelper(size, divisions));
//     const sphere = new THREE.Mesh(
//       new THREE.SphereGeometry(sphereRadius, 64, 64),
//       new THREE.MeshBasicMaterial({
//         color: 0x44aa88,
//         transparent: true,
//         opacity: 0.3,
//         side: THREE.DoubleSide
//       })
//     );
//     scene.add(sphere);

//     // Video setup
//     const video = document.createElement('video');
//     video.setAttribute('playsinline', '');
//     video.autoplay = true;
//     video.muted = true;

//     navigator.mediaDevices
//       .getUserMedia({ video: { facingMode: { exact: 'environment' } }, audio: false })
//       .then((stream) => {
//         video.srcObject = stream;
//         video.play();
//       })
//       .catch(console.error);

//     const videoTexture = new THREE.VideoTexture(video);
//     videoTextureRef.current = videoTexture;

//     // Plane dimensions and increment
//     const planeWidth = 2;
//     const planeHeight = 3; 
//     // Slight overlap factor
//     const angleIncrement = (planeWidth * 0.95) / sphereRadius;
//     const angleRef = { currentAngle: 0 };

//     const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//     const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
//     const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
//     scene.add(videoPlane);
//     videoPlaneRef.current = videoPlane;

//     const placeObjectOnSphere = (obj, angle) => {
//       const r = sphereRadius - offsetFromSurface;
//       const x = r * Math.sin(angle);
//       const z = r * Math.cos(angle);
//       obj.position.set(x, 0, -z);
//       obj.rotation.set(0, Math.PI - angle, 0);
//     };

//     // Place the video plane initially
//     placeObjectOnSphere(videoPlane, angleRef.currentAngle);

//     // Create a marker (red dot) to guide the user
//     const markerGeometry = new THREE.SphereGeometry(0.05, 16, 16);
//     const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//     const marker = new THREE.Mesh(markerGeometry, markerMaterial);
//     scene.add(marker);
//     markerRef.current = marker;

//     // Place the marker at the same angle
//     placeObjectOnSphere(marker, angleRef.currentAngle);

//     angleInfoRef.current = {
//       angleIncrement,
//       angleRef,
//       placeObjectOnSphere
//     };

//     const onWindowResize = () => {
//       camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     };
//     window.addEventListener('resize', onWindowResize, false);

//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       // Smoothly rotate camera to target angle after capture
//       const speed = 0.02; // rotation speed factor
//       if (Math.abs(targetCameraAngleRef.current - currentCameraAngleRef.current) > 0.001) {
//         // Move currentCameraAngle towards targetCameraAngle
//         currentCameraAngleRef.current += (targetCameraAngleRef.current - currentCameraAngleRef.current) * speed;
//         lookAtAngle(camera, currentCameraAngleRef.current);
//       }
//       renderer.render(scene, camera);
//     };
//     animate();

//     return () => {
//       window.removeEventListener('resize', onWindowResize);
//       if (mountRef.current && renderer.domElement) {
//         mountRef.current.removeChild(renderer.domElement);
//       }
//       renderer.dispose();
//       if (video.srcObject) {
//         const tracks = video.srcObject.getTracks();
//         tracks.forEach(track => track.stop());
//       }
//     };
//   }, []);

//   const captureImage = () => {
//     const renderer = rendererRef.current;
//     const scene = sceneRef.current;
//     const videoPlane = videoPlaneRef.current;
//     const marker = markerRef.current;
//     if (!renderer || !scene || !videoPlane || !marker) return;

//     const { angleIncrement, angleRef, placeObjectOnSphere } = angleInfoRef.current;
//     const dataURL = renderer.domElement.toDataURL('image/png');

//     const img = new Image();
//     img.onload = () => {
//       const capturedTexture = new THREE.Texture(img);
//       capturedTexture.needsUpdate = true;

//       const planeWidth = 2;
//       const planeHeight = 3; 
//       const capturedGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//       const capturedMaterial = new THREE.MeshBasicMaterial({ map: capturedTexture, side: THREE.DoubleSide });
//       const capturedPlane = new THREE.Mesh(capturedGeometry, capturedMaterial);
//       scene.add(capturedPlane);

//       // Place the captured plane at the current angle
//       placeObjectOnSphere(capturedPlane, angleRef.currentAngle);

//       // Move to next angle
//       angleRef.currentAngle += angleIncrement;
//       placeObjectOnSphere(videoPlane, angleRef.currentAngle);
//       placeObjectOnSphere(marker, angleRef.currentAngle);

//       // Set the camera to rotate automatically to the new angle
//       targetCameraAngleRef.current = angleRef.currentAngle;

//       setInstructions("Camera rotating... Align and press Capture when ready.");
//     };
//     img.src = dataURL;
//   };

//   // Helper function to orient camera to a given angle
//   function lookAtAngle(camera, angle) {
//     // Compute the point on the sphere at this angle
//     const r = sphereRadius - offsetFromSurface;
//     const x = r * Math.sin(angle);
//     const z = r * Math.cos(angle);
//     camera.lookAt(x, 0, -z);
//   }

//   return (
//     <div style={{ position: 'relative', width: '100%', height: '100vh', overflow: 'hidden' }}>
//       <div
//         ref={mountRef}
//         style={{
//           width: '100%',
//           height: '100%',
//           display: 'block',
//           position: 'absolute',
//           top: 0,
//           left: 0
//         }}
//       />
//       <div style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 1 }}>
//         <button
//           onClick={captureImage}
//           style={{
//             padding: '10px',
//             background: 'white',
//             border: '1px solid #ccc',
//             cursor: 'pointer',
//             marginBottom: '10px'
//           }}
//         >
//           Capture Image
//         </button>
//         <div style={{ color: 'white', background: 'rgba(0,0,0,0.5)', padding: '5px' }}>
//           {instructions}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default SceneView;















// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// const SceneView = () => {
//   const mountRef = useRef(null);
//   const rendererRef = useRef(null);
//   const cameraRef = useRef(null);
//   const sceneRef = useRef(null);
//   const videoPlaneRef = useRef(null);
//   const videoTextureRef = useRef(null);

//   const angleInfoRef = useRef({
//     angleIncrement: 0,
//     angleRef: { currentAngle: 0 },
//     placePlaneOnSphere: () => {}
//   });

//   useEffect(() => {
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x202020);
//     sceneRef.current = scene;

//     // Setup camera at center
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       mountRef.current.clientWidth / mountRef.current.clientHeight,
//       0.1,
//       1000
//     );
//     camera.position.set(0, 0, 0);
//     cameraRef.current = camera;

//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     mountRef.current.appendChild(renderer.domElement);
//     rendererRef.current = renderer;

//     const controls = new OrbitControls(camera, renderer.domElement);
//     controls.enableDamping = true;
//     controls.dampingFactor = 0.05;
//     controls.minDistance = 0.1;
//     controls.maxDistance = 100;
//     controls.enablePan = true;
//     controls.minPolarAngle = 0;
//     controls.maxPolarAngle = Math.PI;

//     // Grid helpers and axes
//     const size = 10;
//     const divisions = 10;
//     const gridXY = new THREE.GridHelper(size, divisions);
//     scene.add(gridXY);
//     const gridYZ = new THREE.GridHelper(size, divisions);
//     gridYZ.rotation.z = Math.PI / 2;
//     scene.add(gridYZ);
//     const gridZX = new THREE.GridHelper(size, divisions);
//     gridZX.rotation.x = Math.PI / 2;
//     scene.add(gridZX);
//     const axesHelper = new THREE.AxesHelper(10);
//     scene.add(axesHelper);

//     // Transparent sphere
//     const sphereRadius = 5;
//     const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
//     const sphereMaterial = new THREE.MeshBasicMaterial({
//       color: 0x44aa88,
//       transparent: true,
//       opacity: 0.3,
//       side: THREE.DoubleSide
//     });
//     const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//     scene.add(sphere);

//     // Video element for camera feed
//     const video = document.createElement('video');
//     video.setAttribute('playsinline', '');
//     video.autoplay = true;
//     video.muted = true;

//     navigator.mediaDevices
//       .getUserMedia({ 
//         video: { facingMode: { exact: 'environment' } }, 
//         audio: false 
//       })
//       .then((stream) => {
//         video.srcObject = stream;
//         video.play();
//       })
//       .catch((err) => {
//         console.error('Error accessing back camera: ', err);
//       });

//     const videoTexture = new THREE.VideoTexture(video);
//     videoTexture.minFilter = THREE.LinearFilter;
//     videoTexture.magFilter = THREE.LinearFilter;
//     videoTextureRef.current = videoTexture;

//     // Plane dimensions
//     const planeWidth = 2;
//     const planeHeight = 3; 
//     const offsetFromSurface = 0.01;

//     const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//     const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
//     const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
//     scene.add(videoPlane);
//     videoPlaneRef.current = videoPlane;

//     // Slightly reduce angle increment to cause images to "touch" or overlap
//     const angleIncrement = (planeWidth * 0.95) / sphereRadius;
//     const angleRef = { currentAngle: 0 };

//     const placePlaneOnSphere = (plane, angle) => {
//       const r = sphereRadius - offsetFromSurface;
//       const x = r * Math.sin(angle);
//       const z = r * Math.cos(angle);
//       plane.position.set(x, 0, -z);
//       plane.rotation.set(0, Math.PI - angle, 0);
//     };

//     // Place the video plane initially
//     placePlaneOnSphere(videoPlane, angleRef.currentAngle);

//     angleInfoRef.current = {
//       angleIncrement,
//       angleRef,
//       placePlaneOnSphere
//     };

//     const onWindowResize = () => {
//       camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     };
//     window.addEventListener('resize', onWindowResize, false);

//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);
//     };
//     animate();

//     return () => {
//       window.removeEventListener('resize', onWindowResize);
//       if (mountRef.current && renderer.domElement) {
//         mountRef.current.removeChild(renderer.domElement);
//       }
//       renderer.dispose();
//       if (video.srcObject) {
//         const tracks = video.srcObject.getTracks();
//         tracks.forEach(track => track.stop());
//       }
//     };
//   }, []);

//   const captureImage = () => {
//     const renderer = rendererRef.current;
//     const scene = sceneRef.current;
//     const videoPlane = videoPlaneRef.current;
//     if (!renderer || !scene || !videoPlane) return;

//     const { angleIncrement, angleRef, placePlaneOnSphere } = angleInfoRef.current;
//     const dataURL = renderer.domElement.toDataURL('image/png');

//     const img = new Image();
//     img.onload = () => {
//       const capturedTexture = new THREE.Texture(img);
//       capturedTexture.needsUpdate = true;

//       const planeWidth = 2;
//       const planeHeight = 3; 
//       const capturedGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//       const capturedMaterial = new THREE.MeshBasicMaterial({ map: capturedTexture, side: THREE.DoubleSide });
//       const capturedPlane = new THREE.Mesh(capturedGeometry, capturedMaterial);

//       const currentAngle = angleRef.currentAngle;
//       scene.add(capturedPlane);
//       placePlaneOnSphere(capturedPlane, currentAngle);

//       // Move video plane to next position with slightly smaller increment
//       angleRef.currentAngle += angleIncrement;
//       placePlaneOnSphere(videoPlane, angleRef.currentAngle);
//     };
//     img.src = dataURL;
//   };

//   return (
//     <div
//       style={{ 
//         position: 'relative', 
//         width: '100%', 
//         height: '100vh', 
//         overflow: 'hidden' 
//       }}
//     >
//       <div
//         ref={mountRef}
//         style={{
//           width: '100%',
//           height: '100%',
//           display: 'block',
//           position: 'absolute',
//           top: 0,
//           left: 0
//         }}
//       />
//       <button
//         onClick={captureImage}
//         style={{
//           position: 'absolute',
//           zIndex: 1,
//           top: '10px',
//           left: '10px',
//           padding: '10px',
//           background: 'white',
//           border: '1px solid #ccc',
//           cursor: 'pointer'
//         }}
//       >
//         Capture Image
//       </button>
//     </div>
//   );
// };

// export default SceneView;









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
