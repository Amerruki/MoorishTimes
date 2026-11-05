"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "MoorishQus.js"), "utf8");

function createDocument(lang) {
  function matches(el, raw) {
    const sel = String(raw).trim();
    if (!sel) return false;
    let rest = sel;
    let tag = null;
    if (rest[0] !== "." && rest[0] !== "#" && rest[0] !== "[") {
      const m = rest.match(/^[a-zA-Z0-9-]+/);
      if (!m) return false;
      tag = m[0].toUpperCase();
      rest = rest.slice(m[0].length);
    }
    if (tag && el.tagName !== tag) return false;
    while (rest) {
      if (rest[0] === ".") {
        const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
        if (!m || !el.classList.contains(m[1])) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === "#") {
        const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
        if (!m || el.getAttribute("id") !== m[1]) return false;
        rest = rest.slice(m[0].length);
      } else if (rest[0] === "[") {
        const end = rest.indexOf("]");
        if (end < 0) return false;
        const inside = rest.slice(1, end);
        rest = rest.slice(end + 1);
        let m = inside.match(/^([a-zA-Z0-9_-]+)\*=(?:"([^"]*)"|'([^']*)')$/);
        if (m) {
          const val = el.getAttribute(m[1]);
          if (val == null || String(val).indexOf(m[2] || m[3] || "") === -1) return false;
          continue;
        }
        m = inside.match(/^([a-zA-Z0-9_-]+)=(?:"([^"]*)"|'([^']*)')$/);
        if (m) {
          if (el.getAttribute(m[1]) !== (m[2] != null ? m[2] : m[3])) return false;
          continue;
        }
        m = inside.match(/^([a-zA-Z0-9_-]+)$/);
        if (m) {
          if (el.getAttribute(m[1]) == null) return false;
          continue;
        }
        return false;
      } else {
        return false;
      }
    }
    return true;
  }

  function walk(node, fn) {
    const kids = node.childNodes || [];
    for (let i = 0; i < kids.length; i++) {
      fn(kids[i]);
      walk(kids[i], fn);
    }
  }

  function queryAll(root, selector) {
    const parts = String(selector).split(",").map((s) => s.trim()).filter(Boolean);
    const out = [];
    walk(root, (el) => {
      if (el.nodeType !== 1) return;
      for (let i = 0; i < parts.length; i++) {
        if (matches(el, parts[i])) {
          out.push(el);
          break;
        }
      }
    });
    return out;
  }

  function Element() {}
  Element.prototype.appendChild = function appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  };
  Element.prototype.insertBefore = function insertBefore(child, ref) {
    if (ref == null) return this.appendChild(child);
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = this.childNodes.indexOf(ref);
    if (i < 0) return this.appendChild(child);
    this.childNodes.splice(i, 0, child);
    child.parentNode = this;
    return child;
  };
  Element.prototype.removeChild = function removeChild(child) {
    const i = this.childNodes.indexOf(child);
    if (i >= 0) this.childNodes.splice(i, 1);
    if (child.parentNode === this) child.parentNode = null;
    return child;
  };
  Element.prototype.setAttribute = function setAttribute(name, value) {
    this._attrs[String(name)] = String(value);
  };
  Element.prototype.getAttribute = function getAttribute(name) {
    const key = String(name);
    if (!Object.prototype.hasOwnProperty.call(this._attrs, key)) return null;
    return this._attrs[key];
  };
  Element.prototype.removeAttribute = function removeAttribute(name) {
    delete this._attrs[String(name)];
  };
  Element.prototype.addEventListener = function addEventListener(type, fn) {
    (this._listeners[type] || (this._listeners[type] = [])).push(fn);
  };
  Element.prototype.querySelectorAll = function querySelectorAll(selector) {
    return queryAll(this, selector);
  };
  Element.prototype.querySelector = function querySelector(selector) {
    return queryAll(this, selector)[0] || null;
  };

  function make(tag) {
    const node = Object.create(Element.prototype);
    node.nodeType = 1;
    node.tagName = String(tag).toUpperCase();
    node.childNodes = [];
    node.parentNode = null;
    node._attrs = Object.create(null);
    node._listeners = Object.create(null);
    node.style = {};
    node.offsetHeight = 0;
    node.hidden = false;
    node.disabled = false;
    node.classList = {
      contains(name) {
        return node.className.split(/\s+/).indexOf(name) !== -1;
      }
    };
    Object.defineProperty(node, "firstChild", {
      get() { return this.childNodes[0] || null; }
    });
    Object.defineProperty(node, "id", {
      get() { return this.getAttribute("id") || ""; },
      set(v) { this.setAttribute("id", v); }
    });
    Object.defineProperty(node, "className", {
      get() { return this.getAttribute("class") || ""; },
      set(v) { this.setAttribute("class", v); }
    });
    Object.defineProperty(node, "type", {
      get() { return this.getAttribute("type") || ""; },
      set(v) { this.setAttribute("type", v); }
    });
    Object.defineProperty(node, "src", {
      get() { return this.getAttribute("src") || ""; },
      set(v) { this.setAttribute("src", v); }
    });
    Object.defineProperty(node, "lang", {
      get() { return this.getAttribute("lang") || ""; },
      set(v) { this.setAttribute("lang", v); }
    });
    Object.defineProperty(node, "textContent", {
      get() { return this._text || ""; },
      set(v) { this._text = String(v); }
    });
    node.focus = function focus() {
      document.activeElement = node;
    };
    node.click = function click() {
      const fns = node._listeners.click || [];
      for (let i = 0; i < fns.length; i++) fns[i]({});
    };
    return node;
  }

  const document = {
    nodeType: 9,
    readyState: "complete",
    activeElement: null,
    currentScript: null,
    createElement: make,
    addEventListener() {},
    getElementById(id) {
      let found = null;
      walk(document.documentElement, (el) => {
        if (!found && el.nodeType === 1 && el.getAttribute("id") === id) found = el;
      });
      return found;
    },
    querySelectorAll(selector) {
      return queryAll(document.documentElement, selector);
    },
    querySelector(selector) {
      return queryAll(document.documentElement, selector)[0] || null;
    }
  };

  const html = make("html");
  html.setAttribute("lang", lang);
  const head = make("head");
  const body = make("body");
  html.appendChild(head);
  html.appendChild(body);
  document.documentElement = html;
  document.head = head;
  document.body = body;

  return { document, Element, make };
}

function boot(lang, build, before) {
  const dom = createDocument(lang);
  build(dom.make, dom.document);
  const sandbox = {
    window: null,
    document: dom.document,
    Element: dom.Element,
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window = sandbox;
  if (before) before(sandbox);
  vm.createContext(sandbox);
  vm.runInContext(SOURCE, sandbox, { filename: "MoorishQus.js" });
  return sandbox;
}

function scriptsLike(document, needle) {
  return document.querySelectorAll("script").filter((node) => {
    const src = node.getAttribute("src") || "";
    const code = node.textContent || "";
    return src.indexOf(needle) !== -1 || code.indexOf(needle) !== -1;
  });
}

function articleThread(make, document) {
  const section = make("div");
  section.className = "comment-section";
  section.offsetHeight = 48;
  const outer = make("div");
  outer.id = "disqus_thread";
  outer.className = "disqus_thread";
  const inner = make("div");
  inner.id = "disqus_thread";
  const loader = make("script");
  loader.textContent = "(function(){var d=document,s=d.createElement('script');s.src='https://moorishtimes.disqus.com/embed.js';d.body.appendChild(s);})();";
  outer.appendChild(inner);
  outer.appendChild(loader);
  section.appendChild(outer);
  const count = make("script");
  count.id = "dsq-count-scr";
  count.src = "https://moorishtimes.disqus.com/count.js";
  const hero = make("text");
  hero.className = "disqus-comment-count";
  hero.setAttribute("data-disqus-url", "https://moorishtimes.com/articles/x");
  document.body.appendChild(section);
  document.body.appendChild(count);
  document.body.appendChild(hero);
  return section;
}

test("article page does not request Disqus until Show comments is pressed", () => {
  const sandbox = boot("en", articleThread);
  assert.equal(scriptsLike(sandbox.document, "disqus.com/embed.js").length, 0);
  assert.equal(scriptsLike(sandbox.document, "disqus.com/count.js").length, 0);
  const button = sandbox.document.querySelector(".mt-disqus-show");
  assert.ok(button, "expected a Show comments button");
  assert.equal(button.tagName, "BUTTON");
  assert.equal(button.getAttribute("type"), "button");
  assert.equal(button.textContent, "Show comments");
  assert.equal(button.style.position || "", "");
});

test("Show comments label follows the page language", () => {
  const fr = boot("fr", articleThread);
  assert.equal(fr.document.querySelector(".mt-disqus-show").textContent, "Afficher les commentaires");
  const en = boot("en-GB", articleThread);
  assert.equal(en.document.querySelector(".mt-disqus-show").textContent, "Show comments");
});

test("click loads embed.js once, keeps disqus_config, holds height, and focuses the thread", () => {
  function disqusConfig() {
    this.page.url = "https://moorishtimes.com/articles/x";
    this.page.identifier = "x";
  }
  const sandbox = boot("en", articleThread, (ctx) => {
    ctx.disqus_config = disqusConfig;
    ctx.window.disqus_config = disqusConfig;
  });
  const button = sandbox.document.querySelector("button.mt-disqus-show");
  const section = sandbox.document.querySelector(".comment-section");
  button.click();
  assert.equal(section.style.minHeight, "48px");
  const embed = scriptsLike(sandbox.document, "disqus.com/embed.js");
  assert.equal(embed.length, 1);
  assert.equal(embed[0].getAttribute("src"), "https://moorishtimes.disqus.com/embed.js");
  assert.ok(embed[0].getAttribute("data-timestamp"));
  assert.equal(scriptsLike(sandbox.document, "disqus.com/count.js").length, 1);
  assert.equal(sandbox.disqus_config, disqusConfig);
  button.click();
  assert.equal(scriptsLike(sandbox.document, "disqus.com/embed.js").length, 1);
  embed[0].onload();
  const thread = sandbox.document.getElementById("disqus_thread");
  assert.equal(sandbox.document.activeElement, thread);
  assert.equal(button.hidden, true);
  assert.equal(thread.getAttribute("tabindex"), "-1");
  assert.equal(sandbox.document.querySelectorAll("[id='disqus_thread']").length, 1);
});

test("a Disqus script inserted after startup stays blocked until the click", () => {
  const sandbox = boot("en", articleThread);
  const late = sandbox.document.createElement("script");
  late.src = "https://moorishtimes.disqus.com/embed.js";
  sandbox.document.body.appendChild(late);
  assert.equal(late.parentNode, null);
  sandbox.document.querySelector("button.mt-disqus-show").click();
  assert.equal(scriptsLike(sandbox.document, "disqus.com/embed.js").length, 1);
});

test("listing pages still load count.js for card counts", () => {
  const sandbox = boot("fr", (make, document) => {
    const card = make("div");
    card.className = "post-v1";
    const link = make("a");
    link.setAttribute("href", "/en/articles/caftan-international");
    const read = make("div");
    read.className = "post-read";
    const line = make("div");
    line.className = "underline";
    read.appendChild(line);
    card.appendChild(link);
    card.appendChild(read);
    document.body.appendChild(card);
  });
  assert.equal(sandbox.document.querySelector("button.mt-disqus-show"), null);
  const counts = sandbox.document.querySelectorAll(".disqus-comment-count");
  assert.equal(counts.length, 1);
  assert.equal(counts[0].getAttribute("data-disqus-url"), "https://moorishtimes.com/articles/caftan-international");
  const countJs = scriptsLike(sandbox.document, "disqus.com/count.js");
  assert.equal(countJs.length, 1);
  assert.equal(countJs[0].getAttribute("src"), "https://moorishtimes.disqus.com/count.js");
});
