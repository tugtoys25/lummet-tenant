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

export async function getCountries(
  db
){

  const result =
    await db.prepare(`
      SELECT
        country_code,
        COUNT(*) clicks
      FROM clicks
      GROUP BY country_code
      ORDER BY clicks DESC
      LIMIT 100
    `)
    .all();

  return result.results || [];

}

export async function getTopCasinos(
  db
){

  const result =
    await db.prepare(`
      SELECT
        casino_slug,
        COUNT(*) clicks
      FROM clicks
      GROUP BY casino_slug
      ORDER BY clicks DESC
      LIMIT 20
    `)
    .all();

  return result.results || [];

}
