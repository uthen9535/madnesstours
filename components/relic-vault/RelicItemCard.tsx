"use client";

import styles from "@/styles/relic-vault.module.css";

export type RelicItem = {
  id: string;
  title: string;
  description: string;
  status: "RECOVERED" | "CLASSIFIED";
  unlocked: boolean;
  thumbnailHint: string;
  tourSlug?: string;
};

type RelicItemCardProps = {
  item: RelicItem;
  selected: boolean;
  onSelect: (item: RelicItem) => void;
};

export function RelicItemCard({ item, selected, onSelect }: RelicItemCardProps) {
  return (
    <button
      type="button"
      className={`${styles.itemCard}${selected ? ` ${styles.itemCardSelected}` : ""}`}
      onClick={() => onSelect(item)}
      aria-pressed={selected}
    >
      <div className={styles.itemThumbFrame} aria-hidden="true">
        <span>{item.thumbnailHint}</span>
      </div>
      <p className={styles.itemMeta}>ID // {item.id}</p>
      <h3 className={styles.itemTitle}>{item.title}</h3>
      <span
        className={`${styles.itemStatus} ${item.status === "RECOVERED" ? styles.itemRecovered : styles.itemClassified}`}
      >
        {item.status}
      </span>
    </button>
  );
}
