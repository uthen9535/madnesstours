"use client";

import { useState } from "react";
import { NeonButton } from "@/components/NeonButton";

type PinActivationModalProps = {
  required: boolean;
};

export function PinActivationModal({ required }: PinActivationModalProps) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [isDismissed, setIsDismissed] = useState(false);

  if (!required || isDismissed) {
    return null;
  }

  const submit = async () => {
    if (isSubmitting) {
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
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/pin/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, confirmPin })
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
      setIsSubmitting(false);
    }
  };

  return (
    <div className="pin-activation-overlay" role="dialog" aria-modal="true" aria-labelledby="pin-activation-title">
      <section className="pin-activation-modal">
        <h2 id="pin-activation-title">Pin activation</h2>
        <p>Reset your pin now?</p>
        <div className="pin-activation-form">
          <label>
            New PIN
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="off"
            />
          </label>
          <label>
            Confirm PIN
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="off"
            />
          </label>
        </div>
        {error ? <p className="pin-activation-error">{error}</p> : null}
        <div className="pin-activation-actions">
          <NeonButton type="button" onClick={submit} disabled={isSubmitting}>
            {isSubmitting ? "Updating..." : "Reset pin"}
          </NeonButton>
          <NeonButton type="button" onClick={() => setIsDismissed(true)} disabled={isSubmitting}>
            Cancel
          </NeonButton>
        </div>
      </section>
    </div>
  );
}
