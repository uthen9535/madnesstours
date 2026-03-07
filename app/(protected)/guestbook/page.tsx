import { Role, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { ChatAutoRefresh } from "@/components/ChatAutoRefresh";
import { GuestbookPinControl } from "@/components/GuestbookPinControl";
import { NeonButton } from "@/components/NeonButton";
import { ProfileLink } from "@/components/ProfileLink";
import { RetroWindow } from "@/components/RetroWindow";
import { requireUser } from "@/lib/auth";
import { formatEthUnitsFromBase } from "@/lib/ethPurse";
import { formatSurfacedLabel, WIRED_WINDOW_MS } from "@/lib/operatorDashboard";
import { buildPunchCountsByUserId, formatPunchCounts } from "@/lib/punchCounts";
import { prisma } from "@/lib/prisma";
import { formatBtcUnitsFromSats } from "@/lib/satoshi";
import { withSqliteRetry } from "@/lib/sqliteRetry";

function toStatusLabel(status: UserStatus): string {
  switch (status) {
    case UserStatus.ALIVE:
      return "alive";
    case UserStatus.COMPROMISED:
      return "compromised";
    case UserStatus.ELIMINATED:
      return "eliminated";
    default:
      return "alive";
  }
}

async function updateOwnStatus(formData: FormData) {
  "use server";

  try {
    const user = await requireUser();
    const nextStatus = String(formData.get("status") ?? "").trim();

    if (!Object.values(UserStatus).includes(nextStatus as UserStatus)) {
      return;
    }

    await withSqliteRetry(() =>
      prisma.user.update({
        where: { id: user.id },
        data: { status: nextStatus as UserStatus }
      })
    );

    revalidatePath("/guestbook");
    revalidatePath("/home");
    revalidatePath(`/profiles/${user.username.toLowerCase()}`);
  } catch (error) {
    console.error("guestbook status update failed", error);
  }
}

async function updateOwnOperations(formData: FormData) {
  "use server";

  try {
    const user = await requireUser();
    const operations = String(formData.get("operations") ?? "").trim().slice(0, 120);

    await withSqliteRetry(() =>
      prisma.user.update({
        where: { id: user.id },
        data: { operations }
      })
    );

    revalidatePath("/guestbook");
    revalidatePath("/home");
    revalidatePath(`/profiles/${user.username.toLowerCase()}`);
  } catch (error) {
    console.error("guestbook operations update failed", error);
  }
}

export default async function GuestbookPage() {
  const user = await requireUser();
  const isAdmin = user.role === Role.admin;

  const [members, tripLogPunchEntries, madnessPunches, ownPinRecord] = await Promise.all([
    isAdmin
      ? prisma.user.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            username: true,
            role: true,
            status: true,
            operations: true,
            btcSats: true,
            ethUnits: true,
            lastSeenAt: true,
            pin: true,
            pinResetComplete: true
          }
        })
      : prisma.user.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            username: true,
            status: true,
            operations: true,
            btcSats: true,
            ethUnits: true,
            lastSeenAt: true,
            pinResetComplete: true
          }
        }),
    prisma.guestbookEntry.findMany({
      where: { tripId: { not: null } },
      select: {
        userId: true,
        tripId: true,
        message: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.tripStamp.findMany({
      select: {
        userId: true,
        tripId: true
      },
      distinct: ["userId", "tripId"]
    }),
    isAdmin
      ? Promise.resolve(null)
      : prisma.user.findUnique({
          where: { id: user.id },
          select: { pin: true }
        })
  ]);

  const nowMs = Date.now();
  const punchCountsByUserId = buildPunchCountsByUserId(madnessPunches, tripLogPunchEntries);

  return (
    <div className="stack">
      <ChatAutoRefresh intervalMs={5000} pauseWhileTypingSelector=".database-table-wrap, .guestbook-pin-manager" />
      <RetroWindow title="Guestbook: Member Database">
        <p className="meta">Columns are live-refreshed every 5 seconds. Wired = wilco when operator is currently online.</p>
        <div className="database-table-wrap">
          <table className="database-table">
            <thead>
              <tr>
                <th>members</th>
                <th>punches</th>
                <th>stamps</th>
                <th>operations</th>
                <th>purse</th>
                <th>wired</th>
                <th>agent condition</th>
                <th>surfaced</th>
                <th className={isAdmin ? "database-table__pin-header" : undefined}>pin</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const adminMember = member as typeof member & { pin?: string; pinResetComplete?: boolean };
                const wired =
                  member.lastSeenAt && nowMs - member.lastSeenAt.getTime() <= WIRED_WINDOW_MS ? "wilco" : "negative";
                const surfaced = formatSurfacedLabel(member.lastSeenAt ?? null);

                return (
                  <tr key={member.id}>
                    <td>
                      <ProfileLink username={member.username} />
                    </td>
                    <td>{formatPunchCounts(punchCountsByUserId.get(member.id)?.mad ?? 0, punchCountsByUserId.get(member.id)?.may ?? 0)}</td>
                    <td>0</td>
                    <td>
                      {member.id === user.id ? (
                        <form action={updateOwnOperations} className="operations-inline-form">
                          <input
                            name="operations"
                            defaultValue={member.operations}
                            maxLength={120}
                            placeholder="Set your operations note"
                          />
                          <NeonButton type="submit" className="operations-inline-form__button">
                            Save
                          </NeonButton>
                        </form>
                      ) : (
                        member.operations
                      )}
                    </td>
                    <td>
                      {formatBtcUnitsFromSats(member.btcSats)} BTC // {formatEthUnitsFromBase(member.ethUnits)} ETH
                    </td>
                    <td>
                      {wired === "wilco" ? (
                        <span className="wired-status">
                          <span className="wired-status__dot" aria-hidden />
                          wilco
                        </span>
                      ) : (
                        "negative"
                      )}
                    </td>
                    <td>
                      {member.id === user.id ? (
                        <form action={updateOwnStatus} className="status-inline-form">
                          <select name="status" defaultValue={member.status}>
                            <option value={UserStatus.ALIVE}>alive</option>
                            <option value={UserStatus.COMPROMISED}>compromised</option>
                            <option value={UserStatus.ELIMINATED}>eliminated</option>
                          </select>
                          <NeonButton type="submit" className="status-inline-form__button">
                            Save
                          </NeonButton>
                        </form>
                      ) : (
                        toStatusLabel(member.status)
                      )}
                    </td>
                    <td>{surfaced}</td>
                    <td className={isAdmin ? "database-table__pin-cell" : undefined}>
                      <GuestbookPinControl
                        memberId={member.id}
                        memberUsername={member.username}
                        canEdit={isAdmin || member.id === user.id}
                        displayValue={
                          isAdmin
                            ? member.id === user.id
                              ? adminMember.pin ?? "******"
                              : adminMember.pinResetComplete
                              ? "******"
                              : adminMember.pin ?? "******"
                            : member.id === user.id
                            ? ownPinRecord?.pin ?? "******"
                            : "******"
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </RetroWindow>
    </div>
  );
}
