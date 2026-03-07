import { ProfileLink } from "@/components/ProfileLink";
import { TerminalBlock } from "@/components/TerminalBlock";
import { formatEthUnitsFromBase } from "@/lib/ethPurse";
import { formatBtcUnitsFromSats } from "@/lib/satoshi";

type OperatorDashboardDetailsProps = {
  role: string;
  username: string;
  statusLabel: string;
  wired: boolean;
  health: number;
  liveChatMessages: number;
  travelStamps: number;
  punchesMad: number;
  punchesMay: number;
  operations: string;
  surfacedLabel: string;
  btcSats: number;
  ethUnits: number;
};

export function OperatorDashboardDetails({
  role,
  username,
  statusLabel,
  wired,
  health,
  liveChatMessages,
  travelStamps,
  punchesMad,
  punchesMay,
  operations,
  surfacedLabel,
  btcSats,
  ethUnits
}: OperatorDashboardDetailsProps) {
  return (
    <div className="operator-dashboard-details">
      <div className="health-bar-wrap" role="img" aria-label={`Health ${health}%`}>
        <div className="health-bar-fill" style={{ width: `${health}%` }} />
      </div>
      <p className="meta">health: {health}%</p>
      <TerminalBlock>
        <div>
          wired:{" "}
          {wired ? (
            <span className="wired-status">
              <span className="wired-status__dot" aria-hidden />
              wilco
            </span>
          ) : (
            "negative"
          )}
        </div>
        <div>
          codename: <ProfileLink username={username} />
        </div>
        <div>role: {role}</div>
        <div>punches: {punchesMad} MAD // {punchesMay} MAY</div>
        <div>
          purse: {formatBtcUnitsFromSats(btcSats)} BTC // {formatEthUnitsFromBase(ethUnits)} ETH
        </div>
        <div>stamps: {travelStamps}</div>
        <div>agent condition: {statusLabel}</div>
        <div>live chat messages: {liveChatMessages}</div>
        <div>operations: {operations || "none logged"}</div>
        <div>surfaced: {surfacedLabel}</div>
      </TerminalBlock>
    </div>
  );
}
