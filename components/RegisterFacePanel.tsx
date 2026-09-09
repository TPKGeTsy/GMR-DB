"use client";

import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { registerFace, removeFace } from "@/app/actions/checkin";
import { ScanFace, Camera, Trash2 } from "lucide-react";

export default function RegisterFacePanel({
  userId,
  initialRegistered,
  initialRegisteredAt,
}: {
  userId: string;
  initialRegistered: boolean;
  initialRegisteredAt: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [modelsLoading, setModelsLoading] = useState(true);
  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState("Loading face recognition models...");
  const [registered, setRegistered] = useState(initialRegistered);
  const [registeredAt, setRegisteredAt] = useState(initialRegisteredAt);
  const [consented, setConsented] = useState(initialRegistered);

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        setModelsLoading(false);
        setStatusText("Ready. Start the camera to register a face.");
      } catch (err) {
        console.error("Model load error:", err);
        setStatusText("Failed to load face recognition models.");
      }
    };
    loadModels();
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraStarted(true);
        setStatusText("Camera ready. Look at the camera and capture.");
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setStatusText("Could not access the camera. Please allow camera permission.");
    }
  };

  const handleCapture = async () => {
    if (!consented) {
      setStatusText("กรุณายืนยันความยินยอมในการเก็บข้อมูลใบหน้าก่อน");
      return;
    }
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsSaving(true);
    setStatusText("Capturing face...");

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, displaySize);

    const detection = await faceapi
      .detectSingleFace(video)
      .withFaceLandmarks()
      .withFaceDescriptor();

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!detection) {
      setStatusText("No face detected. Look straight at the camera and try again.");
      setIsSaving(false);
      return;
    }

    const resized = faceapi.resizeResults(detection, displaySize);
    new faceapi.draw.DrawBox(resized.detection.box, {
      label: "Captured",
      boxColor: "#22c55e",
    }).draw(canvas);

    const descriptor = Array.from(detection.descriptor);
    const result = await registerFace(userId, descriptor, consented);

    if (result.success) {
      setRegistered(true);
      setRegisteredAt(new Date().toISOString());
      setStatusText("Face registered successfully.");
    } else {
      setStatusText(result.error || "Failed to register face.");
    }
    setIsSaving(false);
  };

  const handleRemove = async () => {
    if (!confirm("Remove this user's registered face?")) return;
    setIsSaving(true);
    const result = await removeFace(userId);
    if (result.success) {
      setRegistered(false);
      setRegisteredAt(null);
      setStatusText("Face registration removed.");
    } else {
      setStatusText(result.error || "Failed to remove face.");
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-white p-6 shadow rounded-lg border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
        <ScanFace className="w-4 h-4 mr-1.5" />
        Face Check-In
      </h2>

      {registered && (
        <p className="text-xs text-green-700 bg-green-50 rounded-md px-3 py-2 mb-3">
          Registered{registeredAt ? ` on ${new Date(registeredAt).toLocaleString("th-TH")}` : ""}
        </p>
      )}

      <p className="text-xs text-gray-500 mb-3">{statusText}</p>

      {!registered && (
        <label className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2.5 mb-3">
          <input
            type="checkbox"
            checked={consented}
            onChange={(e) => setConsented(e.target.checked)}
            className="mt-0.5 rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <span>
            ฉันยินยอมให้บริษัทเก็บและใช้ข้อมูลใบหน้าของฉัน (biometric data) เพื่อวัตถุประสงค์การเช็คอิน-เช็คเอาท์เท่านั้น
            ตามนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
          </span>
        </label>
      )}

      <div className="relative w-full aspect-[4/3] bg-black rounded-lg overflow-hidden border border-gray-200 mb-3">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover"
          style={{ display: isCameraStarted ? "block" : "none" }}
        />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {!isCameraStarted && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-xs">
            Camera off
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {!isCameraStarted ? (
          <button
            onClick={startCamera}
            disabled={modelsLoading}
            className="inline-flex items-center px-3 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 font-medium text-xs"
          >
            <Camera className="w-3.5 h-3.5 mr-1.5" />
            Start Camera
          </button>
        ) : (
          <button
            onClick={handleCapture}
            disabled={isSaving || !consented}
            className="inline-flex items-center px-3 py-2 rounded-md text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 font-medium text-xs"
          >
            <ScanFace className="w-3.5 h-3.5 mr-1.5" />
            {registered ? "Re-capture & Save" : "Capture & Save"}
          </button>
        )}

        {registered && (
          <button
            onClick={handleRemove}
            disabled={isSaving}
            className="inline-flex items-center px-3 py-2 rounded-md text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 font-medium text-xs"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
