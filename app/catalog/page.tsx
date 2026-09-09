import { getCatalogAssets } from "@/app/actions/assets";
import { auth } from "@/auth";
import CatalogCard from "@/components/CatalogCard";
import Pagination from "@/components/Pagination";
import Search from "@/components/Search";
import { ShoppingBag } from "lucide-react";
import { Asset } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    query?: string;
  }>;
}) {
  const params = await searchParams;
  const currentPage = Number(params.page) || 1;
  const query = params.query || "";
  const limit = 12;

  const [result, session] = await Promise.all([
    getCatalogAssets({ page: currentPage, limit, query }),
    auth(),
  ]);
  const isLoggedIn = !!session?.user;

  if (!result.success || !result.data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <p className="text-xl font-semibold text-red-600">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>
        <p className="text-sm">กรุณาลองใหม่อีกครั้งในภายหลัง</p>
      </div>
    );
  }

  const { assets, totalPages } = result.data;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 flex items-center">
            <ShoppingBag className="mr-3 text-orange-600" size={32} />
            Asset Catalog
          </h1>
          <p className="mt-1 text-sm text-gray-500 font-medium">
            เรียกดูและค้นหาอุปกรณ์วิศวกรรมทั้งหมดในระบบ
          </p>
        </div>
        <div className="w-full md:w-96">
          <Search placeholder="ค้นหาชื่ออุปกรณ์, รุ่น หรือหมวดหมู่..." />
        </div>
      </div>

      {/* Assets Grid */}
      {assets.length > 0 ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 md:gap-6">
            {assets.map((asset: Asset) => (
              <CatalogCard key={asset.id} asset={asset} isLoggedIn={isLoggedIn} />
            ))}
          </div>
          
          <Pagination totalPages={totalPages} currentPage={currentPage} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
          <ShoppingBag size={48} className="text-gray-300 mb-4" />
          <p className="text-gray-500 font-medium">ไม่พบอุปกรณ์ที่ตรงกับการค้นหา</p>
          <p className="text-xs text-gray-400 mt-1">ลองใช้คำค้นหาอื่นหรือเรียกดูหมวดหมู่อื่นๆ</p>
        </div>
      )}
    </div>
  );
}
