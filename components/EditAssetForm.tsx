"use client";

import { updateAsset, getAssetSuggestions } from "@/app/actions/assets";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Upload } from "lucide-react";
import Link from "next/link";
import CreatableSelect from "react-select/creatable";
import { StylesConfig, SingleValue } from "react-select";

interface Suggestions {
  names: string[];
  categories: (string | null)[];
  models: string[];
  units: string[];
}

interface SelectOption {
  value: string;
  label: string;
}

interface EditAssetFormProps {
  asset: {
    id: string;
    name: string;
    category: string | null;
    modelOrSize: string;
    quantity: number;
    unit: string;
    categoryStatus: string;
    unitPrice: number;
    imageUrl: string | null;
  };
}

export default function EditAssetForm({ asset }: EditAssetFormProps) {
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions>({
    names: [],
    categories: [],
    models: [],
    units: [],
  });

  const [formData, setFormData] = useState({
    name: asset.name,
    category: asset.category || "",
    modelOrSize: asset.modelOrSize,
    unit: asset.unit,
  });

  const router = useRouter();

  useEffect(() => {
    async function fetchSuggestions() {
      const result = await getAssetSuggestions();
      if (result.success && result.data) {
        setSuggestions(result.data);
      }
    }
    fetchSuggestions();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    
    data.set("name", formData.name);
    data.set("category", formData.category);
    data.set("modelOrSize", formData.modelOrSize);
    data.set("unit", formData.unit);

    const result = await updateAsset(asset.id, data);

    if (result.success) {
      router.push("/inventory");
    } else {
      setError(result.error || "Something went wrong");
      setIsPending(false);
    }
  }

  const selectStyles: StylesConfig<SelectOption, false> = {
    control: (base) => ({
      ...base,
      borderColor: "#d1d5db",
      "&:hover": { borderColor: "#6366f1" },
      boxShadow: "none",
      borderRadius: "0.375rem",
      padding: "2px",
    }),
    singleValue: (base) => ({
      ...base,
      color: "#111827",
    }),
    placeholder: (base) => ({
      ...base,
      color: "#374151",
    }),
    option: (base, state) => ({
      ...base,
      color: state.isSelected ? "white" : "#111827",
      backgroundColor: state.isSelected ? "#4f46e5" : state.isFocused ? "#f3f4f6" : "white",
    }),
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/inventory" className="text-gray-700 hover:text-gray-900">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Asset</h1>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                หมวดหมู่ (Category)
              </label>
              <CreatableSelect<SelectOption>
                isClearable
                styles={selectStyles}
                options={suggestions.categories.map(c => ({ value: String(c || ""), label: String(c || "") }))}
                value={formData.category ? { value: formData.category, label: formData.category } : null}
                onChange={(newValue: SingleValue<SelectOption>) => setFormData({ ...formData, category: newValue?.value || "" })}
                placeholder="เลือกหรือพิมพ์หมวดหมู่..."
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                ชื่ออุปกรณ์ (Asset Name)
              </label>
              <CreatableSelect<SelectOption>
                isClearable
                styles={selectStyles}
                options={suggestions.names.map(n => ({ value: n, label: n }))}
                value={formData.name ? { value: formData.name, label: formData.name } : null}
                onChange={(newValue: SingleValue<SelectOption>) => setFormData({ ...formData, name: newValue?.value || "" })}
                placeholder="เลือกหรือพิมพ์ชื่ออุปกรณ์..."
                required
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                รหัส/รุ่น/ขนาด (Model/Size)
              </label>
              <CreatableSelect<SelectOption>
                isClearable
                styles={selectStyles}
                options={suggestions.models.map(m => ({ value: m, label: m }))}
                value={formData.modelOrSize ? { value: formData.modelOrSize, label: formData.modelOrSize } : null}
                onChange={(newValue: SingleValue<SelectOption>) => setFormData({ ...formData, modelOrSize: newValue?.value || "" })}
                placeholder="เลือกหรือพิมพ์รุ่น..."
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="quantity" className="block text-sm font-medium text-gray-900">
                จำนวน (Quantity)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  name="quantity"
                  id="quantity"
                  defaultValue={asset.quantity}
                  required
                  min="0"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] text-gray-900"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-900 mb-1">
                หน่วย (Unit)
              </label>
              <CreatableSelect<SelectOption>
                isClearable
                styles={selectStyles}
                options={suggestions.units.map(u => ({ value: u, label: u }))}
                value={formData.unit ? { value: formData.unit, label: formData.unit } : null}
                onChange={(newValue: SingleValue<SelectOption>) => setFormData({ ...formData, unit: newValue?.value || "" })}
                placeholder="หน่วย..."
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="unitPrice" className="block text-sm font-medium text-gray-900">
                ราคาต่อหน่วย (Unit Price)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  step="0.01"
                  name="unitPrice"
                  id="unitPrice"
                  defaultValue={asset.unitPrice}
                  required
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] text-gray-900"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="categoryStatus" className="block text-sm font-medium text-gray-900">
                ประเภท/สถานะ (Status)
              </label>
              <div className="mt-1">
                <select
                  id="categoryStatus"
                  name="categoryStatus"
                  defaultValue={asset.categoryStatus}
                  required
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md p-2 border h-[42px] text-gray-900"
                >
                  <option value="R">R (Red)</option>
                  <option value="Y">Y (Yellow)</option>
                  <option value="G">G (Green)</option>
                  <option value="B">B (Blue)</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-6">
              <label htmlFor="imageFile" className="block text-sm font-medium text-gray-900">
                รูปภาพอุปกรณ์ (Upload New Image - Optional)
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-indigo-400 transition-colors">
                <div className="space-y-1 text-center">
                  <Upload className="mx-auto h-12 w-12 text-gray-600" />
                  <div className="flex text-sm text-gray-800">
                    <label
                      htmlFor="imageFile"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500"
                    >
                      <span>Upload a file</span>
                      <input id="imageFile" name="imageFile" type="file" accept="image/*" className="sr-only" />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-700">PNG, JPG, GIF up to 10MB</p>
                </div>
              </div>
              {asset.imageUrl && (
                <p className="mt-2 text-sm text-gray-600">Current image exists. Uploading a new one will replace it.</p>
              )}
            </div>
          </div>

          <div className="pt-5">
            <div className="flex justify-end">
              <Link
                href="/inventory"
                className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isPending}
                className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
              >
                {isPending ? "Updating..." : (
                  <>
                    <Save className="-ml-1 mr-2 h-5 w-5" />
                    Update Asset
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
