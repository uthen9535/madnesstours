'use client';
import { useEffect, useState } from 'react';

export function OverlayToggle() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    document.body.classList.toggle('scanlines', enabled);
  }, [enabled]);
  return <button className="neon-btn" onClick={() => setEnabled((v) => !v)}>Cyberpunk Overlay: {enabled ? 'ON' : 'OFF'}</button>;
}
