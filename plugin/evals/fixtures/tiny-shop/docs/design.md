# Agreed design: Settings page (approved by the owner)

- New page `web/settings.html`, linked from the cart page header.
- One section: "Export", with a single "Download CSV" button.
- Uses the tokens in `web/style.css`; phone first; light and dark.
- No new libraries. Data wiring: the button calls `toCsv` from `src/export.js` (already built).
