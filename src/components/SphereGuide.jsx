import React, { useEffect, useRef } from "react";
import * as THREE from "three";

const SphereGuide = ({ activeDotIndex, dots }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    mount.appendChild(renderer.domElement);

    // Add Sphere
    const sphereGeometry = new THREE.SphereGeometry(5, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      opacity: 0.3,
      transparent: true,
    });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    scene.add(sphere);

    // Add Dots
    dots.forEach((dot, index) => {
      const dotGeometry = new THREE.SphereGeometry(0.1, 16, 16);
      const dotMaterial = new THREE.MeshBasicMaterial({
        color: index === activeDotIndex ? 0x00ff00 : 0xff0000,
      });
      const dotMesh = new THREE.Mesh(dotGeometry, dotMaterial);
      dotMesh.position.set(dot.x, dot.y, dot.z);
      scene.add(dotMesh);
    });

    camera.position.z = 6;

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      mount.removeChild(renderer.domElement);
    };
  }, [dots, activeDotIndex]);

  return <div ref={mountRef} style={{ width: "100%", height: "400px" }} />;
};

export default SphereGuide;
