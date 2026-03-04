import { revalidatePath } from "next/cache";
import Link from "next/link";
import { BTCSatsChart } from "@/components/BTCSatsChart";
import { BlinkTag } from "@/components/BlinkTag";
import { ChatAutoRefresh } from "@/components/ChatAutoRefresh";
import { FooterForestStrip } from "@/components/FooterForestStrip";
import { LiveChatComposer } from "@/components/LiveChatComposer";
import { NeonButton } from "@/components/NeonButton";
import { OperatorDashboardDetails } from "@/components/OperatorDashboardDetails";
import { ProfileLink } from "@/components/ProfileLink";
import { RetroWindow } from "@/components/RetroWindow";
import { SubmarineCommandChart } from "@/components/SubmarineCommandChart";
import { requireUser } from "@/lib/auth";
import { getBTCWeeklySnapshot } from "@/lib/btc";
import { getETHWeeklySnapshot } from "@/lib/eth";
import { getOperatorDashboardData } from "@/lib/operatorDashboard";
import { prisma } from "@/lib/prisma";
import { formatBtcUnitsFromSats, parseBtcUnitsToSats } from "@/lib/satoshi";

async function sendHomeChatMessage(formData: FormData) {
  "use server";

  const user = await requireUser();
  const intent = String(formData.get("intent") ?? "message").trim();

  if (intent === "satoshi") {
    const recipientRaw = String(formData.get("satoshiRecipient") ?? "").trim();
    const recipientUsername = recipientRaw.replace(/^@+/, "").toLowerCase();
    if (!recipientUsername) {
      return;
    }

    const unitsRaw = String(formData.get("satoshiUnits") ?? "").trim();
    const amountSats = parseBtcUnitsToSats(unitsRaw);
    if (!amountSats) {
      return;
    }

    await prisma.$transaction(async (tx) => {
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
    });
  } else {
    const message = String(formData.get("message") ?? "").trim();
    if (!message || message.length > 500) {
      return;
    }

    await prisma.guestbookEntry.create({
      data: {
        userId: user.id,
        tripId: null,
        message
      }
    });
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

  await prisma.$transaction(async (tx) => {
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
  });

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

  await prisma.$transaction(async (tx) => {
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
  });

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
      prisma.satoshiDrop.count()
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
        }
      }
    })
  ]);
  const [totalMembers, totalTours, shotOClockEvents] = telemetry;
  const chatEntries = [...chatEntriesDesc].reverse();

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

              <RetroWindow title="Travel Queue">
                <div className="card-list">
                  {recentTrips.map((trip) => (
                    <div key={trip.id} className="card">
                      <h3>{trip.title}</h3>
                      <p className="meta">{trip.location}</p>
                      <p>{trip.summary}</p>
                      <Link href={`/trips/${trip.slug}`}>View Trip Log</Link>
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
                      <Link href={`/blog/${post.slug}`}>Open Post</Link>
                    </div>
                  ))}
                </div>
              </RetroWindow>
            </div>

            <div className="stack home-tracker-stack">
              <RetroWindow title="Fleet Telemetry" className="home-top-panel home-top-panel--command-station">
                <SubmarineCommandChart
                  totalMembers={totalMembers}
                  totalTours={totalTours}
                  shotOClockEvents={shotOClockEvents}
                />
              </RetroWindow>
              <RetroWindow title="Satoshi Tracker" className="home-top-panel home-top-panel--tracker-orange">
                <BTCSatsChart
                  initialPoints={btcWeekly.points}
                  initialSource={btcWeekly.source}
                  assetSymbol="BTC"
                  spotEndpoint="/api/btc/spot"
                  theme="orange"
                />
              </RetroWindow>
              <RetroWindow title="ETH Tracker" className="home-top-panel home-top-panel--tracker-purple">
                <BTCSatsChart
                  initialPoints={ethWeekly.points}
                  initialSource={ethWeekly.source}
                  assetSymbol="ETH"
                  spotEndpoint="/api/eth/spot"
                  theme="purple"
                />
              </RetroWindow>
            </div>
          </div>
        </div>

        <aside className="home-chat-dock">
          <ChatAutoRefresh intervalMs={5000} />
          <RetroWindow title="Live Chat Relay" className="home-chat-window">
            <p className="meta">Synced with the Live Chat page. Realtime-ish refresh every 5 seconds.</p>
            <div className="chat-thread home-chat-thread">
              {chatEntries.map((entry) => (
                <article
                  key={entry.id}
                  className={`chat-message ${entry.userId === user.id ? "chat-message--outbound" : "chat-message--inbound"} ${entry.satoshiDrop ? "chat-message--satoshi" : ""}`}
                >
                  <p className="chat-message__body">{entry.message}</p>
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
                  <p className="meta">
                    {entry.user.displayName} (<ProfileLink username={entry.user.username} />) :: {entry.createdAt.toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
            <div className="home-chat-form">
              <LiveChatComposer action={sendHomeChatMessage} textareaId="home-chat-message" availableSats={user.btcSats} />
            </div>
          </RetroWindow>
        </aside>
      </div>
      <FooterForestStrip />
    </div>
  );
}
