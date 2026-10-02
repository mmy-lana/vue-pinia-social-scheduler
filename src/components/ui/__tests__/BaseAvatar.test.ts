import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { hueFromString, initialsOf } from '@/lib/utils'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'

const TESTID = 'base-avatar'

function mountAvatar(props: Record<string, unknown> = {}) {
  return mount(BaseAvatar, { props: { name: 'Ada Lovelace', ...props } as never })
}

describe('BaseAvatar', () => {
  it('renders the initials of the name on the hashed hsl background', () => {
    const avatar = mountAvatar()
    const expectedHue = hueFromString('Ada Lovelace')

    expect(avatar.element.tagName).toBe('SPAN')
    expect(avatar.attributes('role')).toBe('img')
    expect(avatar.attributes('aria-label')).toBe('Ada Lovelace')
    expect(avatar.attributes('data-testid')).toBe(TESTID)

    const initials = avatar.find('[data-testid="base-avatar-initials"]')
    expect(initials.text()).toBe(initialsOf('Ada Lovelace'))
    expect(initials.text()).toBe('AL')

    const disc = avatar.find('[data-testid="base-avatar-disc"]')
    expect(disc.attributes('style')).toContain(`hsl(${expectedHue} 70% 45%)`)
    expect(disc.classes()).toContain('rounded-full')
    expect(disc.classes()).toContain('text-white')
  })

  it('honours an explicit hue and clamps it into 0–359', () => {
    expect(
      mountAvatar({ hue: 210 }).find('[data-testid="base-avatar-disc"]').attributes('style'),
    ).toContain('hsl(210 70% 45%)')
    expect(
      mountAvatar({ hue: 420 }).find('[data-testid="base-avatar-disc"]').attributes('style'),
    ).toContain('hsl(359 70% 45%)')
    expect(
      mountAvatar({ hue: -12 }).find('[data-testid="base-avatar-disc"]').attributes('style'),
    ).toContain('hsl(0 70% 45%)')
  })

  it('maps every size to a token-sized disc', () => {
    const expected: Array<[string, string]> = [
      ['xs', 'size-6'],
      ['sm', 'size-8'],
      ['md', 'size-10'],
      ['lg', 'size-12'],
      ['xl', 'size-14'],
    ]

    for (const [size, className] of expected) {
      expect(mountAvatar({ size }).find('[data-testid="base-avatar-disc"]').classes()).toContain(
        className,
      )
    }
    expect(mountAvatar().find('[data-testid="base-avatar-disc"]').classes()).toContain('size-10')
  })

  it('shows the image and hides the initials from assistive tech', () => {
    const avatar = mountAvatar({ src: 'https://example.test/ada.png' })

    const image = avatar.find('[data-testid="base-avatar-image"]')
    expect(image.exists()).toBe(true)
    expect(image.attributes('src')).toBe('https://example.test/ada.png')
    expect(image.attributes('alt')).toBe('')
    expect(avatar.find('[data-testid="base-avatar-initials"]').attributes('aria-hidden')).toBe(
      'true',
    )
    expect(avatar.attributes('aria-label')).toBe('Ada Lovelace')
  })

  it('falls back to the initials when the image fails to load', async () => {
    const avatar = mountAvatar({ src: 'https://example.test/missing.png' })

    expect(avatar.find('[data-testid="base-avatar-image"]').exists()).toBe(true)

    await avatar.find('[data-testid="base-avatar-image"]').trigger('error')

    expect(avatar.find('[data-testid="base-avatar-image"]').exists()).toBe(false)
    const initials = avatar.find('[data-testid="base-avatar-initials"]')
    expect(initials.text()).toBe('AL')
    expect(initials.attributes('aria-hidden')).toBeUndefined()
  })

  it('retries a new src after a previous failure', async () => {
    const avatar = mountAvatar({ src: 'https://example.test/missing.png' })
    await avatar.find('[data-testid="base-avatar-image"]').trigger('error')
    expect(avatar.find('[data-testid="base-avatar-image"]').exists()).toBe(false)

    await avatar.setProps({ src: 'https://example.test/ada.png' })

    expect(avatar.find('[data-testid="base-avatar-image"]').attributes('src')).toBe(
      'https://example.test/ada.png',
    )
  })

  it('renders no status dot by default', () => {
    expect(mountAvatar().find('[data-testid="base-avatar-status"]').exists()).toBe(false)
    expect(mountAvatar({ status: null }).find('[data-testid="base-avatar-status"]').exists()).toBe(
      false,
    )
  })

  it('renders a titled status dot per status', () => {
    const online = mountAvatar({ status: 'online' }).find('[data-testid="base-avatar-status"]')
    expect(online.attributes('title')).toBe('Online')
    expect(online.classes()).toContain('bg-ok')
    expect(online.text()).toBe('Online')
    expect(online.find('.sr-only').exists()).toBe(true)

    const offline = mountAvatar({ status: 'offline' }).find('[data-testid="base-avatar-status"]')
    expect(offline.attributes('title')).toBe('Offline')
    expect(offline.classes()).toContain('bg-ink-muted')

    const error = mountAvatar({ status: 'error' }).find('[data-testid="base-avatar-status"]')
    expect(error.attributes('title')).toBe('Connection error')
    expect(error.classes()).toContain('bg-danger')
  })
})
