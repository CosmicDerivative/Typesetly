import { Link2, Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { StoryBible, StoryRelationship } from '../types'
import './StoryMindMap.css'

interface StoryMindMapProps {
  bible: StoryBible
  onAdd: (sourceId: string, targetId: string, label: string) => void
  onUpdate: (id: string, patch: Partial<StoryRelationship>) => void
  onDelete: (id: string) => void
  onSelectEntity: (kind: 'characters' | 'world', id: string) => void
}

interface MapEntity {
  id: string
  name: string
  detail: string
  kind: 'characters' | 'world'
}

const VIEW_WIDTH = 900
const VIEW_HEIGHT = 470

export function StoryMindMap({
  bible,
  onAdd,
  onUpdate,
  onDelete,
  onSelectEntity,
}: StoryMindMapProps) {
  const entities = useMemo<MapEntity[]>(() => [
    ...bible.characters.map((character) => ({
      id: character.id,
      name: character.name || 'Unnamed character',
      detail: character.role || 'Character',
      kind: 'characters' as const,
    })),
    ...bible.world.map((entry) => ({
      id: entry.id,
      name: entry.name || 'Unnamed world entry',
      detail: entry.category.replace('-', ' '),
      kind: 'world' as const,
    })),
  ], [bible.characters, bible.world])
  const [sourceId, setSourceId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!entities.some((entity) => entity.id === sourceId)) {
      setSourceId(entities[0]?.id || '')
    }
    if (!entities.some((entity) => entity.id === targetId) || targetId === sourceId) {
      setTargetId(entities.find((entity) => entity.id !== (sourceId || entities[0]?.id))?.id || '')
    }
  }, [entities, sourceId, targetId])

  const positions = useMemo(() => new Map(entities.map((entity, index) => {
    if (entities.length === 1) return [entity.id, { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 }]
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / entities.length
    const radiusX = Math.min(315, 145 + entities.length * 24)
    const radiusY = Math.min(180, 100 + entities.length * 13)
    return [
      entity.id,
      {
        x: VIEW_WIDTH / 2 + Math.cos(angle) * radiusX,
        y: VIEW_HEIGHT / 2 + Math.sin(angle) * radiusY,
      },
    ]
  })), [entities])

  const relationshipRows = bible.relationships
    .map((relationship) => ({
      relationship,
      source: entities.find((entity) => entity.id === relationship.sourceId),
      target: entities.find((entity) => entity.id === relationship.targetId),
    }))
    .filter((row) => row.source && row.target)

  const addRelationship = () => {
    if (!sourceId || !targetId || sourceId === targetId) return
    onAdd(sourceId, targetId, label)
    setLabel('')
  }

  return (
    <div className="story-map-workspace">
      <div className="story-map-canvas">
        {entities.length === 0 ? (
          <div className="story-map-empty">
            <Link2 size={30} />
            <strong>Add characters or world entries to start mapping.</strong>
            <span>The map uses explicit relationships you create, so it never invents story canon.</span>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label="Relationship map for the current book"
          >
            {relationshipRows.map(({ relationship }) => {
              const source = positions.get(relationship.sourceId)
              const target = positions.get(relationship.targetId)
              if (!source || !target) return null
              const middleX = (source.x + target.x) / 2
              const middleY = (source.y + target.y) / 2
              const displayLabel = relationship.label || 'connected to'
              const labelWidth = Math.min(150, Math.max(58, displayLabel.length * 6.2))
              return (
                <g className="story-map-edge" key={relationship.id}>
                  <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                  <rect
                    x={middleX - labelWidth / 2}
                    y={middleY - 10}
                    width={labelWidth}
                    height={20}
                    rx={10}
                  />
                  <text x={middleX} y={middleY + 3}>{displayLabel.slice(0, 24)}</text>
                </g>
              )
            })}
            {entities.map((entity) => {
              const position = positions.get(entity.id)
              if (!position) return null
              return (
                <g
                  className={`story-map-node ${entity.kind}`}
                  key={entity.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${entity.name}`}
                  transform={`translate(${position.x - 78} ${position.y - 29})`}
                  onClick={() => onSelectEntity(entity.kind, entity.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      onSelectEntity(entity.kind, entity.id)
                    }
                  }}
                >
                  <rect width="156" height="58" rx="16" />
                  <text className="story-map-node-name" x="78" y="25">
                    {entity.name.length > 22 ? `${entity.name.slice(0, 21)}…` : entity.name}
                  </text>
                  <text className="story-map-node-detail" x="78" y="42">{entity.detail}</text>
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <div className="story-map-controls">
        <div className="relationship-builder">
          <div>
            <small>Relationship builder</small>
            <strong>Connect two story records</strong>
          </div>
          <select
            aria-label="Relationship source"
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
          >
            {entities.map((entity) => (
              <option value={entity.id} key={entity.id}>{entity.name}</option>
            ))}
          </select>
          <input
            value={label}
            placeholder="protects, rivals, lives in..."
            aria-label="Relationship label"
            onChange={(event) => setLabel(event.target.value)}
          />
          <select
            aria-label="Relationship target"
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
          >
            {entities.map((entity) => (
              <option value={entity.id} key={entity.id} disabled={entity.id === sourceId}>
                {entity.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={entities.length < 2 || !sourceId || !targetId || sourceId === targetId}
            onClick={addRelationship}
          >
            <Plus size={14} /> Connect
          </button>
        </div>

        <div className="relationship-list">
          {relationshipRows.map(({ relationship, source, target }) => (
            <div className="relationship-row" key={relationship.id}>
              <span>{source?.name}</span>
              <input
                value={relationship.label}
                aria-label={`Relationship between ${source?.name} and ${target?.name}`}
                onChange={(event) => onUpdate(relationship.id, { label: event.target.value })}
              />
              <span>{target?.name}</span>
              <button
                type="button"
                title="Delete relationship"
                aria-label="Delete relationship"
                onClick={() => onDelete(relationship.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {!relationshipRows.length && entities.length > 0 && (
            <div className="relationship-empty">No explicit relationships yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
