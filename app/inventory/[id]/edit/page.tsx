import { getAssetById } from "@/app/actions/assets";
import EditAssetForm from "@/components/EditAssetForm";
import { notFound } from "next/navigation";

export default async function EditAssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getAssetById(id);

  if (!result.success || !result.data) {
    notFound();
  }

  const asset = result.data;

  return <EditAssetForm asset={asset} />;
}
