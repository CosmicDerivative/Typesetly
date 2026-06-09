import {
  Crosshair,
  BookOpen,
  History,
  MessageSquareText,
  PanelLeft,

export function UtilityBar() {
  const [activeTool, setActiveTool] = useState<string | null>(null)

  return (
    <nav className="utility-bar" aria-label="Writing tools">
      {tools.map((tool) => (
        <button
          key={tool}
          type="button"
          className={activeTool === tool ? 'active' : ''}
          onClick={() => setActiveTool((current) => current === tool ? null : tool)}
        >
          {tool}
        </button>
      ))}
    </nav>
  )
}
