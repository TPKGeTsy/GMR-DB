"use client";

import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";
import { recordCheckIn } from "@/app/actions/checkin";
import { ScanFace, Camera, CheckCircle2, XCircle, LogIn, LogOut, MapPin } from "lucide-react";
import { formatThaiTime } from "@/lib/datetime";

interface RosterEntry {
  id: string;
  name: string;
  descriptor: number[];
}

interface RecentCheckIn {
  id: string;
  name: string;
  type: string;
  location: string;
  note: string | null;
  createdAt: string;
  confidence: number;
}

interface PendingMatch {
  userId: string;
  name: string;
  confidence: number;
}

// Horizontal position of the nose tip relative to the jawline's two edges,
// as a 0-1 ratio. Near 0.5 when facing the camera; shifts toward 0 or 1 as
// the head turns to either side (the near-side jaw edge foreshortens while
// the nose stays roughly put). Robust to lighting/resolution noise since it
// only depends on coarse landmark positions, not fine eyelid geometry.
function getYawRatio(landmarks: faceapi.FaceLandmarks68): number {
  const jaw = landmarks.getJawOutline();
  const noseTip = landmarks.getNose()[3];
  const [edgeA, edgeB] = [jaw[0], jaw[16]];
  const faceWidth = edgeB.x - edgeA.x;
  if (faceWidth === 0) return 0.5;
  return (noseTip.x - edgeA.x) / faceWidth;
}

const YAW_CENTER_RATIO = 0.5;
const YAW_TURN_OFFSET = 0.15;
const TURN_SAMPLE_COUNT = 25;
const TURN_SAMPLE_INTERVAL_MS = 150;

/**
 * Liveness check: watches the video for ~4 seconds and requires the head to
 * be seen turned to both sides at some point (in either order). A printed
 * photo or a frozen frame holds one fixed head angle and can never show
 * both, which is what the previous single-frame "smile" check couldn't rule
 * out. A deliberate head turn is also easier for people to perform on cue
 * than a precisely-timed blink.
 */
async function detectHeadTurn(video: HTMLVideoElement, onSample?: (i: number, total: number) => void): Promise<boolean> {
  let sawLeft = false;
  let sawRight = false;

  for (let i = 0; i < TURN_SAMPLE_COUNT; i++) {
    onSample?.(i, TURN_SAMPLE_COUNT);
    const detection = await faceapi.detectSingleFace(video).withFaceLandmarks();

    if (detection) {
      const yaw = getYawRatio(detection.landmarks);

      if (yaw <= YAW_CENTER_RATIO - YAW_TURN_OFFSET) sawLeft = true;
      else if (yaw >= YAW_CENTER_RATIO + YAW_TURN_OFFSET) sawRight = true;

      if (sawLeft && sawRight) return true;
    }

    await new Promise((resolve) => setTimeout(resolve, TURN_SAMPLE_INTERVAL_MS));
  }

  return false;
}

export default function CheckInScanner({ initialRoster }: { initialRoster: RosterEntry[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [modelsLoading, setModelsLoading] = useState(true);
  const [isCameraStarted, setIsCameraStarted] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("Loading face recognition models...");
  const [recent, setRecent] = useState<RecentCheckIn[]>([]);

  const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);
  const [outsideOffice, setOutsideOffice] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    const loadModels = async () => {
      try {
        await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
        await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
        await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
        await faceapi.nets.faceExpressionNet.loadFromUri("/models");
        setModelsLoading(false);
        setStatusText(
          initialRoster.length === 0
            ? "No faces registered yet. Ask an admin to register faces on the Users page."
            : "Ready. Start the camera to check in."
        );
      } catch (err) {
        console.error("Model load error:", err);
        setStatusText("Failed to load face recognition models.");
      }
    };
    loadModels();
  }, [initialRoster.length]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setIsCameraStarted(true);
        setStatusText("Camera ready. Click Scan to check in.");
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setStatusText("Could not access the camera. Please allow camera permission.");
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraStarted(false);
  };

  const handleScan = async () => {
    if (initialRoster.length === 0) {
      setStatusText("No faces registered yet.");
      return;
    }
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsScanning(true);
    setStatusText("Scanning...");

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
      setIsScanning(false);
      return;
    }

    const labeledDescriptors = initialRoster.map(
      (u) => new faceapi.LabeledFaceDescriptors(u.id, [new Float32Array(u.descriptor)])
    );
    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    const resized = faceapi.resizeResults(detection, displaySize);
    const isUnknown = bestMatch.label === "unknown";
    const confidence = 1 - bestMatch.distance;

    new faceapi.draw.DrawBox(resized.detection.box, {
      label: isUnknown ? "Unknown" : `${Math.round(confidence * 100)}%`,
      boxColor: isUnknown ? "#ef4444" : "#22c55e",
    }).draw(canvas);

    if (isUnknown) {
      setIsScanning(false);
      setStatusText("Face not recognized.");
      return;
    }

    const rosterEntry = initialRoster.find((u) => u.id === bestMatch.label);

    // Liveness check: require the head to turn to both sides, which a
    // printed photo or a frozen video frame physically cannot do. Stronger
    // than the old single-frame smile check, which a photo of a smiling
    // face could pass trivially.
    setStatusText(`ตรวจพบใบหน้า: ${rosterEntry?.name} — กรุณาหันหน้าช้าๆ ไปทางซ้ายและขวาเพื่อยืนยันตัวตน...`);
    const turned = await detectHeadTurn(video, (i, total) => {
      setStatusText(`ตรวจพบใบหน้า: ${rosterEntry?.name} — กรุณาหันหน้าซ้าย-ขวา (${i + 1}/${total})`);
    });

    setIsScanning(false);

    if (!turned) {
      setStatusText("ไม่พบการหันหน้า กรุณากดสแกนใหม่และหันหน้าซ้าย-ขวาให้ชัดเจนเพื่อยืนยันว่าไม่ใช่รูปถ่าย (liveness check)");
      return;
    }

    setPendingMatch({ userId: bestMatch.label, name: rosterEntry?.name || "Unknown", confidence });
    setOutsideOffice(false);
    setNote("");
    setStatusText(`Recognized: ${rosterEntry?.name}. Choose an action below.`);
  };

  const captureSnapshot = (): string | undefined => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return undefined;

    const snapshotCanvas = document.createElement("canvas");
    snapshotCanvas.width = video.videoWidth;
    snapshotCanvas.height = video.videoHeight;
    const ctx = snapshotCanvas.getContext("2d");
    if (!ctx) return undefined;

    ctx.drawImage(video, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
    return snapshotCanvas.toDataURL("image/jpeg", 0.8);
  };

  const handleConfirm = async (type: "IN" | "OUT") => {
    if (!pendingMatch) return;
    setIsSubmitting(true);

    const photoDataUrl = captureSnapshot();

    const result = await recordCheckIn(
      pendingMatch.userId,
      pendingMatch.confidence,
      type,
      outsideOffice ? "OUTSIDE" : "OFFICE",
      note.trim() || undefined,
      photoDataUrl
    );

    if (result.success && result.data) {
      setStatusText(
        `${result.data.type === "IN" ? "Checked in" : "Checked out"}: ${result.data.name}`
      );
      setRecent((prev) => [result.data!, ...prev].slice(0, 10));
      setPendingMatch(null);
      setOutsideOffice(false);
      setNote("");
      stopCamera();
    } else {
      setStatusText(result.error || "Failed to record check-in.");
    }
    setIsSubmitting(false);
  };

  const handleCancelMatch = () => {
    setPendingMatch(null);
    setOutsideOffice(false);
    setNote("");
    setStatusText("Ready. Start the camera to check in.");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white shadow rounded-lg border border-gray-100 p-6 space-y-4">
        <div className="flex items-center text-sm font-medium text-gray-700">
          <ScanFace className="w-4 h-4 mr-2 text-orange-600" />
          {statusText}
        </div>

        <div className="relative w-full max-w-[640px] aspect-[4/3] bg-black rounded-lg overflow-hidden border border-gray-200 mx-auto">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover -scale-x-100"
            style={{ display: isCameraStarted ? "block" : "none" }}
          />
          {/* Mirrored to match the video preview so the detection box lines up.
              The underlying pixel data (face detection, saved snapshot) is
              untouched by this — CSS transforms only affect rendering. */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full -scale-x-100" />
          {!isCameraStarted && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
              Camera off
            </div>
          )}
        </div>

        {!pendingMatch ? (
          <div className="flex justify-center gap-3">
            {!isCameraStarted ? (
              <button
                onClick={startCamera}
                disabled={modelsLoading}
                className="inline-flex items-center justify-center w-full sm:w-auto min-h-[60px] px-6 py-4 rounded-lg text-white bg-orange-600 hover:bg-orange-700 active:bg-orange-800 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 font-semibold text-lg transition-transform"
              >
                <Camera className="w-6 h-6 mr-2" />
                Start Camera
              </button>
            ) : (
              <button
                onClick={handleScan}
                disabled={isScanning}
                className="inline-flex items-center justify-center w-full sm:w-auto min-h-[60px] px-6 py-4 rounded-lg text-white bg-orange-600 hover:bg-orange-700 active:bg-orange-800 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 font-semibold text-lg transition-transform"
              >
                <ScanFace className="w-6 h-6 mr-2" />
                {isScanning ? "Scanning..." : "Scan & Check In"}
              </button>
            )}
          </div>
        ) : (
          <div className="border border-orange-100 bg-orange-50 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-gray-900">{pendingMatch.name}</p>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={outsideOffice}
                onChange={(e) => setOutsideOffice(e.target.checked)}
                className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
              />
              <MapPin className="w-4 h-4 text-gray-500" />
              Working outside the office
            </label>

            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                outsideOffice
                  ? "รายละเอียด (เช่น ออกไปหน้างาน, WFH, ธุระต่างจังหวัด)"
                  : "หมายเหตุ (ถ้ามาสาย โปรดระบุเหตุผล) — ไม่บังคับ"
              }
              className="w-full rounded-md border-gray-300 text-sm focus:border-orange-500 focus:ring-orange-500"
            />

            <div className="flex flex-wrap gap-3 pt-1">
              <button
                onClick={() => handleConfirm("IN")}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center flex-1 sm:flex-none px-5 py-4 rounded-lg text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 font-semibold text-base"
              >
                <LogIn className="w-5 h-5 mr-2" />
                Start Work
              </button>
              <button
                onClick={() => handleConfirm("OUT")}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center flex-1 sm:flex-none px-5 py-4 rounded-lg text-white bg-gray-700 hover:bg-gray-800 disabled:opacity-50 font-semibold text-base"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Finish Work
              </button>
              <button
                onClick={handleCancelMatch}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center flex-1 sm:flex-none px-5 py-4 rounded-lg text-gray-600 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 font-semibold text-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-900">Recent Check-Ins</h2>
        </div>
        <ul className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
          {recent.length === 0 ? (
            <li className="px-6 py-10 text-center text-sm text-gray-500 italic">
              No check-ins yet this session.
            </li>
          ) : (
            recent.map((c) => (
              <li key={c.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center text-sm font-medium text-gray-900">
                    <CheckCircle2 className="w-4 h-4 mr-2 text-green-500 flex-shrink-0" />
                    {c.name}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {formatThaiTime(c.createdAt)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {Math.round(c.confidence * 100)}% match
                    </p>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    c.type === "IN" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                  }`}>
                    {c.type === "IN" ? "Check In" : "Check Out"}
                  </span>
                  {c.location === "OUTSIDE" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-yellow-100 text-yellow-800">
                      Outside{c.note ? `: ${c.note}` : ""}
                    </span>
                  )}
                </div>
              </li>
            ))
          )}
        </ul>
        {initialRoster.length === 0 && (
          <div className="px-6 py-4 border-t border-gray-100 bg-yellow-50 text-xs text-yellow-800 flex items-start">
            <XCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            No one has a registered face yet.
          </div>
        )}
      </div>
    </div>
  );
}
