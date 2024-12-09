import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const CaptureDots = () => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    const sphereGeometry = new THREE.SphereGeometry(5, 32, 16);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.5,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Add guide dots
    const dotMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 12; i++) {
      const dotGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const dot = new THREE.Mesh(dotGeometry, dotMaterial);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      dot.position.set(
        5 * Math.sin(phi) * Math.cos(theta),
        5 * Math.sin(phi) * Math.sin(theta),
        5 * Math.cos(phi)
      );
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

  return <div ref={mountRef} style={{ width: "100%", height: "400px" }} />;
};

export default CaptureDots;
