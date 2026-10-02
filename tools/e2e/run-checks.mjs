/**
 * Headless-Chrome feature verification.
 *
 * Boots its own Chrome instance (separate profile, separate PID — any browser
 * the developer has open is untouched), then drives the real built app:
 * every check interacts with the UI the way a person would and fails the run on
 * console errors, page exceptions or failed requests.
 *
 *   node tools/e2e/run-checks.mjs --url http://127.0.0.1:4173 --only boot,nav
 *
 * Screenshots land in .e2e/screenshots/.
 */
import { BrowserSession } from './chrome.mjs'

const args = process.argv.slice(2)
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : (args[index + 1] ?? fallback)
}

const BASE_URL = flag('url', 'http://127.0.0.1:4173')
const PORT = Number(flag('port', '9455'))
const ONLY = flag('only', '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)

const PHONE = { width: 390, height: 844, mobile: true }
const TABLET = { width: 900, height: 1000, mobile: false }
const DESKTOP = { width: 1440, height: 950, mobile: false }

/**
 * `BaseSegmented` owns its own `data-testid`, so a caller cannot override it.
 * The radiogroups are addressed by their accessible name instead — which is
 * also what a screen reader would use to find them.
 */
const CALENDAR_VIEW = '[role="radiogroup"][aria-label="Calendar view"] button'
const THEME = '[role="radiogroup"][aria-label="Theme"] button'
const SCHEDULE_MODE = '[role="radiogroup"][aria-label="When should this post go out?"] button'

const checks = []
const check = (name, fn) => checks.push({ name, fn })

/* ------------------------------------------------------------------ *
 * Helpers available to every check
 * ------------------------------------------------------------------ */

function makeContext(page) {
  return {
    page,
    url: (path) => `${BASE_URL}${path}`,
    async goto(path) {
      await page.goto(`${BASE_URL}${path}`)
    },
    /**
     * Resets to a genuinely empty workspace: unload the app, clear the origin
     * out of band, then boot. Clearing from inside a running page would be
     * undone by the persistence plugin's `pagehide` flush, so the old data would
     * simply reappear.
     */
    async clearAndReload(path) {
      await page.goto('about:blank')
      await page.clearOriginStorage(BASE_URL)
      await page.goto(`${BASE_URL}${path}`)
    },
    async count(selector) {
      return page.count(selector)
    },
    async text(selector) {
      return page.text(selector)
    },
    async exists(selector) {
      return page.exists(selector)
    },
    click: (selector) => page.click(selector),
    clickText: (text, selector) => page.clickText(text, selector),
    setValue: (selector, value) => page.setValue(selector, value),
    waitFor: (selector, options) => page.waitFor(selector, options),
    waitForGone: (selector, options) => page.waitForGone(selector, options),
    storageSnapshot: () => page.storageSnapshot(),
    dragTo: (source, target, options) => page.dragTo(source, target, options),
    waitForExpression: (expression, options) => page.waitForExpression(expression, options),
    evaluate: (expression) => page.evaluate(expression),
    shot: (name) => page.screenshot(name),
    assert(condition, message) {
      if (!condition) throw new Error(message)
    },
    assertEqual(actual, expected, message) {
      if (actual !== expected) {
        throw new Error(`${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
      }
    },
    async assertText(selector, needle, message) {
      const value = await page.text(selector)
      if (!value || !value.includes(needle)) {
        throw new Error(`${message} — "${needle}" not found in ${selector} (got: ${value ?? 'null'})`)
      }
    },
    async assertVisible(selector, message) {
      await page.waitFor(selector, { timeout: 10_000 }).catch(() => {
        throw new Error(`${message} — selector missing: ${selector}`)
      })
    },
    async assertNoHorizontalScroll(message) {
      const overflow = await page.evaluate(`
        return document.documentElement.scrollWidth - document.documentElement.clientWidth;
      `)
      if (overflow > 1) throw new Error(`${message} — horizontal overflow of ${overflow}px`)
    },
  }
}

/* ------------------------------------------------------------------ *
 * Checks
 * ------------------------------------------------------------------ */

/**
 * Loads the demo dataset, answering the "replace your data?" confirmation when
 * the workspace is not already empty. Every data-dependent check starts here.
 */
async function loadDemo(ctx) {
  await ctx.goto('/settings')
  await ctx.clickText('Load demo data', 'button')
  const asked = await ctx.exists('[data-testid="confirm-accept"]')
  if (asked) await ctx.click('[data-testid="confirm-accept"]')
  await ctx.waitForGone('[data-testid="confirm-dialog"]')
}

check('boot', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.clearAndReload('/dashboard')
  await ctx.assertVisible('[data-testid="app-shell"]', 'app shell should mount')
  await ctx.assertVisible('[data-testid="sidebar-nav"]', 'desktop should show the sidebar')
  await ctx.assertText('[data-testid="top-bar-title"]', 'Timeline', 'top bar should name the page')
  await ctx.assertText('[data-testid="top-bar-engine"]', 'Engine', 'the scheduler state should be visible')
  await ctx.shot('01-boot-desktop')
})

check('routes', async (ctx) => {
  const routes = [
    ['/dashboard', 'Timeline'],
    ['/calendar', 'Calendar'],
    ['/queue', 'Posting queue'],
    ['/library', 'Library'],
    ['/channels', 'Channels'],
    ['/settings', 'Settings'],
  ]
  for (const [route, title] of routes) {
    await ctx.goto(route)
    await ctx.assertVisible('[data-testid="app-shell"]', `shell missing on ${route}`)
    await ctx.assertText('[data-testid="top-bar-title"]', title, `${route} should show "${title}"`)
  }
  await ctx.goto('/does-not-exist')
  await ctx.assertText('[data-testid="top-bar-title"]', 'Page not found', 'unknown routes render the not-found page')
  await ctx.assertVisible('[data-testid="not-found-timeline"]', 'not-found offers a way back')
  await ctx.shot('02-routes')
})

check('responsive', async (ctx) => {
  for (const [label, viewport] of [
    ['phone-360', { width: 360, height: 780, mobile: true }],
    ['phone-390', PHONE],
    ['phone-430', { width: 430, height: 932, mobile: true }],
    ['tablet', TABLET],
    ['desktop', DESKTOP],
    ['wide', { width: 1440, height: 950, mobile: false }],
  ]) {
    await ctx.page.setViewport(viewport.width, viewport.height, viewport.mobile)
    await ctx.goto('/dashboard')
    await ctx.assertNoHorizontalScroll(`${label} dashboard`)
    const navSelector =
      viewport.width < 768
        ? '[data-testid="bottom-nav"]'
        : viewport.width < 1024
          ? '[data-testid="sidebar-nav"]'
          : '[data-testid="sidebar-nav"]'
    await ctx.assertVisible(navSelector, `${label} should show the right navigation`)
    if (viewport.width >= 768 && viewport.width < 1024) {
      await ctx.assertVisible(
        '[data-testid="app-shell-rail"]',
        `${label} should collapse to the 72px icon rail`,
      )
    }

    // Every route must survive the width, not just the dashboard.
    for (const route of ['/calendar', '/queue', '/library', '/channels', '/settings']) {
      await ctx.goto(route)
      await ctx.assertNoHorizontalScroll(`${label} ${route}`)
    }

    // No essential action may be reachable only on hover, and tap targets
    // must clear the 44px floor.
    const smallTargets = await ctx.page.evaluate(`
      const nodes = Array.from(document.querySelectorAll('button, a[href], [role="tab"], [role="menuitem"]'));
      return nodes
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return rect.height < 44 || rect.width < 24;
        })
        .map((node) => (node.getAttribute('data-testid') || node.textContent || node.tagName).trim().slice(0, 40));
    `)
    ctx.assert(
      smallTargets.length === 0,
      `${label} ${viewport.width}px: tap targets below 44px: ${JSON.stringify(smallTargets.slice(0, 5))}`,
    )

    await ctx.shot(`03-responsive-${label}`)
  }
})

check('onboarding', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.clearAndReload('/dashboard')
  await ctx.assertVisible('[data-testid="onboarding-card"]', 'an empty workspace offers onboarding')
  await ctx.clickText('Load demo data')
  await ctx.page.waitForGone('[data-testid="onboarding-card"]')
  await ctx.assert(
    (await ctx.count('[data-testid="post-card"]')) > 0,
    'loading demo data fills the timeline',
  )
  await ctx.shot('04-onboarding-demo')
})

check('connect-channel', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.clearAndReload('/channels')
  await ctx.assertVisible('[data-testid="channels-empty"]', 'channels page starts empty')

  await ctx.click('[data-testid="channels-connect"]')
  await ctx.assertVisible('[data-testid="connect-channel-form"]', 'the connect form opens')

  await ctx.page.setValue('[data-field="handle"] input', 'lanabuilds')
  await ctx.page.setValue('[data-field="displayName"] input', 'Lana Builds')
  await ctx.click('[data-testid="connect-channel-submit"] button')

  await ctx.assertVisible('[data-testid="channel-card"]', 'the new channel appears')
  await ctx.assertText('[data-testid="channel-card-handle"]', '@lanabuilds', 'the handle is shown')
  await ctx.shot('05-connect-channel')
})

check('composer', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.clearAndReload('/channels')
  await ctx.click('[data-testid="channels-connect"]')
  await ctx.page.setValue('[data-field="handle"] input', 'lanabuilds')
  await ctx.page.setValue('[data-field="displayName"] input', 'Lana Builds')
  await ctx.click('[data-testid="connect-channel-submit"] button')
  await ctx.page.waitForGone('[data-testid="connect-channel-form"]')

  await ctx.goto('/dashboard')
  await ctx.click('[data-testid="dashboard-create"]')
  await ctx.assertVisible('[data-testid="composer-sheet"]', 'the composer opens')

  await ctx.page.setValue('[data-testid="composer-editor"] textarea', 'Ship the queue today')
  await ctx.click('[data-testid="composer-submit"]')

  await ctx.page.waitForGone('[data-testid="composer-sheet"]')
  await ctx.assert(
    (await ctx.count('[data-testid="post-card"]')) > 0,
    'a scheduled post appears on the timeline',
  )
  await ctx.assertVisible('[data-testid="post-card"] [data-testid="post-status-badge"]', 'the card shows a status')
  await ctx.shot('06-composer-scheduled')
})

check('validation', async (ctx) => {
  await ctx.page.setViewport(PHONE.width, PHONE.height, PHONE.mobile)
  await ctx.clearAndReload('/dashboard')
  await ctx.click('[data-testid="bottom-nav-more"]')
  await ctx.assertVisible('[data-testid="more-sheet-channels"]', 'the More sheet opens')
  await ctx.click('[data-testid="more-sheet-channels"]')
  await ctx.page.waitForGone('[data-testid="more-sheet"]')

  await ctx.click('[data-testid="channels-connect"]')
  await ctx.page.setValue('[data-field="handle"] input', 'lanabuilds')
  await ctx.page.setValue('[data-field="displayName"] input', 'Lana Builds')
  await ctx.click('[data-testid="connect-channel-submit"] button')
  await ctx.page.waitForGone('[data-testid="connect-channel-form"]')

  // An empty submit must be refused, and must say why.
  await ctx.goto('/dashboard')
  await ctx.click('[data-testid="dashboard-create"]')
  await ctx.assertVisible('[data-testid="composer-form"]', 'the composer opens as a full-screen sheet')
  await ctx.click('[data-testid="composer-submit"]')
  await ctx.assertVisible(
    '[data-testid="composer-editor"] [data-testid="base-textarea-error"]',
    'an empty post is refused with a message on the field',
  )
  ctx.assert(
    (await ctx.count('[data-testid="post-card"]')) === 0,
    'nothing was created by the refused submit',
  )
  await ctx.shot('07-validation-mobile')
})

check('calendar', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.goto('/calendar')
  await ctx.assertVisible('[data-testid="calendar-month-grid"]', 'the month grid renders')

  const cells = await ctx.count('[data-drop-day]')
  ctx.assert(cells >= 28, `a month grid has at least 28 day cells (got ${cells})`)

  // Month → week → agenda, then back to today.
  await ctx.clickText('Week', CALENDAR_VIEW)
  await ctx.assertVisible('[data-testid="calendar-week-grid"]', 'the week grid renders')
  await ctx.clickText('Agenda', CALENDAR_VIEW)
  await ctx.assertVisible('[data-testid="calendar-agenda-list"]', 'the agenda renders')
  await ctx.clickText('Month', CALENDAR_VIEW)

  const before = await ctx.text('[data-testid="calendar-title"]')
  await ctx.click('[data-testid="calendar-next"]')
  const after = await ctx.text('[data-testid="calendar-title"]')
  ctx.assert(before !== after, 'the next period changes the title')
  await ctx.click('[data-testid="calendar-today"]')
  ctx.assertEqual(await ctx.text('[data-testid="calendar-title"]'), before, 'Today returns to the start')

  await ctx.shot('08-calendar-month')
})

check('queue', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await loadDemo(ctx)
  await ctx.goto('/queue')

  await ctx.assertVisible('[data-testid="slot-editor"]', 'the slot editor renders')
  await ctx.assertVisible('[data-testid="weekday-slot-row"]', 'the seven weekday rows render')

  const rows = await ctx.count('[data-testid="weekday-slot-row"]')
  ctx.assertEqual(rows, 7, 'there is one row per weekday')

  // Add a time by hand, then confirm it is really there.
  await ctx.page.setValue('[data-testid="weekday-slot-input"]', '07:30')
  await ctx.click('[data-testid="weekday-slot-add"]')
  ctx.assert(
    (await ctx.count('[data-testid="weekday-slot-chip"]')) > 0,
    'the added posting time shows as a chip',
  )

  await ctx.assertVisible('[data-testid="upcoming-queue-list"]', 'the upcoming queue list renders')
  await ctx.shot('09-queue')
})

check('channels', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await loadDemo(ctx)
  await ctx.goto('/channels')

  await ctx.assertVisible('[data-testid="channel-card"]', 'channel cards render')
  const cards = await ctx.count('[data-testid="channel-card"]')
  ctx.assert(cards > 0, 'demo data created at least one channel')
  await ctx.shot('10-channels')
})

check('library', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.goto('/library')
  await ctx.assertVisible('[data-testid="timeline-filters"]', 'the library filters render')
  await ctx.assertVisible('[data-testid="top-bar-title"]', 'Library', 'the library page is routed')
  await ctx.shot('11-library')
})

check('settings', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.goto('/settings')
  await ctx.assertVisible('[data-testid="settings-timezone"]', 'the timezone control renders')
  await ctx.assertVisible('[data-testid="settings-storage-usage"]', 'storage usage is reported')

  await ctx.clickText('Dark', THEME)
  const isDark = await ctx.page.evaluate(
    "return document.documentElement.classList.contains('dark');",
  )
  ctx.assert(isDark, 'choosing the dark theme adds the .dark class')
  await ctx.shot('12-settings-dark')

  await ctx.clickText('Light', THEME)
  const isLight = await ctx.page.evaluate(
    "return !document.documentElement.classList.contains('dark');",
  )
  ctx.assert(isLight, 'choosing the light theme removes it again')

  // The reset guard must refuse until the word is typed exactly.
  const disabledBefore = await ctx.page.evaluate(`
    const button = document.querySelector('[data-testid="settings-reset"]');
    return button ? button.disabled : null;
  `)
  ctx.assertEqual(disabledBefore, true, 'reset is disabled until RESET is typed')
  await ctx.shot('13-settings-light')
})

check('scheduler', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.clearAndReload('/dashboard')
  await ctx.assertVisible('[data-testid="onboarding-card"]', 'an empty workspace offers demo data')
  await ctx.click('[data-testid="onboarding-demo"] button')
  await ctx.waitForGone('[data-testid="onboarding-card"]')
  await ctx.goto('/dashboard')

  // A post scheduled for the current minute becomes due on the next tick
  // (the engine polls every 5s), so give it room.
  await ctx.click('[data-testid="dashboard-create"]')
  await ctx.assertVisible('[data-testid="composer-sheet"]', 'the composer opens')

  await ctx.clickText('Now', SCHEDULE_MODE)
  await ctx.page.setValue('[data-testid="composer-editor"] textarea', 'Publish me immediately')
  // Demo data leaves several channels connected, one of them deliberately
  // disconnected, and none preselected. Publishing needs a live channel.
  await ctx.click(
    '[data-testid="account-chip"]:not(:has([data-testid="account-chip-disconnected"]))',
  )
  await ctx.click('[data-testid="composer-submit"]')
  await ctx.page.waitForGone('[data-testid="composer-sheet"]')

  await ctx
    .waitForExpression(
      `(() => {
        const raw = window.localStorage.getItem('vpss:posts');
        if (!raw) return false;
        return JSON.parse(raw).data.some(
          (post) => post.content.startsWith('Publish me immediately') && post.status === 'published',
        );
      })()`,
      { timeout: 20_000 },
    )
    .catch(() => {
      throw new Error('a post published with "Now" never reached the published state')
    })

  // The timeline opens on "Upcoming", which by definition hides published
  // posts — switch the filter before looking for the card.
  await ctx.clickText('Published', '[role="radiogroup"] button')
  await ctx.assertVisible(
    '[data-testid="post-card"][data-status="published"]',
    'the published post is listed under the Published filter',
  )
  await ctx.assertVisible('[data-testid="post-metrics-row"]', 'a published post shows metrics')
  await ctx.shot('14-scheduler-published')
})

check('drag-reschedule', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.clearAndReload('/dashboard')
  await loadDemo(ctx)
  await ctx.goto('/calendar')

  const chips = await ctx.count('[data-testid="calendar-chip"]')
  if (chips === 0) {
    throw new Error('no calendar chips to drag — demo data should schedule some posts')
  }

  const source = '[data-testid="calendar-chip"]'

  // Drop onto a *future* day: moving a post into the past is correctly refused
  // by the lead-time rule, so picking any old cell would test the wrong thing.
  // The drop has to land on a cell that is actually on screen: the gesture is
  // dispatched as real pointer coordinates, so an off-screen target would be
  // released over whatever happens to be there instead.
  const targetKey = await ctx.page.evaluate(`
    const chip = document.querySelector('${source}');
    chip.scrollIntoView({ block: 'center' });
    const chipDay = chip.closest('[data-drop-day]')?.getAttribute('data-drop-day');
    const today = new Date();
    // At least a day ahead, so the move clears the "at least a minute from now"
    // rule whatever time of day this runs.
    const earliest = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const visible = Array.from(document.querySelectorAll('[data-drop-day]'))
      .filter((el) => {
        const key = el.getAttribute('data-drop-day');
        if (key <= earliest || key === chipDay) return false;
        const rect = el.getBoundingClientRect();
        return rect.top > 0 && rect.bottom < window.innerHeight && rect.width > 0;
      })
      .map((el) => el.getAttribute('data-drop-day'))
      .sort();
    return visible[0] ?? null;
  `)
  ctx.assert(targetKey !== null, 'found a visible future day cell to drop on')

  const before = (await ctx.storageSnapshot())['vpss:posts']
  await ctx.page.dragTo(source, `[data-drop-day="${targetKey}"]`, { steps: 20 })

  // The gesture settles in well under a frame, but persistence is debounced, so
  // the store is compared once the write has actually landed.
  await ctx
    .waitForExpression(`window.localStorage.getItem('vpss:posts') !== ${JSON.stringify(before)}`, {
      timeout: 10_000,
    })
    .catch(() => {
      throw new Error(`dragging a chip onto ${targetKey} did not change the stored schedule`)
    })

  await ctx.assertText(
    '[data-testid="toast-host"]',
    'Moved to',
    'the move is confirmed with an undoable toast',
  )
  await ctx.shot('15-drag-reschedule')
})

check('persistence', async (ctx) => {
  await ctx.page.setViewport(DESKTOP.width, DESKTOP.height)
  await ctx.goto('/settings')
  await ctx.clickText('Load demo data', 'button')
  await ctx.goto('/dashboard')
  const before = await ctx.count('[data-testid="post-card"]')
  await ctx.goto('/channels')
  await ctx.goto('/dashboard')
  const after = await ctx.count('[data-testid="post-card"]')
  ctx.assertEqual(after, before, 'posts survive navigation (stored in LocalStorage)')

  const storage = await ctx.page.storageSnapshot()
  ctx.assert(
    Object.keys(storage).some((key) => key.startsWith('vpss:')),
    'data is persisted under the vpss: namespace',
  )

  // A full reload is the real test of hydration.
  await ctx.page.goto(`${BASE_URL}/dashboard`)
  await ctx.assert(
    (await ctx.count('[data-testid="post-card"]')) > 0,
    'posts are rehydrated after a full page load',
  )
})

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

async function main() {
  const selected = ONLY.length > 0 ? checks.filter((c) => ONLY.includes(c.name)) : checks
  if (selected.length === 0) {
    console.error(`No checks matched --only ${ONLY.join(',')}`)
    process.exit(2)
  }

  const browser = await BrowserSession.launch({ width: DESKTOP.width, height: DESKTOP.height, port: PORT })
  const results = []
  let hardFailure = false

  console.log(`\n▶ ${selected.length} check(s) against ${BASE_URL}`)
  console.log(`  chrome pid ${browser.process.pid}, profile ${browser.userDataDir}\n`)

  for (const { name, fn } of selected) {
    const page = await browser.newPage('about:blank', DESKTOP)
    const ctx = makeContext(page)
    const started = Date.now()
    try {
      await fn(ctx)
      const problems = page.problems()
      const noise = [...problems.consoleErrors, ...problems.pageErrors, ...problems.failedRequests]
      if (noise.length > 0) {
        throw new Error(`browser reported errors:\n    ${noise.slice(0, 5).join('\n    ')}`)
      }
      results.push({ name, ok: true, ms: Date.now() - started })
      console.log(`  ✓ ${name} (${Date.now() - started}ms)`)
    } catch (error) {
      hardFailure = true
      const message = error instanceof Error ? error.message : String(error)
      results.push({ name, ok: false, ms: Date.now() - started, message })
      console.log(`  ✗ ${name} (${Date.now() - started}ms)\n      ${message.split('\n').join('\n      ')}`)
      await page.screenshot(`fail-${name}`).catch(() => {})
    } finally {
      page.clearProblems()
      // Without this, the next check runs alongside this page's scheduler and
      // persistence timers, both of which keep writing to the same origin.
      await page.close()
    }
  }

  await browser.close()

  const passed = results.filter((result) => result.ok).length
  console.log(`\n${passed}/${results.length} checks passed`)
  process.exit(hardFailure ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})