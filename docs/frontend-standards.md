# Frontend Standards

## Mandatory Stack
- Frontend stack is fixed to `React + Vite + Tailwind CSS + Ant Design`.
- `Ant Design ProComponents` is allowed and preferred when it clearly improves admin-console scenarios.
- Tailwind is only for layout and structural styling. Primary interaction and visual components must come from Ant Design first.

## Component Priority
- Always use mature open source components before building custom UI.
- Default priority is `Ant Design` -> `ProComponents` -> narrowly scoped wrappers around those components.
- Custom components are only allowed when existing components cannot meet the requirement cleanly.
- Custom wrappers must not create a second design system. They must reuse the global theme token, spacing, radius, and feedback conventions.

## Routing And Navigation
- Navigation must be route-driven. Menu data must come from the central route metadata.
- The application shell must support first-level groups and collapsible second-level menus.
- Every second-level menu maps to an independent page route. Do not stack multiple business domains into one page.

## Page Structure
- List pages should follow `filters + table/list + detail form/drawer`.
- Cross-domain information cannot be mixed into the same page.
- Tabs are only allowed inside the same business domain.
- Forms, tables, drawers, modals, messages, notifications, and result states should all use Ant Design components first.

## Code Hygiene
- Remove obsolete components, styles, and helpers once the new equivalent is live.
- Do not keep unused primitives, duplicate page shells, or one-off style systems.
- Shared context, API client, route metadata, and theme tokens must stay centralized.
- New frontend work should extend the current architecture instead of adding parallel implementations.
- Do not keep multiple active logic paths for the same feature. Remove superseded flows in the same iteration when safe.
- Record architecture-impacting iterations in `docs/iteration-log.md`.

## Project Prompt
- Repository-wide engineering rules live in `docs/project-prompt.md`.
- Treat that document as the default prompt for consistency, cleanup discipline, and iteration recordkeeping.
