import { BookOpen, Search, X } from 'lucide-react'
import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import './Wiki.css'

interface WikiProps {
  onClose: () => void
}

interface WikiEntry {
  question: string
  answer: string
  keywords?: string
}

interface WikiSection {
  id: string
  title: string
  description: string
  entries: WikiEntry[]
}

const WIKI_SECTIONS: WikiSection[] = [
  {
    id: 'start',
    title: 'Getting started',
    description: 'The basic Typesetly workflow and where your work is stored.',
    entries: [
      {
        question: 'What is the recommended workflow?',
        answer: 'Create or open a book, write in Draft, develop characters and continuity in Plan, arrange the manuscript in Organize, choose a book theme in Design, and inspect and export the finished book in Publish. You can move between workspaces at any time.',
        keywords: 'workflow first book begin',
      },
      {
        question: 'Does Typesetly save automatically?',
        answer: 'Yes. Manuscript and project changes are saved into the local IndexedDB library automatically. The saved indicator reports the current state. A downloaded snapshot is still recommended because clearing browser data, deleting an application profile, or losing the drive can remove local data.',
        keywords: 'autosave local indexeddb storage saved',
      },
      {
        question: 'Does Typesetly require an account or internet connection?',
        answer: 'No account is required and ordinary writing, organization, design, preview, and export work locally. Installing dependencies and packaging the desktop application can require internet access.',
        keywords: 'offline privacy account cloud internet',
      },
      {
        question: 'How do I create, duplicate, or remove a book?',
        answer: 'Return to the library by selecting the Typesetly logo. Use New book to create a project. Each library card provides actions for opening, duplicating, editing details, or removing a project.',
        keywords: 'library home new duplicate delete project',
      },
    ],
  },
  {
    id: 'workspaces',
    title: 'The five workspaces',
    description: 'Each workspace is dedicated to a different stage of production.',
    entries: [
      {
        question: 'What is Draft for?',
        answer: 'Draft is the focused writing workspace. It contains the rich-text toolbar, page metadata, manuscript editor, save status, word count, DOCX export, and writing timer.',
        keywords: 'draft write editor toolbar',
      },
      {
        question: 'What is Plan for?',
        answer: 'Plan is the full-page Story Studio for characters, worldbuilding, series continuity, live manuscript mentions, sticky-note links, and the relationship Mind map. Its controls and typography are sized for focused planning. From Plan, choose Open beside Draft when you want the compact Story reference drawer while writing, or use the Plan command on the shelf to open that drawer without leaving Draft.',
        keywords: 'plan story studio full page character worldbuilding continuity mind map',
      },
      {
        question: 'What is Organize for?',
        answer: 'Organize displays Opening pages, Main text, and Closing pages as a structure board. Drag compatible pages to reorder them. Drag a scene within its chapter or onto another chapter to move it. In the Manuscript map, use the plus button on any chapter to append a scene, or expand the active chapter and use its insertion controls to add a scene at an exact position. Manuscript folders can group drafts, alternate scenes, or research without adding headings or changing export order. The trash target accepts removable pages and non-final scenes.',
        keywords: 'organize board reorder drag drop structure',
      },
      {
        question: 'What is Design for?',
        answer: 'Design manages reusable book themes. Themes control body typography, paragraph treatment, headings, scene ornaments, notes, trim size, margins, running headers, page numbers, and other output-facing choices.',
        keywords: 'design theme formatting typography margins',
      },
      {
        question: 'What is Publish for?',
        answer: 'Publish provides the full reader-proof canvas, device controls, export preflight, and EPUB and PDF export. Use it to inspect the active page with the selected theme before producing files.',
        keywords: 'publish proof preview export epub pdf',
      },
    ],
  },
  {
    id: 'structure',
    title: 'Pages, parts, and scenes',
    description: 'Build and navigate a structured manuscript.',
    entries: [
      {
        question: 'How do I add front matter or back matter?',
        answer: 'Open the Outline command, then use the menu beside Add chapter. Choose an available opening or closing page. Required Title Page, Copyright, and Contents pages are protected; optional matter can be moved to Trash.',
        keywords: 'front opening back closing matter add page',
      },
      {
        question: 'How do Parts work?',
        answer: 'A Part groups body chapters. Add one from the Outline menu or Organize workspace. In the outline, drop a chapter onto a Part to nest it. Reorder Parts and chapters by dragging above or below compatible targets.',
        keywords: 'part volume nest chapter',
      },
      {
        question: 'How do I create and rename scenes?',
        answer: 'Open a chapter in the Outline and use a scene menu to add a scene before or after, split content, rename, duplicate, move, or delete it. Double-click a page, scene, or manuscript folder name to rename it in place; press Enter to save or Escape to cancel. The same double-click renaming works on page and scene cards in Organize. A chapter always retains at least one scene.',
        keywords: 'scene page folder add rename double click inline split duplicate',
      },
      {
        question: 'How do I change a chapter into a prologue, epilogue, or another page type?',
        answer: 'Open the page menu in the Manuscript map or its gear menu in Draft, then choose Page type. Typesetly preserves the text and moves the page into Opening pages, Main text, or Closing pages as appropriate. Prologues, epilogues, and other matter do not consume chapter numbers. Required Title Page, Copyright, and Contents pages cannot be converted.',
        keywords: 'change page chapter type prologue epilogue front back matter numbering',
      },
      {
        question: 'How does Trash work?',
        answer: 'Deleted pages and scenes are moved to recoverable Trash. Open Trash from the Outline footer to restore items, permanently delete individual items, or empty Trash. Required pages and the last scene in a chapter cannot be trashed.',
        keywords: 'trash restore recover permanent delete',
      },
      {
        question: 'What are master pages?',
        answer: 'A master page is a reusable copy of a page structure. Save the active page as a master from the Outline menu, then add that master to the current book whenever you need the same starting layout.',
        keywords: 'master template reusable page',
      },
      {
        question: 'How do I organize books into a series?',
        answer: 'Open Book profile or use Series details from a library card. Give related books the same series name and assign each a book number. The library can filter and sort those volumes in series order, while Story Studio’s Series scope browses character and world records across every matching book. Records from another volume are read-only until you copy them into the active book. EPUB export includes standards-based collection name and group-position metadata.',
        keywords: 'series saga trilogy sequence order collection continuity multiple books epub',
      },
    ],
  },
  {
    id: 'editor',
    title: 'Writing and special content',
    description: 'Use the manuscript editor without losing structured content.',
    entries: [
      {
        question: 'What formatting is available in Draft?',
        answer: 'The toolbar supports bold, italic, underline, strikeout, headings, alignment, lists, block quotes, links, footnotes, images, page breaks, scene breaks, callouts, text messages, LitRPG interface blocks, verse, hanging indents, and attributed quotations.',
        keywords: 'bold italic link image footnote format',
      },
      {
        question: 'How do smart quotes and dashes work?',
        answer: 'With Smart Punctuation enabled, straight quotation marks are converted as you type. Two consecutive hyphens become an en dash (–), while a third hyphen upgrades it to an em dash (—). Disable Smart Punctuation from the Quotes drawer when you need literal repeated hyphens.',
        keywords: 'smart punctuation quote apostrophe hyphen en dash em dash',
      },
      {
        question: 'How do text messages and callouts work?',
        answer: 'Choose Special block and select the desired block. Text messages can store message text, sender, direction, and iOS or Android appearance. Existing message and callout blocks can be selected and edited without nesting or replacing unrelated text.',
        keywords: 'bubble chat message callout sender',
      },
      {
        question: 'How do I build LitRPG stat screens and system panels?',
        answer: 'Choose the table-shaped LitRPG Block button in the Draft toolbar. Start with Stat screen, System message, Skill selection, or Item information, then customize its title, subtitle, footer, columns, rows, colors, width, spacing, and appearance. After insertion, edit every field directly in Draft, move rows up or down, move columns left or right, or drag the block by its handle. Choose Full builder for structural and visual changes. Structured blocks remain tables in Draft, Preview, and EPUB, with a print-safe rendering in PDF.',
        keywords: 'litrpg stat screen system message skill selection item information table block builder',
      },
      {
        question: 'How do verse, hanging indents, and quotations work?',
        answer: 'Select the intended text before applying these special blocks. The selection is converted into an editable structured block. Its spacing, indentation, border, and quotation style are controlled by the active theme.',
        keywords: 'verse poem hanging indent quotation quote',
      },
      {
        question: 'How do images work?',
        answer: 'Insert an image from the editor, then provide useful alternative text unless it is decorative. Page options support chapter art and full-page images. Export preflight warns about missing descriptions and unsuitable image metadata.',
        keywords: 'image picture alt caption decorative',
      },
      {
        question: 'Can I edit front and back matter?',
        answer: 'Yes. Select any editable matter page from Outline or Organize. Its editor is based on the page type, so a title page, contents page, custom page, and ordinary prose page expose different appropriate fields.',
        keywords: 'front matter back matter edit',
      },
    ],
  },
  {
    id: 'tools',
    title: 'Command shelf and windows',
    description: 'Open, switch, and dismiss supporting tools.',
    entries: [
      {
        question: 'What is the command shelf?',
        answer: 'The shelf above the status bar opens Outline, Review, History, Find, Goals, Plan, Notes, Settings, Quotes, and Proof. Each command toggles its docked panel open or closed beside the manuscript. Plan on the shelf opens the compact Story Studio drawer; the top Plan tab still opens the full-page workspace. An active command is highlighted.',
        keywords: 'shelf dock commands toolbar toggle',
      },
      {
        question: 'How do tool panels stay open?',
        answer: 'Opening Outline docks it as a left column; opening another tool docks it as a right column. The manuscript stays clear and usable—panels do not dim or blur the editor. Typesetly remembers which panels were open across refreshes. Select the same command again or use the X button to close a panel.',
        keywords: 'dock panel open close remember restart refresh window drawer toggle',
      },
      {
        question: 'What happens on a narrow screen?',
        answer: 'Below the compact-width breakpoint, keeping two permanent columns would make the writing canvas unusably narrow. Open panels therefore remain available as overlays until closed, without dimming the editor behind a blur scrim.',
        keywords: 'responsive mobile resize narrow overlay',
      },
      {
        question: 'What is Review?',
        answer: 'Review contains chapter comments and tracked editing sessions. Capture selected text for context, add and resolve comments, and accept or reject pending tracked changes.',
        keywords: 'review comments tracked changes',
      },
      {
        question: 'What is History?',
        answer: 'History stores named versions and recent automatic recovery points. Compare word-level changes before restoring. Restoring replaces manuscript text while preserving current project settings and comments.',
        keywords: 'history revisions restore recovery compare',
      },
      {
        question: 'How does the Story Bible work?',
        answer: 'Open Plan from the top workspace navigation for the full-page Story Studio, or use Plan on the command shelf for a compact reference column while drafting. The Characters tab stores identity, role, appearance, voice, motivation, conflict, arc, relationship notes, notes, and tags. The World tab stores categorized places, cultures, organizations, history, magic, technology, creatures, objects, rules, connection notes, notes, and tags. From the full Plan view, choose Open beside Draft to keep writing with the drawer open. All records save with the book and are included in snapshots.',
        keywords: 'story studio bible character worldbuilding lore planning drawer',
      },
      {
        question: 'How do live mentions and the Mind map work?',
        answer: 'Story Studio scans the current manuscript locally and counts whole-name references for each character and world entry. Character aliases and alternate place names are included. Select a chapter chip to jump to that manuscript page. The Mind map uses explicit relationships you create between any two character or world records; labels remain editable, and deleting a record removes its map links. Typesetly does not invent relationships from prose.',
        keywords: 'live mention mapping alias chapter mind map relationship link graph place',
      },
      {
        question: 'How do Sticky Notes work?',
        answer: 'Open Notes from the command shelf to create color-coded notes for the whole book, a page, a scene, a character, or a worldbuilding record. Attach selection captures highlighted manuscript text as a quoted reference. Note badges in Outline reopen the relevant context, while note buttons in Story open or create a linked note. A Notes drawer stays beside the manuscript until you close it. Linked character and world notes can pull a fresh Story Bible snapshot into the note.',
        keywords: 'sticky note margin selection highlight attach chapter scene character world',
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goals, habits, and focus',
    description: 'Track progress without sending writing data to a service.',
    entries: [
      {
        question: 'What is the difference between a book goal and a habit?',
        answer: 'A book goal tracks progress toward a total word count and optional due date. A writing habit tracks net words added on selected weekdays. Deleting words written that day reduces the daily count, but deleting older prose cannot make daily progress negative or erase manually logged work. The calendar and streak statistics use locally recorded manuscript activity.',
        keywords: 'goal habit streak calendar words',
      },
      {
        question: 'How does the writing timer work?',
        answer: 'Use Timer in the Draft status bar to start or pause a writing sprint. Timer settings let you choose sprint and break durations and reset the current phase.',
        keywords: 'timer sprint pomodoro focus break',
      },
      {
        question: 'What do editor settings affect?',
        answer: 'Editor settings change the Draft experience, including font, size, line height, paragraph appearance, alignment, typewriter scrolling, spellcheck, browser grammar extensions (LanguageTool and similar), automatic recovery timing, and workspace appearance. Grammar extensions are allowed on the active chapter by default and only pause automatically on unusually long chapters. Recovery can be disabled or scheduled from every minute to every hour; unchanged manuscripts do not create duplicate snapshots. Choose from 16 light and dark palettes such as Parchment, Sepia, Solarized Light, Midnight, Forest, Nord, and High Contrast. The selection is saved with the manuscript and does not replace the Design theme used for exported books or the reader appearance selected in Preview.',
        keywords: 'settings font dark spellcheck languagetool recovery snapshots interval typewriter',
      },
      {
        question: 'Why does Draft show stacked pages?',
        answer: 'Draft shows the active chapter as a scrollable stack of page sheets sized from your Design theme trim and margins, similar to Google Docs. Each sheet is its own editor field (so browser grammar extensions see one page at a time), while Typesetly still saves a single chapter. Writing can flow across pages with arrow keys and overflow; Export and Proof still use the full print/ebook layout engine.',
        keywords: 'pages draft google docs sheets trim margins scroll languagetool',
      },    ],
  },
  {
    id: 'design-preview',
    title: 'Design and reader proofing',
    description: 'Understand the difference between editor appearance and book output.',
    entries: [
      {
        question: 'Why does the preview look different from Draft?',
        answer: 'Draft uses editor preferences optimized for writing. Proof uses the active Design theme and device profile, matching the typography, paragraph rules, heading treatment, notes, and special blocks intended for readers.',
        keywords: 'preview different draft typography',
      },
      {
        question: 'How accurate are device previews?',
        answer: 'Each profile uses device-specific logical dimensions, native resolution, PPI, aspect ratio, bezel, corner shape, and screen family. The mockup is scaled to fit the workspace while preserving relative physical size. It is a proofing approximation, not an emulator for a particular reading app.',
        keywords: 'device ipad iphone kindle accurate size ppi',
      },
      {
        question: 'What do reader appearance controls do?',
        answer: 'For screen devices you can change reader font scale and select light, sepia, or dark appearance. Rotate supported devices to inspect landscape layout. Print uses the selected trim size and margins instead.',
        keywords: 'appearance sepia dark landscape rotate',
      },
      {
        question: 'How do I make a custom theme?',
        answer: 'Open Design, duplicate or edit a theme recipe, change the desired sections, and save it under a new name. Custom themes can be favorited, reused, renamed, and removed without modifying built-in presets.',
        keywords: 'custom theme preset recipe save',
      },
    ],
  },
  {
    id: 'files',
    title: 'Import, export, and backups',
    description: 'Move manuscripts safely in and out of Typesetly.',
    entries: [
      {
        question: 'What can Typesetly import?',
        answer: 'The library can import a DOCX, a complete Scrivener .scriv project folder, or a zipped Scrivener project backup as a new book. The Outline menu can import DOCX chapters into the current book. Structural Scrivener Binder folders such as Books and Parts become Parts; nested Arcs, Acts, Volumes, Sections, and Phases remain nested manuscript folders, with their documents kept as separate chapters. Documents inside true chapter folders become scenes. Imported structure and formatting are normalized, and the review screen explains content that could not be mapped exactly.',
        keywords: 'import docx word manuscript scrivener scriv scrivx binder zip',
      },
      {
        question: 'How do I import a Scrivener project?',
        answer: 'From the library, choose Import a Scrivener project. Select the entire .scriv folder rather than the .scrivx index by itself, or select a zipped project backup. Review the detected Binder structure before confirming. Import is read-only: Typesetly never changes the source project. Draft and Manuscript text are imported; Research, snapshots, comments, custom metadata, and Compile settings remain in Scrivener.',
        keywords: 'scrivener import folder backup binder read only',
      },
      {
        question: 'How does Scrivener round-trip sync work?',
        answer: 'Live sync is available in the desktop app from Book profile. In Scrivener, first configure File → Sync → with External Folder and let Scrivener create its Draft folder. In Typesetly choose Connect sync folder and select that external folder, never the .scriv project. Sync Now compares every linked chapter with the last successful sync: one-sided edits move to the other app, while simultaneous edits create a separate Scrivener conflict chapter for manual review. Alternate between applications and run sync in both before switching. Binder hierarchy and order are not changed by external-folder sync.',
        keywords: 'scrivener sync external folder round trip conflict desktop rtf txt',
      },
      {
        question: 'What is DOCX export for?',
        answer: 'DOCX export produces an editable manuscript for collaboration or continued word-processor editing. EPUB and PDF use the active Design theme more directly and are intended for reader distribution or print proofing.',
        keywords: 'docx word export editable',
      },
      {
        question: 'How do EPUB and PDF export work?',
        answer: 'Open Publish and review preflight notices. EPUB packages reflowable chapters, navigation, metadata, styles, and media. PDF paginates the book using the chosen trim, typography, margins, headers, and footers.',
        keywords: 'epub pdf export preflight',
      },
      {
        question: 'How do I back up or transfer my library?',
        answer: 'Use the snapshot button in the header to download a JSON backup containing books and custom themes. Restore that snapshot from the library screen on the same or another installation. Keep copies somewhere separate from the application profile.',
        keywords: 'backup snapshot json restore transfer',
      },
      {
        question: 'How do I build the desktop application?',
        answer: 'Install Node.js and dependencies, then use npm.cmd start for desktop development. Package with npm.cmd run package:win on Windows, npm run package:mac on macOS, or npm run package:linux on Linux. The README covers signing and distribution.',
        keywords: 'electron desktop build package installer',
      },
      {
        question: 'How does the desktop updater work?',
        answer: 'The desktop application checks the official Typesetly GitHub repository for newer stable releases and same-version hotpatch revisions after startup. When one is available, Install version appears in the header. Choose it once: Typesetly downloads the correct package into its managed update cache, verifies the release metadata, closes the app, installs the update, and relaunches automatically.',
        keywords: 'desktop update latest github installer download checksum version hotpatch revision',
      },
    ],
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Common fixes for local development and manuscript behavior.',
    entries: [
      {
        question: 'PowerShell says npm.ps1 cannot be loaded. What should I do?',
        answer: 'Use npm.cmd instead of npm in PowerShell, for example npm.cmd install or npm.cmd run dev. This calls the Windows command shim and does not require changing the machine execution policy.',
        keywords: 'npm ps1 execution policy powershell',
      },
      {
        question: 'A recent interface change is not showing.',
        answer: 'Use Ctrl+Shift+R to perform a hard reload. If the development server was stopped, restart it with npm.cmd run dev. For the desktop wrapper, close and reopen the development window after rebuilding.',
        keywords: 'cache reload stale css interface',
      },
      {
        question: 'Text wraps differently between devices. Is that expected?',
        answer: 'Yes. Screen width, reader font scale, body font, line spacing, paragraph alignment, and device orientation all change line wrapping. Check several device profiles and the Print profile before export.',
        keywords: 'wrap wrapping overflow device',
      },
      {
        question: 'An export reports warnings or errors.',
        answer: 'Open each preflight item and correct missing metadata, empty required content, inaccessible image descriptions, or other reported issues. Suggestions may be bypassable, while errors identify information required for a valid export.',
        keywords: 'warning error export preflight fix',
      },
      {
        question: 'How do I verify a development checkout?',
        answer: 'Run npm.cmd run verify. It performs linting, automated tests, TypeScript compilation, and a production Vite build.',
        keywords: 'verify tests lint build developer',
      },
    ],
  },
]

export const Wiki = memo(function Wiki({ onClose }: WikiProps) {
  const [query, setQuery] = useState('')
  const [activeSection, setActiveSection] = useState(WIKI_SECTIONS[0].id)
  const searchRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef(onClose)
  const deferredQuery = useDeferredValue(query)

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    searchRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const filteredSections = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase()
    if (!needle) {
      return WIKI_SECTIONS.filter((section) => section.id === activeSection)
    }
    return WIKI_SECTIONS
      .map((section) => ({
        ...section,
        entries: section.entries.filter((entry) =>
          `${section.title} ${section.description} ${entry.question} ${entry.answer} ${entry.keywords || ''}`
            .toLowerCase()
            .includes(needle),
        ),
      }))
      .filter((section) => section.entries.length > 0)
  }, [activeSection, deferredQuery])

  return (
    <div className="wiki-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="wiki"
        role="dialog"
        aria-modal="true"
        aria-labelledby="typesetly-wiki-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="wiki-head">
          <div className="wiki-title">
            <span><BookOpen size={18} /></span>
            <div>
              <small>Typesetly handbook</small>
              <h2 id="typesetly-wiki-title">Application Wiki</h2>
            </div>
          </div>
          <label className="wiki-search">
            <Search size={15} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search features, workflows, or problems…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <button type="button" className="wiki-close" aria-label="Close wiki" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="wiki-layout">
          <aside className="wiki-nav" aria-label="Wiki sections">
            <p>Browse topics</p>
            {WIKI_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id && !query ? 'active' : ''}
                onClick={() => {
                  setQuery('')
                  setActiveSection(section.id)
                }}
              >
                {section.title}
              </button>
            ))}
            <div className="wiki-quickstart">
              <strong>Quick path</strong>
              <span>1. Draft</span>
              <span>2. Plan</span>
              <span>3. Organize</span>
              <span>4. Design</span>
              <span>5. Publish</span>
            </div>
          </aside>

          <main className="wiki-content">
            {filteredSections.length > 0 ? filteredSections.map((section) => (
              <section className="wiki-section" id={`wiki-${section.id}`} key={section.id}>
                <div className="wiki-section-head">
                  <h3>{section.title}</h3>
                  <p>{section.description}</p>
                </div>
                <div className="wiki-entries">
                  {section.entries.map((entry, index) => (
                    <details key={`${deferredQuery}-${entry.question}`} open={!deferredQuery && index === 0}>
                      <summary>{entry.question}</summary>
                      <p>{entry.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            )) : (
              <div className="wiki-empty">
                <BookOpen size={25} />
                <strong>No wiki articles match “{deferredQuery}”</strong>
                <button type="button" onClick={() => setQuery('')}>Clear search</button>
              </div>
            )}
          </main>
        </div>

        <footer className="wiki-footer">
          <span>Press <kbd>Esc</kbd> to close</span>
          <span>Books and settings are stored locally unless you export or back them up.</span>
        </footer>
      </section>
    </div>
  )
})
