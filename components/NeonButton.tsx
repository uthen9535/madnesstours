import { ButtonHTMLAttributes } from 'react';

export function NeonButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className="neon-btn" {...props} />;
}
