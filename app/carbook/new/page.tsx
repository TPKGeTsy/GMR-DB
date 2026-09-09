import { auth } from "@/auth";
import NewVehicleForm from "@/components/NewVehicleForm";

export default async function NewVehiclePage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN" && session?.user?.role !== "OPERATOR") {
    return <div className="p-8 text-center text-red-600">Access Denied</div>;
  }

  return <NewVehicleForm />;
}
