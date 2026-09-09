import Link from "next/link";
import { 
  ListFilter, 
  PlusCircle, 
  ShieldCheck, 
  BarChart3, 
  Database,
  ArrowRight,
  Car,
  ScanFace,
  Grid2x2
} from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col space-y-16 pb-12">
      {/* Hero Section */}
      <section className="text-center space-y-6 pt-10">
        <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-orange-50 border border-orange-100 text-orange-700 text-sm font-medium mb-4">
          <ShieldCheck className="w-4 h-4 mr-2" />
          Engineering Asset Management System
        </div>
        <h1 className="text-5xl font-extrabold text-gray-900 tracking-tight sm:text-6xl">
          Group Maker Robotic <br />
          <span className="text-orange-600">Stock</span>
        </h1>
        {/* <p className="max-w-2xl mx-auto text-xl text-gray-700">
          ระบบควบคุมสต็อกอุปกรณ์วิศวกรรม ติดตามงบประมาณ และวิเคราะห์ข้อมูลสถานะวัสดุในที่เดียว 
          แม่นยำ รวดเร็ว และรองรับการขยายตัวในอนาคต
        </p> */}
        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
          <Link
            href="/inventory"
            className="inline-flex items-center px-8 py-3 border border-transparent text-base font-medium rounded-lg shadow-sm text-white bg-orange-600 hover:bg-orange-700 transition-colors"
          >
            ไปหน้าคลังสินค้า
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center px-8 py-3 border border-gray-300 text-base font-medium rounded-lg text-gray-900 bg-white hover:bg-gray-50 transition-colors"
          >
            ดูสรุปงบประมาณ
          </Link>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <Link href="/inventory">
            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
              <ListFilter className="w-6 h-6 text-blue-600" />
            </div>
          </Link>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Inventory Control</h3>
          <p className="text-gray-800 leading-relaxed">
            บันทึกข้อมูลอุปกรณ์ละเอียดครบถ้วน ทั้งรหัส รุ่น จำนวน และหน่วยนับ พร้อมระบบแยกประเภทสถานะ R/Y
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <Link href="/dashboard">
            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="w-6 h-6 text-green-600" />
            </div>
          </Link>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Budget Analytics</h3>
          <p className="text-gray-800 leading-relaxed">
            Dashboard สรุปงบประมาณที่ใช้ไปแบบ Real-time พร้อมกราฟวิเคราะห์สัดส่วนต้นทุนตามประเภทอุปกรณ์
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <Link href="/carbook">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
              <Car className="w-6 h-6 text-purple-600" />
            </div>
          </Link>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Car Booking</h3>
          <p className="text-gray-800 leading-relaxed">
            ระบบจองรถยนต์สำหรับออกหน้างาน ติดตามสถานะการจองแบบเรียลไทม์
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <Link href="/checkin">
            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-6">
              <ScanFace className="w-6 h-6 text-orange-600" />
            </div>
          </Link>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Face Scan Attendance</h3>
          <p className="text-gray-800 leading-relaxed">
            ระบบเช็คการเข้างานและเลิกงานด้วยการ scan หน้า
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <Link href="/schedule">
            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-6">
              <BarChart3 className="w-6 h-6 text-red-600" />
            </div>
          </Link>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Work Schedule</h3>
          <p className="text-gray-800 leading-relaxed">
            ระบบเช็คการวางแผนและตารางงานพนักงาน GMR
          </p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
          <Link href="/project">
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mb-6">
              <Grid2x2 className="w-6 h-6 text-gray-600" />
            </div>
          </Link>
          <h3 className="text-xl font-bold text-gray-900 mb-2">Project Management</h3>
          <p className="text-gray-800 leading-relaxed">
            ระบบจัดการโครงการและติดตามความคืบหน้าของงาน
          </p>
        </div>


      </section>

      {/* Quick Action Banner */}
      <section className="bg-orange-900 rounded-3xl p-8 md:p-12 text-white overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-4">
            <h2 className="text-3xl font-bold">เริ่มต้นระบบการจัดการคลัง</h2>
            <p className="text-orange-100 text-lg opacity-90">
              กรอกข้อมูลเพียงไม่กี่ขั้นตอน เพื่อเริ่มติดตามสถานะและงบประมาณของโครงการ
            </p>
          </div>
          <Link
            href="/inventory/new"
            className="inline-flex items-center px-6 py-4 border-none text-lg font-bold rounded-xl shadow-lg text-orange-900 bg-white hover:bg-orange-50 transition-all transform hover:scale-105"
          >
            <PlusCircle className="mr-2 h-6 w-6" />
            Add New Asset
          </Link>
        </div>
        {/* Decorative elements */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-orange-800 rounded-full opacity-50 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-orange-700 rounded-full opacity-30 blur-3xl"></div>
      </section>
    </div>
  );
}
