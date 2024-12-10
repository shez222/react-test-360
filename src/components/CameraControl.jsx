import React, { useEffect, useRef } from "react";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import * as THREE from "three";

const CameraControl = ({ onAlign }) => {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);

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

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controlsRef.current = controls;

    camera.position.set(0, 0, 5);

    const animate = () => {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
      const aligned = checkAlignment(controls);
      if (aligned) {
        onAlign();
      }
    };

    const checkAlignment = (controls) => {
      // Logic to check if camera is aligned with the active dot
      return true; // Placeholder: Replace with actual alignment logic
    };

    animate();

    return () => {
      mount.removeChild(renderer.domElement);
    };
  }, [onAlign]);

  return <div ref={mountRef} style={{ width: "100%", height: "400px" }} />;
};

export default CameraControl;
