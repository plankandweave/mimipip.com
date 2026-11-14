import { RegistryGuest } from "@/components/Registry";
import { notFound } from "next/navigation";
export const metadata = {
  title: "A little wish list",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  if (!/^[a-f0-9]{32}$/.test(code)) notFound();
  return <RegistryGuest code={code} />;
}
