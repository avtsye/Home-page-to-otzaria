# Changelog

## 4.0.10

### Added
- Manual creation of saved book cards without automatically importing currently open tabs.
- Empty saved cards can be created and populated later through library search or open tabs.

### Changed
- Settings panel and controls were realigned to the official Otzaria Material 3 plugin design guide.
- Settings panel now uses the official overlay-panel proportions, theme surfaces, radii and navigation treatment.
- Feedback textarea now expands to fill the available settings viewport instead of using a fixed small box.
- Saved-tab action buttons were rebalanced for clearer proportions.


## 4.0.9

### Added
- Unified right-click context menus across the home page.
- Context actions for books, search results, groups, saved tab sets, installed plugins, quick pins, saved searches, home cards and settings.
- Keyboard navigation and Escape-to-close support for context menus.

### Improved
- Book context menus now expose group/favorites toggles and home pinning.
- Saved-tab context menus expose preview/open-all/edit/update/export/delete actions.
- Plugin context menus expose open and favorite toggles.
- Group context menus expose scoped search, pinning, group management and deletion.
- Saved-tab cards continue to exclude plugin/tool tabs using Otzaria's official `toolId` / book-tab state.


## 4.0.8

### Added
- Right-click context menu for saved book sets with open/select, update positions, export, edit, and delete actions.
- Partial opening and stronger management of saved book sets inspired by the attached reference plugin.
- Book-only filtering for saved sets so plugin/tool tabs are never stored.

### Fixed
- Restored external links in the About screen.
- Stabilized saved-tab initialization so one failed feature can no longer break the entire home page.
- Fixed feedback/settings layout sizing and saved-tab visibility.
- Balanced saved-tab toolbar button sizes.


## 4.0.7

### Added
- Saved tab sets: save multiple open books as one card and reopen them together.
- Preview saved tab sets before opening, with indicators for books that are already open.
- Edit saved tab sets: rename, reorder books, remove books, add currently open tabs, and search the library to add books manually.
- Choose whether already-open books keep their current position or restore the saved position.
- General undo support for user changes such as groups, favorites, pins, saved searches, and saved-tab actions.
- Official OtzariaIcons and FluentUI System Icons rendering for installed plugin cards.

### Changed
- Reworked the plugin UI to follow Otzaria Material 3 theme roles and UI font.
- Fixed settings scrolling, footer overlap, control alignment, and feedback layout.
- Settings download link now points to the GitHub Releases page.
- Simplified the search field to a single rounded outer border.
- Removed the obsolete project `assets/` icon directory.


## 4.0.6

### Changed
- Added refreshed high-resolution icon assets for project/release presentation.
- Packaging now verifies that the project `assets/` directory is never included inside `.otzplugin` packages.
- GitHub Actions now publishes versioned GitHub Releases with downloadable plugin packages.


## 4.0.5

### Changed
- Settings/About links now open in the system default browser through `app.openUrl`.
- Added the required `app.open_url` permission.
- Removed direct in-WebView navigation for external project links.


## 4.0.4

### Changed
- Rebuilt the Settings screen with five fully separated tabs: General, Appearance, Feedback, Diagnostics and About.
- Moved all settings panes into static HTML instead of creating some of them dynamically at runtime.
- Added a dedicated settings sidebar, contextual footer text and tab-specific save behavior.
- Improved mobile settings layout and reduced visual clutter before store upload.


## 4.0.3

### Changed
- Updated the store description to: "דף בית מתקדם לאוצריא עם חיפוש בתוכן, המשך קריאה, סימניות, מועדפים, קבוצות, תוספים והתאמה אישית מלאה."
- Release package includes and uses the custom plugin icon.
- Store release remains stable and requires Otzaria 0.9.98 or newer.


## 4.0.2

### Changed
- Added a dedicated plugin icon and made it the official manifest icon.
- Included the custom icon in Release, Debug and dev-compat packages.
- Updated the homepage and About UI to display the new plugin icon.


## 4.0.1

### Changed
- Store release now requires Otzaria 0.9.98.
- Live suggestions use broader full-text search and fall back to `search.fullText` when needed.
- GitHub Actions builds a separate 0.9.97 `dev-compat` artifact for development builds that already contain the new API.


## 4.0.0

### Added
- Full-text live search alongside book-title suggestions.
- Search history and saved search profiles.
- Search scope for current book and custom groups.
- Drag & Drop homepage sections and pin-to-top controls.
- Group colors, icons, nested groups, ordering and book movement between groups.
- Custom quick pins for books, groups and favorite plugins.
- Plugin favorites, recent-use sorting, compact list view and lazy loading.
- Focus mode, density, columns, card size, background, accent and corner settings.
- Dashboard cards.
- Memory-only cache.
- Per-section refresh and updated timestamps.
- Diagnostics, compatibility checks and debug log.
- Technical context in feedback reports.
- Detailed feedback categories.
- About page and one-time changelog notice.
- Keyboard shortcuts and accessibility improvements.
- Automated smoke tests.
- Separate debug package that opens diagnostics automatically.

### Fixed
- Runtime initialization failure caused by using `clone` before its declaration.
- New-tab registration no longer removes the `+` button when Library is selected.
- Feedback moved into Settings.
- Packaged builds are committed automatically to `dist/`.

## 3.3.0
- Combined book-name suggestions and full-text suggestions.
- Feedback moved into a dedicated Settings tab.

## 3.2.2
- Fixed fatal JavaScript runtime initialization error.

## 3.2.1
- Fixed `+` registration behavior and hardened UI wiring.

## 3.2.0
- Advanced search UI, modern redesign and complete plugin launcher.

## 3.1.0
- Initial repository release with configurable `+` target and feedback.
