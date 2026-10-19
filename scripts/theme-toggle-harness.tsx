// Bundled by scripts/check-theme-toggle.mjs. Imports the real components, so the
// test drives the shipped code rather than a copy of it.
import { createRoot, type Root } from 'react-dom/client';
import ThemeToggle from '../components/ThemeToggle';
import { ThemeGate } from '../lib/theme/useTheme';

export function render(host: HTMLElement): Root {
  const root = createRoot(host);
  root.render(
    <ThemeGate>
      <ThemeToggle />
    </ThemeGate>,
  );
  return root;
}
