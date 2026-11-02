// Checks MoorishWebMCP's fill_contact_form against a static copy of the Contact form, served at
// the live URLs so location.pathname matches. Run: node scripts/test-webmcp-contact.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');

const FORM = fs.readFileSync(path.join(__dirname, 'test-webmcp-contact.html'), 'utf8');
const SCRIPT = path.join(__dirname, 'MoorishWebMCP.js');

async function open(browser, url) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__tools = {};
    document.modelContext = { registerTool: (t) => { window.__tools[t.name] = t; } };
  });
  await page.route('https://mcp.moorish.cloud/**', (r) => r.fulfill({ contentType: 'application/json', body: '{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}' }));
  await page.route('https://moorishtimes.com/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: FORM }));
  await page.goto(url);
  await page.addScriptTag({ path: SCRIPT });
  return page;
}

const call = (page, input) =>
  page.evaluate(async (input) => {
    const t = window.__tools.fill_contact_form;
    if (!t) throw new Error('fill_contact_form not registered');
    const events = [];
    for (const id of ['Contact-Topic', 'Contact-Email', 'Contact-Message']) {
      for (const type of ['input', 'change']) document.getElementById(id).addEventListener(type, () => events.push(id + ':' + type));
    }
    let sent = false;
    document.getElementById('wf-form-Contact-Form').addEventListener('submit', (e) => { sent = true; e.preventDefault(); });
    const result = await t.execute(input);
    return {
      result, events, sent,
      annotations: t.annotations, description: t.description,
      topic: document.getElementById('Contact-Topic').value,
      email: document.getElementById('Contact-Email').value,
      message: document.getElementById('Contact-Message').value,
      name: document.getElementById('Contact-Name').value,
    };
  }, input);

(async () => {
  const browser = await chromium.launch();
  try {
    let page = await open(browser, 'https://moorishtimes.com/contact');
    const r = await call(page, { topic: 'correction', email: 'a@b.co', message: 'Date fausse à la ligne 3' });
    assert.equal(r.result.filled, true);
    assert.match(r.result.next, /reCAPTCHA and presses Send/);
    assert.equal(r.topic, 'Correction');
    assert.equal(r.email, 'a@b.co');
    assert.equal(r.message, 'Date fausse à la ligne 3');
    assert.equal(r.name, '');
    assert.equal(r.sent, false, 'never submits');
    for (const e of ['Contact-Topic:input', 'Contact-Topic:change', 'Contact-Message:input', 'Contact-Message:change']) assert.ok(r.events.includes(e), e);
    assert.equal(r.annotations.readOnlyHint, false);
    assert.match(r.description, /send_to_newsroom/);
    assert.match(r.description, /auth\.md/);
    await page.close();

    page = await open(browser, 'https://moorishtimes.com/en/contact');
    const named = await call(page, { topic: 'story', email: 'a@b.co', message: 'Tip', name: 'Nadia' });
    assert.equal(named.result.filled, true);
    assert.equal(named.topic, 'Story');
    assert.equal(named.name, 'Nadia');
    await page.close();

    page = await open(browser, 'https://moorishtimes.com/news/x');
    const off = await call(page, { topic: 'other', email: 'a@b.co', message: 'Bonjour' });
    assert.equal(off.result.filled, false);
    assert.equal(off.result.url, 'https://moorishtimes.com/contact');
    assert.match(off.result.next, /call fill_contact_form again/);
    await page.close();

    page = await open(browser, 'https://moorishtimes.com/en/articles/x');
    const offEn = await call(page, { topic: 'other', email: 'a@b.co', message: 'Hello' });
    assert.equal(offEn.result.url, 'https://moorishtimes.com/en/contact');
    console.log('fill_contact_form: all checks passed');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
