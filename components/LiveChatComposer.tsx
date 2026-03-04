"use client";

import { useEffect, useState } from "react";
import { NeonButton } from "@/components/NeonButton";
import { formatBtcUnitsFromSats } from "@/lib/satoshi";

type LiveChatComposerProps = {
  action: (formData: FormData) => void | Promise<void>;
  textareaId: string;
  availableSats: number;
  showRecipientField?: boolean;
};

export function LiveChatComposer({ action, textareaId, availableSats, showRecipientField = true }: LiveChatComposerProps) {
  const [satoshiMode, setSatoshiMode] = useState(false);
  const [dropBurstId, setDropBurstId] = useState(0);

  useEffect(() => {
    if (!dropBurstId) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      setDropBurstId(0);
    }, 2200);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dropBurstId]);

  return (
    <form action={action} className="form-grid live-chat-composer">
      <label htmlFor={textareaId}>Message (max 500 chars)</label>
      <textarea id={textareaId} name="message" maxLength={500} />
      <p className="meta">bag: {formatBtcUnitsFromSats(availableSats)} BTC</p>
      <div className="live-chat-composer__actions">
        <NeonButton type="submit" name="intent" value="message">
          Send To Live Chat
        </NeonButton>
        {!satoshiMode ? (
          <NeonButton type="button" className="live-chat-composer__sats-toggle" onClick={() => setSatoshiMode(true)}>
            Send Satoshi
          </NeonButton>
        ) : (
          <div className="live-chat-composer__sats-inline">
            {showRecipientField ? (
              <input
                name="satoshiRecipient"
                type="text"
                placeholder="@username"
                aria-label="Recipient username"
                required
              />
            ) : null}
            <input
              name="satoshiUnits"
              type="number"
              min="0.00000001"
              step="0.00000001"
              defaultValue="0.03"
              aria-label="Satoshi transfer amount in BTC units"
              required
            />
            <span className="meta">units</span>
            <NeonButton
              type="submit"
              name="intent"
              value="satoshi"
              className="live-chat-composer__sats-submit"
              onClick={() => setDropBurstId(Date.now())}
            >
              Drop
            </NeonButton>
          </div>
        )}
      </div>
      {dropBurstId ? (
        <div key={dropBurstId} className="satoshi-fall-lane" aria-hidden="true">
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--a">₿</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--b">01010010</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--c">₿</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--d">11100011</span>
        </div>
      ) : null}
    </form>
  );
}
