"use client";

import Image from "next/image";
import { Package, Tag } from "lucide-react";

interface Asset {
  id: string;
  name: string;
  imageUrl: string | null;
  imagePosition: string | null;
  category: string | null;
  modelOrSize: string;
  quantity: number;
  unit: string;
  categoryStatus: string;
  unitPrice: number;
}

export default function CatalogCard({ asset }: { asset: Asset }) {
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
        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 min-h-[2.5rem] mb-1 group-hover:text-indigo-600 transition-colors">
          {asset.name}
        </h3>
        <p className="text-[11px] text-gray-500 mb-2 truncate">
          {asset.modelOrSize}
        </p>
        
        <div className="mt-auto pt-2 flex items-center justify-between border-t border-gray-50">
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400">ราคาประมาณการ</span>
            <span className="text-sm font-bold text-indigo-600">
              ฿{Number(asset.unitPrice).toLocaleString()}
            </span>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-gray-400 block uppercase">คงเหลือ</span>
            <span className={`text-xs font-bold ${asset.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {asset.quantity} {asset.unit}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
