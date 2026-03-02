'use client';
import { useRef, useState } from 'react';

export function AudioToggle() {
  const [muted, setMuted] = useState(true);
  const ref = useRef<HTMLAudioElement>(null);
  return (
    <div>
      <audio ref={ref} loop muted={muted} autoPlay src="https://files.freemusicarchive.org/storage-freemusicarchive-org/music/no_curator/Visager/Songs_From_An_Unmade_World/Visager_-_02_-_Welcome_to_the_Grid.mp3" />
      <button className="neon-btn" onClick={() => {
        const next = !muted;
        setMuted(next);
        if (ref.current) {
          ref.current.muted = next;
          ref.current.play().catch(() => null);
        }
      }}>Mute Audio: {muted ? 'ON' : 'OFF'}</button>
    </div>
  );
}
