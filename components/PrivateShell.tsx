import { requireUser } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { NavBar } from './NavBar';
import { OverlayToggle } from './OverlayToggle';
import { AudioToggle } from './AudioToggle';

export async function PrivateShell({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect('/login');

  return (
    <>
      <h1>MadnessNet <span className="blink">NEW</span></h1>
      <div className="nav">
        <OverlayToggle />
        <AudioToggle />
      </div>
      <NavBar isAdmin={user.role === 'ADMIN'} />
      {children}
    </>
  );
}
