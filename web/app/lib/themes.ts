/**
 * The themes a reader can choose between.
 *
 * Only metadata lives here. Every colour value is in `app/themes.css`, under a
 * `[data-theme="<id>"]` block, because Tailwind needs the palettes as CSS custom
 * properties and duplicating them into TypeScript would only give the two copies
 * a chance to disagree. `themes.test.ts` asserts this list and that file agree.
 *
 * `appearance` is not decoration: it decides whether `<html>` also gets the
 * `dark` class, which is what keeps shadcn's own `dark:` rules working.
 */
export interface Theme {
  id: string;
  label: string;
  appearance: "light" | "dark";
}

export const THEMES: Theme[] = [
  { id: "paper", label: "Paper", appearance: "light" },
  { id: "everforest-light", label: "Everforest Light", appearance: "light" },
  { id: "rose-pine-moon", label: "Rosé Pine Moon", appearance: "dark" },
  { id: "nord", label: "Nord", appearance: "dark" },
  // The id predates the light variant, and it is in readers' cookies; only the
  // label changed, because "Everforest" alone no longer says which one it is.
  { id: "everforest", label: "Everforest Dark", appearance: "dark" },
  { id: "tokyo-night", label: "Tokyo Night", appearance: "dark" },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", appearance: "dark" },
];

/** The palette the app was designed in (DESIGN.md §4), and the fallback. */
export const DEFAULT_THEME = THEMES[0];

/**
 * Every role a palette must fill. A theme that misses one would inherit whatever
 * the previous theme set, so the test treats a missing role as a failure rather
 * than letting it fall through.
 */
export const THEME_ROLES = [
  "paper",
  "paper-raised",
  "ink",
  "hairline",
  "accent-surface",
  "accent-ink",
  "on-accent",
  "danger",
  "success",
  "scrim",
] as const;

/** A cookie value is arbitrary text until it matches something we ship. */
export function resolveTheme(id: string | null | undefined): Theme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
}

/**
 * What a theme puts on `<html>`.
 *
 * Two things, not one. `data-theme` selects the palette; the `dark` class is
 * there because shadcn's own components carry `dark:` rules — the `aria-invalid`
 * rings in `button.tsx` and `input.tsx` — and those key off the class, not the
 * attribute. A dark palette without the class renders correctly right up until a
 * form field goes invalid.
 *
 * Accepts `undefined` because `Layout` also renders the error boundary, where
 * the root loader never ran and there is no theme to read.
 */
export function themeAttributes(theme: Theme | undefined): {
  "data-theme": string;
  className?: string;
} {
  const resolved = theme ?? DEFAULT_THEME;
  return {
    "data-theme": resolved.id,
    className: resolved.appearance === "dark" ? "dark" : undefined,
  };
}

/**
 * Repaint the page in a theme without waiting for the server.
 *
 * The switch is a form post, so the authoritative change comes from the root
 * loader re-running with the new cookie. That is a round trip, and a colour
 * scheme that lags a click by even a moment feels broken, so the picker calls
 * this first. It sets exactly what the server would, which is what stops the
 * page flipping a second time when the real answer arrives.
 *
 * Browser only: there is no `document` on the server.
 */
export function applyTheme(theme: Theme): void {
  const { className } = themeAttributes(theme);
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.classList.toggle("dark", className === "dark");
}
