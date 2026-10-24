/*!
 * MoorishMCP v1.0 — WebMCP tools for AI agents browsing moorishtimes.com
 * Zero dependencies. Inert in browsers without WebMCP (document.modelContext).
 *
 * Registers four read-only tools that an in-browser agent can call instead of
 * scraping the Webflow DOM: search the catalogue, list the latest pieces, read
 * one article or brief as Markdown, and read the page the visitor is on. All
 * data comes from the site's public read API (/app-api/v1), same origin, no key.
 *
 * Targets the WebMCP Community Group draft of 20/10/2026 (document.modelContext,
 * registerTool with annotations). navigator.modelContext is the name the early
 * Chrome preview used, kept as a fallback.
 */
(function () {
  "use strict";

  var mc = (document.modelContext || navigator.modelContext);
  if (!mc || typeof mc.registerTool !== "function") return;

  var SITE = "https://moorishtimes.com";
  var API = SITE + "/app-api/v1";
  var PAGE = /^\/(en\/)?(news|articles)\/([a-z0-9-]+)\/?$/;
  var CATEGORIES = ["hist", "cult", "pol", "actu", "sport", "eco"];
  var CATEGORY_NOTE = "hist history, cult culture, pol politics, actu current affairs, sport, eco economy";

  function pageLang() {
    return /^\/en(\/|$)/.test(location.pathname) ? "en" : "fr";
  }

  function getJSON(path) {
    return fetch(API + path, { headers: { accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error("The Moorish Times API answered " + r.status + " for " + path);
      return r.json();
    });
  }

  var catalog;
  function getCatalog() {
    if (!catalog) {
      catalog = getJSON("/catalog").then(function (d) { return d.items; }, function (e) {
        catalog = null;
        throw e;
      });
    }
    return catalog;
  }

  function itemUrl(type, slug, lang) {
    return SITE + (lang === "en" ? "/en" : "") + (type === "news" ? "/news/" : "/articles/") + slug;
  }

  function card(it, lang) {
    var en = lang === "en";
    return {
      title: (en ? it.titleEn : it.titleFr) || it.titleFr || it.titleEn,
      summary: (en ? it.summaryEn : it.summaryFr) || "",
      url: itemUrl(it.type, it.slug, lang),
      type: it.type,
      category: it.category,
      tags: it.tags || [],
      published: it.publishedAt
    };
  }

  function fold(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  function filtered(items, input) {
    var type = input.type === "article" || input.type === "news" ? input.type : null;
    return items.filter(function (it) {
      return (!type || it.type === type) && (!input.category || it.category === input.category);
    });
  }

  function clampLimit(n, dflt) {
    n = Math.floor(Number(n) || dflt);
    return Math.max(1, Math.min(n, 25));
  }

  function runs(rs) {
    return rs.map(function (r) {
      var t = r.text;
      if (r.href) t = "[" + t.trim() + "](" + r.href + ")";
      return t;
    }).join("");
  }

  function image(img) {
    return "![" + (img.alt || "").replace(/[\[\]]/g, "") + "](" + img.url + ")";
  }

  function block(b, lang) {
    switch (b.t) {
      case "paragraph": return (b.dropCap && !b.dropCapInBody ? b.dropCap : "") + runs(b.runs);
      case "heading": return new Array(b.level + 1).join("#") + " " + runs(b.runs);
      case "image": return image(b) + ([b.caption, b.credit].filter(Boolean).length ? "\n\n*" + [b.caption, b.credit].filter(Boolean).join(" ") + "*" : "");
      case "gallery": return b.images.map(image).join("\n");
      case "quote": return runs(b.runs).split("\n").map(function (l) { return "> " + l; }).join("\n") + (b.cite ? "\n>\n> " + b.cite : "");
      case "list": return b.items.map(function (rs, i) { return (b.ordered ? (i + 1) + "." : "-") + " " + runs(rs); }).join("\n");
      case "references": return "## " + (lang === "en" ? "References" : "Références") + "\n\n" + b.items.map(function (it) { return "- " + runs(it.runs); }).join("\n");
      default: return "";
    }
  }

  function readItem(type, slug, lang) {
    return getJSON("/item/" + type + "/" + encodeURIComponent(slug) + "?locale=" + lang).then(function (it) {
      return {
        title: it.title,
        summary: it.summary,
        url: itemUrl(type, slug, lang),
        translation: itemUrl(type, slug, lang === "en" ? "fr" : "en"),
        language: it.locale,
        type: it.type,
        category: it.category,
        tags: it.tags || [],
        author: it.author ? it.author.name : null,
        published: it.publishedAt,
        updated: it.updatedAt,
        image: it.hero ? it.hero.url : null,
        body: it.blocks.map(function (b) { return block(b, lang); }).filter(Boolean).join("\n\n"),
        attribution: "The Moorish Times, " + itemUrl(type, slug, lang)
      };
    });
  }

  var language = { type: "string", enum: ["fr", "en"], description: "Edition to answer in: fr (primary) or en. Defaults to the edition of the current page." };
  var category = { type: "string", enum: CATEGORIES, description: CATEGORY_NOTE + "." };
  var kind = { type: "string", enum: ["article", "news", "any"], description: "article for long-form heritage features, news for news briefs, any for both (default)." };
  var readOnly = { readOnlyHint: true };

  var tools = [
    {
      name: "search_moorish_times",
      title: "Search The Moorish Times",
      description: "Search The Moorish Times, a bilingual French and English magazine on Moroccan history, heritage, culture and current affairs. Matches titles, summaries and tags in both languages and returns the best matches with their URLs.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words to look for, in French or English." },
          type: kind,
          category: category,
          language: language,
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Maximum results, default 8." }
        },
        required: ["query"]
      },
      annotations: readOnly,
      execute: function (input) {
        var lang = input.language || pageLang();
        var terms = fold(input.query).split(/[^a-z0-9]+/).filter(function (w) { return w.length > 1; });
        return getCatalog().then(function (items) {
          var scored = filtered(items, input).map(function (it) {
            var title = fold(it.titleFr + " " + it.titleEn);
            var rest = fold(it.summaryFr + " " + it.summaryEn + " " + (it.tags || []).join(" "));
            var score = 0;
            terms.forEach(function (w) {
              if (title.indexOf(w) >= 0) score += 3;
              if (rest.indexOf(w) >= 0) score += 1;
            });
            return { it: it, score: score };
          }).filter(function (s) { return s.score > 0; });
          scored.sort(function (a, b) { return b.score - a.score; });
          return {
            results: scored.slice(0, clampLimit(input.limit, 8)).map(function (s) { return card(s.it, lang); }),
            total: scored.length
          };
        });
      }
    },
    {
      name: "list_latest_moorish_times",
      title: "Latest from The Moorish Times",
      description: "List the most recent articles and news briefs from The Moorish Times, newest first, optionally narrowed to one type or category.",
      inputSchema: {
        type: "object",
        properties: {
          type: kind,
          category: category,
          language: language,
          limit: { type: "integer", minimum: 1, maximum: 25, description: "Maximum results, default 10." }
        }
      },
      annotations: readOnly,
      execute: function (input) {
        var lang = input.language || pageLang();
        return getCatalog().then(function (items) {
          return { results: filtered(items, input).slice(0, clampLimit(input.limit, 10)).map(function (it) { return card(it, lang); }) };
        });
      }
    },
    {
      name: "read_moorish_times_article",
      title: "Read an article",
      description: "Read one Moorish Times article or news brief in full, as Markdown with its metadata, sources and the URL of its translation. Pass the page URL (any moorishtimes.com article or news URL, French or English).",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Article or news URL, for example https://moorishtimes.com/en/news/acme-consortium-um6p." },
          language: language
        },
        required: ["url"]
      },
      annotations: readOnly,
      execute: function (input) {
        var path;
        try { path = new URL(input.url, SITE).pathname; } catch (e) { path = ""; }
        var m = PAGE.exec(path);
        if (!m) return Promise.reject(new Error("Not a Moorish Times article or news URL: " + input.url));
        return readItem(m[2], m[3], input.language || (m[1] ? "en" : "fr"));
      }
    },
    {
      name: "read_current_moorish_times_page",
      title: "Read this page",
      description: "Read the Moorish Times page the visitor is viewing. On an article or news brief, returns the full text as Markdown with metadata; on any other page, returns its title, description and URL.",
      inputSchema: { type: "object", properties: {} },
      annotations: readOnly,
      execute: function () {
        var m = PAGE.exec(location.pathname);
        if (m) return readItem(m[2], m[3], m[1] ? "en" : "fr");
        var desc = document.querySelector('meta[name="description"]');
        return Promise.resolve({
          title: document.title,
          description: desc ? desc.content : "",
          url: SITE + location.pathname,
          language: pageLang(),
          hint: "Use search_moorish_times or list_latest_moorish_times to find articles."
        });
      }
    }
  ];

  tools.forEach(function (tool) {
    try {
      var p = mc.registerTool(tool);
      if (p && typeof p.catch === "function") p.catch(function () {});
    } catch (e) {}
  });
})();
