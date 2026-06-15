# Ask Pastor Daniel Knowledge Pack

This directory contains the backend-ready knowledge foundation derived from
the supplied source documents.

## Contents

- `CONVICTIONS.md`: controlling theological summary and unresolved positions
- `VOICE_GUIDE.md`: reasoning, tone, structure, and style guidance
- `ASSISTANT_INSTRUCTIONS.md`: system-level identity, grounding, and safety rules
- `manifest.json`: source-document metadata and extraction statistics
- `*.json`: extracted text preserved by source and page

## Source Priority

1. `Statement of Faith`
2. Explicit first-person position statements in the books
3. Repeated teaching across multiple books
4. Exploratory discussions and descriptions of other theological views

An exploratory presentation of a view must not be mistaken for Pastor Daniel's
own conviction.

## Recommended Retrieval Metadata

Every searchable chunk should retain:

- `document_id`
- `title`
- `page_start`
- `page_end`
- `text`
- `source_file`
- `source_role`: `controlling`, `primary`, or `reference`

Retrieve from both the controlling guides and source documents. Answers should
cite source titles and page numbers.

Reference sources may inform research and comparison, but must never be treated
as Pastor Daniel's own words or convictions without confirmation from a
controlling or primary source.

## Important Limitation

PDF extraction preserves page references but may introduce spacing or line-break
artifacts. Always consult the original PDF before publishing an exact quotation.
