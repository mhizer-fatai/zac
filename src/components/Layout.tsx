import { ArrowDownToLine, Home, Send, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { cn } from '../lib/format'
import { useWallet } from '../lib/walletContext'
import { useDirectory } from '../lib/directory'
import { Avatar } from './Avatar'
import { Logo } from './Logo'
import { NetworkBadge } from './NetworkBadge'
import { shortAddress } from '../lib/format'

const navItems = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/send', label: 'Send', icon: Send, end: false },
  { to: '/receive', label: 'Receive', icon: ArrowDownToLine, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false }
]

export function Layout() {
  const location = useLocation()
  const { connection, status, connect } = useWallet()
  const { findByAddress } = useDirectory()
  const handle = connection ? findByAddress(connection.address)?.username : undefined

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [location.pathname])

  const walletLabel = connection
    ? handle
      ? `@${handle}`
      : shortAddress(connection.address, 6, 5)
    : null

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand" aria-label="Zac home">
            <Logo />
          </NavLink>
          <nav className="nav-desktop" aria-label="Primary">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => cn('nav-link', isActive && 'is-active')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="topbar-actions">
            {status === 'connected' && connection ? (
              <NavLink to="/settings" className="wallet-chip" title="Wallet settings">
                <Avatar seed={connection.address} label={handle ? `@${handle}` : connection.address} size={28} />
                <span className="wallet-chip-text">{walletLabel}</span>
                <NetworkBadge network={connection.network} />
              </NavLink>
            ) : status === 'checking' ? (
              <span className="wallet-chip is-loading" aria-label="Checking wallet">
                <span className="skeleton-dot" />
                <span className="skeleton-line" />
              </span>
            ) : status === 'unavailable' ? (
              <NavLink to="/settings" className="btn btn-secondary btn-sm">
                Set up wallet
              </NavLink>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void connect().catch(() => {})}>
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo size={22} />
            <p>Private payments, by name.</p>
          </div>
          <div className="footer-links">
            <NavLink to="/privacy">Privacy model</NavLink>
            <NavLink to="/settings">Settings</NavLink>
            <span className="footer-note">Shielded by Zcash · MIT</span>
          </div>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="Primary mobile">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => cn('mobile-nav-item', isActive && 'is-active')}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
