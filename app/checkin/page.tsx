import { getFaceRoster } from "@/app/actions/checkin";
import CheckInScanner from "@/components/CheckInScanner";
import { ScanFace } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CheckInPage() {
  const roster = await getFaceRoster();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center">
          <ScanFace className="mr-2 h-6 w-6 text-orange-600" />
          Face Check-In
        </h1>
        <p className="text-gray-500">Look at the camera and scan to check in.</p>
      </div>

      <CheckInScanner initialRoster={roster.success && roster.data ? roster.data : []} />
    </div>
  );
}
