"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Car, CalendarPlus, Wrench } from "lucide-react";
import { createBooking } from "@/app/actions/carbooking";

interface Vehicle {
  id: string;
  name: string;
  licensePlate: string;
  imageUrl: string | null;
  status: string;
}

export default function VehicleBookingCard({ vehicle, isLoggedIn }: { vehicle: Vehicle; isLoggedIn: boolean }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [purpose, setPurpose] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isAvailable = vehicle.status === "AVAILABLE";

  const handleSubmit = async () => {
    if (!startAt || !endAt) {
      setMessage("กรุณาเลือกวันเวลาเริ่มต้นและสิ้นสุด");
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    const result = await createBooking(vehicle.id, startAt, endAt, purpose);
    if (result.success) {
      setShowForm(false);
      setStartAt("");
      setEndAt("");
      setPurpose("");
      router.refresh();
    } else {
      setMessage(result.error || "จองรถไม่สำเร็จ");
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
      <div className="aspect-video relative bg-gray-50 border-b border-gray-100 overflow-hidden">
        {vehicle.imageUrl ? (
          <Image src={vehicle.imageUrl} alt={vehicle.name} fill sizes="320px" className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <Car size={48} />
          </div>
        )}
        <div className="absolute top-2 right-2">
          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
            isAvailable ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-800"
          }`}>
            {isAvailable ? "พร้อมใช้งาน" : "ซ่อมบำรุง"}
          </span>
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-semibold text-gray-900">{vehicle.name}</h3>
        <p className="text-xs text-gray-500 mb-3">ทะเบียน {vehicle.licensePlate}</p>

        {!isAvailable ? (
          <span className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium">
            <Wrench className="w-3.5 h-3.5" />
            ไม่พร้อมให้จอง
          </span>
        ) : !isLoggedIn ? (
          <Link
            href="/login"
            className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors"
          >
            เข้าสู่ระบบเพื่อจอง
          </Link>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="mt-auto inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 text-xs font-semibold transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            จองรถคันนี้
          </button>
        ) : (
          <div className="space-y-2 mt-auto">
            <div>
              <label className="text-[10px] text-gray-500">เริ่มต้น</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500">สิ้นสุด</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
              />
            </div>
            <input
              type="text"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="วัตถุประสงค์ (ไม่บังคับ)"
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
            />
            {message && <p className="text-[10px] text-red-600">{message}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 px-2 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-xs font-semibold"
              >
                {isSubmitting ? "กำลังส่ง..." : "ส่งคำขอจอง"}
              </button>
              <button
                onClick={() => { setShowForm(false); setMessage(null); }}
                disabled={isSubmitting}
                className="px-2 py-1.5 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 text-xs"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
