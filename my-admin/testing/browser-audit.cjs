// Browser smoke/error-path audit against the production bundle. All remote/API
// requests are intercepted by CDP before navigation. Never starts my-server or Atlas.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../dist/my-admin/browser');
const executable = process.env.LIGHTBOOKS_QA_BROWSER || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((file) => fs.existsSync(file));
if (!executable || !fs.existsSync(path.join(root, 'index.html')))
  throw new Error('Build my-admin and provide a local Chromium browser first.');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'lightbooks-admin-browser-'));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser, server, socket;
const checks = [], exceptions = [], consoleErrors = [], requests = [];
let mode = 'anonymous', fixtureWrites = 0;
const identity = () => ({
  user: { _id: 'isolated-fixture', fullName: 'Browser Fixture', email: 'fixture@example.invalid',
    role: mode === 'warehouse' ? 'admin' : 'superadmin', roleCode: mode === 'warehouse' ? 'WAREHOUSE_MANAGER' : 'SUPER_ADMIN',
    permissions: mode === 'warehouse' ? [{ module: 'inventory', actions: ['view'] }] : [],
  }, csrfToken: 'isolated-csrf', expiresAt: '2099-01-01T00:00:00.000Z',
});

(async () => {
  server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const candidate = path.resolve(root, '.' + pathname);
    const file = candidate.startsWith(root + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
      ? candidate : path.join(root, 'index.html');
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn(executable, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
    '--remote-debugging-port=0', `--user-data-dir=${path.join(output, 'profile')}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
  browser.on('error', (error) => { exceptions.push(String(error)); });
  const activePort = path.join(output, 'profile/DevToolsActivePort');
  const deadline = Date.now() + 30000;
  while (!fs.existsSync(activePort) && Date.now() < deadline) await delay(100);
  assert.ok(fs.existsSync(activePort), 'Browser remote debugger did not start');
  const port = fs.readFileSync(activePort, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let sequence = 0;
  const pending = new Map();
  function cdp(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const item = pending.get(message.id); pending.delete(message.id);
      if (message.error) item?.reject(new Error(JSON.stringify(message.error))); else item?.resolve(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error')
      consoleErrors.push(message.params.args.map((arg) => arg.description || arg.value));
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    try {
      if (request.url.startsWith(origin + '/')) { await cdp('Fetch.continueRequest', { requestId }); return; }
      let status = 204, body = '';
      if (request.url.startsWith('http://localhost:3002/api/')) {
        const url = new URL(request.url); requests.push({ path: url.pathname, method: request.method });
        status = 503; body = { message: 'Isolated browser fixture: service unavailable' };
        if (request.method === 'OPTIONS') {
          status = 204; body = '';
        } else if (url.pathname === '/api/admin/auth/session') {
          status = mode === 'anonymous' ? 401 : 200;
          body = mode === 'anonymous' ? { message: 'No fixture session' } : identity();
        } else if (url.pathname === '/api/admin/auth/login' && request.method === 'POST') {
          const supplied = JSON.parse(request.postData || '{}');
          assert.equal(supplied.email, 'fixture@example.invalid');
          assert.equal(supplied.password, 'Browser-fixture-password-123');
          fixtureWrites++; mode = 'superadmin'; status = 200; body = identity();
        } else if (url.pathname === '/api/admin/auth/logout') {
          assert.equal(request.headers['X-Admin-CSRF'] || request.headers['x-admin-csrf'], 'isolated-csrf');
          fixtureWrites++; mode = 'anonymous'; status = 200; body = {};
        } else if (['/api/books', '/api/categories', '/api/authors'].includes(url.pathname)) {
          status = 200; body = [];
        } else if (url.pathname === '/api/admin/books/inventory') {
          status = 200; body = { items: [], total: 0, page: 1, limit: 100,
            counts: { all: 0, active: 0, hidden: 0, low: 0, out: 0 }, lowStockThreshold: 5 };
        }
      }
      await cdp('Fetch.fulfillRequest', { requestId, responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: origin }, { name: 'Access-Control-Allow-Credentials', value: 'true' },
          { name: 'Access-Control-Allow-Headers', value: 'Content-Type, X-Admin-CSRF' },
          { name: 'Access-Control-Allow-Methods', value: 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS' }],
        body: Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)).toString('base64'),
      });
    } catch (error) { exceptions.push(String(error)); await cdp('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }); }
  };
  await cdp('Page.enable'); await cdp('Runtime.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  const evaluate = async (expression) => {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  async function until(expression) {
    const end = Date.now() + 12000;
    while (Date.now() < end) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error('Browser wait failed: ' + expression);
  }
  async function navigate(route) {
    await cdp('Page.navigate', { url: origin + route });
    await until('!!document.querySelector("app-root") && document.body.innerText.length > 30');
    await delay(350);
  }
  await navigate('/inventory');
  await until('location.pathname === "/login" && !!document.querySelector("#password")');
  checks.push('Anonymous route redirects to login');
  await evaluate(`(() => {
    for (const [id, value] of [['email', 'fixture@example.invalid'], ['password', 'Browser-fixture-password-123']]) {
      const input = document.getElementById(id); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await delay(100);
  await evaluate('document.querySelector(".submit-button").click()');
  await until('location.pathname === "/dashboard" && !!document.querySelector(".sidebar")');
  checks.push('Real browser login form sends the entered password and opens the authorized page');
  for (const route of ['/dashboard', '/book-list', '/book-form', '/inventory', '/orders', '/refunds',
    '/accounts', '/customer-detail/fixture', '/users-roles', '/vouchers', '/news-list', '/news-editor',
    '/banners', '/buyback-requests', '/buyback-detail/fixture', '/settings', '/missing-fixture-page']) {
    await navigate(route);
    await until('!!document.querySelector(".sidebar")');
    assert.ok(await evaluate('document.querySelector("main.content").innerText.trim().length > 10'), route);
    checks.push(`${route}: mounts the page and handles isolated empty/unavailable APIs`);
  }
  mode = 'warehouse';
  await navigate('/dashboard');
  await until('location.pathname === "/inventory"');
  await until('document.body.innerText.includes("Chưa có") || document.body.innerText.includes("Tồn kho")');
  assert.equal(await evaluate('Array.from(document.querySelectorAll("a.nav-item")).map(a => a.getAttribute("href")).join(",")'), '/inventory');
  assert.equal(await evaluate('!!document.querySelector("a.btn-add")'), false);
  checks.push('Inventory-only session lands on inventory, hides other modules and create controls');
  for (const width of [1440, 768, 390]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await delay(150);
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), `Page overflow at ${width}`);
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(output, `inventory-${width}.png`), Buffer.from(result.data, 'base64'));
    checks.push(`Inventory viewport ${width}: no document overflow, screenshot saved`);
  }
  await evaluate(`document.querySelector('button[aria-label="Đăng xuất"]').click()`);
  await until('location.pathname === "/login"');
  checks.push('Topbar logout sends CSRF and returns to login');
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  assert.equal(consoleErrors.length, 0, JSON.stringify(consoleErrors));
  const result = { status: 'PASS', checks, requests, fixtureWrites, atlasRequests: 0, exceptions, consoleErrors,
    scope: 'Production bundle browser smoke, auth form/navigation, API error/empty paths, and Inventory responsive; not live CRUD or native MongoDB E2E' };
  fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ status: result.status, checks: checks.length, output, atlasRequests: 0 }));
})().catch((error) => {
  fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), checks, exceptions, consoleErrors, requests }, null, 2));
  console.error(JSON.stringify({ status: 'FAIL', error: String(error), output })); process.exitCode = 1;
}).finally(async () => {
  socket?.close(); browser?.kill();
  if (server) await new Promise((resolve) => server.close(resolve));
});
