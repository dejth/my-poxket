import { Link, NavLink, Outlet } from 'react-router-dom'

import type { SessionData } from './api'

interface AppShellProps {
  readonly isSigningOut: boolean
  readonly onSignOut: () => void
  readonly session: SessionData
}

const navigation = [
  { label: 'ภาพรวม', path: '/' },
  { label: 'รายการ', path: '/transactions' },
  { label: 'บัตร', path: '/credit-cards' },
  { label: 'ผ่อน', path: '/installments' },
  { label: 'ประจำ', path: '/recurring-expenses' },
  { label: 'หมวดหมู่', path: '/categories' },
] as const

export function AppShell({ isSigningOut, onSignOut, session }: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <NavLink className="app-brand" to="/" aria-label="My Poxket">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>My Poxket</span>
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
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="account-name">{session.user.username}</span>
          <button
            className="text-button"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {isSigningOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        </div>
      </aside>

      <div className="app-content">
        <header className="mobile-topbar">
          <NavLink className="app-brand" to="/" aria-label="My Poxket">
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            <span>My Poxket</span>
          </NavLink>
          <button
            className="text-button"
            disabled={isSigningOut}
            onClick={onSignOut}
            type="button"
          >
            {isSigningOut ? 'กำลังออก…' : 'ออกจากระบบ'}
          </button>
        </header>
        <Outlet context={{ session }} />
      </div>

      <Link
        aria-label="เพิ่มรายการด่วน"
        className="mobile-quick-add"
        to="/transactions?action=new"
      >
        <span aria-hidden="true">+</span>
      </Link>

      <nav className="bottom-nav" aria-label="เมนูหลักบนมือถือ">
        {navigation.map((item) => (
          <NavLink
            className={({ isActive }) =>
              isActive ? 'bottom-nav-link is-active' : 'bottom-nav-link'
            }
            end={item.path === '/'}
            key={item.path}
            to={item.path}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
