import React, { useRef } from "react";

const ImageCapture = ({ onCapture }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const startCamera = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoRef.current.srcObject = stream;
  };

  const captureImage = () => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg");
    onCapture(image);
  };

  return (
    <div>
      <video ref={videoRef} autoPlay style={{ width: "100%", maxWidth: "640px" }} />
      <canvas ref={canvasRef} width="640" height="480" style={{ display: "none" }} />
      <button onClick={startCamera}>Start Camera</button>
      <button onClick={captureImage}>Capture Image</button>
    </div>
  );
};

export default ImageCapture;
