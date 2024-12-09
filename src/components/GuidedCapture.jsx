import React, { useRef, useEffect, useState } from "react";
import * as THREE from "three";

const GuidedCapture = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const mountRef = useRef(null);
  const [currentDot, setCurrentDot] = useState(0);
  const [capturedImages, setCapturedImages] = useState([]);

  useEffect(() => {
    // Access webcam
    const initCamera = async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    };
    initCamera();

    // Setup 3D scene
    const mount = mountRef.current;
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

    // Add sphere with dots
    const geometry = new THREE.SphereGeometry(5, 32, 16);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    const dots = [];
    for (let i = 0; i < 16; i++) {
      const dotGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);

      const theta = (i / 16) * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      dot.position.set(
        5 * Math.sin(phi) * Math.cos(theta),
        5 * Math.sin(phi) * Math.sin(theta),
        5 * Math.cos(phi)
      );
      dots.push(dot);
      scene.add(dot);
    }

    camera.position.z = 10;

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      mount.removeChild(renderer.domElement);
    };
  }, []);

  const captureImage = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const video = videoRef.current;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL("image/jpeg");
    setCapturedImages((prev) => [...prev, imageData]);
    setCurrentDot((prev) => prev + 1);
  };

  const saveImages = () => {
    capturedImages.forEach((image, index) => {
      const link = document.createElement("a");
      link.href = image;
      link.download = `capture-${index + 1}.jpg`;
      link.click();
    });
  };

  return (
    <div>
      <div ref={mountRef} style={{ width: "100%", height: "50vh" }} />
      <video ref={videoRef} autoPlay style={{ width: "100%", maxWidth: "640px" }} />
      <canvas ref={canvasRef} width="640" height="480" style={{ display: "none" }} />
      <button onClick={captureImage}>Capture Image for Dot {currentDot + 1}</button>
      {capturedImages.length > 0 && (
        <button onClick={saveImages}>Download Captured Images</button>
      )}
    </div>
  );
};

export default GuidedCapture;
