export type InlineMarkdownSegment = {
  bold: boolean
  italic: boolean
  start: number
  text: string
}

type Marker = {
  bold: boolean
  italic: boolean
  token: "***" | "**" | "*"
}

const MARKERS: Marker[] = [
  { bold: true, italic: true, token: "***" },
  { bold: true, italic: false, token: "**" },
  { bold: false, italic: true, token: "*" },
]

export function parseInlineMarkdown(text: string): InlineMarkdownSegment[] {
  return parseRange(text, 0, text.length, false, false)
}

function parseRange(
  text: string,
  start: number,
  end: number,
  bold: boolean,
  italic: boolean
): InlineMarkdownSegment[] {
  const segments: InlineMarkdownSegment[] = []
  let cursor = start

  while (cursor < end) {
    const opening = findOpeningMarker(text, cursor, end)

    if (!opening) {
      pushSegment(segments, text.slice(cursor, end), cursor, bold, italic)
      break
    }

    if (opening.index > cursor) {
      pushSegment(
        segments,
        text.slice(cursor, opening.index),
        cursor,
        bold,
        italic
      )
    }

    const contentStart = opening.index + opening.marker.token.length
    const closing = findClosingMarker(
      text,
      contentStart,
      end,
      opening.marker.token
    )

    if (closing === undefined) {
      pushSegment(
        segments,
        text.slice(opening.index, end),
        opening.index,
        bold,
        italic
      )
      break
    }

    segments.push(
      ...parseRange(
        text,
        contentStart,
        closing,
        bold || opening.marker.bold,
        italic || opening.marker.italic
      )
    )
    cursor = closing + opening.marker.token.length
  }

  return segments
}

function findOpeningMarker(text: string, start: number, end: number) {
  let match: { index: number; marker: Marker } | undefined

  for (const marker of MARKERS) {
    const index = text.indexOf(marker.token, start)
    if (index === -1 || index >= end) continue
    if (!match || index < match.index) match = { index, marker }
  }

  return match
}

function findClosingMarker(
  text: string,
  start: number,
  end: number,
  token: Marker["token"]
) {
  let cursor = start

  while (cursor < end) {
    const index = text.indexOf(token, cursor)
    if (index === -1 || index >= end) return undefined
    return index
  }

  return undefined
}

function pushSegment(
  segments: InlineMarkdownSegment[],
  text: string,
  start: number,
  bold: boolean,
  italic: boolean
) {
  if (!text) return
  segments.push({ bold, italic, start, text })
}
