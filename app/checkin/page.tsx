import { getFaceRoster } from "@/app/actions/checkin";
import { isKioskAuthorized } from "@/lib/kioskAuth";
import CheckInScanner from "@/components/CheckInScanner";
import { ScanFace, ShieldAlert } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  const authorized = await isKioskAuthorized();

  if (!authorized) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-3">
        <ShieldAlert className="w-10 h-10 text-orange-500 mx-auto" />
        <h1 className="text-lg font-bold text-gray-900">อุปกรณ์นี้ยังไม่ได้ตั้งค่า</h1>
        <p className="text-sm text-gray-500">
          เครื่องนี้ยังไม่ได้รับอนุญาตให้ใช้เช็คอินหน้ากล้อง ถ้านี่คือเครื่อง kiosk จริงของบริษัท
          กรุณาตั้งค่าก่อนใช้งาน
        </p>
        <Link href="/checkin/setup" className="inline-block text-sm text-orange-600 hover:text-orange-700 font-medium">
          ไปหน้าตั้งค่าอุปกรณ์ →
        </Link>
      </div>
    );
  }

  const roster = await getFaceRoster();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <ScanFace className="mr-2 h-6 w-6 text-orange-600" />
          Face Check-In
        </h1>
        <p className="text-gray-500">Look at the camera and scan to check in.</p>
      </div>

      <CheckInScanner initialRoster={roster.success && roster.data ? roster.data : []} />
    </div>
  );
}
