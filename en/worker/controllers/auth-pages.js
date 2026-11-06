// Login, register, forgot password and reset password pages.
// Part of worker/controllers.js, which re-exports everything from here.
import { landingText, siteTextValue } from "../site-text/resolve.js";
import { Renderer } from "../render.js";
import { getSiteContext } from "../site-context.js";
import { escapeHtml } from "./shared.js";

export async function renderLogin(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "login.html",
      {
        seo_title: landingText(site, "login").seoTitle,
        seo_description: landingText(site, "login").seoDescription,
        heading: landingText(site, "login").titleHtml,
        canonical: site.url("/en/login"),

        // Public Turnstile sitekey — per-Worker dashboard variable
        // (Settings → Variables and Secrets), never hardcoded.
        turnstile_sitekey: escapeHtml(env.TURNSTILE_SITEKEY || "")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderRegister(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "register.html",
      {
        seo_title: landingText(site, "register").seoTitle,
        seo_description: landingText(site, "register").seoDescription,
        heading: landingText(site, "register").titleHtml,
        canonical: site.url("/en/register"),

        // Public Turnstile sitekey — per-Worker dashboard variable
        // (Settings → Variables and Secrets), never hardcoded.
        turnstile_sitekey: escapeHtml(env.TURNSTILE_SITEKEY || "")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderForgotPassword(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);

  const html =
    await renderer.render(
      "forgot-password.html",
      {
        seo_title: siteTextValue(site, "account_forgot_seo_title"),
        seo_description: siteTextValue(site, "account_forgot_seo_description"),
        canonical: site.url("/en/forgot-password")
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}

export async function renderResetPassword(
  request,
  env
){

  const renderer =
    new Renderer(env, request);
  const site = await getSiteContext(request, env);
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  const html =
    await renderer.render(
      "reset-password.html",
      {
        seo_title: siteTextValue(site, "account_reset_seo_title"),
        seo_description: siteTextValue(site, "account_reset_seo_description"),
        canonical: site.url("/en/reset-password"),
        token
      }
    );

  return new Response(
    html,
    {
      headers:{
        "Content-Type":
          "text/html"
      }
    }
  );

}
