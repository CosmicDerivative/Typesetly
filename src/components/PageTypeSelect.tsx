import { PAGE_TYPE_LABELS } from '../data'
import {
  CONVERTIBLE_BACK_TYPES,
  CONVERTIBLE_BODY_TYPES,
  CONVERTIBLE_FRONT_TYPES,
} from '../manuscript/pageTypes'
import type { PageType } from '../types'

export function PageTypeSelect({
  value,
  onChange,
  id,
}: {
  value: PageType
  onChange: (type: PageType) => void
  id?: string
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as PageType)}
    >
      <optgroup label="Main text">
        {CONVERTIBLE_BODY_TYPES.map((type) => (
          <option key={type} value={type}>{PAGE_TYPE_LABELS[type]}</option>
        ))}
      </optgroup>
      <optgroup label="Opening pages">
        {CONVERTIBLE_FRONT_TYPES.map((type) => (
          <option key={type} value={type}>{PAGE_TYPE_LABELS[type]}</option>
        ))}
      </optgroup>
      <optgroup label="Closing pages">
        {CONVERTIBLE_BACK_TYPES.map((type) => (
          <option key={type} value={type}>{PAGE_TYPE_LABELS[type]}</option>
        ))}
      </optgroup>
    </select>
  )
}
