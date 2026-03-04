"use client";

import { useState } from "react";
import { NeonButton } from "@/components/NeonButton";

type GuestbookPinControlProps = {
  memberId: string;
  memberUsername: string;
  displayValue: string;
  canEdit: boolean;
};

export function GuestbookPinControl({ memberId, memberUsername, displayValue, canEdit }: GuestbookPinControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const close = () => {
    if (isSaving) {
      return;
    }
    setIsOpen(false);
    setPin("");
    setConfirmPin("");
    setError("");
  };

  const submit = async () => {
    if (!canEdit || isSaving) {
      return;
    }

    if (!/^\d{6}$/.test(pin) || !/^\d{6}$/.test(confirmPin)) {
      setError("PIN must be exactly 6 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PIN confirmation does not match.");
      return;
    }

    setError("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/auth/pin/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: memberId,
          customPin: pin
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Unable to update PIN right now.");
        return;
      }

      window.location.reload();
    } catch {
      setError("Unable to update PIN right now.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="database-table__pin-controls guestbook-pin-manager">
      <span className="database-table__pin-value">{displayValue}</span>
      {canEdit ? (
        <NeonButton type="button" className="database-table__pin-edit-button" onClick={() => setIsOpen(true)}>
          Edit pin
        </NeonButton>
      ) : null}
      {isOpen ? (
        <div className="pin-activation-overlay" role="dialog" aria-modal="true" aria-labelledby={`guestbook-pin-title-${memberId}`}>
          <section className="pin-activation-modal">
            <h2 id={`guestbook-pin-title-${memberId}`}>Pin update</h2>
            <p>
              Set a new 6 digit pin for <strong>@{memberUsername}</strong>.
            </p>
            <div className="pin-activation-form">
              <label>
                New PIN
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
              <label>
                Confirm PIN
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </label>
            </div>
            {error ? <p className="pin-activation-error">{error}</p> : null}
            <div className="pin-activation-actions">
              <NeonButton type="button" onClick={submit} disabled={isSaving}>
                {isSaving ? "Updating..." : "Save pin"}
              </NeonButton>
              <NeonButton type="button" onClick={close} disabled={isSaving}>
                Cancel
              </NeonButton>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
