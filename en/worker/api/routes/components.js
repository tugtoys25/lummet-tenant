// Page components and the component studio.
// Part of the admin API. Dispatched in order from worker/api.js (see worker/api/routes/index.js).
import { cleanHeroSettingsJson, renderAdvancedHero } from "../../component-hero.js";
import { Renderer } from "../../render.js";
import { renderComponent } from "../../component-engine.js";
import { isStudioType, cleanStudioSettingsJson, cleanLegacySettingsJson, renderStudioComponent } from "../../component-studio.js";
import { searchSource, searchLinks, resolvePicks, isSource, LINK_SOURCE_KEYS } from "../../component-sources.js";
import * as componentsDB from "../../database/components.js";
import { NOT_HANDLED, failure, json, success, validate } from "../helpers.js";

export async function route({ request, env, path }) {

    // ==================================
    // COMPONENTS CRUD
    // ==================================

    if (path === "/api/v1/components/list") {
      const url = new URL(request.url);
      const type = url.searchParams.get("type");
      const result = await componentsDB.getAllComponents(env.DB, type);
      return json({ components: result });
    }

    if (path === "/api/v1/component/get" && request.method === "GET") {
      const url = new URL(request.url);
      const id = parseInt(url.searchParams.get("id"));
      if (!id) return failure("id is required");
      const component = await componentsDB.getComponent(env.DB, id);
      if (!component) return failure("Component not found", 404);
      return json({ success: true, component });
    }

    if (path === "/api/v1/component/create" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["name", "type"]);
      try { body.settings_json = cleanComponentSettings(body.type, body.settings_json); }
      catch (err) { return failure(err.message); }
      const id = await componentsDB.createComponent(env.DB, body);
      return json({ success: true, id });
    }

    if (path === "/api/v1/component/update" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "name", "type"]);
      try { body.settings_json = cleanComponentSettings(body.type, body.settings_json); }
      catch (err) { return failure(err.message); }
      await componentsDB.updateComponent(env.DB, body.id, body);
      return success();
    }

    // Draft preview of a hero component: the same HTML the public page would get, built from
    // the form's current values. Nothing is saved.
    if (path === "/api/v1/component/hero-preview" && request.method === "POST") {
      const body = await request.json();
      let settings = {};
      try { settings = JSON.parse(cleanHeroSettingsJson(body.settings_json) || "{}"); }
      catch (err) { return failure(err.message); }
      // the preview always uses the advanced layout so that every option can be seen
      settings.design = "advanced";
      const html = renderAdvancedHero({
        id: 0,
        type: "hero",
        title: String(body.title || ""),
        content: String(body.content || ""),
        settings,
        injection_point: "top"
      });
      return json({ success: true, html });
    }

    // Preview of a visual-editor component (grid, table, section): the same HTML the page gets.
    if (path === "/api/v1/component/preview" && request.method === "POST") {
      const body = await request.json();
      const PREVIEW_OLD = ["text", "cta", "banner", "faq_group", "author", "casino_grid", "comparison_table", "news_feed"];
      if (PREVIEW_OLD.includes(body.type)) {
        let settings = {};
        try { settings = JSON.parse(cleanLegacySettingsJson(body.type, body.settings_json) || "{}") || {}; }
        catch (err) { return failure(err.message); }
        let content = String(body.content || "");
        if (body.type === "faq_group") { try { content = JSON.parse(content); } catch { content = []; } if (!Array.isArray(content)) content = []; }
        const html = await renderComponent(new Renderer(env, request), {
          id: 0, type: body.type, name: "preview", title: String(body.title || ""), content, settings, injection_point: "content_top"
        });
        return json({ success: true, html });
      }
      if (!isStudioType(body.type)) return failure("Unsupported type for preview");
      let settings;
      try { settings = JSON.parse(cleanStudioSettingsJson(body.type, body.settings_json)); }
      catch (err) { return failure(err.message); }
      const html = await renderStudioComponent(env.DB, {
        id: 0, type: body.type, title: String(body.title || ""), content: "", settings, injection_point: "content_top"
      });
      return json({ success: true, html });
    }

    // Picker search: ?source=casino&q=...&type=... ; links=1 returns link targets instead of cards
    if (path === "/api/v1/component/pick-search" && request.method === "GET") {
      const url = new URL(request.url);
      const source = url.searchParams.get("source") || "";
      const q = url.searchParams.get("q") || "";
      const limit = Math.min(30, parseInt(url.searchParams.get("limit")) || 20);
      const type = url.searchParams.get("type") || "";
      if (url.searchParams.get("links")) {
        if (!LINK_SOURCE_KEYS.includes(source)) return failure("Unknown source");
        return json({ success: true, results: await searchLinks(env.DB, source, { q, limit, customType: type }) });
      }
      if (!isSource(source)) return failure("Unknown source");
      return json({ success: true, results: await searchSource(env.DB, source, { q, limit, customType: type }) });
    }

    if (path === "/api/v1/component/pick-resolve" && request.method === "POST") {
      const body = await request.json();
      return json({ success: true, results: await resolvePicks(env.DB, Array.isArray(body.picks) ? body.picks.slice(0, 48) : []) });
    }

    if (path === "/api/v1/component/delete" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.deleteComponent(env.DB, body.id);
      return success();
    }

    // ==================================
    // PAGE-COMPONENT ASSIGNMENTS
    // ==================================

    if (path === "/api/v1/components/assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "page_slug", "component_id"]);
      await componentsDB.assignComponentToPage(env.DB, body);
      return success();
    }

    if (path === "/api/v1/components/bulk-assign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["page_type", "component_id"]);
      await componentsDB.bulkAssignComponent(env.DB, body);
      return success();
    }
    if (path === "/api/v1/components/unassign" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.removePageComponent(env.DB, body.id);
      return success();
    }

    if (path === "/api/v1/components/page" && request.method === "GET") {
      const url = new URL(request.url);
      const pageType = url.searchParams.get("page_type");
      const pageSlug = url.searchParams.get("page_slug");
      if (!pageType || !pageSlug) return failure("page_type and page_slug are required");
      const assignments = await componentsDB.getAllPageAssignments(env.DB, pageType, pageSlug);
      return json({ assignments });
    }

    if (path === "/api/v1/components/reorder" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["items"]);
      for (const item of body.items) {
        await componentsDB.updatePageComponentPosition(env.DB, item.id, item.position);
      }
      return success();
    }

    if (path === "/api/v1/components/toggle" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id", "enabled"]);
      await componentsDB.togglePageComponent(env.DB, body.id, body.enabled);
      return success();
    }

    if (path === "/api/v1/components/update-assignment" && request.method === "POST") {
      const body = await request.json();
      validate(body, ["id"]);
      await componentsDB.updatePageComponentAssignment(env.DB, body.id, body);
      return success();
    }

  return NOT_HANDLED;
}

function cleanComponentSettings(type, text) {
  if (type === "hero") return cleanHeroSettingsJson(text);
  if (isStudioType(type)) return cleanStudioSettingsJson(type, text);
  return cleanLegacySettingsJson(type, text);
}
