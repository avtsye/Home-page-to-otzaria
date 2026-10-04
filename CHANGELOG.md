# Changelog

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
