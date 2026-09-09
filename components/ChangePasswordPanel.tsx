"use client";

import { useState } from "react";
import { changePassword } from "@/app/actions/auth";
import { KeyRound } from "lucide-react";

export default function ChangePasswordPanel({
  userId,
  isSelf,
}: {
  userId: string;
  isSelf: boolean;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: "error", text: "รหัสผ่านใหม่ไม่ตรงกัน" });
      return;
    }

    setIsSubmitting(true);
    const result = await changePassword(userId, currentPassword, newPassword);
    if (result.success) {
      setMessage({ type: "success", text: "เปลี่ยนรหัสผ่านสำเร็จ" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      setMessage({ type: "error", text: result.error || "เปลี่ยนรหัสผ่านไม่สำเร็จ" });
    }
    setIsSubmitting(false);
  };

  return (
    <div className="bg-white p-6 shadow rounded-lg border border-gray-100">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center">
        <KeyRound className="w-4 h-4 mr-1.5" />
        {isSelf ? "Change Password" : "Reset User Password"}
      </h2>

      <form onSubmit={handleSubmit} className="space-y-3">
        {isSelf && (
          <div>
            <label className="text-xs text-gray-400">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
            />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-400">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-400">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-orange-500 focus:ring-orange-500 outline-none"
          />
        </div>

        {message && (
          <p className={`text-xs ${message.type === "error" ? "text-red-600" : "text-green-700"}`}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full inline-flex items-center justify-center px-3 py-2 rounded-md bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 text-sm font-semibold transition-colors"
        >
          {isSubmitting ? "กำลังบันทึก..." : isSelf ? "เปลี่ยนรหัสผ่าน" : "ตั้งรหัสผ่านใหม่"}
        </button>
      </form>
    </div>
  );
}
