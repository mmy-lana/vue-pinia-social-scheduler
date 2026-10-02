/**
 * Minimal Chrome DevTools Protocol driver.
 *
 * Zero dependencies: Node 24 ships a global WebSocket, which is all a CDP
 * client needs. The browser is launched by *this* process, with its own
 * throwaway profile directory and its own PID, and only that PID is ever
 * killed — any browser the user already has open is left alone.
 */
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Terminates the browser and every helper it forked.
 *
 * The process was spawned detached, so it leads its own process group and the
 * negative pid reaches the whole tree. Only this run's own group is signalled:
 * a browser the developer has open is never in it.
 */
function killTree(child) {
  if (child.pid === undefined) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

export async function resolveChromeBinary() {
  const { access } = await import('node:fs/promises')
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    `No Chrome binary found. Looked in:\n${CHROME_CANDIDATES.map((c) => `  - ${c}`).join('\n')}`,
  )
}

class CdpConnection {
  #socket
  #nextId = 1
  #pending = new Map()
  #handlers = new Set()

  constructor(socket) {
    this.#socket = socket
    socket.addEventListener('message', (event) => this.#onMessage(String(event.data)))
  }

  #onMessage(raw) {
    const message = JSON.parse(raw)
    if (typeof message.id === 'number') {
      const entry = this.#pending.get(message.id)
      if (!entry) return
      this.#pending.delete(message.id)
      if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`))
      else entry.resolve(message.result)
      return
    }
    for (const handler of this.#handlers) handler(message)
  }

  on(handler) {
    this.#handlers.add(handler)
    return () => this.#handlers.delete(handler)
  }

  send(method, params = {}, sessionId) {
    const id = this.#nextId++
    const payload = { id, method, params }
    // Only needed when multiplexing several targets over the browser socket.
    if (sessionId) payload.sessionId = sessionId
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.#socket.send(JSON.stringify(payload))
      setTimeout(() => {
        if (this.#pending.has(id)) {
          this.#pending.delete(id)
          reject(new Error(`CDP timeout: ${method}`))
        }
      }, 30_000)
    })
  }

  close() {
    try {
      this.#socket.close()
    } catch {
      // already closed
    }
  }
}

export class BrowserSession {
  constructor({ process: child, connection, userDataDir, port }) {
    this.process = child
    this.connection = connection
    this.userDataDir = userDataDir
    this.port = port
    this.consoleErrors = []
    this.pageErrors = []
    this.failedRequests = []
  }

  static async launch({ width = 1440, height = 900, port = 9333 } = {}) {
    const binary = await resolveChromeBinary()
    const userDataDir = await mkdtemp(join(tmpdir(), 'vpss-chrome-'))
    const child = spawn(
      binary,
      [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        `--window-size=${width},${height}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-features=Translate,MediaRouter,OptimizationHints',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--no-sandbox',
        'about:blank',
      ],
      // Its own process group, so the whole browser tree — not just the parent
      // pid — can be reaped. Chrome forks several helper processes, and leaving
      // them behind accumulates headless browsers on the host.
      { stdio: 'ignore', detached: true },
    )

    const deadline = Date.now() + 20_000
    let version = null
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`)
        if (response.ok) {
          version = await response.json()
          break
        }
      } catch {
        // not listening yet
      }
      await sleep(120)
    }
    if (!version) {
      killTree(child)
      await rm(userDataDir, { recursive: true, force: true })
      throw new Error('Chrome did not expose a debugging port in time')
    }

    const socket = new WebSocket(version.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('CDP socket failed')), { once: true })
    })

    const session = new BrowserSession({
      process: child,
      connection: new CdpConnection(socket),
      userDataDir,
      port,
    })
    session.connection.on((message) => session.#onEvent(message))
    return session
  }

  #onEvent(message) {
    if (message.method === 'Runtime.consoleAPICalled') {
      const { type, args } = message.params
      if (type === 'error' || type === 'warning') {
        this.consoleErrors.push(
          `[${type}] ${(args ?? [])
            .map((arg) => arg.value ?? arg.description ?? arg.type)
            .join(' ')}`,
        )
      }
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      this.pageErrors.push(
        details.exception?.description ?? details.text ?? 'unknown page exception',
      )
    }
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      this.failedRequests.push(message.params.entry.text)
    }
  }

  async newPage(url = 'about:blank', { width = 1440, height = 900 } = {}) {
    const response = await fetch(`http://127.0.0.1:${this.port}/json/new?${url}`, {
      method: 'PUT',
    })
    const target = await response.json()
    const socket = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true })
      socket.addEventListener('error', () => reject(new Error('page socket failed')), { once: true })
    })
    const connection = new CdpConnection(socket)
    const page = new Page(connection, target.id, this)
    await page.init(width, height)
    return page
  }

  async close() {
    try {
      await this.connection.send('Browser.close')
    } catch {
      // browser may already be gone
    }
    this.connection.close()
    const exited = new Promise((resolve) => this.process.once('exit', resolve))
    const timer = setTimeout(() => killTree(this.process), 3_000)
    await exited
    clearTimeout(timer)
    // Helpers outlive the parent unless the whole group is signalled.
    killTree(this.process)
    await rm(this.userDataDir, { recursive: true, force: true })
  }
}

class Page {
  constructor(connection, targetId, session) {
    this.connection = connection
    this.targetId = targetId
    this.session = session
  }

  /** The socket is already bound to this target, so no sessionId is sent. */
  send(method, params) {
    return this.connection.send(method, params)
  }

  async init(width, height) {
    await this.send('Page.enable')
    await this.send('Runtime.enable')
    await this.send('Log.enable')
    await this.setViewport(width, height)
  }

  setViewport(width, height, mobile = false) {
    return this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile,
    })
  }

  async goto(url, { waitUntil = 'load', timeout = 20_000 } = {}) {
    const loaded = this.#waitForEvent(waitUntil === 'load' ? 'Page.loadEventFired' : null, timeout)
    await this.send('Page.navigate', { url })
    if (waitUntil === 'load') await loaded
    await this.waitForIdle()
  }

  #waitForEvent(method, timeout) {
    if (!method) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off()
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeout)
      const off = this.connection.on((message) => {
        if (message.method === method) {
          clearTimeout(timer)
          off()
          resolve()
        }
      })
    })
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression: `(async function(){ ${expression} })()`,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      )
    }
    return result.result.value
  }

  async waitFor(selector, { timeout = 10_000, visible = true } = {}) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const found = await this.evaluate(`
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        ${visible ? 'const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;' : 'return true;'}
      `)
      if (found) return true
      await sleep(80)
    }
    throw new Error(`Timed out waiting for selector: ${selector}`)
  }

  /**
   * Waits for a boolean expression evaluated in the page to become truthy.
   * For state that is not reflected in the DOM — what is actually in
   * LocalStorage, a store's contents — where `waitFor` would have nothing to
   * select.
   */
  async waitForExpression(expression, { timeout = 10_000, interval = 120 } = {}) {
    const deadline = Date.now() + timeout
    let lastError = null
    while (Date.now() < deadline) {
      try {
        if (await this.evaluate(`return Boolean(${expression});`)) return true
      } catch (error) {
        lastError = error
      }
      await sleep(interval)
    }
    throw new Error(
      `Timed out waiting for expression: ${expression}${lastError ? `\n  last error: ${lastError.message}` : ''}`,
    )
  }

  async waitForGone(selector, { timeout = 10_000 } = {}) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      const found = await this.evaluate(
        `return document.querySelector(${JSON.stringify(selector)}) !== null;`,
      )
      if (!found) return true
      await sleep(80)
    }
    throw new Error(`Timed out waiting for ${selector} to disappear`)
  }

  /** Settles Vue's render queue plus two animation frames. */
  async waitForIdle() {
    await this.evaluate(`
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return true;
    `)
    await sleep(60)
  }

  async click(selector) {
    const clicked = await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.click();
      return true;
    `)
    if (!clicked) throw new Error(`click: no element for ${selector}`)
    await this.waitForIdle()
  }

  async clickText(text, selector = 'button, a, [role="button"]') {
    const clicked = await this.evaluate(`
      const nodes = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
      const target = nodes.find((node) => (node.textContent || '').trim().includes(${JSON.stringify(text)}));
      if (!target) return false;
      target.scrollIntoView({ block: 'center' });
      target.click();
      return true;
    `)
    if (!clicked) throw new Error(`clickText: nothing matching "${text}"`)
    await this.waitForIdle()
  }

  async setValue(selector, value) {
    const ok = await this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return false;
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return true;
    `)
    if (!ok) throw new Error(`setValue: no element for ${selector}`)
    await this.waitForIdle()
  }

  async text(selector) {
    return this.evaluate(`
      const el = document.querySelector(${JSON.stringify(selector)});
      return el ? (el.textContent || '').trim() : null;
    `)
  }

  async count(selector) {
    return this.evaluate(`return document.querySelectorAll(${JSON.stringify(selector)}).length;`)
  }

  async exists(selector) {
    return this.evaluate(`return document.querySelector(${JSON.stringify(selector)}) !== null;`)
  }

  /** Real pointer gesture: press, move in steps, release. */
  async dragTo(sourceSelector, targetSelector, { steps = 12 } = {}) {
    const box = await this.evaluate(`
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      const target = document.querySelector(${JSON.stringify(targetSelector)});
      if (!source || !target) return null;
      source.scrollIntoView({ block: 'center' });
      await new Promise((r) => requestAnimationFrame(r));
      const s = source.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      return { sx: s.left + s.width / 2, sy: s.top + s.height / 2, tx: t.left + t.width / 2, ty: t.top + t.height / 2 };
    `)
    if (!box) throw new Error(`dragTo: missing ${sourceSelector} or ${targetSelector}`)

    const point = (type, x, y, extra = {}) =>
      this.send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: 'left',
        buttons: type === 'mouseReleased' ? 0 : 1,
        clickCount: 1,
        pointerType: 'mouse',
        ...extra,
      })

    await point('mousePressed', box.sx, box.sy)
    await point('mouseMoved', box.sx, box.sy + 2)
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps
      await point('mouseMoved', box.sx + (box.tx - box.sx) * ratio, box.sy + (box.ty - box.sy) * ratio)
      await sleep(16)
    }
    await point('mouseReleased', box.tx, box.ty)
    await this.waitForIdle()
  }

  async screenshot(name) {
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    const dir = join(process.cwd(), '.e2e', 'screenshots')
    await mkdir(dir, { recursive: true })
    const file = join(dir, `${name}.png`)
    await writeFile(file, Buffer.from(data, 'base64'))
    return file
  }

  async setStorage(entries) {
    await this.evaluate(`
      const entries = ${JSON.stringify(entries)};
      for (const [key, value] of Object.entries(entries)) {
        window.localStorage.setItem(key, value);
      }
      return true;
    `)
  }

  async clearStorage() {
    await this.evaluate(`
      window.localStorage.clear();
      return true;
    `)
  }

  /**
   * Clears an origin's LocalStorage through the browser, not the page.
   *
   * `clearStorage()` cannot be used to reset state between checks: the app is
   * still running, and its persistence plugin flushes on `pagehide`, so the
   * moment we navigate the cleared keys are written straight back from memory.
   * Clearing by origin while the app is unloaded leaves nothing alive to
   * re-persist, which is what a fresh install actually looks like.
   */
  async clearOriginStorage(origin) {
    await this.send('Storage.clearDataForOrigin', {
      origin,
      storageTypes: 'local_storage,indexeddb,cache_storage',
    })
  }

  async storageSnapshot() {
    return this.evaluate(`
      const out = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        out[key] = window.localStorage.getItem(key);
      }
      return out;
    `)
  }

  /**
   * Closes the target. Each check gets its own page, and leaving previous pages
   * open lets their schedulers and persistence timers keep running against the
   * same origin, which makes later checks depend on earlier ones.
   */
  async close() {
    try {
      await this.send('Page.close')
    } catch {
      // The target may already be gone.
    }
    this.connection.close()
  }

  problems() {
    return {
      consoleErrors: [...this.session.consoleErrors],
      pageErrors: [...this.session.pageErrors],
      failedRequests: [...this.session.failedRequests],
    }
  }

  clearProblems() {
    this.session.consoleErrors.length = 0
    this.session.pageErrors.length = 0
    this.session.failedRequests.length = 0
  }
}
