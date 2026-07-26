import type { ThemeHeaderFooter } from '../types'

type RunningHeaderContext = {
  title: string
  author: string
  chapter: string
}

export function runningHeaderText(
  layout: ThemeHeaderFooter['layout'],
  context: RunningHeaderContext,
  pageNumber: number,
) {
  const odd = pageNumber % 2 === 1

  if (layout === 'chapter-page') return context.chapter
  if (layout === 'title-author') return odd ? context.author || context.title : context.title
  if (layout === 'author-title-page') return odd ? context.title : context.author || context.title
  return ''
}

export function runningHeaderAlignment(pageNumber: number) {
  return pageNumber % 2 === 1 ? 'right' : 'left'
}

export function layoutShowsPageNumber(layout: ThemeHeaderFooter['layout']) {
  return layout === 'page-center' || layout === 'chapter-page' || layout === 'author-title-page'
}
