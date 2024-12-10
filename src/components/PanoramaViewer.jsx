// src/components/PanoramaViewer.jsx

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { DeviceOrientationControls } from 'three-stdlib';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const PanoramaViewer = () => {
  // Refs for Three.js components
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const sceneRef = useRef(null);

  const videoPlaneRef = useRef(null);
  const videoTextureRef = useRef(null);
  const markerRef = useRef(null);
  const hiddenCanvasRef = useRef(null);

  // Top-Level Plane Dimensions
  const planeWidth = 4; // Adjust as needed for horizontal coverage
  const planeHeight = 5; // Adjust as needed for vertical coverage

  // Sphere and placement settings
  const sphereRadius = 5;
  const offsetFromSurface = 0.01;

  // Global Configuration
  const hfov = 60; // Horizontal Field of View in degrees
  const vfov = 60; // Vertical Field of View in degrees

  // Memoize elevation levels to prevent re-creation on every render
  const elevationLevels = useMemo(() => [0, 30, -30, 60, -60, 90, -90], []);

  // Memoize azimuthal increments based on elevation
  const azimuthIncrements = useMemo(() => ({
    0: 30,    // Equator: high density
    30: 45,   // Upper mid
    '-30': 45, // Lower mid
    60: 60,   // Upper high
    '-60': 60, // Lower high
    90: 90,   // North Pole
    '-90': 90  // South Pole
  }), []);

  // Calculate maximum captures based on azimuthal increments
  const maxCaptures = useMemo(() => {
    return elevationLevels.reduce((total, elev) => {
      const increment = azimuthIncrements[elev] || 60; // Default to 60° if not defined
      return total + Math.ceil(360 / increment);
    }, 0);
  }, [elevationLevels, azimuthIncrements]);

  // Capture Queue Initialization
  const captureQueueRef = useRef([]);

  // State to indicate when the capture queue is ready
  const [queueReady, setQueueReady] = useState(false);

  // Initialize the capture queue
  useEffect(() => {
    const initializeQueue = () => {
      const queue = [];
      elevationLevels.forEach(elev => {
        const increment = azimuthIncrements[elev] || 60;
        const captures = Math.ceil(360 / increment);
        for (let i = 0; i < captures; i++) {
          queue.push({ azimuth: i * increment, elevation: elev });
        }
      });
      captureQueueRef.current = queue;
      setQueueReady(true); // Indicate that the queue is ready
    };
    initializeQueue();
  }, [elevationLevels, azimuthIncrements]);

  // Refs for mutable variables
  const captureCountRef = useRef(0);
  const capturingRef = useRef(false);
  const firstCaptureDoneRef = useRef(false);

  // State variables for UI
  const [instructions, setInstructions] = useState("Press 'Capture' to take the first image.");
  const [captureCount, setCaptureCount] = useState(0);
  const [showFlash, setShowFlash] = useState(false); // For visual feedback

  // Initialize Three.js Scene and Components
  useEffect(() => {
    // Initialize Three.js Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Setup Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Setup Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize Controls
    let controls;
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      // For iOS 13+ devices, need to request permission
      DeviceOrientationEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            controls = new DeviceOrientationControls(camera);
            controls.connect();
          } else {
            console.warn('Device Orientation permission denied. Falling back to OrbitControls.');
            controls = new OrbitControls(camera, renderer.domElement);
            configureOrbitControls(controls);
          }
        })
        .catch(console.error);
    } else if (window.DeviceOrientationEvent) {
      // Use DeviceOrientationControls for other mobile devices
      controls = new DeviceOrientationControls(camera);
      controls.connect();
    } else {
      // Use OrbitControls for desktop
      controls = new OrbitControls(camera, renderer.domElement);
      configureOrbitControls(controls);
    }

    // Add a Semi-Transparent Sphere as a Reference (Visible from Inside)
    const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x44aa88,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide // Ensures visibility from inside
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Setup Video Feed from the Back Camera
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

    // Create the Video Plane and Add to Scene
    const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
    const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(videoPlane);
    videoPlaneRef.current = videoPlane;

    // Add a Marker (Red Dot) to Guide the User for Next Captures
    const marker = createMarker();
    scene.add(marker);
    markerRef.current = marker;

    // Place Video Plane and Marker at the first capture position
    if (captureQueueRef.current.length > 0) {
      const firstCapture = captureQueueRef.current[0];
      placeObjectOnSphere(videoPlane, firstCapture.azimuth, firstCapture.elevation);
      placeObjectOnSphere(marker, firstCapture.azimuth, firstCapture.elevation);
    }

    // Create a Hidden Canvas for Capturing Video Frames
    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = video.videoWidth || 640;
    hiddenCanvas.height = video.videoHeight || 480;
    hiddenCanvasRef.current = hiddenCanvas;

    // Handle Window Resizing
    const onWindowResize = () => {
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    window.addEventListener('resize', onWindowResize, false);

    // Animation Loop
    const animate = () => {
      requestAnimationFrame(animate);
      if (controls) controls.update();
      renderer.render(scene, camera);

      // After the First Capture, Auto-Capture When Aligned
      if (
        firstCaptureDoneRef.current &&
        !capturingRef.current &&
        captureCountRef.current < maxCaptures &&
        isMarkerCentered(camera, marker)
      ) {
        capturingRef.current = true;
        autoCaptureImage().then(() => {
          capturingRef.current = false;
        });
      }
    };
    animate();

    // Cleanup on Unmount
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
  }, [captureQueueRef, maxCaptures, elevationLevels, azimuthIncrements]);

  // Configure OrbitControls (Helper Function)
  const configureOrbitControls = useCallback((controls) => {
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 1;
    controls.maxDistance = 100;
    controls.enablePan = false;
    controls.enableZoom = true;
  }, []);

  // Capture Image Function
  const captureImage = useCallback(() => {
    if (!capturingRef.current && captureCountRef.current < maxCaptures) {
      performCapture(false);
    }
  }, [maxCaptures]);

  // Auto Capture Function
  const autoCaptureImage = useCallback(async () => {
    return performCapture(true);
  }, []);

  // Perform Capture Function
  const performCapture = useCallback((isAuto) => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const videoPlane = videoPlaneRef.current;
    const marker = markerRef.current;
    const hiddenCanvas = hiddenCanvasRef.current;
    const video = videoTextureRef.current?.image;
    const queue = captureQueueRef.current;

    if (!renderer || !scene || !videoPlane || !marker || !hiddenCanvas || !video) return;

    if (queue.length === 0) {
      setInstructions("All captures completed. Explore your panorama!");
      return;
    }

    const { azimuth, elevation } = queue.shift(); // Dequeue the next capture

    // Draw the current video frame to the hidden canvas
    const ctx = hiddenCanvas.getContext('2d');
    hiddenCanvas.width = video.videoWidth || 640;
    hiddenCanvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

    // Get the Data URL from the Hidden Canvas
    const dataURL = hiddenCanvas.toDataURL('image/png');

    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Create a texture from the captured image
        const capturedTexture = new THREE.Texture(img);
        capturedTexture.needsUpdate = true;

        // Create a plane for the captured image with FrontSide
        const capturedPlane = createCapturedPlane(capturedTexture, planeWidth, planeHeight, elevation);
        capturedPlane.userData.isCaptured = true; // Tag for potential removal/reset
        scene.add(capturedPlane);

        // Place the captured plane on the sphere at the current azimuth and elevation
        placeObjectOnSphere(capturedPlane, azimuth, elevation);

        console.log(`Captured image placed at Azimuth: ${azimuth}°, Elevation: ${elevation}°`);

        // Increment capture count
        captureCountRef.current += 1;
        setCaptureCount(captureCountRef.current); // Update state for UI

        // Update Instructions
        if (!isAuto) {
          setInstructions("Image captured. Rotate the device to align the next marker for automatic capture.");
          firstCaptureDoneRef.current = true;
        } else {
          setInstructions(`Image ${captureCountRef.current} captured. Rotate to align and auto-capture again.`);
        }

        // Move Video Plane and Marker to New Azimuth and Elevation
        placeObjectOnSphere(videoPlaneRef.current, azimuth, elevation);
        placeObjectOnSphere(marker, azimuth, elevation);

        // Flash Effect for Visual Feedback
        setShowFlash(true);
        setTimeout(() => setShowFlash(false), 200); // Flash duration: 200ms

        resolve();
      };
      img.src = dataURL;
    });
  }, [planeHeight, planeWidth]);

  // Helper Function to Place Objects on the Sphere
  const placeObjectOnSphere = useCallback((obj, azimuthDeg, elevationDeg) => {
    const r = sphereRadius - offsetFromSurface;
    const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg);
    const elevationRad = THREE.MathUtils.degToRad(elevationDeg);

    const x = r * Math.cos(elevationRad) * Math.sin(azimuthRad);
    const y = r * Math.sin(elevationRad);
    const z = r * Math.cos(elevationRad) * Math.cos(azimuthRad);

    obj.position.set(x, y, -z); // Negative z to face inward
    obj.lookAt(0, 0, 0); // Ensure the plane faces the center
  }, []);

  // Function to reset the panorama capture process
  const resetPanorama = useCallback(() => {
    const scene = sceneRef.current;
    const videoPlane = videoPlaneRef.current;
    const marker = markerRef.current;

    if (!scene || !videoPlane || !marker) return;

    // Remove all captured planes
    scene.children.forEach(child => {
      if (child.userData.isCaptured) {
        scene.remove(child);
        child.geometry.dispose();
        child.material.dispose();
      }
    });

    // Reset mutable refs
    captureCountRef.current = 0;
    capturingRef.current = false;
    firstCaptureDoneRef.current = false;

    // Reset state variables
    setCaptureCount(0);
    setInstructions("Press 'Capture' to take the first image.");
    setQueueReady(false); // Temporarily set to false during reinitialization

    // Reset the capture queue
    const newQueue = [];
    elevationLevels.forEach(elev => {
      const increment = azimuthIncrements[elev] || 60;
      const captures = Math.ceil(360 / increment);
      for (let i = 0; i < captures; i++) {
        newQueue.push({ azimuth: i * increment, elevation: elev });
      }
    });
    captureQueueRef.current = newQueue;
    setQueueReady(true); // Re-indicate that the queue is ready

    // Reposition video plane and marker
    if (captureQueueRef.current.length > 0) {
      const firstCapture = captureQueueRef.current[0];
      placeObjectOnSphere(videoPlane, firstCapture.azimuth, firstCapture.elevation);
      placeObjectOnSphere(marker, firstCapture.azimuth, firstCapture.elevation);
    }
  }, [elevationLevels, azimuthIncrements, placeObjectOnSphere]);

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
      {/* Instructions and (Initial) Capture Button */}
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
        {queueReady && captureCount < maxCaptures && captureQueueRef.current.length > 0 && !firstCaptureDoneRef.current && (
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
        {/* Progress Bar */}
        <div style={{ marginTop: '10px' }}>
          <progress value={captureCount} max={maxCaptures} style={{ width: '100%' }}></progress>
          <span>{` ${captureCount} / ${maxCaptures}`}</span>
        </div>
      </div>
      {/* Reset Button */}
      {captureCount > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 1, 
            color: 'white', 
            background: 'rgba(0,0,0,0.5)', 
            padding: '10px',
            borderRadius: '5px',
            maxWidth: '150px'
          }}
        >
          <button
            onClick={resetPanorama}
            style={{
              padding: '10px 20px',
              background: '#ffffffee',
              border: '1px solid #ccc',
              cursor: 'pointer',
              borderRadius: '5px',
              fontWeight: 'bold'
            }}
          >
            Reset
          </button>
        </div>
      )}
      {/* Flash Effect for Visual Feedback */}
      {showFlash && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(255,255,255,0.8)',
            zIndex: 3,
            pointerEvents: 'none'
          }}
        />
      )}
    </div>
  );
};

/** Helper Functions **/

// Function to create the red marker
function createMarker() {
  const markerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
  const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  return new THREE.Mesh(markerGeometry, markerMaterial);
}

// Function to create a captured image plane
function createCapturedPlane(texture, width, height, elevation = 0) {
  // Adjust plane height based on elevation to account for perspective distortion (optional)
  let adjustedHeight = height;
  if (Math.abs(elevation) > 60) { // Near the poles
    adjustedHeight *= 1.2; // Increase height by 20%
  }
  
  const geometry = new THREE.PlaneGeometry(width, adjustedHeight);
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide });
  return new THREE.Mesh(geometry, material);
}

// Function to stop the video stream
function stopVideoStream(video) {
  if (video.srcObject) {
    const tracks = video.srcObject.getTracks();
    tracks.forEach(track => track.stop());
  }
}

// Function to check if the marker is centered in the view
function isMarkerCentered(camera, marker) {
  const vector = new THREE.Vector3().copy(marker.position).project(camera);
  const dx = vector.x;
  const dy = vector.y;
  const threshold = 0.05;
  return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
}

export default PanoramaViewer;













// // src/components/PanoramaViewer.jsx

// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// import { DeviceOrientationControls } from 'three/examples/jsm/controls/DeviceOrientationControls';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// const PanoramaViewer = () => {
//   // Refs for Three.js components
//   const mountRef = useRef(null);
//   const rendererRef = useRef(null);
//   const cameraRef = useRef(null);
//   const sceneRef = useRef(null);

//   const videoPlaneRef = useRef(null);
//   const videoTextureRef = useRef(null);
//   const markerRef = useRef(null);
//   const hiddenCanvasRef = useRef(null);

//   // **Top-Level Plane Dimensions**
//   const planeWidth = 4; // Adjust as needed for horizontal coverage
//   const planeHeight = 5; // Adjust as needed for vertical coverage

//   // Sphere and placement settings
//   const sphereRadius = 5;
//   const offsetFromSurface = 0.01;

//   // **Global Configuration**
//   const hfov = 60; // Horizontal Field of View in degrees
//   const vfov = 60; // Vertical Field of View in degrees

//   // Define elevation levels starting from equator and alternating upwards and downwards
//   const elevationLevels = [0, 30, -30, 60, -60, 90, -90]; // Degrees

//   // Define azimuthal increments based on elevation (Negative keys are quoted)
//   const azimuthIncrements = {
//     0: 30,    // Equator: high density
//     30: 45,   // Upper mid
//     '-30': 45, // Lower mid
//     60: 60,   // Upper high
//     '-60': 60, // Lower high
//     90: 90,   // North Pole
//     '-90': 90  // South Pole
//   };

//   // Calculate maximum captures based on azimuthal increments
//   let maxCaptures = 0;
//   elevationLevels.forEach(elev => {
//     const increment = azimuthIncrements[elev] || 60; // Default to 60° if not defined
//     maxCaptures += Math.ceil(360 / increment);
//   });

//   // **Capture Queue Initialization**
//   const captureQueueRef = useRef([]);

//   // State to indicate when the capture queue is ready
//   const [queueReady, setQueueReady] = useState(false);

//   // Initialize the capture queue
//   useEffect(() => {
//     const queue = [];
//     elevationLevels.forEach(elev => {
//       const increment = azimuthIncrements[elev] || 60;
//       const captures = Math.ceil(360 / increment);
//       for (let i = 0; i < captures; i++) {
//         queue.push({ azimuth: i * increment, elevation: elev });
//       }
//     });
//     captureQueueRef.current = queue;
//     setQueueReady(true); // Indicate that the queue is ready
//   }, []);

//   // Refs for mutable variables
//   const captureCountRef = useRef(0);
//   const capturingRef = useRef(false);
//   const firstCaptureDoneRef = useRef(false);

//   // State variables for UI
//   const [instructions, setInstructions] = useState("Press 'Capture' to take the first image.");
//   const [captureCount, setCaptureCount] = useState(0);
//   const [showFlash, setShowFlash] = useState(false); // For visual feedback

//   useEffect(() => {
//     // Initialize Three.js Scene
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x000000);
//     sceneRef.current = scene;

//     // Setup Camera
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       mountRef.current.clientWidth / mountRef.current.clientHeight,
//       0.1,
//       1000
//     );
//     camera.position.set(0, 0, 0);
//     cameraRef.current = camera;

//     // Setup Renderer
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     mountRef.current.appendChild(renderer.domElement);
//     rendererRef.current = renderer;

//     // Choose Controls Based on Device
//     let controls;
//     if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
//       // For iOS 13+ devices, need to request permission
//       DeviceOrientationEvent.requestPermission()
//         .then(permissionState => {
//           if (permissionState === 'granted') {
//             controls = new DeviceOrientationControls(camera);
//             controls.connect();
//           } else {
//             console.warn('Device Orientation permission denied. Falling back to OrbitControls.');
//             controls = new OrbitControls(camera, renderer.domElement);
//             configureOrbitControls(controls);
//           }
//         })
//         .catch(console.error);
//     } else if (window.DeviceOrientationEvent) {
//       // Use DeviceOrientationControls for other mobile devices
//       controls = new DeviceOrientationControls(camera);
//       controls.connect();
//     } else {
//       // Use OrbitControls for desktop
//       controls = new OrbitControls(camera, renderer.domElement);
//       configureOrbitControls(controls);
//     }

//     // Add a Semi-Transparent Sphere as a Reference (Visible from Inside)
//     const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
//     const sphereMaterial = new THREE.MeshBasicMaterial({
//       color: 0x44aa88,
//       transparent: true,
//       opacity: 0.3,
//       side: THREE.BackSide // Ensures visibility from inside
//     });
//     const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//     scene.add(sphere);

//     // Setup Video Feed from the Back Camera
//     const video = document.createElement('video');
//     video.setAttribute('playsinline', '');
//     video.autoplay = true;
//     video.muted = true;

//     navigator.mediaDevices
//       .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
//       .then((stream) => {
//         video.srcObject = stream;
//         video.play();
//       })
//       .catch((err) => {
//         console.error('Error accessing back camera: ', err);
//         setInstructions("Unable to access the camera. Please check permissions.");
//       });

//     const videoTexture = new THREE.VideoTexture(video);
//     videoTexture.minFilter = THREE.LinearFilter;
//     videoTexture.magFilter = THREE.LinearFilter;
//     videoTextureRef.current = videoTexture;

//     // **Use the top-level planeWidth and planeHeight**
//     // Create the Video Plane and Add to Scene
//     const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//     const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
//     const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
//     scene.add(videoPlane);
//     videoPlaneRef.current = videoPlane;

//     // Add a Marker (Red Dot) to Guide the User for Next Captures
//     const marker = createMarker();
//     scene.add(marker);
//     markerRef.current = marker;

//     // Place Video Plane and Marker at the first capture position
//     if (captureQueueRef.current.length > 0) {
//       const firstCapture = captureQueueRef.current[0];
//       placeObjectOnSphere(videoPlane, firstCapture.azimuth, firstCapture.elevation);
//       placeObjectOnSphere(marker, firstCapture.azimuth, firstCapture.elevation);
//     }

//     // Create a Hidden Canvas for Capturing Video Frames
//     const hiddenCanvas = document.createElement('canvas');
//     hiddenCanvas.width = video.videoWidth || 640;
//     hiddenCanvas.height = video.videoHeight || 480;
//     hiddenCanvasRef.current = hiddenCanvas;

//     // Handle Window Resizing
//     const onWindowResize = () => {
//       camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     };
//     window.addEventListener('resize', onWindowResize, false);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       if (controls) controls.update();
//       renderer.render(scene, camera);

//       // After the First Capture, Auto-Capture When Aligned
//       if (
//         firstCaptureDoneRef.current &&
//         !capturingRef.current &&
//         captureCountRef.current < maxCaptures &&
//         isMarkerCentered(camera, marker)
//       ) {
//         capturingRef.current = true;
//         autoCaptureImage().then(() => {
//           capturingRef.current = false;
//         });
//       }
//     };
//     animate();

//     // Cleanup on Unmount
//     return () => {
//       window.removeEventListener('resize', onWindowResize);
//       if (mountRef.current && renderer.domElement) {
//         mountRef.current.removeChild(renderer.domElement);
//       }
//       renderer.dispose();
//       if (controls instanceof DeviceOrientationControls) {
//         controls.disconnect();
//       } else if (controls instanceof OrbitControls) {
//         controls.dispose();
//       }
//       stopVideoStream(video);
//     };
//   }, []); // Empty dependency array ensures this runs once

//   // Configure OrbitControls (Helper Function)
//   const configureOrbitControls = (controls) => {
//     controls.enableDamping = true;
//     controls.dampingFactor = 0.05;
//     controls.minDistance = 1;
//     controls.maxDistance = 100;
//     controls.enablePan = false;
//     controls.enableZoom = true;
//   };

//   // Capture Image Function
//   const captureImage = () => {
//     if (!capturingRef.current && captureCountRef.current < maxCaptures) {
//       performCapture(false);
//     }
//   };

//   // Auto Capture Function
//   const autoCaptureImage = async () => {
//     return performCapture(true);
//   };

//   // Perform Capture Function
//   const performCapture = (isAuto) => {
//     const renderer = rendererRef.current;
//     const scene = sceneRef.current;
//     const videoPlane = videoPlaneRef.current;
//     const marker = markerRef.current;
//     const hiddenCanvas = hiddenCanvasRef.current;
//     const video = videoTextureRef.current.image;
//     const queue = captureQueueRef.current;

//     if (!renderer || !scene || !videoPlane || !marker || !hiddenCanvas || !video) return;

//     if (queue.length === 0) {
//       setInstructions("All captures completed. Explore your panorama!");
//       return;
//     }

//     const { azimuth, elevation } = queue.shift(); // Dequeue the next capture

//     // Draw the current video frame to the hidden canvas
//     const ctx = hiddenCanvas.getContext('2d');
//     hiddenCanvas.width = video.videoWidth || 640;
//     hiddenCanvas.height = video.videoHeight || 480;
//     ctx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

//     // Get the Data URL from the Hidden Canvas
//     const dataURL = hiddenCanvas.toDataURL('image/png');

//     return new Promise((resolve) => {
//       const img = new Image();
//       img.onload = () => {
//         // Create a texture from the captured image
//         const capturedTexture = new THREE.Texture(img);
//         capturedTexture.needsUpdate = true;

//         // Create a plane for the captured image with FrontSide
//         const capturedPlane = createCapturedPlane(capturedTexture, planeWidth, planeHeight); // planeWidth and planeHeight are defined
//         capturedPlane.userData.isCaptured = true; // Tag for potential removal/reset
//         scene.add(capturedPlane);

//         // Place the captured plane on the sphere at the current azimuth and elevation
//         placeObjectOnSphere(capturedPlane, azimuth, elevation);

//         console.log(`Captured image placed at Azimuth: ${azimuth}°, Elevation: ${elevation}°`);

//         // Increment capture count
//         captureCountRef.current += 1;
//         setCaptureCount(captureCountRef.current); // Update state for UI

//         // Update Instructions
//         if (!isAuto) {
//           setInstructions("Image captured. Rotate the device to align the next marker for automatic capture.");
//           firstCaptureDoneRef.current = true;
//         } else {
//           setInstructions(`Image ${captureCountRef.current} captured. Rotate to align and auto-capture again.`);
//         }

//         // Move Video Plane and Marker to New Azimuth and Elevation
//         placeObjectOnSphere(videoPlaneRef.current, azimuth, elevation);
//         placeObjectOnSphere(marker, azimuth, elevation);

//         // Flash Effect for Visual Feedback
//         setShowFlash(true);
//         setTimeout(() => setShowFlash(false), 200); // Flash duration: 200ms

//         resolve();
//       };
//       img.src = dataURL;
//     });
//   };

//   // Helper Function to Place Objects on the Sphere
//   const placeObjectOnSphere = (obj, azimuthDeg, elevationDeg) => {
//     const r = sphereRadius - offsetFromSurface;
//     const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg);
//     const elevationRad = THREE.MathUtils.degToRad(elevationDeg);

//     const x = r * Math.cos(elevationRad) * Math.sin(azimuthRad);
//     const y = r * Math.sin(elevationRad);
//     const z = r * Math.cos(elevationRad) * Math.cos(azimuthRad);

//     obj.position.set(x, y, -z); // Negative z to face inward
//     obj.lookAt(0, 0, 0); // Ensure the plane faces the center
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
//       {/* Instructions and (Initial) Capture Button */}
//       <div 
//         style={{ 
//           position: 'absolute', 
//           top: '10px', 
//           left: '10px', 
//           zIndex: 1, 
//           color: 'white', 
//           background: 'rgba(0,0,0,0.5)', 
//           padding: '10px',
//           borderRadius: '5px',
//           maxWidth: '300px'
//         }}
//       >
//         {queueReady && captureCount < maxCaptures && captureQueueRef.current.length > 0 && !firstCaptureDoneRef.current && (
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
//         <div style={{ marginTop: '10px' }}>
//           Captures: {captureCount} / {maxCaptures}
//         </div>
//       </div>
//       {/* Flash Effect for Visual Feedback */}
//       {showFlash && (
//         <div
//           style={{
//             position: 'absolute',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(255,255,255,0.8)',
//             zIndex: 3,
//             pointerEvents: 'none'
//           }}
//         />
//       )}
//     </div>
//   );
// };

// /** Helper Functions **/

// // Function to create the red marker
// function createMarker() {
//   const markerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
//   const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//   return new THREE.Mesh(markerGeometry, markerMaterial);
// }

// // Function to create a captured image plane
// function createCapturedPlane(texture, width, height) {
//   const geometry = new THREE.PlaneGeometry(width, height);
//   const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide }); // FrontSide ensures visibility from inside
//   return new THREE.Mesh(geometry, material);
// }

// // Function to stop the video stream
// function stopVideoStream(video) {
//   if (video.srcObject) {
//     const tracks = video.srcObject.getTracks();
//     tracks.forEach(track => track.stop());
//   }
// }

// // Function to check if the marker is centered in the view
// function isMarkerCentered(camera, marker) {
//   const vector = new THREE.Vector3().copy(marker.position).project(camera);
//   const dx = vector.x;
//   const dy = vector.y;
//   const threshold = 0.05;
//   return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
// }

// export default PanoramaViewer;













// // src/components/PanoramaViewer.jsx

// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// import { DeviceOrientationControls } from 'three-stdlib';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// const PanoramaViewer = () => {
//   const mountRef = useRef(null);
//   const rendererRef = useRef(null);
//   const cameraRef = useRef(null);
//   const sceneRef = useRef(null);

//   const videoPlaneRef = useRef(null);
//   const videoTextureRef = useRef(null);
//   const markerRef = useRef(null);
//   const hiddenCanvasRef = useRef(null);

//   // **Top-Level Plane Dimensions**
//   const planeWidth = 4; // Increased to 4 units for wider horizontal coverage
//   const planeHeight = 5; // Increased to 5 units for taller vertical coverage

//   // Sphere and placement settings
//   const sphereRadius = 5;
//   const offsetFromSurface = 0.01;

//   // Capture configuration
//   const hfov = 60; // Horizontal Field of View in degrees (adjust based on actual camera)
//   const vfov = 45; // Vertical Field of View in degrees (adjust based on actual camera)

//   const azIncrement = hfov * 0.75; // 45°
//   const elevationStep = vfov * 0.75; // 33.75°, rounded to 30° for simplicity

//   const elevationLevels = [-60, -30, 0, 30, 60]; // Degrees
//   const maxCapturesPerElevation = Math.ceil(360 / azIncrement); // 8 captures
//   const maxCaptures = elevationLevels.length * maxCapturesPerElevation; // 5 * 8 = 40 captures

//   // Refs for mutable variables
//   const captureCountRef = useRef(0);
//   const currentAzimuthRef = useRef(0); // Horizontal angle in degrees
//   const currentElevationIndexRef = useRef(0); // Index for elevation levels
//   const capturingRef = useRef(false);
//   const firstCaptureDoneRef = useRef(false);

//   // State variables for UI
//   const [instructions, setInstructions] = useState("Press 'Capture' to take the first image.");
//   const [captureCount, setCaptureCount] = useState(0);
//   const [showFlash, setShowFlash] = useState(false); // For visual feedback

//   useEffect(() => {
//     // Initialize Three.js Scene
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x000000);
//     sceneRef.current = scene;

//     // Setup Camera
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       mountRef.current.clientWidth / mountRef.current.clientHeight,
//       0.1,
//       1000
//     );
//     camera.position.set(0, 0, 0);
//     cameraRef.current = camera;

//     // Setup Renderer
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     mountRef.current.appendChild(renderer.domElement);
//     rendererRef.current = renderer;

//     // Choose Controls Based on Device
//     let controls;
//     if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
//       // For iOS 13+ devices, need to request permission
//       DeviceOrientationEvent.requestPermission()
//         .then(permissionState => {
//           if (permissionState === 'granted') {
//             controls = new DeviceOrientationControls(camera);
//             controls.connect();
//           } else {
//             console.warn('Device Orientation permission denied.');
//             controls = new OrbitControls(camera, renderer.domElement);
//             configureOrbitControls(controls);
//           }
//         })
//         .catch(console.error);
//     } else if (window.DeviceOrientationEvent) {
//       // Use DeviceOrientationControls for other mobile devices
//       controls = new DeviceOrientationControls(camera);
//       controls.connect();
//     } else {
//       // Use OrbitControls for desktop
//       controls = new OrbitControls(camera, renderer.domElement);
//       configureOrbitControls(controls);
//     }

//     // Add a Semi-Transparent Sphere as a Reference (Visible from Inside)
//     const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
//     const sphereMaterial = new THREE.MeshBasicMaterial({
//       color: 0x44aa88,
//       transparent: true,
//       opacity: 0.3,
//       side: THREE.BackSide // Ensures visibility from inside
//     });
//     const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//     scene.add(sphere);

//     // Setup Video Feed from the Back Camera
//     const video = document.createElement('video');
//     video.setAttribute('playsinline', '');
//     video.autoplay = true;
//     video.muted = true;

//     navigator.mediaDevices
//       .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
//       .then((stream) => {
//         video.srcObject = stream;
//         video.play();
//       })
//       .catch((err) => {
//         console.error('Error accessing back camera: ', err);
//         setInstructions("Unable to access the camera. Please check permissions.");
//       });

//     const videoTexture = new THREE.VideoTexture(video);
//     videoTexture.minFilter = THREE.LinearFilter;
//     videoTexture.magFilter = THREE.LinearFilter;
//     videoTextureRef.current = videoTexture;

//     // **Use the top-level planeWidth and planeHeight**
//     // Create the Video Plane and Add to Scene
//     const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//     const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
//     const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
//     scene.add(videoPlane);
//     videoPlaneRef.current = videoPlane;

//     // Helper Function to Place Objects on the Inner Surface of the Sphere
//     const placeObjectOnSphere = (obj, azimuthDeg, elevationDeg) => {
//       const r = sphereRadius - offsetFromSurface;
//       const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg);
//       const elevationRad = THREE.MathUtils.degToRad(elevationDeg);

//       const x = r * Math.cos(elevationRad) * Math.sin(azimuthRad);
//       const y = r * Math.sin(elevationRad);
//       const z = r * Math.cos(elevationRad) * Math.cos(azimuthRad);

//       obj.position.set(x, y, -z); // Negative z to face inward
//       obj.lookAt(0, 0, 0); // Ensure the plane faces the center
//     };

//     // Initial Placement with first elevation
//     const initialElevation = elevationLevels[currentElevationIndexRef.current];
//     placeObjectOnSphere(videoPlane, currentAzimuthRef.current, initialElevation);

//     // Add a Marker (Red Dot) to Guide the User for Next Captures
//     const marker = createMarker();
//     scene.add(marker);
//     markerRef.current = marker;
//     placeObjectOnSphere(marker, currentAzimuthRef.current, initialElevation);

//     // Create a Hidden Canvas for Capturing Video Frames
//     const hiddenCanvas = document.createElement('canvas');
//     hiddenCanvas.width = video.videoWidth || 640;
//     hiddenCanvas.height = video.videoHeight || 480;
//     hiddenCanvasRef.current = hiddenCanvas;

//     // Handle Window Resizing
//     const onWindowResize = () => {
//       camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     };
//     window.addEventListener('resize', onWindowResize, false);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       if (controls) controls.update();
//       renderer.render(scene, camera);

//       // After the First Capture, Auto-Capture When Aligned
//       if (
//         firstCaptureDoneRef.current &&
//         !capturingRef.current &&
//         captureCountRef.current < maxCaptures &&
//         isMarkerCentered(camera, marker)
//       ) {
//         capturingRef.current = true;
//         autoCaptureImage().then(() => {
//           capturingRef.current = false;
//         });
//       }
//     };
//     animate();

//     // Cleanup on Unmount
//     return () => {
//       window.removeEventListener('resize', onWindowResize);
//       if (mountRef.current && renderer.domElement) {
//         mountRef.current.removeChild(renderer.domElement);
//       }
//       renderer.dispose();
//       if (controls instanceof DeviceOrientationControls) {
//         controls.disconnect();
//       } else if (controls instanceof OrbitControls) {
//         controls.dispose();
//       }
//       stopVideoStream(video);
//     };
//   }, []); // Empty dependency array ensures this runs once

//   // Configure OrbitControls (Helper Function)
//   const configureOrbitControls = (controls) => {
//     controls.enableDamping = true;
//     controls.dampingFactor = 0.05;
//     controls.minDistance = 1;
//     controls.maxDistance = 100;
//     controls.enablePan = false;
//     controls.enableZoom = true;
//   };

//   // Capture Image Function
//   const captureImage = () => {
//     if (!capturingRef.current && captureCountRef.current < maxCaptures) {
//       performCapture(false);
//     }
//   };

//   // Auto Capture Function
//   const autoCaptureImage = async () => {
//     return performCapture(true);
//   };

//   // Perform Capture Function
//   const performCapture = (isAuto) => {
//     const renderer = rendererRef.current;
//     const scene = sceneRef.current;
//     const videoPlane = videoPlaneRef.current;
//     const marker = markerRef.current;
//     const hiddenCanvas = hiddenCanvasRef.current;
//     const video = videoTextureRef.current.image;

//     if (!renderer || !scene || !videoPlane || !marker || !hiddenCanvas || !video) return;

//     const ctx = hiddenCanvas.getContext('2d');
//     hiddenCanvas.width = video.videoWidth || 640;
//     hiddenCanvas.height = video.videoHeight || 480;
//     ctx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

//     // Get the Data URL from the Hidden Canvas
//     const dataURL = hiddenCanvas.toDataURL('image/png');

//     return new Promise((resolve) => {
//       const img = new Image();
//       img.onload = () => {
//         // Create a texture from the captured image
//         const capturedTexture = new THREE.Texture(img);
//         capturedTexture.needsUpdate = true;

//         // Create a plane for the captured image with FrontSide
//         const capturedPlane = createCapturedPlane(capturedTexture, planeWidth, planeHeight); // planeWidth and planeHeight are defined
//         capturedPlane.userData.isCaptured = true; // Tag for potential removal/reset
//         scene.add(capturedPlane);

//         // Determine current elevation
//         const currentElevation = elevationLevels[currentElevationIndexRef.current];

//         // Place the captured plane on the sphere at the current azimuth and elevation
//         placeObjectOnSphere(capturedPlane, currentAzimuthRef.current, currentElevation);

//         console.log(`Captured image placed at Azimuth: ${currentAzimuthRef.current}°, Elevation: ${currentElevation}°`);

//         // Increment capture count
//         captureCountRef.current += 1;
//         setCaptureCount(captureCountRef.current); // Update state for UI

//         // Check if all captures for current elevation are done
//         if (currentAzimuthRef.current >= 360 - azIncrement) {
//           currentAzimuthRef.current = 0; // Reset azimuth for next elevation
//           currentElevationIndexRef.current += 1; // Move to next elevation

//           if (currentElevationIndexRef.current >= elevationLevels.length) {
//             setInstructions("360° capture completed. Explore your panorama!");
//             return resolve();
//           }
//         } else {
//           currentAzimuthRef.current += azIncrement; // Move to next azimuth
//         }

//         // Update Instructions
//         if (!isAuto) {
//           setInstructions("Rotate the device to align the red dot with the center. Once aligned, image capture will happen automatically.");
//           firstCaptureDoneRef.current = true;
//         } else {
//           const currentCaptureNumber = captureCountRef.current;
//           setInstructions(`Image ${currentCaptureNumber} captured. Rotate to align and auto-capture again.`);
//         }

//         // Move Video Plane and Marker to New Azimuth and Elevation
//         const newElevation = elevationLevels[currentElevationIndexRef.current] || elevationLevels[elevationLevels.length - 1];
//         placeObjectOnSphere(videoPlaneRef.current, currentAzimuthRef.current, newElevation);
//         placeObjectOnSphere(marker, currentAzimuthRef.current, newElevation);

//         // **Flash Effect for Visual Feedback**
//         setShowFlash(true);
//         setTimeout(() => setShowFlash(false), 200); // Flash duration: 200ms

//         resolve();
//       };
//       img.src = dataURL;
//     });
//   };

//   // Helper Function to Place Objects on the Sphere
//   const placeObjectOnSphere = (obj, azimuthDeg, elevationDeg) => {
//     const r = sphereRadius - offsetFromSurface;
//     const azimuthRad = THREE.MathUtils.degToRad(azimuthDeg);
//     const elevationRad = THREE.MathUtils.degToRad(elevationDeg);

//     const x = r * Math.cos(elevationRad) * Math.sin(azimuthRad);
//     const y = r * Math.sin(elevationRad);
//     const z = r * Math.cos(elevationRad) * Math.cos(azimuthRad);

//     obj.position.set(x, y, -z); // Negative z to face inward
//     obj.lookAt(0, 0, 0); // Ensure the plane faces the center
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
//       {/* Instructions and (Initial) Capture Button */}
//       <div 
//         style={{ 
//           position: 'absolute', 
//           top: '10px', 
//           left: '10px', 
//           zIndex: 1, 
//           color: 'white', 
//           background: 'rgba(0,0,0,0.5)', 
//           padding: '10px',
//           borderRadius: '5px',
//           maxWidth: '300px'
//         }}
//       >
//         {captureCount < maxCaptures && !firstCaptureDoneRef.current && (
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
//         <div style={{ marginTop: '10px' }}>
//           Captures: {captureCount} / {maxCaptures}
//         </div>
//       </div>
//       {/* Flash Effect for Visual Feedback */}
//       {showFlash && (
//         <div
//           style={{
//             position: 'absolute',
//             top: 0,
//             left: 0,
//             width: '100%',
//             height: '100%',
//             backgroundColor: 'rgba(255,255,255,0.8)',
//             zIndex: 3,
//             pointerEvents: 'none'
//           }}
//         />
//       )}
//     </div>
//   );
// };

// /** Helper Functions **/

// // Function to create the red marker
// function createMarker() {
//   const markerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
//   const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//   return new THREE.Mesh(markerGeometry, markerMaterial);
// }

// // Function to create a captured image plane
// function createCapturedPlane(texture, width, height) {
//   const geometry = new THREE.PlaneGeometry(width, height);
//   const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide }); // Changed to FrontSide
//   return new THREE.Mesh(geometry, material);
// }

// // Function to stop the video stream
// function stopVideoStream(video) {
//   if (video.srcObject) {
//     const tracks = video.srcObject.getTracks();
//     tracks.forEach(track => track.stop());
//   }
// }

// // Function to check if the marker is centered in the view
// function isMarkerCentered(camera, marker) {
//   const vector = new THREE.Vector3().copy(marker.position).project(camera);
//   const dx = vector.x;
//   const dy = vector.y;
//   const threshold = 0.05;
//   return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
// }

// export default PanoramaViewer;















// // src/components/PanoramaViewer.jsx

// import React, { useEffect, useRef, useState } from 'react';
// import * as THREE from 'three';
// import { DeviceOrientationControls } from 'three-stdlib';
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// const PanoramaViewer = () => {
//   const mountRef = useRef(null);
//   const rendererRef = useRef(null);
//   const cameraRef = useRef(null);
//   const sceneRef = useRef(null);

//   const videoPlaneRef = useRef(null);
//   const videoTextureRef = useRef(null);
//   const markerRef = useRef(null);
//   const hiddenCanvasRef = useRef(null);

//   // Sphere and placement settings
//   const sphereRadius = 5;
//   const offsetFromSurface = 0.01;

//   // State variables
//   const [instructions, setInstructions] = useState("Press 'Capture' to take the first image.");
//   const [firstCaptureDone, setFirstCaptureDone] = useState(false);
//   const [captureCount, setCaptureCount] = useState(0);
//   const maxCaptures = 36; // 36 captures for 360° (every 10 degrees)
//   const angleIncrement = (Math.PI * 2) / maxCaptures; // ~0.1745 radians (~10 degrees)
//   const [currentAngle, setCurrentAngle] = useState(0);
//   const [capturing, setCapturing] = useState(false);

//   useEffect(() => {
//     // Initialize Three.js Scene
//     const scene = new THREE.Scene();
//     scene.background = new THREE.Color(0x000000);
//     sceneRef.current = scene;

//     // Setup Camera
//     const camera = new THREE.PerspectiveCamera(
//       75,
//       mountRef.current.clientWidth / mountRef.current.clientHeight,
//       0.1,
//       1000
//     );
//     camera.position.set(0, 0, 0);
//     cameraRef.current = camera;

//     // Setup Renderer
//     const renderer = new THREE.WebGLRenderer({ antialias: true });
//     renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     mountRef.current.appendChild(renderer.domElement);
//     rendererRef.current = renderer;

//     // Choose Controls Based on Device
//     let controls;
//     if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
//       // For iOS 13+ devices, need to request permission
//       DeviceOrientationEvent.requestPermission()
//         .then(permissionState => {
//           if (permissionState === 'granted') {
//             controls = new DeviceOrientationControls(camera);
//             controls.connect();
//           } else {
//             console.warn('Device Orientation permission denied.');
//             controls = new OrbitControls(camera, renderer.domElement);
//             configureOrbitControls(controls);
//           }
//         })
//         .catch(console.error);
//     } else if (window.DeviceOrientationEvent) {
//       // Use DeviceOrientationControls for other mobile devices
//       controls = new DeviceOrientationControls(camera);
//       controls.connect();
//     } else {
//       // Use OrbitControls for desktop
//       controls = new OrbitControls(camera, renderer.domElement);
//       configureOrbitControls(controls);
//     }

//     // Add a Semi-Transparent Sphere as a Reference (Visible from Inside)
//     const sphereGeometry = new THREE.SphereGeometry(sphereRadius, 64, 64);
//     const sphereMaterial = new THREE.MeshBasicMaterial({
//       color: 0xffffff,
//       transparent: true,
//       opacity: 0.3,
//       side: THREE.BackSide // Ensures visibility from inside
//     });
//     const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
//     scene.add(sphere);

//     // Setup Video Feed from the Back Camera
//     const video = document.createElement('video');
//     video.setAttribute('playsinline', '');
//     video.autoplay = true;
//     video.muted = true;

//     navigator.mediaDevices
//       .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
//       .then((stream) => {
//         video.srcObject = stream;
//         video.play();
//       })
//       .catch((err) => {
//         console.error('Error accessing back camera: ', err);
//         setInstructions("Unable to access the camera. Please check permissions.");
//       });

//     const videoTexture = new THREE.VideoTexture(video);
//     videoTexture.minFilter = THREE.LinearFilter;
//     videoTexture.magFilter = THREE.LinearFilter;
//     videoTextureRef.current = videoTexture;

//     // Dimensions for the Video Plane
//     const planeWidth = 2; // Adjusted to 2 as per your request
//     const planeHeight = 3;

//     // Create the Video Plane and Add to Scene
//     const planeGeometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
//     const planeMaterial = new THREE.MeshBasicMaterial({ map: videoTexture, side: THREE.DoubleSide });
//     const videoPlane = new THREE.Mesh(planeGeometry, planeMaterial);
//     scene.add(videoPlane);
//     videoPlaneRef.current = videoPlane;

//     // Helper Function to Place Objects on the Inner Surface of the Sphere
//     const placeObjectOnSphere = (obj, angle) => {
//       const r = sphereRadius - offsetFromSurface;
//       const x = r * Math.sin(angle);
//       const z = r * Math.cos(angle);
//       obj.position.set(x, 0, -z);
//       obj.rotation.set(0, Math.PI - angle, 0);
//     };

//     // Initial Placement
//     placeObjectOnSphere(videoPlane, currentAngle);

//     // Add a Marker (Red Dot) to Guide the User for Next Captures
//     const marker = createMarker();
//     scene.add(marker);
//     markerRef.current = marker;
//     placeObjectOnSphere(marker, currentAngle);

//     // Create a Hidden Canvas for Capturing Video Frames
//     const hiddenCanvas = document.createElement('canvas');
//     hiddenCanvas.width = video.videoWidth || 640;
//     hiddenCanvas.height = video.videoHeight || 480;
//     hiddenCanvasRef.current = hiddenCanvas;

//     // Handle Window Resizing
//     const onWindowResize = () => {
//       camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
//       camera.updateProjectionMatrix();
//       renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
//     };
//     window.addEventListener('resize', onWindowResize, false);

//     // Animation Loop
//     const animate = () => {
//       requestAnimationFrame(animate);
//       controls.update();
//       renderer.render(scene, camera);

//       // After the First Capture, Auto-Capture When Aligned
//       if (
//         firstCaptureDone &&
//         !capturing &&
//         captureCount < maxCaptures &&
//         isMarkerCentered(camera, marker)
//       ) {
//         setCapturing(true);
//         autoCaptureImage().then(() => {
//           setCapturing(false);
//         });
//       }
//     };
//     animate();

//     // Cleanup on Unmount
//     return () => {
//       window.removeEventListener('resize', onWindowResize);
//       if (mountRef.current && renderer.domElement) {
//         mountRef.current.removeChild(renderer.domElement);
//       }
//       renderer.dispose();
//       if (controls instanceof DeviceOrientationControls) {
//         controls.disconnect();
//       } else if (controls instanceof OrbitControls) {
//         controls.dispose();
//       }
//       stopVideoStream(video);
//     };
//   }, [firstCaptureDone, captureCount, currentAngle, capturing]);

//   // Configure OrbitControls (Helper Function)
//   const configureOrbitControls = (controls) => {
//     controls.enableDamping = true;
//     controls.dampingFactor = 0.05;
//     controls.minDistance = 1;
//     controls.maxDistance = 100;
//     controls.enablePan = false;
//     controls.enableZoom = true;
//   };

//   // First Manual Capture via Button
//   const captureImage = () => {
//     performCapture(false);
//   };

//   // Subsequent Captures Happen Automatically Once Aligned
//   const autoCaptureImage = async () => {
//     return performCapture(true);
//   };

//   const performCapture = (isAuto) => {
//     const renderer = rendererRef.current;
//     const scene = sceneRef.current;
//     const videoPlane = videoPlaneRef.current;
//     const marker = markerRef.current;
//     const hiddenCanvas = hiddenCanvasRef.current;
//     const video = videoTextureRef.current.image;

//     if (!renderer || !scene || !videoPlane || !marker || !hiddenCanvas || !video) return;

//     const ctx = hiddenCanvas.getContext('2d');
//     hiddenCanvas.width = video.videoWidth || 640;
//     hiddenCanvas.height = video.videoHeight || 480;
//     ctx.drawImage(video, 0, 0, hiddenCanvas.width, hiddenCanvas.height);

//     // Get the Data URL from the Hidden Canvas
//     const dataURL = hiddenCanvas.toDataURL('image/png');

//     return new Promise((resolve) => {
//       const img = new Image();
//       img.onload = () => {
//         // Create a texture from the captured image
//         const capturedTexture = new THREE.Texture(img);
//         capturedTexture.needsUpdate = true;

//         // Create a plane for the captured image
//         const capturedPlane = createCapturedPlane(capturedTexture, 2, 3); // planeWidth set to 2
//         scene.add(capturedPlane);

//         // Place the captured plane on the sphere at the current angle
//         placeObjectOnSphere(capturedPlane, currentAngle);

//         console.log(`Captured image placed at angle: ${(currentAngle * (180 / Math.PI)).toFixed(2)}°`);

//         // Move to Next Angle
//         let newAngle = currentAngle + angleIncrement;
//         if (newAngle >= Math.PI * 2) {
//           newAngle -= Math.PI * 2; // Wrap around
//         }
//         setCurrentAngle(newAngle);
//         placeObjectOnSphere(videoPlaneRef.current, newAngle);
//         placeObjectOnSphere(marker, newAngle);

//         setCaptureCount((prev) => prev + 1);

//         if (captureCount + 1 >= maxCaptures) {
//           setInstructions("360° capture completed. Explore your panorama!");
//         } else if (!isAuto) {
//           setInstructions("Rotate the device to align the red dot with the center. Once aligned, image capture will happen automatically.");
//           setFirstCaptureDone(true);
//         } else {
//           setInstructions(`Image ${captureCount + 1} captured. Rotate to align and auto-capture again.`);
//         }

//         resolve();
//       };
//       img.src = dataURL;
//     });
//   };

//   // Helper Function to Place Objects on the Sphere
//   const placeObjectOnSphere = (obj, angle) => {
//     const sphereRadius = 5;
//     const offsetFromSurface = 0.01;
//     const r = sphereRadius - offsetFromSurface;
//     const x = r * Math.sin(angle);
//     const z = r * Math.cos(angle);
//     obj.position.set(x, 0, -z);
//     obj.rotation.set(0, Math.PI - angle, 0);
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
//       {/* Instructions and (Initial) Capture Button */}
//       <div 
//         style={{ 
//           position: 'absolute', 
//           top: '10px', 
//           left: '10px', 
//           zIndex: 1, 
//           color: 'white', 
//           background: 'rgba(0,0,0,0.5)', 
//           padding: '10px',
//           borderRadius: '5px',
//           maxWidth: '300px'
//         }}
//       >
//         {!firstCaptureDone && captureCount < maxCaptures && (
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
//         <div style={{ marginTop: '10px' }}>
//           Captures: {captureCount} / {maxCaptures}
//         </div>
//       </div>
//     </div>
//   );
// };

// /** Helper Functions **/

// // Function to create the red marker
// function createMarker() {
//   const markerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
//   const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
//   return new THREE.Mesh(markerGeometry, markerMaterial);
// }

// // Function to create a captured image plane
// function createCapturedPlane(texture, width, height) {
//   const geometry = new THREE.PlaneGeometry(width, height);
//   const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
//   return new THREE.Mesh(geometry, material);
// }

// // Function to stop the video stream
// function stopVideoStream(video) {
//   if (video.srcObject) {
//     const tracks = video.srcObject.getTracks();
//     tracks.forEach(track => track.stop());
//   }
// }

// // Function to check if the marker is centered in the view
// function isMarkerCentered(camera, marker) {
//   const vector = new THREE.Vector3().copy(marker.position).project(camera);
//   const dx = vector.x;
//   const dy = vector.y;
//   const threshold = 0.05;
//   return Math.abs(dx) < threshold && Math.abs(dy) < threshold;
// }

// export default PanoramaViewer;



















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
