import { RetroWindow } from "@/components/RetroWindow";
import { LibraryArchive } from "@/components/library/LibraryArchive";
import { requireUser } from "@/lib/auth";

export default async function LibraryPage() {
  await requireUser();

  return (
    <div className="stack">
      <RetroWindow title="Madness Library // Cultural Archive">
        <LibraryArchive />
      </RetroWindow>
    </div>
  );
}
