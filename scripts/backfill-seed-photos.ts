/* eslint-disable no-console */
// One-off: rewrites already-persisted picsum.photos URLs (from earlier seed
// runs, before seed.ts switched to self-hosted seed-assets/) to the local
// equivalent. Safe to re-run — rows with no picsum URLs are just skipped.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AVATAR_RE = /^https:\/\/picsum\.photos\/seed\/([a-zA-Z0-9_-]+)\/400\/400$/;
const PHOTO_RE = /^https:\/\/picsum\.photos\/seed\/([a-zA-Z0-9_-]+)\/800\/600$/;

function rewriteAvatar(url: string | null): string | null {
  if (!url) return url;
  const m = url.match(AVATAR_RE);
  return m ? `/seed-assets/${m[1]}-avatar.jpg` : url;
}

function rewritePhoto(url: string): string {
  const m = url.match(PHOTO_RE);
  return m ? `/seed-assets/${m[1]}-photo.jpg` : url;
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, avatarUrl: true, photos: true },
  });
  let userUpdates = 0;
  for (const u of users) {
    const newAvatar = rewriteAvatar(u.avatarUrl);
    const newPhotos = u.photos.map(rewritePhoto);
    const avatarChanged = newAvatar !== u.avatarUrl;
    const photosChanged = JSON.stringify(newPhotos) !== JSON.stringify(u.photos);
    if (avatarChanged || photosChanged) {
      await prisma.user.update({
        where: { id: u.id },
        data: { avatarUrl: newAvatar, photos: newPhotos },
      });
      userUpdates++;
    }
  }

  const events = await prisma.event.findMany({ select: { id: true, photos: true } });
  let eventUpdates = 0;
  for (const e of events) {
    const newPhotos = e.photos.map(rewritePhoto);
    if (JSON.stringify(newPhotos) !== JSON.stringify(e.photos)) {
      await prisma.event.update({ where: { id: e.id }, data: { photos: newPhotos } });
      eventUpdates++;
    }
  }

  console.log(`Updated ${userUpdates} user(s), ${eventUpdates} event(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
