---
name: Applica Executive
colors:
  surface: '#FAF9F9'
  surface-dim: '#dadada'
  surface-bright: '#faf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f3'
  surface-container: '#eeeeed'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1A1C1C'
  on-surface-variant: '#414849'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f0f0'
  outline: '#717879'
  outline-variant: '#C1C8C9'
  surface-tint: '#446469'
  primary: '#123338'
  on-primary: '#ffffff'
  primary-container: '#2a4a4f'
  on-primary-container: '#97b9be'
  inverse-primary: '#abccd2'
  secondary: '#735c00'
  on-secondary: '#ffffff'
  secondary-container: '#fed65b'
  on-secondary-container: '#745c00'
  tertiary: '#3d2c06'
  on-tertiary: '#ffffff'
  tertiary-container: '#56421b'
  on-tertiary-container: '#cbaf7e'
  error: '#BA1A1A'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c6e9ef'
  primary-fixed-dim: '#abccd2'
  on-primary-fixed: '#001f24'
  on-primary-fixed-variant: '#2c4c51'
  secondary-fixed: '#ffe088'
  secondary-fixed-dim: '#e9c349'
  on-secondary-fixed: '#241a00'
  on-secondary-fixed-variant: '#574500'
  tertiary-fixed: '#fddfa9'
  tertiary-fixed-dim: '#dfc390'
  on-tertiary-fixed: '#261900'
  on-tertiary-fixed-variant: '#57441c'
  background: '#faf9f9'
  on-background: '#1a1c1c'
  surface-variant: '#E3E2E2'
  linkedin-blue: '#0A66C2'
  success-green: '#10B981'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '900'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  display-lg-light:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '300'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.3'
  title-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '900'
    lineHeight: '1.0'
    letterSpacing: 0.1em
  label-bold:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1.0'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 24px
  xl: 32px
  container-margin: 24px
  gutter: 16px
---

## Brand & Style
Applica is a premium, executive-tier job platform designed for high-stakes career moves in Tech and Finance. The brand personality is **Sophisticated, Exclusive, and Efficient**. It avoids the cluttered "job board" aesthetic in favor of a curated, high-end gallery feel.

The design style is **Corporate Modern with Glassmorphism accents**. It utilizes a "Quiet Luxury" palette—deep forest greens and muted golds—combined with generous whitespace, high-quality professional photography, and subtle translucent layers (glass panels) to create a sense of depth and elite status. The interface should feel like a bespoke concierge service rather than a utility tool.

## Colors
The palette is rooted in **Deep Forest (#2A4A4F)** and **Muted Gold (#D4AF37)**. 

- **Primary (Deep Forest):** Used for brand identity, primary actions, and core headings. It conveys stability and authority.
- **Secondary (Muted Gold):** Used sparingly for "Premium" labels, specific highlights, and accent icons. It signals exclusivity.
- **Neutral (Warm Grey):** The background uses a slightly warm off-white (#FAF9F9) to reduce eye strain and feel more organic than pure white.
- **Semantic Colors:** LinkedIn blue is retained for platform familiarity, while success green and error red are used for swipe feedback and status alerts.

## Typography
The system relies exclusively on **Inter** to maintain a clean, systematic, and highly legible appearance across all density levels. 

- **Contrast is key:** Use a mix of `300` (Light) and `900` (Black) weights for headlines to create a modern editorial feel. 
- **Tracking:** Tighten tracking slightly for large display text (-0.02em) and increase tracking for uppercase labels (+0.1em) to ensure a premium look.
- **Hierarchy:** Primary roles and company names should be high-contrast, while secondary metadata (location, date) uses lower contrast variants.

## Layout & Spacing
The layout follows a **Mobile-First Fixed Grid** philosophy for the core swipe experience, centered on a 3:4.5 aspect ratio card.

- **Safe Areas:** A 24px horizontal margin is standard for all views.
- **Top/Bottom Bars:** 64px fixed height for top navigation and 72px for bottom navigation (including safe area insets).
- **Stacking:** Cards are stacked vertically with a 4px/8px translation to indicate depth in the deck.
- **Responsive:** On larger screens, the main content container is capped at 448px (max-width: md) to preserve the intimate, app-like feel.

## Elevation & Depth
Elevation is primarily handled through **Tonal Layering** and **Soft Ambient Shadows**.

- **Level 1 (Cards):** Uses `shadow-xl` with a high blur radius and low opacity (approx. 10-15%) to make cards feel like they are floating above the surface.
- **Level 2 (Modals):** Full-screen overlays use a 0.8 opacity white background with an 8px backdrop blur (Glassmorphism) to maintain context.
- **Level 3 (Buttons):** Primary buttons use a subtle `shadow-md` to provide a tactile "pressable" appearance.
- **Outlines:** Use 1px `outline-variant` (#C1C8C9) for secondary containers and inputs instead of shadows to keep the UI clean.

## Shapes
The shape language is consistently **Rounded**, balancing approachability with professional structure.

- **Base Components:** 8px (default) for inputs and small cards.
- **Large Cards:** 16px (rounded-2xl) for job cards to give them a distinct, tactile feel.
- **Buttons/Chips:** Full pill-shaped (9999px) for primary actions and tags to distinguish them from structural containers.
- **Images:** Always use a minimum of 12px (rounded-xl) for profile or company imagery.

## Components

### Buttons
- **Primary:** Full-width, pill-shaped, #2A4A4F background, white text. Includes a 95% scale transform on active state.
- **Secondary:** Surface-variant background with on-surface-variant text.
- **Icon Buttons:** 64x64px circles for main swipe actions, using outlines for "reject" and solid primary for "apply".

### Cards
- **Job Card:** A multi-layered container with a 1/3 height image header, internal padding of 24px, and a footer separated by a subtle border.
- **Status Card:** Small notification cards for "Pendientes" using light semantic background tints (e.g., error-container) and 12px rounded corners.

### Chips & Tags
- **Metadata Tags:** Small, 11px font-weight 700, pill-shaped. Used for "Hybrid" or "Salary" data.
- **Premium Badge:** High-contrast primary background with a gold icon, positioned in the top-right corner of images.

### Input Fields
- **Text Inputs:** 12px padding, 8px rounded corners, 1px outline (#717879). Focus state uses a 1px ring of the primary color.

### Navigation
- **Top Nav:** Minimalist, 64px height, white background with a bottom border-variant.
- **Bottom Nav:** Iconic navigation with 28px Material Symbols. Active state fills the icon and bolds the label.