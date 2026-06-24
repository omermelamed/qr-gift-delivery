import { describe, it, expect } from 'vitest'
import { renderSmsTemplate, resolveSmsTemplate } from '@/lib/sms-template'

describe('renderSmsTemplate', () => {
  it('substitutes name and link', () => {
    expect(renderSmsTemplate('Hi {name}, gift: {link}', { name: 'Dana', link: 'http://x/y' }))
      .toBe('Hi Dana, gift: http://x/y')
  })
  it('replaces every occurrence of a placeholder', () => {
    expect(renderSmsTemplate('{name} {name} {link}', { name: 'A', link: 'L' })).toBe('A A L')
  })
  it('leaves text without placeholders unchanged', () => {
    expect(renderSmsTemplate('no vars here', { name: 'A', link: 'L' })).toBe('no vars here')
  })
})

describe('resolveSmsTemplate', () => {
  it('prefers a non-empty campaign template', () => {
    expect(resolveSmsTemplate('camp {link}', 'co {link}')).toBe('camp {link}')
  })
  it('falls back to the company template when campaign is null', () => {
    expect(resolveSmsTemplate(null, 'co {link}')).toBe('co {link}')
  })
  it('treats empty / whitespace-only as absent', () => {
    expect(resolveSmsTemplate('   ', 'co {link}')).toBe('co {link}')
    expect(resolveSmsTemplate('', null)).toBeNull()
  })
  it('returns null when both are empty', () => {
    expect(resolveSmsTemplate(null, null)).toBeNull()
    expect(resolveSmsTemplate('  ', '')).toBeNull()
  })
  it('trims the chosen template', () => {
    expect(resolveSmsTemplate('  camp {link}  ', null)).toBe('camp {link}')
  })
})
