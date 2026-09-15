import { NextResponse } from "next/server";
import { auth } from "@/auth";
import prisma from "@/lib/prisma";
import { toCsv } from "@/lib/attendance";

export async function GET() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const logs = await prisma.checkIn.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { username: true, fullName: true } } },
  });

  const header = ["Name", "Username", "Type", "Location", "Note", "Confidence %", "Timestamp"];
  const rows = logs.map((log) => [
    log.user.fullName || log.user.username,
    log.user.username,
    log.type === "IN" ? "Check In" : "Check Out",
    log.location === "OUTSIDE" ? "Outside Office" : "Office",
    log.note || "",
    log.confidence != null ? (log.confidence * 100).toFixed(1) : "",
    log.createdAt.toISOString(),
  ]);

  const csv = toCsv(header, rows);
  const filename = `attendance-export-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
