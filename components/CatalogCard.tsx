"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Package, Tag, HandHelping, PackageMinus } from "lucide-react";
import { Asset } from "@prisma/client";
import { borrowAsset } from "@/app/actions/loans";

export default function CatalogCard({ asset, isLoggedIn }: { asset: Asset; isLoggedIn: boolean }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [qty, setQty] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const isConsume = asset.issueType === "CONSUME";

  const handleBorrow = async () => {
    setIsSubmitting(true);
    setMessage(null);
    const result = await borrowAsset(asset.id, qty);
    if (result.success) {
      setShowForm(false);
      setQty(1);
      router.refresh();
    } else {
      setMessage(result.error || (isConsume ? "เบิกของไม่สำเร็จ" : "ยืมของไม่สำเร็จ"));
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col h-full group">
      {/* Image Area */}
      <div className="aspect-square relative bg-gray-50 border-b border-gray-100 overflow-hidden">
        {asset.imageUrl ? (
          <Image
            src={asset.imageUrl}
            alt={asset.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            style={{ objectPosition: asset.imagePosition || "50% 50%" }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300">
            <Package size={64} />
          </div>
        )}

        {/* Category Badge */}
        {asset.category && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-white/90 backdrop-blur-sm rounded text-[10px] font-bold text-gray-600 shadow-sm flex items-center z-10">
            <Tag size={10} className="mr-1" />
            {asset.category.toUpperCase()}
          </div>
        )}

        {/* เบิก/ยืม Badge */}
        <div
          className={`absolute bottom-2 left-2 px-2 py-1 rounded text-[10px] font-bold shadow-sm z-10 ${
            isConsume ? "bg-rose-100/90 text-rose-700" : "bg-blue-100/90 text-blue-700"
          }`}
        >
          {isConsume ? "เบิก (ไม่คืน)" : "ยืม (ต้องคืน)"}
        </div>

        {/* Status indicator Dot */}
        <div className="absolute top-2 right-2 z-10">
            {asset.categoryStatus === "R" && <div className="w-3 h-3 rounded-full bg-red-500 border-2 border-white shadow-sm" title="Critical" />}
            {asset.categoryStatus === "Y" && <div className="w-3 h-3 rounded-full bg-yellow-400 border-2 border-white shadow-sm" title="Warning" />}
            {asset.categoryStatus === "G" && <div className="w-3 h-3 rounded-full bg-green-500 border-2 border-white shadow-sm" title="Good" />}
            {asset.categoryStatus === "B" && <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-sm" title="New" />}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-3 flex flex-col flex-grow">
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 min-h-[2.5rem] mb-1 group-hover:text-orange-600 transition-colors">
          {asset.name}
        </h3>
        <p className="text-[11px] text-gray-500 mb-2 truncate">
          {asset.modelOrSize}
        </p>

        <div className="mt-auto pt-2 flex items-center justify-between border-t border-gray-50 mb-2">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400">ราคาประมาณการ</span>
            <span className="text-sm font-bold text-orange-600">
              ฿{Number(asset.unitPrice).toLocaleString("th-TH")}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block uppercase">คงเหลือ</span>
            <span className={`text-xs font-bold ${asset.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {asset.quantity} {asset.unit}
            </span>
          </div>
        </div>

        {/* Borrow Action */}
        {!isLoggedIn ? (
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors"
          >
            <HandHelping className="w-3.5 h-3.5" />
            เข้าสู่ระบบเพื่อ{isConsume ? "เบิก" : "ยืม"}
          </Link>
        ) : asset.quantity <= 0 ? (
          <span className="inline-flex items-center justify-center px-2 py-1.5 rounded-md bg-gray-100 text-gray-400 text-xs font-medium">
            ของหมดสต๊อก
          </span>
        ) : !showForm ? (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-orange-600 text-white hover:bg-orange-700 text-xs font-semibold transition-colors"
          >
            {isConsume ? <PackageMinus className="w-3.5 h-3.5" /> : <HandHelping className="w-3.5 h-3.5" />}
            {isConsume ? "เบิกของ" : "ยืมของ"}
          </button>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={1}
                max={asset.quantity}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Math.min(asset.quantity, Number(e.target.value))))}
                className="w-14 rounded-md border border-gray-300 px-1.5 py-1 text-xs focus:border-orange-500 focus:ring-orange-500 outline-none"
              />
              <button
                onClick={handleBorrow}
                disabled={isSubmitting}
                className="flex-1 px-2 py-1 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-xs font-semibold transition-colors"
              >
                {isSubmitting ? "กำลังบันทึก..." : isConsume ? "ยืนยันเบิก" : "ยืนยันยืม"}
              </button>
              <button
                onClick={() => { setShowForm(false); setMessage(null); }}
                disabled={isSubmitting}
                className="px-2 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 text-xs"
              >
                ยกเลิก
              </button>
            </div>
            {message && <p className="text-[10px] text-red-600">{message}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
