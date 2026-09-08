import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import type { SessionData } from './api'
import { Modal } from './Modal'

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

const mobileIcons = [
  'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  'M4 6h16M4 12h16M4 18h16',
  'M3 5h18v14H3ZM3 10h18',
]

export function AppShell({ isSigningOut, onSignOut, session }: AppShellProps) {
  const [isMoreOpen, setMoreOpen] = useState(false)
  const { pathname } = useLocation()
  const secondaryNavigation = [
    ...navigation.slice(3),
    ...(session.user.role === 'owner'
      ? [{ label: 'ผู้ใช้', path: '/users' }]
      : []),
  ]
  const isMoreActive = secondaryNavigation.some(
    (item) => pathname === item.path,
  )
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>
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
          {session.user.role === 'owner' ? (
            <NavLink className="nav-link" to="/users">
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
        <span aria-hidden="true">+</span>
      </Link>

      <nav className="bottom-nav" aria-label="เมนูหลักบนมือถือ">
        {navigation.slice(0, 3).map((item, index) => (
          <NavLink
            className={({ isActive }) =>
              isActive ? 'bottom-nav-link is-active' : 'bottom-nav-link'
            }
            end={item.path === '/'}
            key={item.path}
            to={item.path}
          >
            <svg
              aria-hidden="true"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={mobileIcons[index]} />
            </svg>
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
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <circle cx="5" cy="12" r="1" />
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
          </svg>
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
                ×
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
                {isSigningOut ? 'กำลังออก…' : 'ออกจากระบบ'}
              </button>
            </section>
          </div>
        </Modal>
      ) : null}
    </div>
  )
}
