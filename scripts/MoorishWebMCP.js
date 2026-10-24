// The Moorish Times WebMCP tools — v1.0
// Registers read-only tools for in-browser AI agents through the WebMCP API
// (https://webmachinelearning.github.io/webmcp/), so an agent on any page can search the
// magazine, list the latest briefs and read a piece as clean Markdown without scraping.
// Data comes from the app API (/app-api/v1, described at /.well-known/api-catalog) and
// from the pages themselves requested with Accept: text/markdown.
// Does nothing in browsers without document.modelContext (or the older
// navigator.modelContext), so it is safe to load site-wide.

(function () {
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  var SITE = 'https://moorishtimes.com';
  var API = SITE + '/app-api/v1';
  var pageLang = (document.documentElement.lang || 'fr').slice(0, 2) === 'en' ? 'en' : 'fr';
  var catalog = null;

  function fold(s) {
    return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function lang(input) {
    return input && (input.language === 'en' || input.language === 'fr') ? input.language : pageLang;
  }

  function pageUrl(item, language) {
    var dir = item.type === 'news' ? 'news' : 'articles';
    return SITE + (language === 'en' ? '/en/' : '/') + dir + '/' + item.slug;
  }

  function summarize(item, language) {
    var en = language === 'en';
    return {
      title: en ? item.titleEn : item.titleFr,
      summary: en ? item.summaryEn : item.summaryFr,
      url: pageUrl(item, language),
      type: item.type,
      category: item.category,
      tags: item.tags,
      publishedAt: item.publishedAt
    };
  }

  function getCatalog() {
    if (!catalog) {
      catalog = fetch(API + '/catalog', { headers: { accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('catalog ' + r.status);
          return r.json();
        })
        .then(function (d) { return d.items; })
        .catch(function (e) { catalog = null; throw e; });
    }
    return catalog;
  }

  function clamp(n, fallback) {
    n = Math.floor(Number(n));
    return n >= 1 ? Math.min(n, 25) : fallback;
  }

  var LANGUAGE = { type: 'string', enum: ['fr', 'en'], description: 'Edition to answer in. Defaults to the page language.' };
  var CATEGORY = {
    type: 'string',
    enum: ['hist', 'cult', 'pol', 'actu', 'sport', 'eco'],
    description: 'hist history, cult culture, pol politics, actu current affairs, sport, eco economy.'
  };
  var READ_ONLY = { readOnlyHint: true };

  var tools = [
    {
      name: 'search_moorish_times',
      title: 'Search The Moorish Times',
      description: 'Search every article and news brief of The Moorish Times, a bilingual magazine on Moroccan history, heritage, culture and current affairs. Matches titles, summaries and tags in French and English, accents ignored. Returns titles, summaries and page URLs, newest first.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words to look for, in French or English.' },
          type: { type: 'string', enum: ['article', 'news'], description: 'Only long-form articles, or only news briefs.' },
          category: CATEGORY,
          language: LANGUAGE,
          limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Defaults to 10.' }
        },
        required: ['query']
      },
      annotations: READ_ONLY,
      execute: function (input) {
        var words = fold(input.query).split(/\s+/).filter(Boolean);
        var language = lang(input);
        return getCatalog().then(function (items) {
          var hits = items.filter(function (it) {
            if (input.type && it.type !== input.type) return false;
            if (input.category && it.category !== input.category) return false;
            var hay = fold([it.titleFr, it.titleEn, it.summaryFr, it.summaryEn, it.tags.join(' ')].join(' '));
            return words.every(function (w) { return hay.indexOf(w) !== -1; });
          });
          return {
            total: hits.length,
            results: hits.slice(0, clamp(input.limit, 10)).map(function (it) { return summarize(it, language); })
          };
        });
      }
    },
    {
      name: 'latest_moorish_times_news',
      title: 'Latest news briefs',
      description: 'List the most recent news briefs from The Moorish Times, newest first, optionally for one category.',
      inputSchema: {
        type: 'object',
        properties: {
          category: CATEGORY,
          language: LANGUAGE,
          limit: { type: 'integer', minimum: 1, maximum: 25, description: 'Defaults to 10.' }
        }
      },
      annotations: READ_ONLY,
      execute: function (input) {
        var language = lang(input);
        return getCatalog().then(function (items) {
          var news = items.filter(function (it) {
            return it.type === 'news' && (!input.category || it.category === input.category);
          });
          return { results: news.slice(0, clamp(input.limit, 10)).map(function (it) { return summarize(it, language); }) };
        });
      }
    },
    {
      name: 'read_moorish_times_page',
      title: 'Read a page as Markdown',
      description: 'Fetch an article or news brief of The Moorish Times as clean Markdown, with title, date, tags, body and references. Pass a moorishtimes.com URL, for example one returned by search_moorish_times. When quoting, cite the page URL.',
      inputSchema: {
        type: 'object',
        properties: { url: { type: 'string', description: 'A page on https://moorishtimes.com.' } },
        required: ['url']
      },
      annotations: READ_ONLY,
      execute: function (input) {
        var url;
        try { url = new URL(input.url, SITE); } catch (e) { return Promise.reject(new Error('Not a URL')); }
        if (url.origin !== SITE && url.origin !== 'https://www.moorishtimes.com') {
          return Promise.reject(new Error('Only moorishtimes.com pages can be read'));
        }
        // no-store: the HTML responses only vary on Accept-Encoding, so the browser cache
        // would otherwise hand back the page already loaded at this URL.
        return fetch(SITE + url.pathname, { headers: { accept: 'text/markdown' }, cache: 'no-store' }).then(function (r) {
          if (!r.ok) throw new Error('page ' + r.status);
          return r.text().then(function (markdown) { return { url: SITE + url.pathname, markdown: markdown }; });
        });
      }
    }
  ];

  tools.forEach(function (tool) {
    // Older builds return nothing instead of a Promise.
    Promise.resolve().then(function () { return mc.registerTool(tool); }).catch(function (e) {
      if (window.console) console.warn('MoorishWebMCP: ' + tool.name + ' not registered', e);
    });
  });
})();
