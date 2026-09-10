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

describe('shared control accessibility', () => {
  it('keeps button targets usable and disabled controls visibly inactive', () => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    const container = document.createElement('div')
    document.body.append(container)
    try {
      for (const className of [
        'primary-button',
        'secondary-button',
        'small-button',
        'text-button',
        'icon-button',
      ]) {
        const button = document.createElement('button')
        button.className = className
        button.textContent = 'ทดสอบ'
        container.append(button)
        const enabled = getComputedStyle(button)
        // jsdom retains rem units; the approved root body size is 16px.
        expect(
          parseFloat(enabled.minWidth) * 16,
          className,
        ).toBeGreaterThanOrEqual(44)
        expect(
          Math.max(
            parseFloat(enabled.minHeight) || 0,
            parseFloat(enabled.height) || 0,
          ) * 16,
          className,
        ).toBeGreaterThanOrEqual(44)
        button.disabled = true
        const disabled = getComputedStyle(button)
        expect(disabled.cursor, className).toBe('not-allowed')
        expect(disabled.opacity, className).toBe('1')
        expect(disabled.boxShadow, className).toBe('none')
      }
    } finally {
      container.remove()
      style.remove()
    }
  })
})

it('reserves a status column beside long card headings', () => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const heading = document.createElement('div')
  heading.className = 'installment-plan-heading'
  heading.innerHTML =
    '<div>รายการตัวอย่างชื่อยาวมากสำหรับทดสอบ</div><span class="status-label">ปิดยอดก่อนกำหนด</span>'
  document.body.append(heading)
  try {
    const layout = getComputedStyle(heading)
    expect(layout.display).toBe('grid')
    expect(layout.gridTemplateColumns).toBe('minmax(0, 1fr) auto')
    expect(getComputedStyle(heading.firstElementChild!).minWidth).toBe('0px')
  } finally {
    heading.remove()
    style.remove()
  }
})

it('keeps the filter primary action content-sized', () => {
  const style = document.createElement('style')
  style.textContent = css
  document.head.append(style)
  const filterActions = document.createElement('div')
  filterActions.className = 'filter-actions'
  const applyFilter = document.createElement('button')
  applyFilter.className = 'primary-button'
  filterActions.append(applyFilter)
  document.body.append(filterActions)
  try {
    expect(getComputedStyle(applyFilter).width).toBe('auto')
  } finally {
    filterActions.remove()
    style.remove()
  }
})
