"use client";

type InfoButtonProps = {
  onClick: () => void;
  label: string;
};

export function InfoButton({ onClick, label }: InfoButtonProps) {
  return (
    <button type="button" className="energy-info-button" onClick={onClick} aria-label={label}>
      INFO
    </button>
  );
}
