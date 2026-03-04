import { RetroWindow } from "@/components/RetroWindow";

export default function StagingPage() {
  return (
    <div className="stack">
      <RetroWindow title="Staging">
        <p className="meta">Access Terminal removed from this page. Use `/login` for operator access.</p>
      </RetroWindow>
    </div>
  );
}
