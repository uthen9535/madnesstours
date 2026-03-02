import { ReactNode } from 'react';

export function RetroWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="retro-window">
      <h2>{title}</h2>
      {children}
    </section>
  );
}
