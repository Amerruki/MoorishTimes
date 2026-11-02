// The Moorish Times WebMCP tools — v1.2
// Registers tools for in-browser AI agents through the WebMCP API
// (https://webmachinelearning.github.io/webmcp/). The tools are the public MCP server's own
// (https://mcp.moorish.cloud/mcp): their names, descriptions and input schemas come from its
// tools/list and each call is forwarded to it, so the page and the server never drift.
// Two tools only the page can offer: read_current_page reads the piece the user is on, and
// fill_contact_form fills the Contact form for the reader to check, tick the reCAPTCHA and send.
// Does nothing in browsers without document.modelContext (or the older
// navigator.modelContext), so it is safe to load site-wide.

(function () {
  var mc = document.modelContext || navigator.modelContext;
  if (!mc || typeof mc.registerTool !== 'function') return;

  var SITE = 'https://moorishtimes.com';
  var MCP = 'https://mcp.moorish.cloud/mcp';
  var CACHE_KEY = 'mt-webmcp-tools-v1';
  var nextId = 1;

  // The server answers Streamable HTTP as a one-event SSE stream.
  function rpc(method, params) {
    return fetch(MCP, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method: method, params: params || {} })
    }).then(function (r) {
      if (!r.ok) throw new Error('The Moorish Times MCP server answered ' + r.status);
      return r.text();
    }).then(function (body) {
      var line = body.split('\n').filter(function (l) { return l.indexOf('data: ') === 0; }).pop();
      var msg = JSON.parse(line ? line.slice(6) : body);
      if (msg.error) throw new Error(msg.error.message);
      return msg.result;
    });
  }

  // A tool result's structured JSON when the server sent it, otherwise its text.
  function unwrap(result) {
    if (result.isError) throw new Error((result.content && result.content[0] && result.content[0].text) || 'Tool error');
    if (result.structuredContent) return result.structuredContent;
    var text = (result.content || []).map(function (c) { return c.text || ''; }).join('\n');
    try { return JSON.parse(text); } catch (e) { return { text: text }; }
  }

  function readCache() {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
  }

  function writeCache(tools) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(tools)); } catch (e) {}
  }

  function register(tool) {
    // Older builds return nothing instead of a Promise.
    Promise.resolve().then(function () { return mc.registerTool(tool); }).catch(function (e) {
      if (window.console) console.warn('MoorishWebMCP: ' + tool.name + ' not registered', e);
    });
  }

  function mirror(def) {
    // Browsers may reject the JSON Schema dialect key the server adds.
    var source = def.inputSchema || { type: 'object', properties: {} };
    var schema = {};
    Object.keys(source).forEach(function (k) {
      if (k !== '$schema') schema[k] = source[k];
    });
    register({
      name: def.name,
      title: def.title || def.name,
      description: (def.description || def.title || def.name) + ' (The Moorish Times, moorishtimes.com)',
      inputSchema: schema,
      annotations: def.annotations || { readOnlyHint: true },
      execute: function (input) {
        return rpc('tools/call', { name: def.name, arguments: input || {} }).then(unwrap);
      }
    });
  }

  function isPiece(path) {
    return /^\/(en\/)?(news|articles)\/[^/]+\/?$/.test(path);
  }

  register({
    name: 'read_current_page',
    title: 'Read this page',
    description: 'The Moorish Times page the user is reading, as clean Markdown with title, date, tags, body and references. On a listing or other page, returns its URL and title only. When quoting, cite the page URL.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: function () {
      var path = location.pathname;
      if (!isPiece(path)) return Promise.resolve({ url: SITE + path, title: document.title });
      // no-store: the HTML responses only vary on Accept-Encoding, so the browser cache
      // would otherwise hand back the page already loaded at this URL.
      return fetch(SITE + path, { headers: { accept: 'text/markdown' }, cache: 'no-store' }).then(function (r) {
        if (!r.ok) throw new Error('page ' + r.status);
        return r.text().then(function (markdown) { return { url: SITE + path, markdown: markdown }; });
      });
    }
  });

  var TOPICS = { story: 'Story', correction: 'Correction', rights: 'Rights', ads: 'Ads', other: 'Other' };
  var SETTERS = {
    INPUT: Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set,
    TEXTAREA: Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set,
    SELECT: Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
  };

  // The native setter plus input and change events, so the site's form script sees the values.
  function setField(id, value) {
    var el = document.getElementById(id);
    if (!el) throw new Error('The Contact form has no #' + id);
    SETTERS[el.tagName].call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  register({
    name: 'fill_contact_form',
    title: 'Fill the Contact form',
    description: 'Fill The Moorish Times Contact form with the reader\'s message, for the reader to check, tick the reCAPTCHA and press Send. It never sends the form. Off the Contact page it returns the page to open, then call it again there. Agents can also send the same message with their own tool: send_to_newsroom on the MCP server, or POST /newsroom (see https://moorishtimes.com/auth.md).',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', enum: Object.keys(TOPICS), description: 'story (a tip), correction (an error in a piece), rights (image rights), ads (advertising and partnerships) or other.' },
        email: { type: 'string', format: 'email', description: 'The reader\'s email, for the reply.' },
        message: { type: 'string', minLength: 1, maxLength: 5000, description: 'The message, in the reader\'s words.' },
        name: { type: 'string', maxLength: 256, description: 'The reader\'s name, if they want to give it.' }
      },
      required: ['topic', 'email', 'message']
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    execute: function (input) {
      var path = location.pathname;
      var en = /^\/en(\/|$)/.test(path);
      if (!/^\/(en\/)?contact\/?$/.test(path)) {
        var url = SITE + (en ? '/en/contact' : '/contact');
        return Promise.resolve({ filled: false, url: url, next: 'Open ' + url + ' and call fill_contact_form again there.' });
      }
      if (!TOPICS[input.topic]) return Promise.reject(new Error('topic must be one of ' + Object.keys(TOPICS).join(', ')));
      setField('Contact-Topic', TOPICS[input.topic]);
      if (input.name) setField('Contact-Name', input.name);
      setField('Contact-Email', input.email);
      setField('Contact-Message', input.message);
      var captcha = document.querySelector('.g-recaptcha, [data-sitekey]');
      if (captcha) captcha.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return Promise.resolve({
        filled: true,
        next: 'Filled. The reader ticks the reCAPTCHA and presses Send. Without a browser, use send_to_newsroom on https://mcp.moorish.cloud/mcp.'
      });
    }
  });

  var cached = readCache();
  if (cached) {
    cached.forEach(mirror);
    return;
  }
  rpc('tools/list').then(function (result) {
    writeCache(result.tools);
    result.tools.forEach(mirror);
  }).catch(function (e) {
    if (window.console) console.warn('MoorishWebMCP: tool list unavailable', e);
  });
})();
