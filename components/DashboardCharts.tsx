"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

interface DashboardChartsProps {
  data: {
    status: string;
    totalValue: number;
    count: number;
  }[];
}

const COLORS = {
  R: "#ef4444", // Red 500
  Y: "#eab308", // Yellow 500
  G: "#22c55e", // Green 500
  B: "#3b82f6", // Blue 500
};

export default function DashboardCharts({ data }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
      <div className="h-full">
        <h3 className="text-sm font-medium text-gray-700 mb-2 text-center">Value by Status (THB)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="status" />
            <YAxis />
            <Tooltip
              formatter={(value: string | number | null | undefined | readonly (string | number)[]) => `฿${Number(value || 0).toLocaleString()}`}
            />
            <Legend />
            <Bar dataKey="totalValue" name="Total Value">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS] || "#8884d8"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="h-full">
        <h3 className="text-sm font-medium text-gray-700 mb-2 text-center">Item Count by Status</h3>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="count"
              nameKey="status"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[entry.status as keyof typeof COLORS] || "#8884d8"} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
