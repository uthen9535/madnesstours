import { RelicVaultAmbientAudio } from "@/components/RelicVaultAmbientAudio";
import { RetroWindow } from "@/components/RetroWindow";
import { RelicVaultScene } from "@/components/relic-vault/RelicVaultScene";

export default function RelicVaultPage() {
  return (
    <div className="stack">
      <RelicVaultAmbientAudio />
      <RetroWindow title="Relic Vault" className="deep-chats-window">
        <RelicVaultScene />
        <p className="deep-chats-note">
          A classified archive of mythic items to collect, punches earned by signing tour logs, stamps awarded for
          moments that deserve to be remembered, and strange artifacts discovered along the way.
        </p>
      </RetroWindow>
    </div>
  );
}
