import { revalidatePath } from "next/cache";
import Link from "next/link";
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
import { getETHWeeklySnapshot } from "@/lib/eth";
import { formatEthUnitsFromBase, parseEthUnitsToBase } from "@/lib/ethPurse";
import { getOperatorDashboardData } from "@/lib/operatorDashboard";
import { prisma } from "@/lib/prisma";
import { formatBtcUnitsFromSats, parseBtcUnitsToSats } from "@/lib/satoshi";
import { withSqliteRetry } from "@/lib/sqliteRetry";

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
  } else {
    const message = String(formData.get("message") ?? "").trim();
    if (!message || message.length > 500) {
      return;
    }

    try {
      await withSqliteRetry(() =>
        prisma.guestbookEntry.create({
          data: {
            userId: user.id,
            tripId: null,
            message
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
  const kpiMax = Math.max(totalMembers, totalTours, shotOClockEvents, 1);
  const kpiPct = (value: number) => `${Math.max(12, Math.round((value / kpiMax) * 100))}%`;
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

              <RetroWindow title="Member KPIs" className="home-top-panel home-top-panel--command-station">
                <div className="card-list">
                  <div className="card">
                    <h3>Total Members</h3>
                    <p className="meta">{totalMembers.toLocaleString()} members in system</p>
                    <div className="submarine-chart__meter" aria-hidden>
                      <span style={{ width: kpiPct(totalMembers) }} />
                    </div>
                  </div>
                  <div className="card">
                    <h3>Total Tours</h3>
                    <p className="meta">{totalTours.toLocaleString()} published tours</p>
                    <div className="submarine-chart__meter" aria-hidden>
                      <span style={{ width: kpiPct(totalTours) }} />
                    </div>
                  </div>
                  <div className="card">
                    <h3>Shot O&apos;Clock Events</h3>
                    <p className="meta">{shotOClockEvents.toLocaleString()} total transmissions</p>
                    <div className="submarine-chart__meter" aria-hidden>
                      <span style={{ width: kpiPct(shotOClockEvents) }} />
                    </div>
                  </div>
                </div>
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

            <HomeChartsColumn
              btcInitial={{ points: btcWeekly.points, source: btcWeekly.source }}
              ethInitial={{ points: ethWeekly.points, source: ethWeekly.source }}
            />
          </div>
        </div>

        <aside className="home-chat-dock">
          <ChatAutoRefresh intervalMs={5000} />
          <RetroWindow title="Chat Transmission" className="home-chat-window">
            <p className="meta">Synced with the Live Chat page. Realtime-ish refresh every 5 seconds.</p>
            <ChatThreadViewport className="chat-thread home-chat-thread">
              {chatEntries.map((entry) => (
                <article
                  key={entry.id}
                  className={`chat-message ${entry.userId === user.id ? "chat-message--outbound" : "chat-message--inbound"} ${entry.satoshiDrop ? "chat-message--satoshi" : ""} ${entry.ethDrop ? "chat-message--ethereum" : ""}`}
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
                    {entry.user.displayName} (<ProfileLink username={entry.user.username} />) :: {entry.createdAt.toLocaleString()}
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
