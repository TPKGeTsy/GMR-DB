import { NextResponse } from "next/server";
import { getFullDailyAttendanceSummary } from "@/app/actions/checkin";
import { toCsv } from "@/lib/attendance";

export async function GET() {
  const result = await getFullDailyAttendanceSummary();
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }

  const header = ["Date", "Employee", "Start", "End", "Total Hours", "Regular Hours", "OT Hours", "Location", "Status"];
  const rows = result.data.map((row) => [
    row.dateKey,
    row.name,
    row.startTime ? new Date(row.startTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "",
    row.endTime ? new Date(row.endTime).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "",
    row.totalHours.toFixed(2),
    row.regularHours.toFixed(2),
    row.otHours.toFixed(2),
    row.location === "OUTSIDE" ? "Outside Office" : "Office",
    row.stillWorking ? "Still working" : "Completed",
  ]);

  const csv = toCsv(header, rows);

  // Stable filename (no date suffix) — this is meant to be re-downloaded as
  // one continuously growing report covering full history, not a dated snapshot.
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-daily-summary.csv"`,
    },
  });
}
