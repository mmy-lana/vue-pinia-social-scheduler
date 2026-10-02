<script setup lang="ts">
/**
 * The in-app manual.
 *
 * Four tabs, because there are four genuinely different questions: how do I use
 * this, why can't it log into my accounts, why isn't it posting for real, and
 * what will it post to.
 *
 * The honest answers matter more here than a reassuring summary. This build has
 * no server and no credentials, so it cannot be compromised and cannot get an
 * account banned — but it also cannot reach a social platform, because every
 * one of them requires an OAuth exchange that a browser-only app cannot perform.
 * Saying so plainly, and explaining the trade-off, is more useful than implying
 * a capability the app does not have.
 */
import { computed, ref } from 'vue'
import {
  CalendarDays,
  Compass,
  HardDrive,
  KeyRound,
  Layers,
  ListOrdered,
  Radio,
  ShieldCheck,
  Settings,
  Users,
} from 'lucide-vue-next'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'
import { PLATFORMS, PLATFORM_IDS, platformLabel } from '@/lib/platforms'
import type { Component } from 'vue'

const props = withDefaults(
  defineProps<{
    open?: boolean
  }>(),
  {
    open: false,
  },
)

const emit = defineEmits<{
  'update:open': [open: boolean]
  close: []
}>()

interface GuideTab {
  id: string
  label: string
  icon: Component
}

const TABS: GuideTab[] = [
  { id: 'start', label: 'Quick Start', icon: Compass },
  { id: 'privacy', label: 'Privacy', icon: ShieldCheck },
  { id: 'platforms', label: 'Platform Setup', icon: KeyRound },
  { id: 'matrix', label: 'Support Matrix', icon: Layers },
]

const active = ref('start')

const tabs = computed(() => TABS)

const isOpen = computed({
  get: () => props.open,
  set: (value: boolean) => emit('update:open', value),
})

function close(): void {
  isOpen.value = false
  emit('close')
}

interface Walkthrough {
  icon: Component
  name: string
  route: string
  summary: string
}

const VIEWS: Walkthrough[] = [
  {
    icon: Radio,
    name: 'Timeline',
    route: '/dashboard',
    summary:
      'The home screen. Upcoming posts grouped by day, with the filter chips above for channel and lifecycle stage. Every card carries its own actions, so nothing is hidden behind a hover.',
  },
  {
    icon: Compass,
    name: 'Composer',
    route: 'opened from anywhere',
    summary:
      'Write once and target several channels. It checks the strictest character limit across your selection, warns when Instagram needs a photo, and previews the result per channel. Four ways out: publish now, pick a time, take the next free queue slot, or save a draft.',
  },
  {
    icon: ListOrdered,
    name: 'Queue',
    route: '/queue',
    summary:
      'Weekly posting times per channel, such as Monday to Friday at 09:00 and 17:00. Once set, "Add to queue" claims the next free slot automatically instead of you choosing a time by hand.',
  },
  {
    icon: CalendarDays,
    name: 'Calendar',
    route: '/calendar',
    summary:
      'Month, week and agenda views of the same data. Tapping a day opens it; on a wide screen you can also drag a post onto another day. Every drag has a matching Reschedule action, so nothing depends on a pointer.',
  },
  {
    icon: Layers,
    name: 'Library',
    route: '/library',
    summary:
      'Everything that exists, filtered by drafts, scheduled, published or failed. A failed post keeps its reason and can be retried without being rewritten.',
  },
  {
    icon: Users,
    name: 'Channels',
    route: '/channels',
    summary:
      'Connect and disconnect the accounts you post from. Removing one cascades to its posts and posting times, and offers an undo for a few seconds.',
  },
  {
    icon: Settings,
    name: 'Settings',
    route: '/settings',
    summary:
      'Timezone, clock format, theme and the failure simulator, plus export, import and reset. Export first if you might want your data back.',
  },
]

/** Why a browser-only app cannot publish on a platform's behalf. */
interface PlatformNote {
  platform: string
  surface: string
  summary: string
}

const PLATFORM_NOTES: PlatformNote[] = [
  {
    platform: 'X',
    surface: 'Developer portal, Project and Keys, OAuth 2.0',
    summary:
      'Needs a client secret to exchange an authorization code for a token. A client secret cannot be shipped inside a web page without anyone being able to read it, so the exchange has to happen on a server.',
  },
  {
    platform: 'LinkedIn',
    surface: 'LinkedIn developer portal, Sign In with LinkedIn',
    summary:
      'Requires a registered application and a server-side token exchange. Posting scopes are additionally reviewed before they are granted.',
  },
  {
    platform: 'Instagram',
    surface: 'Meta for Developers, Instagram Graph API',
    summary:
      'Facebook Login for Business, then a long-lived token obtained server-side. The media endpoints additionally reject requests that do not originate from a registered origin.',
  },
  {
    platform: 'Facebook',
    surface: 'Meta for Developers, Facebook Login',
    summary:
      'Page access tokens are issued through a server-side exchange. App review is required before a page can publish on your behalf.',
  },
  {
    platform: 'Threads',
    surface: 'Threads API for Developers',
    summary:
      'Uses the Threads API with Meta login. Token exchange is server-side and publishing permissions are granted per account.',
  },
]

interface MatrixRow {
  platform: string
  included: boolean
  maxChars: number | null
  maxMedia: number | null
  requiresMedia: boolean
  note: string
}

const UNSUPPORTED = [
  {
    platform: 'YouTube',
    reason:
      'Publishing is upload-only and multipart, with no browser-direct endpoint that avoids a server. A post here is not a short text update.',
  },
  {
    platform: 'TikTok',
    reason:
      'Requires the Content Posting API, which mandates a server-side token exchange and has no public client-only posting flow.',
  },
  {
    platform: 'Pinterest',
    reason:
      'The Pin API exists but its OAuth exchange is server-side, and its content model is a board plus a link rather than a text post.',
  },
]

const matrixRows = computed<MatrixRow[]>(() => [
  ...PLATFORM_IDS.map((id) => {
    const meta = PLATFORMS[id]
    return {
      platform: platformLabel(id),
      included: true,
      maxChars: meta.maxChars,
      maxMedia: meta.maxMedia,
      requiresMedia: meta.requiresMedia,
      note: 'Fully modelled: limits, media rules and queue times.',
    }
  }),
  ...UNSUPPORTED.map((entry) => ({
    platform: entry.platform,
    included: false,
    maxChars: null,
    maxMedia: null,
    requiresMedia: false,
    note: entry.reason,
  })),
])
</script>

<template>
  <BaseModal
    :open="isOpen"
    title="Guide & Manual"
    size="xl"
    data-testid="app-guide-modal"
    @update:open="(value) => { if (!value) close() }"
  >
    <div class="flex flex-col gap-4" data-testid="app-guide">
      <p class="text-sm text-ink-muted">
        What this app is, why it cannot log in to your accounts, and what it
        can post to.
      </p>

      <BaseTabs
        v-model="active"
        :tabs="tabs"
        ariaLabel="Guide sections"
        data-testid="app-guide-tabs"
      />

      <!-- Tab 1 -->
      <section v-show="active === 'start'" data-testid="app-guide-panel-start">
        <h3 class="mb-2 text-sm font-semibold text-ink">What this is</h3>
        <p class="mb-4 text-sm text-ink-muted">
          A single-user, offline planner for social posts. You write and schedule
          content here; it runs entirely in your browser and keeps everything on
          this device. There is no account, no server and no subscription.
        </p>

        <h3 class="mb-2 text-sm font-semibold text-ink">Your first five minutes</h3>
        <ol class="mb-4 flex list-decimal flex-col gap-2 ps-5 text-sm text-ink-muted">
          <li>Open <strong class="text-ink">Channels</strong> and connect the accounts you post from.</li>
          <li>Open <strong class="text-ink">Queue</strong> and set weekly posting times, or accept the defaults.</li>
          <li>Use <strong class="text-ink">New post</strong> in the header, pick your channels, and choose now, a time, a queue slot or a draft.</li>
          <li>Review it on the <strong class="text-ink">Timeline</strong>, or shape the month on the <strong class="text-ink">Calendar</strong>.</li>
          <li>Use <strong class="text-ink">Load demo data</strong> in Settings at any point to explore with realistic content.</li>
        </ol>

        <h3 class="mb-2 text-sm font-semibold text-ink">Every view</h3>
        <ul class="flex flex-col gap-3">
          <li
            v-for="view in VIEWS"
            :key="view.name"
            class="flex gap-3"
            :data-testid="`app-guide-view-${view.name.toLowerCase()}`"
          >
            <component
              :is="view.icon"
              class="mt-0.5 size-5 shrink-0 text-ink-muted"
              aria-hidden="true"
            />
            <div>
              <p class="text-sm font-medium text-ink">
                {{ view.name }}
                <span class="font-normal text-ink-muted">{{ view.route }}</span>
              </p>
              <p class="text-sm text-ink-muted">{{ view.summary }}</p>
            </div>
          </li>
        </ul>
      </section>

      <!-- Tab 2 -->
      <section v-show="active === 'privacy'" data-testid="app-guide-panel-privacy">
        <div
          class="mb-4 flex items-start gap-3 rounded-control bg-ok/10 px-4 py-3"
          role="note"
          data-testid="app-guide-privacy-callout"
        >
          <ShieldCheck class="mt-0.5 size-5 shrink-0 text-ok" aria-hidden="true" />
          <p class="text-sm text-ink">
            This app has no backend. It cannot be hacked, because there is no
            server holding your data, and it cannot get an account banned,
            because it never holds a credential for one.
          </p>
        </div>

        <h3 class="mb-2 text-sm font-semibold text-ink">Where your data lives</h3>
        <p class="mb-4 text-sm text-ink-muted">
          Everything is written to this browser's
          <code class="rounded-control bg-surface-muted px-1 font-mono text-xs">localStorage</code>
          under the <code class="rounded-control bg-surface-muted px-1 font-mono text-xs">vpss:</code>
          namespace. It never leaves the device. Clearing site data or using a
          different browser starts you fresh, which is also why Export exists.
        </p>

        <ul class="mb-4 flex flex-col gap-2">
          <li class="flex gap-2 text-sm text-ink-muted">
            <HardDrive class="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            No passwords, tokens or session cookies are requested, because there is nothing to sign in to.
          </li>
          <li class="flex gap-2 text-sm text-ink-muted">
            <Layers class="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            No analytics, no telemetry, no third-party requests. The only network traffic is loading this app itself.
          </li>
          <li class="flex gap-2 text-sm text-ink-muted">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden="true" />
            Import validates every record with a schema and drops anything malformed rather than trusting it.
          </li>
        </ul>

        <h3 class="mb-2 text-sm font-semibold text-ink">Your data is portable</h3>
        <p class="text-sm text-ink-muted">
          Settings, Export JSON writes a complete backup to a file you keep.
          Import JSON restores one after validating it and showing you what is
          inside. Reset everything clears the namespace for good.
        </p>
      </section>

      <!-- Tab 3 -->
      <section v-show="active === 'platforms'" data-testid="app-guide-panel-platforms">
        <h3 class="mb-2 text-sm font-semibold text-ink">
          Why publishing is simulated here
        </h3>
        <p class="mb-4 text-sm text-ink-muted">
          Every major platform requires an OAuth 2.0 authorization-code exchange
          that involves a client secret. A web page cannot keep a secret: anyone
          who opens developer tools can read it, so the platform treats it as
          public. The exchange therefore has to happen on a server that holds
          the secret and never sends it to the browser. This app is that page and
          nothing else, so it cannot complete the exchange.
        </p>
        <p class="mb-4 text-sm text-ink-muted">
          The same applies to cross-origin rules. Token and publishing endpoints
          do not send the headers a browser needs, so a direct
          <code class="rounded-control bg-surface-muted px-1 font-mono text-xs">fetch</code>
          from this page is blocked regardless of credentials.
        </p>

        <div
          class="mb-4 rounded-control border border-line px-4 py-3"
          data-testid="app-guide-platform-notes"
        >
          <p class="mb-2 text-sm font-medium text-ink">What a real deployment needs</p>
          <ul class="flex flex-col gap-3">
            <li v-for="note in PLATFORM_NOTES" :key="note.platform">
              <p class="text-sm font-medium text-ink">{{ note.platform }}</p>
              <p class="text-xs text-ink-muted">{{ note.surface }}</p>
              <p class="text-sm text-ink-muted">{{ note.summary }}</p>
            </li>
          </ul>
        </div>

        <p class="text-sm text-ink-muted">
          In the meantime the scheduler runs the full lifecycle locally:
          scheduling, due-time detection, the publishing window, failure codes
          and retries. Everything above that line behaves exactly as it would
          against a real endpoint, so swapping in a backend is a change to one
          module rather than a rewrite.
        </p>
      </section>

      <!-- Tab 4 -->
      <section v-show="active === 'matrix'" data-testid="app-guide-panel-matrix">
        <h3 class="mb-2 text-sm font-semibold text-ink">Supported platforms</h3>
        <div class="mb-4 overflow-x-auto">
          <table class="w-full min-w-lg border-collapse text-sm" data-testid="app-guide-matrix">
            <caption class="sr-only">
              Platform support: character limits, media limits and whether a
              platform is included.
            </caption>
            <thead>
              <tr class="border-b border-line text-left">
                <th scope="col" class="py-2 pe-3 font-semibold text-ink">Platform</th>
                <th scope="col" class="py-2 pe-3 font-semibold text-ink">Characters</th>
                <th scope="col" class="py-2 pe-3 font-semibold text-ink">Media</th>
                <th scope="col" class="py-2 pe-3 font-semibold text-ink">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in matrixRows"
                :key="row.platform"
                class="border-b border-line/60 last:border-b-0"
                :data-testid="`app-guide-matrix-${row.platform.toLowerCase()}`"
              >
                <th scope="row" class="py-2 pe-3 text-start font-medium text-ink">
                  {{ row.platform }}
                </th>
                <td class="py-2 pe-3 tabular-nums text-ink-muted">
                  {{ row.maxChars === null ? 'Not applicable' : row.maxChars.toLocaleString() }}
                </td>
                <td class="py-2 pe-3 tabular-nums text-ink-muted">
                  <template v-if="row.maxMedia === null">Not applicable</template>
                  <template v-else>
                    up to {{ row.maxMedia }}{{ row.requiresMedia ? ', one required' : '' }}
                  </template>
                </td>
                <td class="py-2 pe-3">
                  <BaseBadge :tone="row.included ? 'ok' : 'neutral'">
                    {{ row.included ? 'Included' : 'Not included' }}
                  </BaseBadge>
                  <p class="mt-1 text-xs text-ink-muted">{{ row.note }}</p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="text-sm text-ink-muted">
          Limits shown are the ones this app enforces while you write, so a post
          is rejected here rather than after a real publish attempt.
        </p>
      </section>
    </div>
  </BaseModal>
</template>