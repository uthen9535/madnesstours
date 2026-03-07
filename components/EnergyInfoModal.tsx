"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type EnergyWidgetId = "kp" | "schumann" | "tec" | "btc" | "eth";

type BaselineBand = {
  level: string;
  range: string;
  note: string;
};

type EnergyInfoCopyEntry = {
  title: string;
  literal: string;
  mythic: string;
  baselines: BaselineBand[];
  footer: string;
  theme?: "btc" | "eth";
};

export const ENERGY_INFO_COPY: Record<EnergyWidgetId, EnergyInfoCopyEntry> = {
  kp: {
    title: "Kp Storm Index",
    literal: "Planetary Kp is a global geomagnetic activity index derived from magnetometer observations across Earth.",
    mythic:
      "Elevated geomagnetic conditions are often associated with increased atmospheric signal pressure: charged nights, vivid dreams, agitation, and sharpened instinct.",
    baselines: [
      { level: "LOW", range: "0-1", note: "very quiet" },
      { level: "NORMAL", range: "2-3", note: "background geomagnetic activity" },
      { level: "HIGH", range: "4", note: "elevated / unsettled conditions" },
      { level: "STORM", range: "5+", note: "storm levels begin" }
    ],
    footer: "MadnessNet // Energy Briefing Terminal"
  },
  schumann: {
    title: "Schumann Resonance",
    literal: "Schumann Resonances are electromagnetic standing waves formed within the Earth-ionosphere cavity, typically observed as spectral bands.",
    mythic:
      "Some research communities interpret strong resonance activity as shifts in environmental pressure influencing mood, sensitivity, and dream intensity.",
    baselines: [
      { level: "REFERENCE", range: "~7.83 Hz", note: "commonly cited fundamental frequency" },
      { level: "LOW", range: "7.3-8.0 Hz", note: "quiet fundamental band with weak harmonic energy" },
      { level: "NORMAL", range: "7.8-8.3 Hz", note: "stable fundamental with harmonics near 14.3, 20.8, and 27.3 Hz" },
      {
        level: "HIGH",
        range: "7.8-8.3 Hz + elevated 14-33 Hz harmonics",
        note: "bursty harmonic power during strong lightning or disturbance"
      }
    ],
    footer: "MadnessNet // Energy Briefing Terminal"
  },
  tec: {
    title: "Ionosphere TEC Pulse",
    literal: "Total Electron Content measures the density of ionized particles along a path through the ionosphere and directly affects radio and satellite signal propagation.",
    mythic:
      "Some signal-watch communities associate elevated TEC conditions with communication anomalies, pressure headaches, restlessness, and active-sky nights.",
    baselines: [
      { level: "LOW", range: "0-10 TECU", note: "quiet ionosphere" },
      { level: "NORMAL", range: "10-30 TECU", note: "typical daytime/nighttime variance" },
      { level: "HIGH", range: "30+ TECU", note: "enhanced ionization conditions" }
    ],
    footer: "MadnessNet // Energy Briefing Terminal"
  },
  btc: {
    title: "Satoshi Tracker",
    literal:
      "Bitcoin is a decentralized monetary protocol secured by distributed computation and cryptographic consensus. No central authority governs issuance or transaction validation. The network operates continuously across global nodes, maintaining one of the few financial ledgers known to function independently of centralized infrastructure.",
    mythic:
      "Within signal-watch circles, Bitcoin is regarded as the reserve settlement layer of the surviving economy. It moves slowly, deliberately, and with extreme finality. Operators treat it less like currency and more like digital territory - a reserve instrument used for large transfers of stored power. When entire banking systems flicker out, Bitcoin is the ledger most people assume will still be ticking somewhere inside the network.",
    baselines: [
      { level: "SATOSHI UNIT", range: "0.00000001 BTC", note: "smallest atomic unit of the network" },
      { level: "FIELD TRADE", range: "~0.00005 BTC", note: "fuel reserves, water filtration kits, ammunition stock" },
      { level: "SURVIVAL TRADE", range: "~0.0005 BTC", note: "rifles, comms equipment, solar generators" },
      { level: "STRONGHOLD TRADE", range: "~0.01 BTC", note: "vehicles, hardened shelters, long-term supplies" },
      { level: "RESERVE LEVEL", range: "1 BTC", note: "equivalent to permanent territory or a fortified home in most post-grid markets" }
    ],
    footer: "MadnessNet // Financial Briefing Terminal",
    theme: "btc"
  },
  eth: {
    title: "Ethereum Tracker",
    literal:
      "Ethereum is a distributed computational network designed to execute programmable contracts and decentralized systems. In addition to functioning as currency, the network acts as an autonomous execution layer where markets, agreements, and infrastructure operate without centralized control.",
    mythic:
      "Operational communities refer to Ethereum as the execution layer of the surviving network economy. Where Bitcoin functions as immovable reserve capital, Ethereum operates as an active computational marketplace. In several documented cases, rogue machine systems and autonomous agents have been observed using Ethereum contracts for machine-to-machine resource exchange. Since the collapse of centralized data infrastructure during the Network Wars, Ethereum has quietly become one of the primary substrates used to rebuild fragments of the global data lattice.",
    baselines: [
      { level: "ETHER UNIT", range: "1 ETH", note: "computational fuel used to operate the network" },
      { level: "FIELD TRADE", range: "~0.5 ETH", note: "electronics, hardware tools, encrypted devices" },
      { level: "SURVIVAL TRADE", range: "~5 ETH", note: "drones, high-end communication rigs, tactical gear" },
      { level: "INFRASTRUCTURE TRADE", range: "~25 ETH", note: "vehicles, mobile data centers, energy systems" },
      { level: "NETWORK BUILDER LEVEL", range: "~100 ETH+", note: "capital scale used to deploy and sustain decentralized systems" }
    ],
    footer: "MadnessNet // Financial Briefing Terminal",
    theme: "eth"
  }
};

type EnergyInfoModalProps = {
  widgetId: EnergyWidgetId | null;
  open: boolean;
  onClose: () => void;
};

export function EnergyInfoModal({ widgetId, open, onClose }: EnergyInfoModalProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    panelRef.current?.scrollTo({ top: 0, left: 0 });
  }, [open, widgetId]);

  if (!open || !widgetId) {
    return null;
  }

  const copy = ENERGY_INFO_COPY[widgetId];
  const panelClasses = ["energy-info-modal__panel"];
  if (copy.theme) {
    panelClasses.push(`energy-info-modal__panel--${copy.theme}`);
  }

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="energy-info-modal" role="dialog" aria-modal="true" aria-labelledby="energy-info-title" onClick={onClose}>
      <section ref={panelRef} className={panelClasses.join(" ")} onClick={(event) => event.stopPropagation()}>
        <header className="energy-info-modal__header">
          <h2 id="energy-info-title">{copy.title}</h2>
          <button type="button" className="energy-info-modal__close" onClick={onClose} aria-label="Close info modal">
            X
          </button>
        </header>
        <div className="energy-info-modal__body">
          <p className="energy-info-modal__label">SYSTEM READOUT</p>
          <p>{copy.literal}</p>

          <p className="energy-info-modal__label">FIELD INTERPRETATIONS</p>
          <p>{copy.mythic}</p>

          <p className="energy-info-modal__label">Baselines</p>
          <ul className="energy-info-modal__baseline-list">
            {copy.baselines.map((band) => (
              <li key={`${band.level}-${band.range}`}>
                <strong>{band.level}</strong> :: {band.range} :: {band.note}
              </li>
            ))}
          </ul>
          <p className="energy-info-modal__footer">{copy.footer}</p>
        </div>
      </section>
    </div>,
    document.body
  );
}
