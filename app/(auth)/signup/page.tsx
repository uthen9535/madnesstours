import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function SignupPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/home");
  }

  redirect("/login?error=Account+creation+is+admin-only");
}
