import { revalidatePath } from "next/cache";
import Link from "next/link";
import { MediaAssetKind, MediaAssetStatus, MediaType } from "@prisma/client";
import { BlinkTag } from "@/components/BlinkTag";
import { ChatAutoRefresh } from "@/components/ChatAutoRefresh";
import { ChatThreadViewport } from "@/components/ChatThreadViewport";
import { FooterForestStrip } from "@/components/FooterForestStrip";
import { HomeChartsColumn } from "@/components/HomeChartsColumn";
import { LiveChatComposer } from "@/components/LiveChatComposer";
import { NeonButton } from "@/components/NeonButton";
import { OperatorDashboardDetails } from "@/components/OperatorDashboardDetails";
import { ProfileLink } from "@/components/ProfileLink";
import { RetroWindow } from "@/components/RetroWindow";
import { requireUser } from "@/lib/auth";
import { getBTCWeeklySnapshot } from "@/lib/btc";
import {
  createChatMemePayload,
  encodeChatMemeMessage,
  extractLinkCandidatesFromMessage,
  parseChatMemeMessage
} from "@/lib/chatMemeMessage";
import { getETHWeeklySnapshot } from "@/lib/eth";
import { formatEthUnitsFromBase, parseEthUnitsToBase } from "@/lib/ethPurse";
import { findLibraryMemeByLink, listLibraryMemesForViewer, normalizeInternalMemeLink } from "@/lib/libraryMemes";
import type { LibraryMemeSource } from "@/lib/libraryMemeTypes";
import { getOperatorDashboardData } from "@/lib/operatorDashboard";
import { prisma } from "@/lib/prisma";
import { formatBtcUnitsFromSats, parseBtcUnitsToSats } from "@/lib/satoshi";
import { withSqliteRetry } from "@/lib/sqliteRetry";

const ORIGINAL_MEDIA_ASSET_URL_PATTERN = /\/uploads\/media\/assets\/[^/]+\/original\.[a-z0-9]+(?:$|[?#])/i;

function isOriginalMediaAssetUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && ORIGINAL_MEDIA_ASSET_URL_PATTERN.test(url);
}

function toLibraryMemeSource(value: string): LibraryMemeSource | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "asset" || normalized === "legacy") {
    return normalized;
  }

  return null;
}

async function sendHomeChatMessage(formData: FormData) {
  "use server";

  const user = await requireUser();
  const intent = String(formData.get("intent") ?? "message").trim();

  if (intent === "satoshi") {
    const recipientRaw = String(formData.get("dropRecipient") ?? "").trim();
    const recipientUsername = recipientRaw.replace(/^@+/, "").toLowerCase();
    if (!recipientUsername) {
      return;
    }

    const unitsRaw = String(formData.get("satoshiUnits") ?? "").trim();
    const amountSats = parseBtcUnitsToSats(unitsRaw);
    if (!amountSats) {
      return;
    }

    try {
      await withSqliteRetry(() =>
        prisma.$transaction(async (tx) => {
          const sender = await tx.user.findUnique({
            where: { id: user.id },
            select: { btcSats: true }
          });

          if (!sender || sender.btcSats < amountSats) {
            return;
          }

          const recipient = await tx.user.findUnique({
            where: { username: recipientUsername },
            select: { id: true, username: true }
          });

          if (!recipient || recipient.id === user.id) {
            return;
          }

          await tx.user.update({
            where: { id: user.id },
            data: {
              btcSats: {
                decrement: amountSats
              }
            }
          });

          const message = `SATOSHI DROP // ${formatBtcUnitsFromSats(amountSats)} BTC (${amountSats.toLocaleString()} sats) // target @${recipient.username}`;
          const entry = await tx.guestbookEntry.create({
            data: {
              userId: user.id,
              tripId: null,
              message
            }
          });

          await tx.satoshiDrop.create({
            data: {
              senderId: user.id,
              receiverId: recipient.id,
              messageId: entry.id,
              amountSats
            }
          });
        })
      );
    } catch (error) {
      console.error("chat transmission satoshi send failed", error);
      return;
    }
  } else if (intent === "ethereum") {
    const recipientRaw = String(formData.get("dropRecipient") ?? "").trim();
    const recipientUsername = recipientRaw.replace(/^@+/, "").toLowerCase();
    if (!recipientUsername) {
      return;
    }

    const unitsRaw = String(formData.get("ethereumUnits") ?? "").trim();
    const amountUnits = parseEthUnitsToBase(unitsRaw);
    if (!amountUnits) {
      return;
    }

    try {
      await withSqliteRetry(() =>
        prisma.$transaction(async (tx) => {
          const sender = await tx.user.findUnique({
            where: { id: user.id },
            select: { ethUnits: true }
          });

          if (!sender || sender.ethUnits < amountUnits) {
            return;
          }

          const recipient = await tx.user.findUnique({
            where: { username: recipientUsername },
            select: { id: true, username: true }
          });

          if (!recipient || recipient.id === user.id) {
            return;
          }

          await tx.user.update({
            where: { id: user.id },
            data: {
              ethUnits: {
                decrement: amountUnits
              }
            }
          });

          const message = `ETHEREUM DROP // ${formatEthUnitsFromBase(amountUnits)} ETH (${amountUnits.toLocaleString()} units) // target @${recipient.username}`;
          const entry = await tx.guestbookEntry.create({
            data: {
              userId: user.id,
              tripId: null,
              message
            }
          });

          await tx.ethDrop.create({
            data: {
              senderId: user.id,
              receiverId: recipient.id,
              messageId: entry.id,
              amountUnits
            }
          });
        })
      );
    } catch (error) {
      console.error("chat transmission ethereum send failed", error);
      return;
    }
  } else if (intent === "meme") {
    const selectedMemeId = String(formData.get("selectedMemeId") ?? "").trim();
    const selectedMemeSource = toLibraryMemeSource(String(formData.get("selectedMemeSource") ?? ""));
    const selectedMemeLink = String(formData.get("selectedMemeLink") ?? "").trim();
    if (!selectedMemeId || !selectedMemeSource) {
      return;
    }

    try {
      const memes = await listLibraryMemesForViewer({
        id: user.id,
        role: user.role
      });
      const selectedMeme = memes.find((item) => item.id === selectedMemeId && item.source === selectedMemeSource);
      if (!selectedMeme) {
        return;
      }

      const encodedMessage = encodeChatMemeMessage(
        createChatMemePayload(selectedMeme, selectedMemeLink || selectedMeme.copyUrl)
      );
      await withSqliteRetry(() =>
        prisma.guestbookEntry.create({
          data: {
            userId: user.id,
            tripId: null,
            message: encodedMessage
          }
        })
      );
    } catch (error) {
      console.error("chat transmission meme add failed", error);
      return;
    }
  } else {
    const message = String(formData.get("message") ?? "").trim();
    if (!message || message.length > 500) {
      return;
    }

    try {
      let messageToStore = message;
      const linkCandidates = extractLinkCandidatesFromMessage(message).filter(
        (candidate) => normalizeInternalMemeLink(candidate) !== null
      );

      if (linkCandidates.length > 0) {
        const memes = await listLibraryMemesForViewer({
          id: user.id,
          role: user.role
        });
        for (const linkCandidate of linkCandidates) {
          const matchedMeme = findLibraryMemeByLink(memes, linkCandidate);
          if (!matchedMeme) {
            continue;
          }

          messageToStore = encodeChatMemeMessage(createChatMemePayload(matchedMeme, linkCandidate));
          break;
        }
      }

      await withSqliteRetry(() =>
        prisma.guestbookEntry.create({
          data: {
            userId: user.id,
            tripId: null,
            message: messageToStore
          }
        })
      );
    } catch (error) {
      console.error("chat transmission message send failed", error);
      return;
    }
  }

  revalidatePath("/guestbook");
  revalidatePath("/home");
}

async function acceptSatoshiDropFromHome(formData: FormData) {
  "use server";

  const user = await requireUser();
  const dropId = String(formData.get("dropId") ?? "").trim();
  if (!dropId) {
    return;
  }

  try {
    await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        const drop = await tx.satoshiDrop.findUnique({
          where: { id: dropId },
          select: {
            amountSats: true,
            senderId: true,
            receiverId: true,
            claimedAt: true
          }
        });

        if (!drop || drop.senderId === user.id || drop.claimedAt) {
          return;
        }

        if (drop.receiverId && drop.receiverId !== user.id) {
          return;
        }

        const claimed = await tx.satoshiDrop.updateMany({
          where: {
            id: dropId,
            claimedAt: null
          },
          data: {
            receiverId: user.id,
            claimedAt: new Date()
          }
        });

        if (claimed.count === 0) {
          return;
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            btcSats: {
              increment: drop.amountSats
            }
          }
        });
      })
    );
  } catch (error) {
    console.error("chat transmission satoshi accept failed", error);
    return;
  }

  revalidatePath("/guestbook");
  revalidatePath("/home");
}

async function abortSatoshiDropFromHome(formData: FormData) {
  "use server";

  const user = await requireUser();
  const dropId = String(formData.get("dropId") ?? "").trim();
  if (!dropId) {
    return;
  }

  try {
    await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        const drop = await tx.satoshiDrop.findUnique({
          where: { id: dropId },
          select: {
            id: true,
            messageId: true,
            amountSats: true,
            senderId: true,
            claimedAt: true
          }
        });

        if (!drop || drop.senderId !== user.id || drop.claimedAt) {
          return;
        }

        const deleted = await tx.satoshiDrop.deleteMany({
          where: {
            id: drop.id,
            senderId: user.id,
            claimedAt: null
          }
        });

        if (deleted.count === 0) {
          return;
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            btcSats: {
              increment: drop.amountSats
            }
          }
        });

        await tx.guestbookEntry.deleteMany({
          where: {
            id: drop.messageId
          }
        });
      })
    );
  } catch (error) {
    console.error("chat transmission satoshi abort failed", error);
    return;
  }

  revalidatePath("/guestbook");
  revalidatePath("/home");
}

async function acceptEthereumDropFromHome(formData: FormData) {
  "use server";

  const user = await requireUser();
  const dropId = String(formData.get("dropId") ?? "").trim();
  if (!dropId) {
    return;
  }

  try {
    await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        const drop = await tx.ethDrop.findUnique({
          where: { id: dropId },
          select: {
            amountUnits: true,
            senderId: true,
            receiverId: true,
            claimedAt: true
          }
        });

        if (!drop || drop.senderId === user.id || drop.claimedAt) {
          return;
        }

        if (drop.receiverId && drop.receiverId !== user.id) {
          return;
        }

        const claimed = await tx.ethDrop.updateMany({
          where: {
            id: dropId,
            claimedAt: null
          },
          data: {
            receiverId: user.id,
            claimedAt: new Date()
          }
        });

        if (claimed.count === 0) {
          return;
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            ethUnits: {
              increment: drop.amountUnits
            }
          }
        });
      })
    );
  } catch (error) {
    console.error("chat transmission ethereum accept failed", error);
    return;
  }

  revalidatePath("/guestbook");
  revalidatePath("/home");
}

async function abortEthereumDropFromHome(formData: FormData) {
  "use server";

  const user = await requireUser();
  const dropId = String(formData.get("dropId") ?? "").trim();
  if (!dropId) {
    return;
  }

  try {
    await withSqliteRetry(() =>
      prisma.$transaction(async (tx) => {
        const drop = await tx.ethDrop.findUnique({
          where: { id: dropId },
          select: {
            id: true,
            messageId: true,
            amountUnits: true,
            senderId: true,
            claimedAt: true
          }
        });

        if (!drop || drop.senderId !== user.id || drop.claimedAt) {
          return;
        }

        const deleted = await tx.ethDrop.deleteMany({
          where: {
            id: drop.id,
            senderId: user.id,
            claimedAt: null
          }
        });

        if (deleted.count === 0) {
          return;
        }

        await tx.user.update({
          where: { id: user.id },
          data: {
            ethUnits: {
              increment: drop.amountUnits
            }
          }
        });

        await tx.guestbookEntry.deleteMany({
          where: {
            id: drop.messageId
          }
        });
      })
    );
  } catch (error) {
    console.error("chat transmission ethereum abort failed", error);
    return;
  }

  revalidatePath("/guestbook");
  revalidatePath("/home");
}

export default async function HomePage() {
  const user = await requireUser();
  const operatorDashboard = await getOperatorDashboardData(user.id);
  if (!operatorDashboard) {
    return null;
  }

  const [recentPosts, recentTrips, btcWeekly, ethWeekly, telemetry, chatEntriesDesc] = await Promise.all([
    prisma.blogPost.findMany({ where: { published: true }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.trip.findMany({ where: { published: true }, orderBy: { startDate: "desc" }, take: 3 }),
    getBTCWeeklySnapshot(),
    getETHWeeklySnapshot(),
    prisma.$transaction([
      prisma.user.count(),
      prisma.trip.count({ where: { published: true } }),
      prisma.satoshiDrop.count(),
      prisma.ethDrop.count()
    ]),
    prisma.guestbookEntry.findMany({
      where: { tripId: null },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true
          }
        },
        satoshiDrop: {
          select: {
            id: true,
            amountSats: true,
            senderId: true,
            receiverId: true,
            claimedAt: true,
            sender: {
              select: {
                username: true
              }
            },
            receiver: {
              select: {
                username: true
              }
            }
          }
        },
        ethDrop: {
          select: {
            id: true,
            amountUnits: true,
            senderId: true,
            receiverId: true,
            claimedAt: true,
            sender: {
              select: {
                username: true
              }
            },
            receiver: {
              select: {
                username: true
              }
            }
          }
        }
      }
    })
  ]);
  const [totalMembers, totalTours, satoshiDropEvents, ethDropEvents] = telemetry;
  const shotOClockEvents = satoshiDropEvents + ethDropEvents;
  const chatEntries = [...chatEntriesDesc].reverse().map((entry) => ({
    ...entry,
    parsedMessage: parseChatMemeMessage(entry.message)
  }));
  const latestTransmissionAt = chatEntriesDesc[0]?.createdAt ?? null;
  const communicatorActive =
    latestTransmissionAt !== null ? Date.now() - latestTransmissionAt.getTime() <= 5 * 60 * 1000 : false;
  const communicatorStateTone = communicatorActive ? "LIVE" : "IDLE";
  const recentTripIds = recentTrips.map((trip) => trip.id);
  const [recentTripCovers, recentTripFallbackImages, recentTripFallbackAssetImages] =
    recentTripIds.length > 0
      ? await Promise.all([
          prisma.mediaItem.findMany({
            where: {
              tripId: { in: recentTripIds },
              type: MediaType.OTHER,
              title: "__trip_cover__"
            },
            select: {
              tripId: true,
              url: true
            }
          }),
          prisma.mediaItem.findMany({
            where: {
              tripId: { in: recentTripIds },
              type: MediaType.IMAGE
            },
            orderBy: { createdAt: "desc" },
            select: {
              tripId: true,
              url: true
            }
          }),
          prisma.mediaAsset.findMany({
            where: {
              tripId: { in: recentTripIds },
              deletedAt: null,
              status: MediaAssetStatus.READY,
              fileType: { in: [MediaAssetKind.IMAGE, MediaAssetKind.GIF] }
            },
            orderBy: { createdAt: "desc" },
            select: {
              tripId: true,
              cardUrl: true,
              thumbnailUrl: true
            }
          })
        ])
      : [[], [], []];
  const recentTripCoverById = new Map<string, string>();
  for (const item of recentTripFallbackAssetImages) {
    if (!item.tripId || recentTripCoverById.has(item.tripId)) {
      continue;
    }
    const coverUrl = item.cardUrl ?? item.thumbnailUrl;
    if (!coverUrl) {
      continue;
    }
    recentTripCoverById.set(item.tripId, coverUrl);
  }
  for (const item of recentTripCovers) {
    if (!item.tripId) {
      continue;
    }
    if (isOriginalMediaAssetUrl(item.url) && recentTripCoverById.has(item.tripId)) {
      continue;
    }
    recentTripCoverById.set(item.tripId, item.url);
  }
  for (const item of recentTripFallbackImages) {
    if (!item.tripId || recentTripCoverById.has(item.tripId)) {
      continue;
    }
    recentTripCoverById.set(item.tripId, item.url);
  }

  return (
    <div className="stack">
      <div className="home-hub-layout">
        <div className="stack home-hub-main">
          <div className="home-main-grid">
            <div className="stack home-content-stack">
              <RetroWindow title="Operator Dashboard" className="home-top-panel">
                <p>
                  Welcome to MadnessNet, <ProfileLink username={user.username.toLowerCase()} />. Private comms are online.{" "}
                  <BlinkTag />
                </p>
                <div className="tag-row">
                  <img src="/icons/btc-chip.svg" alt="BTC pixel icon" width={24} height={24} />
                  <img src="/icons/mascot.svg" alt="Mascot pixel icon" width={24} height={24} />
                </div>
                <OperatorDashboardDetails {...operatorDashboard} />
              </RetroWindow>

              <RetroWindow title="Tour Queue">
                <div className="card-list">
                  {recentTrips.map((trip) => (
                    <div key={trip.id} className="card">
                      {recentTripCoverById.get(trip.id) ? (
                        <img
                          src={recentTripCoverById.get(trip.id)}
                          alt={`${trip.title} cover`}
                          className="trip-preview-cover"
                          loading="lazy"
                          decoding="async"
                          width={640}
                          height={360}
                        />
                      ) : null}
                      <h3>{trip.title}</h3>
                      <p className="meta">{trip.location}</p>
                      <p>{trip.summary}</p>
                      <Link href={`/tours/${trip.slug}`} className="neon-button card-cta-button">
                        Open Tour
                      </Link>
                    </div>
                  ))}
                </div>
              </RetroWindow>

              <RetroWindow title="Broadcasts">
                <div className="card-list">
                  {recentPosts.map((post) => (
                    <div key={post.id} className="card">
                      <h3>{post.title}</h3>
                      <p className="meta">/{post.category.toLowerCase()}</p>
                      <p>{post.excerpt ?? "No excerpt yet."}</p>
                      <Link href={`/blog/${post.slug}`} className="neon-button card-cta-button">
                        Open Post
                      </Link>
                    </div>
                  ))}
                </div>
              </RetroWindow>
            </div>

            <HomeChartsColumn
              btcInitial={{ points: btcWeekly.points, source: btcWeekly.source }}
              ethInitial={{ points: ethWeekly.points, source: ethWeekly.source }}
              stats={{
                totalMembers,
                totalTours,
                shotOClockEvents
              }}
            />
          </div>
        </div>

        <aside className="home-chat-dock">
          <ChatAutoRefresh intervalMs={5000} />
          <RetroWindow
            title="Chat Transmission"
            className={`home-chat-window ${communicatorActive ? "home-chat-window--active" : "home-chat-window--dormant"}`}
          >
            <div className="chat-comm-header" aria-live="polite">
              <div className="chat-comm-header__cluster chat-comm-header__cluster--left">
                <span className="chat-comm-header__led chat-comm-header__led--teal" aria-hidden />
                <span className="chat-comm-header__led chat-comm-header__led--amber" aria-hidden />
                <span className="chat-comm-header__mark">MX-9 LINK</span>
              </div>
              <div className="chat-comm-header__cluster chat-comm-header__cluster--center">
                <span className="chat-comm-header__signal-label">signal</span>
                <span className="chat-comm-header__bars" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="chat-comm-header__cluster chat-comm-header__cluster--right">
                <span className="chat-comm-header__state">{communicatorStateTone}</span>
                <span className="chat-comm-header__mark">
                  {latestTransmissionAt ? `last packet ${latestTransmissionAt.toLocaleTimeString()}` : "no packets in range"}
                </span>
              </div>
            </div>
            <p className="meta chat-comm-meta">Synced with Live Chat // auto-refresh every 5 seconds.</p>
            <ChatThreadViewport className="chat-thread home-chat-thread">
              {chatEntries.map((entry) => (
                <article
                  key={entry.id}
                  className={`chat-message ${entry.userId === user.id ? "chat-message--outbound" : "chat-message--inbound"} ${entry.satoshiDrop ? "chat-message--satoshi" : ""} ${entry.ethDrop ? "chat-message--ethereum" : ""} ${entry.parsedMessage.kind === "meme" ? "chat-message--meme" : ""}`}
                >
                  {entry.parsedMessage.kind === "meme" ? (
                    <div className="chat-message__meme">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={entry.parsedMessage.payload.previewUrl}
                        alt={entry.parsedMessage.payload.caption || `Meme uploaded by @${entry.parsedMessage.payload.uploader}`}
                        className="chat-message__meme-image"
                        loading="lazy"
                        decoding="async"
                        width={420}
                        height={420}
                      />
                      {entry.parsedMessage.payload.caption ? (
                        <p className="chat-message__meme-caption">{entry.parsedMessage.payload.caption}</p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="chat-message__body">{entry.parsedMessage.text}</p>
                  )}
                  {entry.satoshiDrop ? (
                    <div className="chat-sats-row">
                      <p className="meta">
                        transfer: {formatBtcUnitsFromSats(entry.satoshiDrop.amountSats)} BTC // from{" "}
                        <ProfileLink username={entry.satoshiDrop.sender.username} />{" "}
                        {entry.satoshiDrop.claimedAt ? (
                          <>
                            {"// accepted by "}
                            {entry.satoshiDrop.receiver?.username ? (
                              <ProfileLink username={entry.satoshiDrop.receiver.username} />
                            ) : (
                              "unknown"
                            )}
                          </>
                        ) : (
                          <>
                            {"// awaiting accept by "}
                            {entry.satoshiDrop.receiver?.username ? (
                              <ProfileLink username={entry.satoshiDrop.receiver.username} />
                            ) : (
                              "anyone"
                            )}
                          </>
                        )}
                      </p>
                      <div className="chat-sats-actions">
                        {!entry.satoshiDrop.claimedAt &&
                        entry.satoshiDrop.senderId !== user.id &&
                        (!entry.satoshiDrop.receiverId || entry.satoshiDrop.receiverId === user.id) ? (
                          <form action={acceptSatoshiDropFromHome}>
                            <input type="hidden" name="dropId" value={entry.satoshiDrop.id} />
                            <NeonButton type="submit" className="chat-sats-accept-button">
                              Accept
                            </NeonButton>
                          </form>
                        ) : null}
                        {!entry.satoshiDrop.claimedAt && entry.satoshiDrop.senderId === user.id ? (
                          <form action={abortSatoshiDropFromHome}>
                            <input type="hidden" name="dropId" value={entry.satoshiDrop.id} />
                            <NeonButton type="submit" className="chat-sats-abort-button">
                              Abort
                            </NeonButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {entry.ethDrop ? (
                    <div className="chat-sats-row">
                      <p className="meta">
                        transfer: {formatEthUnitsFromBase(entry.ethDrop.amountUnits)} ETH // from{" "}
                        <ProfileLink username={entry.ethDrop.sender.username} />{" "}
                        {entry.ethDrop.claimedAt ? (
                          <>
                            {"// accepted by "}
                            {entry.ethDrop.receiver?.username ? (
                              <ProfileLink username={entry.ethDrop.receiver.username} />
                            ) : (
                              "unknown"
                            )}
                          </>
                        ) : (
                          <>
                            {"// awaiting accept by "}
                            {entry.ethDrop.receiver?.username ? (
                              <ProfileLink username={entry.ethDrop.receiver.username} />
                            ) : (
                              "anyone"
                            )}
                          </>
                        )}
                      </p>
                      <div className="chat-sats-actions">
                        {!entry.ethDrop.claimedAt &&
                        entry.ethDrop.senderId !== user.id &&
                        (!entry.ethDrop.receiverId || entry.ethDrop.receiverId === user.id) ? (
                          <form action={acceptEthereumDropFromHome}>
                            <input type="hidden" name="dropId" value={entry.ethDrop.id} />
                            <NeonButton type="submit" className="chat-sats-accept-button">
                              Accept
                            </NeonButton>
                          </form>
                        ) : null}
                        {!entry.ethDrop.claimedAt && entry.ethDrop.senderId === user.id ? (
                          <form action={abortEthereumDropFromHome}>
                            <input type="hidden" name="dropId" value={entry.ethDrop.id} />
                            <NeonButton type="submit" className="chat-sats-abort-button">
                              Abort
                            </NeonButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  <p className="meta">
                    <ProfileLink username={entry.user.username} /> :: {entry.createdAt.toLocaleString()}
                  </p>
                </article>
              ))}
            </ChatThreadViewport>
            <div className="home-chat-form">
              <LiveChatComposer
                action={sendHomeChatMessage}
                textareaId="home-chat-message"
                availableSats={user.btcSats}
                availableEthUnits={user.ethUnits}
              />
            </div>
          </RetroWindow>
        </aside>
      </div>
      <FooterForestStrip />
    </div>
  );
}
