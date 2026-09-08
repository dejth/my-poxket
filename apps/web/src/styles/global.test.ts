/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { formatThbMinor } from '../pages/finance-format'

const css = readFileSync('src/styles/global.css', 'utf8')

function luminance(hex: string) {
  const channels = hex.match(/[a-f\d]{2}/gi)!.map((channel) => {
    const value = parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
}

function color(name: string) {
  const value = css.match(
    new RegExp(`--color-${name}: (#[a-f\\d]{6});`, 'i'),
  )?.[1]
  if (!value) throw new Error(`Missing color token: ${name}`)
  return value
}

describe('Calm Ledger tokens', () => {
  it('keeps text and semantic status pairs readable', () => {
    const pairs = [
      ['ink', 'surface'],
      ['muted', 'canvas'],
      ['muted', 'surface'],
      ['surface', 'accent'],
      ['surface', 'accent-strong'],
      ['accent', 'accent-soft'],
      ['warning', 'warning-soft'],
      ['error', 'error-soft'],
      ['muted', 'neutral-soft'],
    ]
    for (const [foreground, background] of pairs) {
      const values = [
        luminance(color(foreground!)),
        luminance(color(background!)),
      ].sort((a, b) => a - b)
      expect(
        (values[1]! + 0.05) / (values[0]! + 0.05),
        `${foreground}/${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
    expect(
      (luminance(color('surface')) + 0.05) /
        (luminance(color('control-border')) + 0.05),
    ).toBeGreaterThanOrEqual(3)
  })

  it('preserves exact THB display including negative and large values', () => {
    expect(formatThbMinor('125001')).toBe('฿1,250.01')
    expect(formatThbMinor('-25000')).toBe('-฿250.00')
    expect(formatThbMinor('99999999999')).toBe('฿999,999,999.99')
  })
})
