import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Menu, GraduationCap, Sun, Moon } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { useDarkMode } from '@/contexts/DarkModeContext'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [desktopCollapsed, setDesktopCollapsed] = useState(
    () => localStorage.getItem('sidebar-collapsed') === 'true'
  )
  const { isDark, toggle } = useDarkMode()

  const handleDesktopToggle = () => {
    setDesktopCollapsed(prev => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* ── Mobile top bar (hidden on desktop) ─────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-white border-b border-gray-200 shadow-sm">
        <button
          onClick={() => setMobileOpen(true)}
          className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-green-500 rounded-lg flex items-center justify-center">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-gray-900">pqLAB</span>
        </div>

        <button
          onClick={toggle}
          className="ml-auto p-1.5 rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label={isDark ? 'Ativar light mode' : 'Ativar dark mode'}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* ── Body row ────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        <Sidebar
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          desktopCollapsed={desktopCollapsed}
          onDesktopToggle={handleDesktopToggle}
        />
        <main className="flex-1 min-w-0 overflow-auto">
          <div className="p-6 lg:p-8 max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
