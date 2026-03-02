import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { RetroWindow } from '@/components/RetroWindow';

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/home');

  return (
    <RetroWindow title="MadnessNet Access Terminal">
      <p className="marquee"><marquee>🔒 PRIVATE BBS NODE — AUTHORIZED MEMBERS ONLY 🔒</marquee></p>
      <form action="/api/auth/login" method="post">
        <label>Username</label>
        <input name="username" required />
        <label>Password</label>
        <input name="password" type="password" required />
        <button className="neon-btn" type="submit">Enter MadnessNet</button>
      </form>
    </RetroWindow>
  );
}
