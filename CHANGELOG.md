# Changelog

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
