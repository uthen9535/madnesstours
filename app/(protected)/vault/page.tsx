import { MediaType } from "@prisma/client";
import { RetroWindow } from "@/components/RetroWindow";
import { prisma } from "@/lib/prisma";

export default async function VaultPage() {
  const media = await prisma.mediaItem.findMany({
    where: {
      approved: true,
      tripId: null
    },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: {
        select: {
          displayName: true
        }
      }
    }
  });

  return (
    <RetroWindow title="Vault: Members Only Media">
      <div className="card-list">
        {media.map((item) => (
          <article key={item.id} className="card">
            <h2>{item.title}</h2>
            <p className="meta">
              {item.type} :: uploaded by {item.uploadedBy.displayName}
            </p>
            <p>{item.description ?? "No description."}</p>
            {item.type === MediaType.IMAGE ? (
              <img src={item.url} alt={item.title} style={{ maxWidth: "100%", border: "2px solid #6aa8ff" }} />
            ) : null}
            {item.type === MediaType.AUDIO ? (
              <audio controls src={item.url} style={{ width: "100%" }}>
                <track kind="captions" />
              </audio>
            ) : null}
            {item.type === MediaType.VIDEO ? (
              <video controls src={item.url} style={{ width: "100%" }}>
                <track kind="captions" />
              </video>
            ) : null}
            {item.type === MediaType.OTHER ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                Open Asset
              </a>
            ) : null}
          </article>
        ))}
      </div>
    </RetroWindow>
  );
}
