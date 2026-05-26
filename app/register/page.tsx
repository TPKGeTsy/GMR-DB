"use client";

import { useActionState } from "react";
import { registerUser } from "@/app/actions/auth";
import Link from "next/link";

export default function RegisterPage() {
  const [errorMessage, dispatch, isPending] = useActionState(
    registerUser,
    undefined,
  );

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md border border-gray-200">
        <h1 className="text-2xl font-bold text-center text-gray-900">Register</h1>
        <form action={dispatch} className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-900"
            >
              Username
            </label>
            <input
              id="username"
              name="username"
              type="text"
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm placeholder-gray-500 text-gray-900"
              placeholder="Choose a username"
            />
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-900"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm placeholder-gray-500 text-gray-900"
              placeholder="Enter your password"
            />
          </div>
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-gray-900"
            >
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              className="w-full px-3 py-2 mt-1 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm placeholder-gray-500 text-gray-900"
              placeholder="Confirm your password"
            />
          </div>
          {errorMessage && (
            <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
              {errorMessage}
            </div>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {isPending ? "Registering..." : "Register"}
          </button>
        </form>
        <p className="text-center text-sm text-gray-800">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 hover:text-indigo-500">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}
