import { getAssets } from "@/app/actions/assets";
import Image from "next/image";
import Link from "next/link";
import { Plus, Edit } from "lucide-react";
import Search from "@/components/Search";
import DeleteAssetButton from "@/components/DeleteAssetButton";

interface Asset {
  id: string;
  imageUrl: string | null;
  name: string;
  category: string | null;
  modelOrSize: string;
  quantity: number;
  unit: string;
  categoryStatus: string;
  unitPrice: number;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams?: Promise<{
    query?: string;
  }>;
}) {
  const params = await searchParams;
  const query = params?.query || "";
  const result = await getAssets(query);

  if (!result.success || !result.data) {
    return <div>Error loading inventory</div>;
  }

  const assets = result.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-gray-700">Manage and view your engineering assets</p>
        </div>
        <Link
          href="/inventory/new"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          <Plus className="-ml-1 mr-2 h-5 w-5" />
          Add Asset
        </Link>
      </div>

      <div className="flex items-center justify-between gap-2 md:mt-8">
        <Search placeholder="ค้นหาชื่ออุปกรณ์, รุ่น หรือหมวดหมู่..." />
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  ลำดับ
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  รูป
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  หมวดหมู่
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  ชื่ออุปกรณ์
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  รหัส/รุ่น/ขนาด
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  จำนวน
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  หน่วย
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  ราคา/หน่วย
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider text-center">
                  ประเภท
                </th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {assets.map((asset: Asset, index: number) => (
                <tr key={asset.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {index + 1}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {asset.imageUrl ? (
                      <div className="h-10 w-10 relative rounded-md overflow-hidden border border-gray-200">
                        <Image
                          src={asset.imageUrl}
                          alt={asset.name}
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-10 w-10 bg-gray-100 flex items-center justify-center rounded-md border border-gray-200">
                        <span className="text-gray-600 text-[10px]">No Image</span>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {asset.category || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {asset.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {asset.modelOrSize}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {asset.quantity}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {asset.unit}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    ฿{Number(asset.unitPrice).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    {asset.categoryStatus === "R" && (
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-600 text-white">
                        R
                      </span>
                    )}
                    {asset.categoryStatus === "Y" && (
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-400 text-black">
                        Y
                      </span>
                    )}
                    {asset.categoryStatus === "G" && (
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-500 text-white">
                        G
                      </span>
                    )}
                    {asset.categoryStatus === "B" && (
                      <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-500 text-white">
                        B
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <Link
                      href={`/inventory/${asset.id}/edit`}
                      className="text-indigo-600 hover:text-indigo-900 inline-block p-2 rounded-md hover:bg-indigo-50 transition-colors"
                      title="Edit Asset"
                    >
                      <Edit className="w-4 h-4" />
                    </Link>
                    <DeleteAssetButton id={asset.id} />
                  </td>
                </tr>
              ))}
              {assets.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-700">
                    No assets found. Click &quot;Add Asset&quot; to get started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
