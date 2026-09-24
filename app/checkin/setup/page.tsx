import KioskSetupForm from "@/components/KioskSetupForm";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function CheckInSetupPage() {
  return (
    <div className="max-w-sm mx-auto space-y-6 py-12">
      <div className="text-center">
        <ShieldCheck className="w-8 h-8 text-orange-500 mx-auto mb-2" />
        <h1 className="text-lg font-bold text-gray-900">ตั้งค่าอุปกรณ์ Kiosk</h1>
        <p className="text-sm text-gray-500 mt-1">
          ทำครั้งเดียวต่อเครื่อง — กรอกรหัสลับของบริษัทเพื่ออนุญาตให้เครื่องนี้ใช้เช็คอินหน้ากล้องได้
        </p>
      </div>
      <KioskSetupForm />
    </div>
  );
}
