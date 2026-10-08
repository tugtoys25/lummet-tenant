export async function logAIGeneration(
  db,
  entityType,
  entitySlug,
  prompt,
  model
) {

  return await db
    .prepare(`
      INSERT INTO ai_generations (
        entity_type,
        entity_slug,
        prompt,
        model
      )
      VALUES (?, ?, ?, ?)
    `)
    .bind(
      entityType,
      entitySlug,
      prompt,
      model
    )
    .run();
}
