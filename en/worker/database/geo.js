export async function getGeoRule(
  db,
  casinoSlug,
  countryCode
) {
  return await db
    .prepare(`
      SELECT *
      FROM geo_rules
      WHERE casino_slug = ?
      AND country_code = ?
      LIMIT 1
    `)
    .bind(casinoSlug, countryCode)
    .first();
}

export async function saveGeoRule(
 db,
 rule
){
 return db.prepare(`
 INSERT INTO geo_rules(
 casino_slug,
 country_code,
 status,
 bonus_override
 )
 VALUES(?,?,?,?)
 `)
 .bind(
 rule.casino_slug,
 rule.country_code,
 rule.status,
 rule.bonus_override
 )
 .run();
}



export async function getGeoRulesForCasino(db, casinoSlug) {
  const result = await db
    .prepare(`
      SELECT * FROM geo_rules
      WHERE casino_slug = ?
      ORDER BY country_code
    `)
    .bind(casinoSlug)
    .all();
  return result.results || [];
}

export async function deleteGeoRulesForCasino(db, casinoSlug) {
  return await db
    .prepare(`
      DELETE FROM geo_rules
      WHERE casino_slug = ?
    `)
    .bind(casinoSlug)
    .run();
}

export async function setCasinoGeoRules(db, casinoSlug, rules) {
  await deleteGeoRulesForCasino(db, casinoSlug);
  if (!rules.length) return;
  for (const rule of rules) {
    await db
      .prepare(`
        INSERT INTO geo_rules (casino_slug, country_code, status, bonus_override)
        VALUES (?, ?, ?, ?)
      `)
      .bind(casinoSlug, rule.country_code, rule.status, rule.bonus_override || null)
      .run();
  }
}
