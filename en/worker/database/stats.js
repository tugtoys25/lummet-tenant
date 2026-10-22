export async function getOverview(
  db
){

  const casinos =
    await db.prepare(`
      SELECT COUNT(*) c
      FROM casinos
    `).first();

  const reviews =
    await db.prepare(`
      SELECT COUNT(*) c
      FROM reviews
    `).first();

  const clicks =
    await db.prepare(`
      SELECT COUNT(*) c
      FROM clicks
    `).first();

  const pages =
    await db.prepare(`
      SELECT COUNT(*) c
      FROM pages
    `).first();

  return {
    casinos: casinos.c,
    reviews: reviews.c,
    clicks: clicks.c,
    pages: pages.c
  };

}


