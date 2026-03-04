import { DeepChatsAmbientAudio } from "@/components/DeepChatsAmbientAudio";
import { DeepChatsVideoModule } from "@/components/DeepChatsVideoModule";
import { FearArchiveDashboard } from "@/components/FearArchiveDashboard";
import { RetroWindow } from "@/components/RetroWindow";

export default function DeepChatsPage() {
  return (
    <div className="stack">
      <DeepChatsAmbientAudio />
      <RetroWindow title="Deep Chats // Full Scene" className="deep-chats-window">
        <DeepChatsVideoModule />
        <p className="deep-chats-note">Mini game staging area. Full-size scene preview is live here.</p>
      </RetroWindow>
      <FearArchiveDashboard />
    </div>
  );
}
