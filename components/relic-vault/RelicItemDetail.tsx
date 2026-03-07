"use client";

import Link from "next/link";
import type { RelicItem } from "@/components/relic-vault/RelicItemCard";
import styles from "@/styles/relic-vault.module.css";

type RelicItemDetailProps = {
  item: RelicItem;
};

export function RelicItemDetail({ item }: RelicItemDetailProps) {
  return (
    <aside className={styles.itemDetail}>
      <div className={styles.itemDetailFrame} aria-hidden="true">
        <span>{item.thumbnailHint}</span>
      </div>
      <p className={styles.itemMeta}>ID // {item.id}</p>
      <h3 className={styles.itemDetailTitle}>{item.title}</h3>
      <p className={styles.itemDetailDescription}>
        {item.unlocked ? item.description : "Classified. Not yet recovered."}
      </p>

      {item.unlocked && item.tourSlug ? (
        <Link href={`/tours/${item.tourSlug}`} className={`neon-button ${styles.itemDetailAction}`}>
          View Tour
        </Link>
      ) : (
        <span className={styles.itemLockedStamp}>CLASSIFIED</span>
      )}
    </aside>
  );
}
