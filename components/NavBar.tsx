import Link from 'next/link';

export function NavBar({ isAdmin }: { isAdmin: boolean }) {
  return (
    <nav className="nav">
      {['home','map','trips','blog','vault','guestbook','members'].map((p)=><Link key={p} href={`/${p}`}>{p.toUpperCase()}</Link>)}
      {isAdmin && <Link href="/admin">ADMIN</Link>}
      <form action="/api/auth/logout" method="post"><button className="neon-btn" type="submit">Logout</button></form>
    </nav>
  );
}
