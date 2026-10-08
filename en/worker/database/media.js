export async function createMedia(
  db,
  data
){

  return db.prepare(`
    INSERT INTO media(
      filename,
      url,
      mime_type,
      size,
      uploaded_by
    )
    VALUES(
      ?,?,?,?,?
    )
  `)
  .bind(
    data.filename,
    data.url,
    data.mime_type,
    data.size,
    data.uploaded_by
  )
  .run();

}

export async function getMedia(
  db
){

  const result =
    await db.prepare(`
      SELECT *
      FROM media
      ORDER BY created_at DESC
    `)
    .all();

  return result.results || [];

}

export async function deleteMedia(
  db,
  id
){

  return db.prepare(`
    DELETE FROM media
    WHERE id=?
  `)
  .bind(id)
  .run();

}
