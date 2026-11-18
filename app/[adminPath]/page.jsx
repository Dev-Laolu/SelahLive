import { notFound } from "next/navigation";
import Admin from "@/app/admin/page";

export const metadata = {
  title: "Selah Live — Admin Portal",
  robots: { index: false, follow: false },
};

export default async function SecretAdminPage({ params }) {
  const { adminPath } = await params;
  const expected = process.env.ADMIN_PATH || "ops-9k3x7";
  if (adminPath !== expected) {
    notFound();
  }
  return <Admin />;
}

