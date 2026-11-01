import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import type { SessionData } from './api'
import { Icon, type IconName } from './Icon'
import { Logo } from './Logo'
import { Modal } from './Modal'
import {
  readThemePreference,
  setThemePreference,
  type ThemePreference,
} from './theme'

interface AppShellProps {
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
  readonly session: SessionData
}

const navigation = [
  { icon: 'house-door', label: 'ภาพรวม', path: '/' },
  { icon: 'list-ul', label: 'รายการ', path: '/transactions' },
  { icon: 'credit-card', label: 'บัตร', path: '/credit-cards' },
  { icon: 'wallet2', label: 'ผ่อน', path: '/installments' },
  { icon: 'arrow-repeat', label: 'ประจำ', path: '/recurring-expenses' },
  { icon: 'tags', label: 'หมวดหมู่', path: '/categories' },
] as const

export function AppShell({ isSigningOut, onSignOut, session }: AppShellProps) {
  const [isMoreOpen, setMoreOpen] = useState(false)
  const [theme, setTheme] = useState(readThemePreference)
  function changeTheme(preference: ThemePreference) {
    setThemePreference(preference)
    setTheme(preference)
  }
  const { pathname } = useLocation()
  const secondaryNavigation = [
    ...navigation.slice(3),
    ...(session.user.role === 'owner'
      ? [{ icon: 'people' as IconName, label: 'ผู้ใช้', path: '/users' }]
      : []),
  ]
  const isMoreActive = secondaryNavigation.some(
    (item) => pathname === item.path,
  )
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>
      <aside className="app-sidebar">
        <NavLink className="app-brand" to="/" aria-label="My Poxket">
          <Logo />
        </NavLink>
        <nav className="primary-nav" aria-label="เมนูหลัก">
          {navigation.map((item) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? 'nav-link is-active' : 'nav-link'
              }
              end={item.path === '/'}
              key={item.path}
              to={item.path}
            >
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <section className="sidebar-account" aria-label="บัญชี">
          <ThemeToggle preference={theme} onChange={changeTheme} />
          {session.user.role === 'owner' ? (
            <NavLink className="nav-link" to="/users">
              <Icon name="people" />
              ผู้ใช้
            </NavLink>
          ) : null}
          <span className="account-name">{session.user.username}</span>
          <button
            className="text-button"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {isSigningOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        </section>
      </aside>

      <div className="app-content">
        <header className="mobile-topbar">
          <NavLink className="app-brand" to="/" aria-label="My Poxket">
            <Logo />
          </NavLink>
          <ThemeToggle preference={theme} onChange={changeTheme} />
        </header>
        <div id="main-content" tabIndex={-1}>
          <Outlet context={{ session }} />
        </div>
      </div>

      <Link
        aria-label="เพิ่มรายการด่วน"
        className="mobile-quick-add"
        state="quick-add"
        to="/transactions?action=new"
      >
        <Icon name="plus-lg" />
      </Link>

      <nav className="bottom-nav" aria-label="เมนูหลักบนมือถือ">
        {navigation.slice(0, 3).map((item) => (
          <NavLink
            className={({ isActive }) =>
              isActive ? 'bottom-nav-link is-active' : 'bottom-nav-link'
            }
            end={item.path === '/'}
            key={item.path}
            to={item.path}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button
          className={`bottom-nav-link${isMoreActive ? ' is-active' : ''}`}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
          aria-label={
            isMoreActive ? 'เพิ่มเติม — หน้าปัจจุบันอยู่ในเมนูนี้' : 'เพิ่มเติม'
          }
          onClick={(event) => {
            event.currentTarget.focus()
            setMoreOpen(true)
          }}
        >
          <Icon name="three-dots" />
          <span>เพิ่มเติม</span>
        </button>
      </nav>
      {isMoreOpen ? (
        <Modal labelledBy="more-title" onClose={() => setMoreOpen(false)}>
          <div className="form-dialog more-menu">
            <div className="dialog-heading">
              <h2 id="more-title" tabIndex={-1} autoFocus>
                เพิ่มเติม
              </h2>
              <button
                className="icon-button"
                type="button"
                aria-label="ปิดเมนูเพิ่มเติม"
                onClick={() => setMoreOpen(false)}
              >
                <Icon name="x-lg" />
              </button>
            </div>
            <nav className="primary-nav" aria-label="เมนูเพิ่มเติม">
              {secondaryNavigation.map((item) => (
                <NavLink
                  className={({ isActive }) =>
                    isActive ? 'nav-link is-active' : 'nav-link'
                  }
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                >
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <section className="sidebar-account" aria-label="บัญชี">
              <span className="account-name">{session.user.username}</span>
              <button
                className="text-button"
                disabled={isSigningOut}
                onClick={onSignOut}
                type="button"
              >
                <Icon name="box-arrow-right" />
                {isSigningOut ? 'กำลังออก…' : 'ออกจากระบบ'}
              </button>
            </section>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}

function ThemeToggle({
  preference,
  onChange,
}: {
  readonly preference: ThemePreference
  readonly onChange: (preference: ThemePreference) => void
}) {
  const next: ThemePreference =
    preference === 'system'
      ? 'light'
      : preference === 'light'
        ? 'dark'
        : 'system'
  const labels = { system: 'ตามระบบ', light: 'สว่าง', dark: 'มืด' }
  const icons = { system: 'display', light: 'sun', dark: 'moon-stars' } as const
  return (
    <button
      className="theme-toggle icon-button"
      type="button"
      aria-label={`ธีม: ${labels[preference]} — เปลี่ยนเป็น${labels[next]}`}
      title={`ธีม: ${labels[preference]} · กดเพื่อเปลี่ยนเป็น${labels[next]}`}
      onClick={() => onChange(next)}
    >
      <Icon name={icons[preference]} />
    </button>
  )
}
