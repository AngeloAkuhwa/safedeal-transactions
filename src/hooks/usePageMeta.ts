import { useEffect } from "react";

/**
 * Per-route head metadata for PUBLIC pages only.
 *
 * Limitation, stated honestly: this app is a static Vite SPA. These tags are
 * written to document.head after mount by JavaScript. Search engines that
 * render JS (Googlebot) see them; social-preview crawlers (WhatsApp,
 * Facebook, LinkedIn, Slack, X) do NOT execute JS and only ever see the
 * static head in index.html. Per-page social previews would require
 * prerendering or SSR.
 */

const SITE_NAME = "SafeDeal";
export const SITE_ORIGIN = "https://trust-link-secure.lovable.app";
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.jpg`;

export interface PageMeta {
  title: string;
  description: string;
  /** Route path, e.g. "/marketplace". Used for canonical and og:url. */
  path?: string;
  /** Absolute or root-relative image URL. Falls back to the SafeDeal card. */
  image?: string | null;
  ogType?: "website" | "article" | "product";
  /** Structured data object injected as a JSON-LD script tag. */
  jsonLd?: Record<string, unknown> | null;
  /** Skip applying while data is still loading. */
  enabled?: boolean;
}

function absolute(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_ORIGIN}${url.startsWith("/") ? "" : "/"}${url}`;
}

type Restore = () => void;

function setMeta(selector: string, create: () => HTMLMetaElement, content: string): Restore {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) {
    const previous = el.getAttribute("content");
    el.setAttribute("content", content);
    return () => {
      if (previous === null) el?.removeAttribute("content");
      else el?.setAttribute("content", previous);
    };
  }
  el = create();
  el.setAttribute("content", content);
  document.head.appendChild(el);
  return () => el?.remove();
}

function namedMeta(name: string, content: string): Restore {
  return setMeta(`meta[name="${name}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute("name", name);
    return m;
  }, content);
}

function propertyMeta(property: string, content: string): Restore {
  return setMeta(`meta[property="${property}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", property);
    return m;
  }, content);
}

function canonicalLink(href: string): Restore {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (el) {
    const previous = el.getAttribute("href");
    el.setAttribute("href", href);
    return () => {
      if (previous === null) el?.removeAttribute("href");
      else el?.setAttribute("href", previous);
    };
  }
  el = document.createElement("link");
  el.setAttribute("rel", "canonical");
  el.setAttribute("href", href);
  document.head.appendChild(el);
  return () => el?.remove();
}

function jsonLdScript(data: Record<string, unknown>): Restore {
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.dataset.pageMeta = "true";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
  return () => script.remove();
}

export function usePageMeta({
  title,
  description,
  path,
  image,
  ogType = "website",
  jsonLd,
  enabled = true,
}: PageMeta) {
  const jsonLdKey = jsonLd ? JSON.stringify(jsonLd) : "";

  useEffect(() => {
    if (!enabled) return;

    const restores: Restore[] = [];
    const previousTitle = document.title;
    document.title = title;
    restores.push(() => {
      document.title = previousTitle;
    });

    const url = absolute(path ?? window.location.pathname);
    const imageUrl = absolute(image || DEFAULT_OG_IMAGE);

    restores.push(namedMeta("description", description));
    restores.push(canonicalLink(url));
    restores.push(propertyMeta("og:title", title));
    restores.push(propertyMeta("og:description", description));
    restores.push(propertyMeta("og:type", ogType));
    restores.push(propertyMeta("og:url", url));
    restores.push(propertyMeta("og:image", imageUrl));
    restores.push(propertyMeta("og:site_name", SITE_NAME));
    restores.push(namedMeta("twitter:card", "summary_large_image"));
    restores.push(namedMeta("twitter:title", title));
    restores.push(namedMeta("twitter:description", description));
    restores.push(namedMeta("twitter:image", imageUrl));

    if (jsonLdKey) {
      restores.push(jsonLdScript(JSON.parse(jsonLdKey) as Record<string, unknown>));
    }

    return () => {
      for (let i = restores.length - 1; i >= 0; i--) restores[i]();
    };
  }, [title, description, path, image, ogType, jsonLdKey, enabled]);
}