import { auth } from "@/auth";
import { getOutsideTripEmployeeOptions } from "@/app/actions/outsideTrip";
import StartOutsideTripForm from "@/components/StartOutsideTripForm";
import { MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OutsideTripPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return <div className="p-8 text-center text-red-600">กรุณาเข้าสู่ระบบก่อน</div>;
  }

  const result = await getOutsideTripEmployeeOptions();
  const employeeOptions = result.success && result.data ? result.data : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <MapPin className="mr-2 h-6 w-6 text-orange-600" />
          ออกหน้างาน (Outside Work Trip)
        </h1>
        <p className="text-gray-500">
          บันทึกทีมที่ออกไปทำงานนอกสถานที่ — ใครที่เช็คอินอยู่ในออฟฟิศจะถูกเช็คเอาท์ให้อัตโนมัติแล้วเปลี่ยนเป็นทำงานนอกสถานที่
        </p>
      </div>

      <StartOutsideTripForm employeeOptions={employeeOptions} currentUserId={session.user.id} />
    </div>
  );
}
