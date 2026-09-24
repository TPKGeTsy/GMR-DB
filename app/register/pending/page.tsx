import { Clock } from "lucide-react";
import Link from "next/link";

export default function RegisterPendingPage() {
  return (
    <div className="max-w-sm mx-auto text-center py-16 space-y-3">
      <Clock className="w-10 h-10 text-orange-500 mx-auto" />
      <h1 className="text-lg font-bold text-gray-900">สมัครสำเร็จ รออนุมัติ</h1>
      <p className="text-sm text-gray-500">
        บัญชีของคุณถูกสร้างแล้ว แต่ยังเข้าใช้งานไม่ได้จนกว่าแอดมินจะอนุมัติ
        กรุณารอสักครู่แล้วลองเข้าสู่ระบบอีกครั้ง
      </p>
      <Link href="/login" className="inline-block text-sm text-orange-600 hover:text-orange-700 font-medium">
        ไปหน้าเข้าสู่ระบบ →
      </Link>
    </div>
  );
}
