'use client';

// Switches the app between dark and light. The icon shows what you get if you press
// it, and the current mode is announced to screen readers rather than shown twice.

import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme/useTheme';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const light = theme === 'light';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={light ? 'Switch to dark mode' : 'Switch to light mode'}
      aria-pressed={light}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
      className="icon-btn"
    >
      {light ? (
        <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      ) : (
        <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      )}
    </button>
  );
}
