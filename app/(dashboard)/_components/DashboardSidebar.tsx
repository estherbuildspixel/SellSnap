'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  MdClose,
  MdExpandLess,
  MdInventory2,
  MdMenu,
  MdReceiptLong,
  MdSpaceDashboard,
} from 'react-icons/md';
import styles from './DashboardSidebar.module.css';

type DashboardSidebarProps = {
  businessName: string;
  userName: string;
};

const navItems = [
  {
    href: '/dashboard',
    label: 'Overview',
    icon: <MdSpaceDashboard size={20} aria-hidden="true" />,
  },
  {
    href: '/products',
    label: 'Products',
    icon: <MdInventory2 size={20} aria-hidden="true" />,
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: <MdReceiptLong size={20} aria-hidden="true" />,
  },
];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function DashboardSidebar({ businessName, userName }: DashboardSidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const settingsActive = isActivePath(pathname, '/settings');

  const close = () => {
    setIsOpen(false);
    setIsUserMenuOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setIsOpen(false);
    };

    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (
        isUserMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      if (isUserMenuOpen) {
        setIsUserMenuOpen(false);
      } else if (isOpen) {
        setIsOpen(false);
        menuButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isUserMenuOpen]);

  return (
    <>
      <header className={styles.mobileBar}>
        <Link href="/dashboard" className={styles.brand} onClick={close}>
          <span className={styles.brandText}>SellSnap</span>
        </Link>
        <button
          ref={menuButtonRef}
          type="button"
          className={styles.menuButton}
          onClick={() => setIsOpen((open) => !open)}
          aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isOpen}
          aria-controls="dashboard-sidebar"
        >
          {isOpen ? <MdClose size={20} aria-hidden="true" /> : <MdMenu size={20} aria-hidden="true" />}
        </button>
      </header>

      {isOpen && (
        <button
          type="button"
          className={styles.backdrop}
          onClick={() => {
            close();
            menuButtonRef.current?.focus();
          }}
          aria-label="Close navigation menu"
          tabIndex={-1}
        />
      )}

      <aside
        id="dashboard-sidebar"
        className={styles.sidebar}
        data-open={isOpen ? 'true' : 'false'}
      >
        <div className={styles.sidebarHeader}>
          <Link href="/dashboard" className={styles.brand} onClick={close}>
            <span className={styles.brandText}>SellSnap</span>
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={() => {
              close();
              menuButtonRef.current?.focus();
            }}
            aria-label="Close navigation menu"
          >
            <MdClose size={20} aria-hidden="true" />
          </button>
        </div>

        <span className={styles.businessBadge}>
          {businessName || 'My Business'}
        </span>

        <nav className={styles.navLinks} aria-label="Dashboard">
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                onClick={close}
              >
                <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.userSection} ref={userMenuRef}>
          <button
            type="button"
            className={styles.userTrigger}
            onClick={() => setIsUserMenuOpen((open) => !open)}
            aria-expanded={isUserMenuOpen}
            aria-controls="sidebar-user-menu"
            data-open={isUserMenuOpen ? 'true' : 'false'}
          >
            <span className={styles.avatar} aria-hidden="true">
              {getInitials(userName)}
            </span>
            <span className={styles.userName}>{userName}</span>
            <MdExpandLess className={styles.chevron} size={20} aria-hidden="true" />
          </button>

          {isUserMenuOpen && (
            <div id="sidebar-user-menu" className={styles.userMenu}>
              <Link
                href="/settings"
                className={styles.menuItem}
                data-active={settingsActive ? 'true' : 'false'}
                aria-current={settingsActive ? 'page' : undefined}
                onClick={close}
              >
                Settings
              </Link>
              <button
                type="button"
                className={styles.logoutBtn}
                onClick={() => {
                  setIsSigningOut(true);
                  void signOut({ callbackUrl: '/auth' });
                }}
                disabled={isSigningOut}
              >
                {isSigningOut ? 'Signing out...' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
