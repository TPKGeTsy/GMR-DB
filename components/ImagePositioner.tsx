"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Move } from "lucide-react";

interface ImagePositionerProps {
  src: string;
  initialPosition?: string;
  onChange: (position: string) => void;
}

export default function ImagePositioner({ src, initialPosition = "50% 50%", onChange }: ImagePositionerProps) {
  const [position, setPosition] = useState(initialPosition);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    let clientX, clientY;

    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as MouseEvent).clientX;
      clientY = (e as MouseEvent).clientY;
    }

    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));

    const newPosition = `${x.toFixed(2)}% ${y.toFixed(2)}%`;
    setPosition(newPosition);
    onChange(newPosition);
  }, [onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    updatePosition(e);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    isDragging.current = true;
    updatePosition(e);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) updatePosition(e);
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDragging.current) {
        e.preventDefault();
        updatePosition(e);
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [updatePosition]);

  return (
    <div className="flex flex-col items-center space-y-2 w-full">
      <p className="text-xs text-gray-500 flex items-center">
        <Move className="w-3 h-3 mr-1" /> จิ้มหรือลากบนรูปเพื่อเลือกจุดสำคัญ (Focus Point)
      </p>
      <div
        ref={containerRef}
        className="relative w-full max-w-xs h-64 border-2 border-orange-500 rounded-lg overflow-hidden cursor-crosshair select-none bg-white flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* รูปต้นฉบับแบบเต็มใบ */}
        <img
          src={src}
          alt="Positioning guide"
          className="max-w-full max-h-full object-contain pointer-events-none"
        />

        {/* จุด Focus ที่ลอยทับอยู่บนกรอบ */}
        <div 
          className="absolute w-8 h-8 border-4 border-white bg-orange-600 rounded-full shadow-[0_0_15px_rgba(0,0,0,0.6)] transform -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
          style={{ 
            left: position.split(" ")[0], 
            top: position.split(" ")[1] 
          }}
        >
          <div className="w-2 h-2 bg-white rounded-full" />
        </div>
        
        {/* เพิ่มเส้นกากบาทจางๆ เพื่อช่วยกะกึ่งกลาง */}
        <div className="absolute inset-0 pointer-events-none border-[1px] border-gray-200 opacity-20" />
      </div>
      <div className="text-[10px] text-gray-500 font-medium">
        จุดโฟกัส: {position}
      </div>
      <input type="hidden" name="imagePosition" value={position} />
    </div>
  );
}
