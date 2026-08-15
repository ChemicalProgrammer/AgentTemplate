# AppScripts-only HTML Service compatibility correction

Build marker: `2.0.0-review.5.2.2-htmlservice-compat`

Replace only `AppScripts.html`.

This is not the same file as the preceding delivery. The block beginning at `renderIndexDiagnostic` was rewritten to remove nested template literals and ternary interpolations from the location rejected by Google Apps Script HTML Service.

Expected verification:

- First lines include `CLIENT_BUILD: 2.0.0-review.5.2.2-htmlservice-compat`.
- Total length: 2,546 lines.
- The `renderIndexDiagnostic` block uses `var driveAvailability` and `var fileSummary`; it no longer begins with an interpolated backtick expression.

Replacing this browser file does not alter Drive files or Gemini/File Search indexes.
