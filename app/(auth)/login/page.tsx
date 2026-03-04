import { redirect } from "next/navigation";
import { StagingAccessTerminal } from "@/components/StagingAccessTerminal";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/home");
  }

  return (
    <div className="stack">
      <StagingAccessTerminal />
    </div>
  );
}
