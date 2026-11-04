export async function getSetting(
  db,
  key
) {

  const setting = await db
    .prepare(`
      SELECT value
      FROM settings
      WHERE key = ?
    `)
    .bind(key)
    .first();

  return setting?.value || null;
}


// Same as getSetting, but while a signed-in editor is previewing the draft (env.__preview, set per request by the
// app worker) a draft value wins over the stored one. Use this for any setting that public pages read directly.
export async function getSettingForRequest(env, key) {
  const draft = env && env.__preview && env.__preview.settings;
  if (draft && Object.prototype.hasOwnProperty.call(draft, key)) {
    const v = draft[key];
    return v == null || v === "" ? null : String(v);
  }
  return getSetting(env.DB, key);
}

export async function getAllSettings(db) {
  if (!db) return {};

  const result = await db
    .prepare(`
      SELECT key, value
      FROM settings
    `)
    .all();

  const settings = {};

  for (const row of result.results || []) {
    settings[row.key] = row.value;
  }

  return settings;
}

export async function saveSettings(
 db,
 settings
){
 for(const key in settings){

  await db.prepare(`
  INSERT OR REPLACE INTO settings(
   key,
   value,
   updated_at
  )
  VALUES(
   ?,
   ?,
   CURRENT_TIMESTAMP
  )
  `)
  .bind(
   key,
   String(settings[key])
  )
  .run();
 }

 return true;
}
