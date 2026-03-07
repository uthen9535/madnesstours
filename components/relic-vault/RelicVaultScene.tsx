"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Cabinet, type CabinetPosition } from "@/components/relic-vault/Cabinet";
import { RelicVaultModal } from "@/components/relic-vault/RelicVaultModal";
import type { RelicItem } from "@/components/relic-vault/RelicItemCard";
import styles from "@/styles/relic-vault.module.css";

type CabinetKey = "punches" | "stamps" | "artifacts";

const relicData: Record<CabinetKey, { title: string; items: RelicItem[] }> = {
  punches: {
    title: "Punches Cabinet",
    items: [
      {
        id: "P-III-001",
        title: "Madness III Bali Punch",
        description: "Primary tour punch secured through member log verification and operation completion.",
        status: "RECOVERED",
        unlocked: true,
        thumbnailHint: "PUNCH // BALI",
        tourSlug: "madness-iii-bali"
      },
      {
        id: "P-III-MAY-002",
        title: "Mayhem Extension Punch",
        description: "Secondary mayhem punch for extension routes and after-hours mission logs.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "PUNCH // MAYHEM",
        tourSlug: "madness-iii-bali"
      },
      {
        id: "P-I-003",
        title: "Lake Powell Legacy Punch",
        description: "Recovered after initial Madness operation in canyon waters.",
        status: "RECOVERED",
        unlocked: true,
        thumbnailHint: "PUNCH // POWELL",
        tourSlug: "madness-i-lake-powell"
      }
    ]
  },
  stamps: {
    title: "Stamps Cabinet",
    items: [
      {
        id: "S-007",
        title: "Signal Seal",
        description: "Classified decorative stamp pending release by command.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "STAMP // SIGNAL"
      },
      {
        id: "S-011",
        title: "Night Relay Crest",
        description: "Reserved for future badge issuance pipelines.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "STAMP // RELAY"
      },
      {
        id: "S-013",
        title: "Monsoon Archive Mark",
        description: "Prototype stamp awaiting authentication.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "STAMP // MONSOON"
      }
    ]
  },
  artifacts: {
    title: "Artifacts Cabinet",
    items: [
      {
        id: "A-029",
        title: "Cassette of Static Prayers",
        description: "Recovered from deprecated HQ stack. Playback remains restricted.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "ARTIFACT // CASSETTE"
      },
      {
        id: "A-031",
        title: "Terminal Keycap Fragment",
        description: "Believed to be from first access terminal revision.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "ARTIFACT // KEYCAP"
      },
      {
        id: "A-047",
        title: "Mirror Channel Relay Core",
        description: "Core component extracted from mirror-channel test rig.",
        status: "CLASSIFIED",
        unlocked: false,
        thumbnailHint: "ARTIFACT // CORE"
      }
    ]
  }
};

export const cabinetPositions: Record<CabinetKey, CabinetPosition> = {
  punches: { top: "34%", left: "19.75%", width: "14.4%", height: "56%" },
  stamps: { top: "34%", left: "40%", width: "14.4%", height: "56%" },
  artifacts: { top: "34%", left: "60.25%", width: "14.4%", height: "56%" }
};

export function RelicVaultScene() {
  const [activeCategory, setActiveCategory] = useState<CabinetKey | null>(null);
  const [armingCategory, setArmingCategory] = useState<CabinetKey | null>(null);
  const armingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpen = useCallback((category: CabinetKey) => {
    if (armingTimerRef.current) {
      clearTimeout(armingTimerRef.current);
    }
    setArmingCategory(category);
    armingTimerRef.current = setTimeout(() => {
      setActiveCategory(category);
      setArmingCategory(null);
      armingTimerRef.current = null;
    }, 180);
  }, []);

  const handleCloseModal = useCallback(() => {
    setActiveCategory(null);
  }, []);

  const activeData = useMemo(() => {
    return activeCategory ? relicData[activeCategory] : null;
  }, [activeCategory]);

  return (
    <section className={styles.scene}>
      <div className={styles.background} aria-hidden="true">
        <video
          className={styles.backgroundVideo}
          src="/relic-vault/relic-vault-video-001.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
        />
      </div>

      <div className={styles.overlay}>
        <Cabinet
          title="Punches Cabinet"
          categoryKey="punches"
          position={cabinetPositions.punches}
          arming={armingCategory === "punches"}
          onOpen={handleOpen}
        />
        <Cabinet
          title="Stamps Cabinet"
          categoryKey="stamps"
          position={cabinetPositions.stamps}
          arming={armingCategory === "stamps"}
          onOpen={handleOpen}
        />
        <Cabinet
          title="Artifacts Cabinet"
          categoryKey="artifacts"
          position={cabinetPositions.artifacts}
          arming={armingCategory === "artifacts"}
          onOpen={handleOpen}
        />
      </div>

      <RelicVaultModal
        open={Boolean(activeData)}
        categoryTitle={activeData?.title ?? ""}
        items={activeData?.items ?? []}
        onClose={handleCloseModal}
      />
    </section>
  );
}
