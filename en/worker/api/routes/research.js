// Research items, sources, claims, relations, versions, review queue, datasets.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { getCurrentUser } from "../../auth.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // RESEARCH CRUD (Phase 1)
    // ==================================
    if (path === "/api/v1/research/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["type", "slug", "title"]);
      const researchDB = await import("../../database/research.js");
      if (!researchDB.isValidResearchType(body.type)) {
        return json({ success: false, error: `Invalid research type: ${body.type}` }, 422);
      }
      const result = await researchDB.createResearchItem(env.DB, body);
      const newId = result.meta?.last_row_id;
      if (newId) {
        const versionsDB = await import("../../database/research-versions.js");
        const savedItem = await researchDB.getResearchItemById(env.DB, newId);
        const currentUser = await getCurrentUser(request, env);
        await versionsDB.createVersionIfChanged(env.DB, savedItem, { changedBy: currentUser?.email || null });
      }
      return success({ id: newId });
    }

    if (path === "/api/v1/research/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "type", "slug", "title"]);
      const researchDB = await import("../../database/research.js");
      if (!researchDB.isValidResearchType(body.type)) {
        return json({ success: false, error: `Invalid research type: ${body.type}` }, 422);
      }
      await researchDB.updateResearchItem(env.DB, body.id, body);
      const versionsDB = await import("../../database/research-versions.js");
      const savedItem = await researchDB.getResearchItemById(env.DB, body.id);
      const currentUser = await getCurrentUser(request, env);
      await versionsDB.createVersionIfChanged(env.DB, savedItem, { changedBy: currentUser?.email || null, changeSummary: body.change_summary || null });
      return success();
    }

    if (path === "/api/v1/research/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const researchDB = await import("../../database/research.js");
      await researchDB.deleteResearchItem(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research/list" && request.method === "GET") {
      const researchDB = await import("../../database/research.js");
      const items = await researchDB.getAllResearchItems(env.DB);
      return json({ research: items });
    }

    if (path === "/api/v1/research/get-by-id" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const researchDB = await import("../../database/research.js");
      const item = await researchDB.getResearchItemById(env.DB, id);
      if (!item) return failure("Research item not found", 404);
      return json({ success: true, item });
    }

    if (path === "/api/v1/research/overdue" && request.method === "GET") {
      const researchDB = await import("../../database/research.js");
      const items = await researchDB.getOverdueResearchItems(env.DB);
      return json({ items });
    }

    // ==================================
    // RESEARCH SOURCES CRUD (Phase 2)
    // Global, reusable — a source is never duplicated per item.
    // ==================================
    if (path === "/api/v1/research-sources/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["organisation"]);
      const sourcesDB = await import("../../database/research-sources.js");
      if (body.source_type && !sourcesDB.isValidSourceType(body.source_type)) {
        return failure(`Invalid source type: ${body.source_type}`, 422);
      }
      await sourcesDB.createSource(env.DB, body);
      return success();
    }

    if (path === "/api/v1/research-sources/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "organisation"]);
      const sourcesDB = await import("../../database/research-sources.js");
      if (body.source_type && !sourcesDB.isValidSourceType(body.source_type)) {
        return failure(`Invalid source type: ${body.source_type}`, 422);
      }
      await sourcesDB.updateSource(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/research-sources/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const sourcesDB = await import("../../database/research-sources.js");
      await sourcesDB.deleteSource(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-sources/list" && request.method === "GET") {
      const sourcesDB = await import("../../database/research-sources.js");
      const sources = await sourcesDB.getAllSources(env.DB);
      return json({ sources });
    }

    if (path === "/api/v1/research-sources/get" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const sourcesDB = await import("../../database/research-sources.js");
      const source = await sourcesDB.getSource(env.DB, id);
      if (!source) return failure("Source not found", 404);
      return json({ success: true, source });
    }

    // ==================================
    // RESEARCH CLAIMS CRUD (Phase 2)
    // Scoped to a single research_item; sourced via
    // research_claim_sources (attach/detach below).
    // ==================================
    if (path === "/api/v1/research-claims/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["research_item_id", "claim_text"]);
      const claimsDB = await import("../../database/research-claims.js");
      if (body.status && !claimsDB.isValidClaimStatus(body.status)) {
        return failure(`Invalid claim status: ${body.status}`, 422);
      }
      const result = await claimsDB.createClaim(env.DB, body);
      return success({ id: result.meta?.last_row_id });
    }

    if (path === "/api/v1/research-claims/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "claim_text"]);
      const claimsDB = await import("../../database/research-claims.js");
      if (body.status && !claimsDB.isValidClaimStatus(body.status)) {
        return failure(`Invalid claim status: ${body.status}`, 422);
      }
      await claimsDB.updateClaim(env.DB, body.id, body);
      return success();
    }

    if (path === "/api/v1/research-claims/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const claimsDB = await import("../../database/research-claims.js");
      await claimsDB.deleteClaim(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-claims/list-for-item" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const researchItemId = parseInt(reqUrl.searchParams.get("research_item_id"));
      if (!researchItemId) return failure("research_item_id is required");
      const claimsDB = await import("../../database/research-claims.js");
      const claims = await claimsDB.getClaimsForResearchItem(env.DB, researchItemId);
      return json({ claims });
    }

    if (path === "/api/v1/research-claims/attach-source" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["claim_id", "source_id"]);
      const claimsDB = await import("../../database/research-claims.js");
      if (body.support_type && !claimsDB.isValidSupportType(body.support_type)) {
        return failure(`Invalid support type: ${body.support_type}`, 422);
      }
      await claimsDB.attachSourceToClaim(env.DB, body);
      return success();
    }

    if (path === "/api/v1/research-claims/detach-source" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const claimsDB = await import("../../database/research-claims.js");
      await claimsDB.detachSourceFromClaim(env.DB, body.id);
      return success();
    }

    // ==================================
    // RESEARCH RELATIONS (Phase 3)
    // The generic entity graph — from/to can be a research item OR
    // an existing casino/country/category/payment_method row.
    // ==================================
    if (path === "/api/v1/research-relations/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["from_type", "from_id", "to_type", "to_id", "relation_type"]);
      const relationsDB = await import("../../database/research-relations.js");
      if (!relationsDB.isValidEntityType(body.from_type)) return failure(`Invalid from_type: ${body.from_type}`, 422);
      if (!relationsDB.isValidEntityType(body.to_type)) return failure(`Invalid to_type: ${body.to_type}`, 422);
      if (!relationsDB.isValidRelationType(body.relation_type)) return failure(`Invalid relation_type: ${body.relation_type}`, 422);
      try {
        await relationsDB.createRelation(env.DB, body);
      } catch (e) {
        if (String(e.message).includes("UNIQUE")) return failure("This relationship already exists.", 409);
        throw e;
      }
      return success();
    }

    if (path === "/api/v1/research-relations/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const relationsDB = await import("../../database/research-relations.js");
      await relationsDB.deleteRelation(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-relations/list-for-entity" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const entityType = reqUrl.searchParams.get("type");
      const entityId = reqUrl.searchParams.get("id");
      const relationsDB = await import("../../database/research-relations.js");
      if (!entityType || !entityId || !relationsDB.isValidEntityType(entityType)) {
        return failure("Valid type and id are required");
      }
      const relations = await relationsDB.getAllRelationsForEntity(env.DB, entityType, entityId);
      return json({ relations });
    }

    if (path === "/api/v1/research-relations/search-entities" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const q = reqUrl.searchParams.get("q") || "";
      const relationsDB = await import("../../database/research-relations.js");
      if (q.trim().length < 2) return json({ results: [] });
      const results = await relationsDB.searchEntities(env.DB, q.trim());
      return json({ results });
    }

    // ==================================
    // RESEARCH VERSIONS (Phase 4)
    // Snapshots are written automatically by research/create and
    // research/update above (see createVersionIfChanged) — the only
    // write endpoint needed here is restore.
    // ==================================
    if (path === "/api/v1/research-versions/list-for-item" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const researchItemId = parseInt(reqUrl.searchParams.get("research_item_id"));
      if (!researchItemId) return failure("research_item_id is required");
      const versionsDB = await import("../../database/research-versions.js");
      const versions = await versionsDB.getVersionsForItem(env.DB, researchItemId);
      return json({ versions });
    }

    if (path === "/api/v1/research-versions/get" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const versionsDB = await import("../../database/research-versions.js");
      const version = await versionsDB.getVersion(env.DB, id);
      if (!version) return failure("Version not found", 404);
      return json({ success: true, version });
    }

    if (path === "/api/v1/research-versions/diff" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      const compareTo = reqUrl.searchParams.get("compare_to"); // version id, or "current"
      if (!id) return failure("id is required");
      const versionsDB = await import("../../database/research-versions.js");
      const version = await versionsDB.getVersion(env.DB, id);
      if (!version) return failure("Version not found", 404);

      let otherSnapshot;
      if (compareTo === "current" || !compareTo) {
        const researchDB = await import("../../database/research.js");
        const currentItem = await researchDB.getResearchItemById(env.DB, version.research_item_id);
        otherSnapshot = currentItem ? {
          type: currentItem.type, slug: currentItem.slug, title: currentItem.title,
          subtitle: currentItem.subtitle, excerpt: currentItem.excerpt, content_json: currentItem.content_json,
          country_id: currentItem.country_id, author_id: currentItem.author_id, status: currentItem.status,
          published: currentItem.published, robots: currentItem.robots, seo_title: currentItem.seo_title,
          seo_description: currentItem.seo_description, seo_keywords: currentItem.seo_keywords,
          canonical_url: currentItem.canonical_url, og_image: currentItem.og_image, featured: currentItem.featured
        } : null;
      } else {
        const other = await versionsDB.getVersion(env.DB, parseInt(compareTo));
        otherSnapshot = other?.content_snapshot || null;
      }

      const changes = versionsDB.diffSnapshots(version.content_snapshot, otherSnapshot);
      return json({ changes });
    }

    if (path === "/api/v1/research-versions/restore" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const versionsDB = await import("../../database/research-versions.js");
      const currentUser = await getCurrentUser(request, env);
      try {
        const restoredItem = await versionsDB.restoreVersion(env.DB, body.id, { changedBy: currentUser?.email || null });
        return success({ item: restoredItem });
      } catch (e) {
        return failure(e.message || "Could not restore version", 404);
      }
    }

    // ==================================
    // RESEARCH REVIEW QUEUE (Phase 5)
    // Read-only — every list here is computed from existing data,
    // nothing new is stored except the source-health status update
    // below, which reuses a column research_sources already has.
    // ==================================
    if (path === "/api/v1/research-review-queue/summary" && request.method === "GET") {
      const queueDB = await import("../../database/research-review-queue.js");
      const counts = await queueDB.getReviewQueueCounts(env.DB);
      return json({ counts });
    }

    if (path === "/api/v1/research-review-queue/list" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const category = reqUrl.searchParams.get("category");
      const queueDB = await import("../../database/research-review-queue.js");
      const handlers = {
        overdue_verification: queueDB.getOverdueVerification,
        broken_sources: queueDB.getBrokenSources,
        stale_sources: queueDB.getStaleSources,
        missing_citations: queueDB.getItemsMissingCitations,
        missing_seo: queueDB.getItemsMissingSeo,
        orphan_relations: queueDB.getOrphanRelations,
      };
      const handler = handlers[category];
      if (!handler) return failure(`Unknown review queue category: ${category}`, 422);
      const items = await handler(env.DB);
      return json({ items });
    }

    if (path === "/api/v1/research-sources/check-health" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const sourcesDB = await import("../../database/research-sources.js");
      const source = await sourcesDB.getSource(env.DB, body.id);
      if (!source) return failure("Source not found", 404);
      const { checkAndRecordSourceHealth } = await import("../../research/source-health.js");
      const result = await checkAndRecordSourceHealth(env.DB, source);
      return json({ success: true, result });
    }

    // ==================================
    // RESEARCH DATASETS (Phase 6)
    // Reusable, versioned tables that report sections, country
    // pages, and comparison pages all pull from via a
    // { type: 'dataset_table' } content block — see
    // renderResearchSections() in controllers.js.
    // ==================================
    if (path === "/api/v1/research-datasets/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["slug", "title"]);
      const datasetsDB = await import("../../database/research-datasets.js");
      if (body.status && !datasetsDB.isValidDatasetStatus(body.status)) {
        return failure(`Invalid dataset status: ${body.status}`, 422);
      }
      const result = await datasetsDB.createDataset(env.DB, body);
      const newId = result.meta?.last_row_id;
      if (newId) {
        const savedDataset = await datasetsDB.getDataset(env.DB, newId);
        const currentUser = await getCurrentUser(request, env);
        await datasetsDB.createDatasetVersionIfChanged(env.DB, savedDataset, { changedBy: currentUser?.email || null });
      }
      return success({ id: newId });
    }

    if (path === "/api/v1/research-datasets/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "slug", "title"]);
      const datasetsDB = await import("../../database/research-datasets.js");
      if (body.status && !datasetsDB.isValidDatasetStatus(body.status)) {
        return failure(`Invalid dataset status: ${body.status}`, 422);
      }
      await datasetsDB.updateDataset(env.DB, body.id, body);
      const savedDataset = await datasetsDB.getDataset(env.DB, body.id);
      const currentUser = await getCurrentUser(request, env);
      await datasetsDB.createDatasetVersionIfChanged(env.DB, savedDataset, { changedBy: currentUser?.email || null, changeSummary: body.change_summary || null });
      return success();
    }

    if (path === "/api/v1/research-datasets/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      const datasetsDB = await import("../../database/research-datasets.js");
      await datasetsDB.deleteDataset(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/research-datasets/list" && request.method === "GET") {
      const datasetsDB = await import("../../database/research-datasets.js");
      const datasets = await datasetsDB.getAllDatasets(env.DB);
      return json({ datasets });
    }

    if (path === "/api/v1/research-datasets/get" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const id = parseInt(reqUrl.searchParams.get("id"));
      if (!id) return failure("id is required");
      const datasetsDB = await import("../../database/research-datasets.js");
      const dataset = await datasetsDB.getDataset(env.DB, id);
      if (!dataset) return failure("Dataset not found", 404);
      return json({ success: true, dataset });
    }

    if (path === "/api/v1/research-datasets/get-by-slug" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const slug = reqUrl.searchParams.get("slug");
      if (!slug) return failure("slug is required");
      const datasetsDB = await import("../../database/research-datasets.js");
      const dataset = await datasetsDB.getDatasetBySlug(env.DB, slug);
      if (!dataset) return failure("Dataset not found", 404);
      return json({ success: true, dataset });
    }

    if (path === "/api/v1/research-datasets/versions" && request.method === "GET") {
      const reqUrl = new URL(request.url);
      const datasetId = parseInt(reqUrl.searchParams.get("dataset_id"));
      if (!datasetId) return failure("dataset_id is required");
      const datasetsDB = await import("../../database/research-datasets.js");
      const versions = await datasetsDB.getDatasetVersions(env.DB, datasetId);
      return json({ versions });
    }

  return NOT_HANDLED;
}
