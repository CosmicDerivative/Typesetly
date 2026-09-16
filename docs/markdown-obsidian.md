# Markdown and Obsidian

## Import

On Home, choose **Import Markdown files** for `.md` / `.markdown` notes,
or **Import vault folder (copy)** for an Obsidian vault or a manuscript
subfolder. The same controls are available under **Book profile**.
Imports create a separate manuscript and never modify the originals.
Each note becomes one chapter, in natural filename order (2 before 10).
Use numbered filenames to specify manuscript order.

Standard headings, emphasis, lists, quotes, links, fenced code, and tables
are parsed. YAML frontmatter is omitted from chapter prose. Obsidian
wikilinks and aliases are retained as Obsidian links. Local PNG, JPEG,
GIF, and WebP attachments are included when selecting the folder containing
them. Missing or ambiguous image references remain visible as Markdown;
remote images are not fetched. Hidden directories such as `.obsidian` and
`.trash` are ignored. Note/PDF transclusions and plugin queries are not run.

## Two-way sync (desktop)

Choose **Connect Obsidian vault**, preferably selecting just the folder
containing your manuscript notes. Connecting from Home creates a book;
connecting from Book profile appends notes to the current book. Existing
unrelated chapters are not sent to the vault.

Use **Book profile → Sync now** after making changes. This is explicit,
manual sync, not a background watcher or an Obsidian plugin:

- Vault edits update linked chapters.
- Typesetly edits update linked Markdown notes, retaining exact frontmatter.
- New vault notes are imported.
- Chapters created after connection are written to `Typesetly/` in the
  chosen folder with collision-resistant filenames.
- Renames and deletions are not propagated. Missing notes/chapters retain
  their mapping so sync does not resurrect deleted work.
- Before overwriting a note, its original is saved in `.typesetly-backups`.
  Backup filenames include the original note name. Restore by copying a
  backup to the original note path after reviewing both versions.
- A note changed since the read is not overwritten. Retry sync to reconcile.
- When both sides changed, an **Obsidian conflict** chapter preserves the
  vault version, and the original chapter keeps the local version. That
  mapping remains write-protected on subsequent syncs. In Book profile,
  choose **Keep Typesetly version** followed by Sync now, or **Use current
  vault version**. Conflict copies remain available for reference. A new
  external edit still triggers conflict protection after your choice.

The rich-text editor cannot losslessly represent all Obsidian constructs.
Notes containing images, task lists, callouts, comments, math, highlights,
block references, footnotes, raw HTML, or pipe tables are protected from
automatic write-back. They can still be imported/read; sync reports why a
write was skipped. Use a separate export for review. Disconnecting never
deletes vault files. Keep your normal vault backups as well.

## Export

**Book profile → Export Markdown ZIP** exports chapters as Markdown files
and packages available inline images in `assets/`. Linked notes keep their
relative paths and frontmatter. Unchanged linked text notes retain their
original Markdown. This is a content interchange format, not a lossless
backup of Typesetly layouts, generated front matter, or special blocks;
keep a Typesetly snapshot for those features.

Folder imports/sync are limited to 2,000 notes, 100 MB total, and 20 MB per
file. Symbolic links are not traversed by desktop sync. A saved vault requires
permission again when reopening the desktop application.

## Verification

`npm run verify` runs Markdown parser/round-trip/conflict regression tests,
filesystem precondition, backup, traversal and collision tests, all existing
tests, lint, and the production build. Browser smoke checks also cover importing
a Markdown file into the editor and downloading the ZIP from Book profile.

Syntax references: [Obsidian links](https://obsidian.md/help/links) and
[properties](https://obsidian.md/help/properties).
