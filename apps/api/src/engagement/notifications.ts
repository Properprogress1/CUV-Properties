import type { Prisma } from "@prisma/client";

export function queueMail(
  tx: Prisma.TransactionClient,
  key: string,
  recipient: string,
  subject: string,
  body: string,
) {
  return tx.mailJob.upsert({
    where: { key },
    create: { key, recipient, subject, body },
    update: {},
  });
}

export async function notify(
  tx: Prisma.TransactionClient,
  userId: string,
  key: string,
  title: string,
  message: string,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      active: true,
      emailUpdates: true,
      emailVerifiedAt: true,
    },
  });
  if (!user?.active) return;
  await tx.notification.upsert({
    where: { key },
    create: { userId, key, title, message },
    update: {},
  });
  if (user.emailUpdates && user.emailVerifiedAt)
    await queueMail(tx, key, user.email, title, message);
}
