import { redirect } from "next/navigation";
import { NeonButton } from "@/components/NeonButton";
import { RetroWindow } from "@/components/RetroWindow";
import { getCurrentUser } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/home");
  }

  const params = await searchParams;

  return (
    <div className="login-screen">
      <RetroWindow title="MadnessNet Access Terminal" className="login-window">
        <p>Private network for Madness Tour members.</p>
        <form action="/api/auth/login" method="post" className="login-form">
          <label htmlFor="username">Codename</label>
          <input id="username" name="username" autoComplete="username" required />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          {params?.error ? <p className="form-error">{params.error}</p> : null}
          <NeonButton type="submit">Dial In</NeonButton>
        </form>
        <p className="login-hint">Need a codename? Ask admin to create it for you.</p>
      </RetroWindow>
    </div>
  );
}
