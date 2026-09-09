"use client";

import { createVehicle } from "@/app/actions/vehicles";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Upload } from "lucide-react";
import Link from "next/link";

export default function NewVehicleForm() {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const router = useRouter();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const result = await createVehicle(data);

    if (result.success) {
      router.push("/carbook");
    } else {
      setError(result.error || "Something went wrong");
      setIsPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/carbook" className="text-gray-700 hover:text-gray-900">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Add Vehicle</h1>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-900 mb-1">
              ชื่อรถ (Vehicle Name)
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="เช่น Toyota Hilux Revo"
              className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] placeholder-gray-500 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="licensePlate" className="block text-sm font-medium text-gray-900 mb-1">
              ทะเบียนรถ (License Plate)
            </label>
            <input
              type="text"
              id="licensePlate"
              name="licensePlate"
              required
              placeholder="เช่น กข 1234 กรุงเทพมหานคร"
              className="shadow-sm focus:ring-orange-500 focus:border-orange-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] placeholder-gray-500 text-gray-900"
            />
          </div>

          <div>
            <label htmlFor="imageFile" className="block text-sm font-medium text-gray-900">
              รูปภาพรถ (Upload Image)
            </label>
            <div className="mt-1">
              {imagePreview ? (
                <div className="flex flex-col items-center">
                  <input id="imageFile" name="imageFile" type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-md border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      const fileInput = document.getElementById("imageFile") as HTMLInputElement;
                      if (fileInput) fileInput.value = "";
                    }}
                    className="mt-2 text-xs text-red-600 hover:text-red-500 font-medium"
                  >
                    ยกเลิกรูปนี้
                  </button>
                </div>
              ) : (
                <div className="relative w-full flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-orange-400 transition-colors cursor-pointer">
                  <input
                    id="imageFile"
                    name="imageFile"
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                    onChange={handleImageChange}
                  />
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-600" />
                    <div className="flex text-sm text-gray-800">
                      <span className="font-medium text-orange-600">Upload a file</span>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-700">PNG, JPG up to 10MB (optional)</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <Link
              href="/carbook"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isPending}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 disabled:opacity-50"
            >
              {isPending ? "Saving..." : (
                <>
                  <Save className="-ml-1 mr-2 h-5 w-5" />
                  Save Vehicle
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
