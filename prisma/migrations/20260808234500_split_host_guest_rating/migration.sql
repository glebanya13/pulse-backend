-- AlterTable
ALTER TABLE "User" ADD COLUMN "hostRating" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "User" ADD COLUMN "hostReviewsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "guestRating" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "User" ADD COLUMN "guestReviewsCount" INTEGER NOT NULL DEFAULT 0;

-- Backfill from existing reviews (role-separated averages).
UPDATE "User" u
SET
  "hostRating" = COALESCE((
    SELECT ROUND(AVG(r."overallScore"))::int
    FROM "Review" r
    WHERE r."targetId" = u.id AND r."targetRole" = 'HOST'
  ), 100),
  "hostReviewsCount" = (
    SELECT COUNT(*)::int FROM "Review" r
    WHERE r."targetId" = u.id AND r."targetRole" = 'HOST'
  ),
  "guestRating" = COALESCE((
    SELECT ROUND(AVG(r."overallScore"))::int
    FROM "Review" r
    WHERE r."targetId" = u.id AND r."targetRole" = 'GUEST'
  ), 100),
  "guestReviewsCount" = (
    SELECT COUNT(*)::int FROM "Review" r
    WHERE r."targetId" = u.id AND r."targetRole" = 'GUEST'
  );

-- Public "rating" on cards = host portrait when host reviews exist, else guest, else 100.
UPDATE "User" u
SET
  rating = CASE
    WHEN u."hostReviewsCount" > 0 THEN u."hostRating"
    WHEN u."guestReviewsCount" > 0 THEN u."guestRating"
    ELSE 100
  END,
  "reviewsCount" = u."hostReviewsCount" + u."guestReviewsCount";
