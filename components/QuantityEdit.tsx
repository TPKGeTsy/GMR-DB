"use client";

import { useState } from "react";
import { Plus, Minus, Loader2 } from "lucide-react";
import { updateAssetQuantity } from "@/app/actions/assets";

interface QuantityEditProps {
  id: string;
  initialQuantity: number;
}

export default function QuantityEdit({ id, initialQuantity }: QuantityEditProps) {
  const [quantity, setQuantity] = useState(initialQuantity);
  const [prevInitialQuantity, setPrevInitialQuantity] = useState(initialQuantity);
  const [isUpdating, setIsUpdating] = useState(false);

  if (initialQuantity !== prevInitialQuantity) {
    setPrevInitialQuantity(initialQuantity);
    setQuantity(initialQuantity);
  }

  const handleUpdate = async (newQuantity: number) => {
    if (newQuantity < 0 || isUpdating) return;
    
    setIsUpdating(true);
    // Optimistic update
    const prevQuantity = quantity;
    setQuantity(newQuantity);

    const result = await updateAssetQuantity(id, newQuantity);
    
    if (!result.success) {
      // Revert if failed
      setQuantity(prevQuantity);
      alert(result.error || "Failed to update quantity");
    }
    
    setIsUpdating(false);
  };

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={() => handleUpdate(quantity - 1)}
        disabled={isUpdating || quantity <= 0}
        className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
        title="Decrease quantity"
      >
        <Minus className="w-4 h-4 text-gray-600" />
      </button>
      
      <div className="w-8 text-center font-medium text-gray-900 relative">
        {isUpdating ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <Loader2 className="w-4 h-4 animate-spin text-orange-600" />
          </div>
        ) : null}
        <span className={isUpdating ? "opacity-0" : ""}>{quantity}</span>
      </div>

      <button
        onClick={() => handleUpdate(quantity + 1)}
        disabled={isUpdating}
        className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50 transition-colors"
        title="Increase quantity"
      >
        <Plus className="w-4 h-4 text-gray-600" />
      </button>
    </div>
  );
}
