

# Dark Mode + Accessibility Assessment

## Is dark mode a good decision?

Yes. Here's why it fits SafeDeal specifically:

1. **Already half-built**: The project already has `.dark` CSS variables defined in `index.css` (lines 58-94), `darkMode: ["class"]` in `tailwind.config.ts`, and `next-themes` is installed. The infrastructure is ready -- we just need to wire it up.

2. **Nigerian market context**: Many Lagos users browse on OLED phones where dark mode saves battery. Late-night browsing is common. It's a practical feature, not just aesthetic.

3. **Accessibility**: Reduces eye strain for photosensitive users. Pairs well with SafeDeal's trust-first brand -- showing you care about user comfort.

4. **Cost**: Since all shadcn/ui components already use CSS variables (`bg-background`, `text-foreground`, etc.), dark mode works automatically across every screen with zero per-component effort. Building the landing page with these tokens means every future screen inherits dark mode for free.

## Implementation approach

- Use `next-themes` `ThemeProvider` wrapping the app in `App.tsx`
- Create a small `ThemeToggle` component (Sun/Moon icon button)
- Persists user preference to `localStorage` automatically
- Respects system preference by default (`system` → `light` → `dark` cycle)

## Where should the dark mode toggle go?

**Header navbar, right side, next to the Login/Sign Up buttons.** Specifically:

```text
[SafeDeal Logo]  [How it Works]  [Protection]  [FAQ]  |  [🌙] [Login] [Sign Up]
```

- On desktop: icon button (Sun/Moon) in the header, left of auth buttons
- On mobile: inside the hamburger Sheet menu, as a row with label "Dark Mode" and a toggle switch

This placement ensures:
- Visible on every page (header is shared across all screens)
- Doesn't clutter the UI (single icon)
- Accessible on mobile without extra navigation

## Should we add an audio button?

I'd recommend **not** adding an audio/screen-reader toggle button. Here's why:

- Screen readers (JAWS, NVDA, VoiceOver, TalkBack) are OS-level tools that users already have configured. Adding a custom audio button would conflict with or duplicate their existing setup.
- The better accessibility investment is proper semantic HTML (`aria-labels`, heading hierarchy, focus management, alt text) which we should do anyway.
- A "read aloud" button for sighted users with reading difficulties could be added later as a nice-to-have, but it adds complexity and isn't standard for MVP fintech products.

## Updated plan addition

Add to the landing page implementation:

1. Wrap `App.tsx` with `ThemeProvider` from `next-themes` (attribute: `class`, default: `system`)
2. Create `src/components/ThemeToggle.tsx` -- Sun/Moon icon button using Lucide icons
3. Place in `Header.tsx` (desktop: icon in nav bar, mobile: toggle row in Sheet menu)
4. Dark mode colors will use the existing `.dark` variables in `index.css`, updated to match SafeDeal brand palette alongside the light theme updates

No audio button for MVP. Proper semantic HTML and ARIA attributes instead.

