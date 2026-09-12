import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logError } from "@/lib/logger";
import { deleteUploadedFile } from "@/lib/storage";

/**
 * Runs daily at midnight (see vercel.json) and purges every check-in photo
 * captured so far — we keep the CheckIn record itself (needed for attendance
 * hour calculations) but drop the actual snapshot to bound storage growth.
 *
 * Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}` for its
 * own Cron Job invocations when that env var is set — this checks it so the
 * endpoint can't be triggered by anyone who finds the URL.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const checkInsWithPhotos = await prisma.checkIn.findMany({
      where: { photoUrl: { not: null } },
      select: { id: true, photoUrl: true },
    });

    await Promise.all(checkInsWithPhotos.map((c) => deleteUploadedFile(c.photoUrl)));

    await prisma.checkIn.updateMany({
      where: { id: { in: checkInsWithPhotos.map((c) => c.id) } },
      data: { photoUrl: null },
    });

    return NextResponse.json({ success: true, deleted: checkInsWithPhotos.length });
  } catch (error) {
    logError("Error cleaning up check-in photos:", error);
    return NextResponse.json({ success: false, error: "Cleanup failed" }, { status: 500 });
  }
}
