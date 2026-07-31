import { ReactNodeViewRenderer } from '@tiptap/react'
import { LitRpgBlockNodeView } from '../components/LitRpgBlockNodeView'
import { LitRpgBlock } from './extensions'

export const LitRpgBlockEditorExtension = LitRpgBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(LitRpgBlockNodeView)
  },
})
