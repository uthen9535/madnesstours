"use client";

import { useEffect, useState } from "react";
import { NeonButton } from "@/components/NeonButton";
import { formatEthUnitsFromBase } from "@/lib/ethPurse";
import { formatBtcUnitsFromSats } from "@/lib/satoshi";

type LiveChatComposerProps = {
  action: (formData: FormData) => void | Promise<void>;
  textareaId: string;
  availableSats: number;
  availableEthUnits: number;
  showRecipientField?: boolean;
};

type TransferMode = "none" | "satoshi" | "ethereum";

export function LiveChatComposer({
  action,
  textareaId,
  availableSats,
  availableEthUnits,
  showRecipientField = true
}: LiveChatComposerProps) {
  const [transferMode, setTransferMode] = useState<TransferMode>("none");
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
      <p className="meta">
        purse: {formatBtcUnitsFromSats(availableSats)} BTC // {formatEthUnitsFromBase(availableEthUnits)} ETH
      </p>
      <div className="live-chat-composer__actions">
        <NeonButton type="submit" name="intent" value="message" formNoValidate>
          Send To Live Chat
        </NeonButton>
        <NeonButton
          type="button"
          className="live-chat-composer__sats-toggle"
          onClick={() => setTransferMode((current) => (current === "satoshi" ? "none" : "satoshi"))}
        >
          Send Satoshi
        </NeonButton>
        <NeonButton
          type="button"
          className="live-chat-composer__sats-toggle live-chat-composer__sats-toggle--eth"
          onClick={() => setTransferMode((current) => (current === "ethereum" ? "none" : "ethereum"))}
        >
          Send Ethereum
        </NeonButton>
        {transferMode !== "none" ? (
          <div className="live-chat-composer__sats-inline">
            {showRecipientField ? (
              <input name="dropRecipient" type="text" placeholder="@username" aria-label="Recipient username" />
            ) : null}
            {transferMode === "satoshi" ? (
              <input
                name="satoshiUnits"
                type="number"
                min="0.00000001"
                step="0.00000001"
                defaultValue="0.03"
                aria-label="Satoshi transfer amount in BTC units"
              />
            ) : (
              <input
                name="ethereumUnits"
                type="number"
                min="0.00000001"
                step="0.00000001"
                defaultValue="0.03"
                aria-label="Ethereum transfer amount in ETH units"
              />
            )}
            <span className="meta">{transferMode === "satoshi" ? "BTC" : "ETH"}</span>
            <NeonButton
              type="submit"
              name="intent"
              value={transferMode}
              className="live-chat-composer__sats-submit"
              onClick={() => setDropBurstId(Date.now())}
            >
              {transferMode === "satoshi" ? "Drop BTC" : "Drop ETH"}
            </NeonButton>
          </div>
        ) : null}
      </div>
      {dropBurstId ? (
        <div key={dropBurstId} className="satoshi-fall-lane" aria-hidden="true">
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--a">{transferMode === "ethereum" ? "Ξ" : "₿"}</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--b">01010010</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--c">{transferMode === "ethereum" ? "Ξ" : "₿"}</span>
          <span className="satoshi-fall-lane__glyph satoshi-fall-lane__glyph--d">11100011</span>
        </div>
      ) : null}
    </form>
  );
}
