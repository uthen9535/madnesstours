'use client';
import { useEffect, useState } from 'react';

export function HitCounter() {
  const [hits, setHits] = useState(0);
  useEffect(() => {
    const current = Number(localStorage.getItem('madness_hits') || '999');
    const next = current + 1;
    localStorage.setItem('madness_hits', String(next));
    setHits(next);
  }, []);
  return <p>Hit Counter: {hits}</p>;
}
