import { describe, it, expect } from 'vitest'
import {
  countSmsMessages,
  projectTemplateLength,
  INFORU_CHARS_PER_MESSAGE,
} from '@/lib/sms/segments'

describe('countSmsMessages', () => {
  it('an empty body costs nothing', () => {
    expect(countSmsMessages('')).toBe(0)
  })

  it('a short Hebrew message is one billed message', () => {
    expect(countSmsMessages('שלום, מחכה לך מתנה')).toBe(1)
  })

  it('201 chars = 1 message, 202 = 2 (InforU Hebrew billing unit)', () => {
    expect(countSmsMessages('x'.repeat(INFORU_CHARS_PER_MESSAGE))).toBe(1) // 201
    expect(countSmsMessages('x'.repeat(INFORU_CHARS_PER_MESSAGE + 1))).toBe(2) // 202
  })

  it('adds another billed message at each 201-char step', () => {
    expect(countSmsMessages('x'.repeat(402))).toBe(2)
    expect(countSmsMessages('x'.repeat(403))).toBe(3)
  })
})

describe('projectTemplateLength', () => {
  it('expands {name} and {link} with buffers, not the literal placeholders', () => {
    // 'Hi ' (3) + name(10) + ', ' (2) + link(50) = 65
    expect(projectTemplateLength('Hi {name}, {link}', { nameLen: 10, linkLen: 50 })).toBe(65)
  })

  it('uses default buffers (name 20 + link 70) when not overridden', () => {
    expect(projectTemplateLength('{name}{link}')).toBe(90)
  })

  it('replaces every occurrence of a placeholder', () => {
    expect(projectTemplateLength('{name} {name}', { nameLen: 5, linkLen: 0 })).toBe(11) // 5 + ' ' + 5
  })
})
