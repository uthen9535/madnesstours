"use client";

import { useEffect, useMemo, useState } from "react";
import { RelicItemCard, type RelicItem } from "@/components/relic-vault/RelicItemCard";
import { RelicItemDetail } from "@/components/relic-vault/RelicItemDetail";
import styles from "@/styles/relic-vault.module.css";

type RelicVaultModalProps = {
  open: boolean;
  categoryTitle: string;
  items: RelicItem[];
  onClose: () => void;
};

export function RelicVaultModal({ open, categoryTitle, items, onClose }: RelicVaultModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelectedId(items[0]?.id ?? null);
  }, [open, items]);

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
  }, [open, onClose]);

  const selectedItem = useMemo(() => {
    if (!selectedId) {
      return items[0] ?? null;
    }
    return items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  }, [items, selectedId]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.modalRoot} role="dialog" aria-modal="true" aria-label={`Relic Vault ${categoryTitle}`}>
      <button type="button" className={styles.modalBackdrop} aria-label="Close Relic Vault modal" onClick={onClose} />
      <div className={styles.modalPanel}>
        <header className={styles.modalHeader}>
          <h2>RELIC VAULT / {categoryTitle.toUpperCase()}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
            X
          </button>
        </header>

        <div className={styles.modalGrid}>
          <section className={styles.itemGrid}>
            {items.map((item) => (
              <RelicItemCard
                key={item.id}
                item={item}
                selected={item.id === selectedItem?.id}
                onSelect={(nextItem) => setSelectedId(nextItem.id)}
              />
            ))}
          </section>
          {selectedItem ? <RelicItemDetail item={selectedItem} /> : null}
        </div>
      </div>
    </div>
  );
}
