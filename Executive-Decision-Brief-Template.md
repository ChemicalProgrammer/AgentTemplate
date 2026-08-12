---
template_id: greenlight.executive-decision-brief-template
name: Executive Decision Brief Template
version: 1.0.0
target: Google Docs
agent: Project Greenlight Agent
source_format: markdown_blueprint
---

# Executive Decision Brief Template

## Purpose

Use this text-only blueprint to create the native Google Docs template inside the organization's Google Workspace environment. The Markdown file is safe to store and review in a source-code repository, but it is not added directly to Workspace Templates.

The native Google Doc created from this blueprint must be added at:

`Templates and Output Formats > Workspace Templates > Add agent asset from Drive`

## Supported Placeholders

The application version 1.9.0 supports exactly these placeholders:

- `{{REPORT_TITLE}}`
- `{{PROJECT_TITLE}}`
- `{{GENERATED_DATE}}`
- `{{CONTENT}}`

Keep the spelling, capitalization, underscores, and double braces unchanged. Use each placeholder exactly once.

## Copy into a Blank Google Doc

Copy the following lines into a Google Doc created inside the organization's Drive:

```text
{{REPORT_TITLE}}

Executive Decision Brief

Project: {{PROJECT_TITLE}}
Generated: {{GENERATED_DATE}}

{{CONTENT}}
```

## Recommended Google Docs Formatting

Apply the following formatting manually:

| Element | Formatting |
| --- | --- |
| `{{REPORT_TITLE}}` | Arial, 26 pt, regular, black |
| `Executive Decision Brief` | Arial, 12 pt, regular, dark gray |
| `Project:` and `Generated:` labels | Arial, 10 pt, bold, dark gray |
| Metadata values | Arial, 10 pt, regular, dark gray |
| `{{CONTENT}}` | Arial, 11 pt, regular, black, 1.15 line spacing |
| Page setup | Letter, portrait, 1-inch margins |

Do not add a line, border, or underline below the report title.

## Registration Steps

1. Create a blank Google Doc using the corporate Google Workspace account.
2. Paste the template body from this file.
3. Apply the recommended formatting.
4. Name the document `Executive Decision Brief Template`.
5. Keep the document inside the approved organizational Drive location.
6. In the Agent Builder, open `Templates and Output Formats > Workspace Templates`.
7. Select `Add agent asset from Drive` and provide the Google Doc link.
8. Use this note: `Formats the Executive Decision Brief for decision-maker review and optional PDF export.`

## Validation Checklist

- The file is a native Google Doc.
- All four supported placeholders are present.
- Each placeholder appears exactly once.
- No placeholder has been translated or reformatted internally.
- The document contains no confidential project data.
- The original template remains unchanged when a report is generated.
- A test report replaces all four placeholders.

## Known Version 1.9.0 Boundary

The current application replaces the four supported placeholders with plain generated text. It does not map individual brief fields to separate placeholders and does not automatically convert Markdown headings inside `{{CONTENT}}` into native Google Docs heading styles.

