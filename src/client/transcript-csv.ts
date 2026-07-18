export type TranscriptExtractionMode =
  'individual' | 'aggregator' | 'stats_tracker'

export interface TranscriptCsvSource {
  videoId: string
  channelName: string
  title: string
  sourceUrl: string
  publishedAt: string | null
  transcriptText: string
  partCount: number
  extractionMode: TranscriptExtractionMode
}

const requiredHeaders = [
  'channel_name',
  'video_id',
  'video_title',
  'video_url',
  'part_number',
  'part_count',
  'transcript_text',
] as const

function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(field)
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += character
    }
  }

  if (quoted) throw new Error('The CSV ends inside a quoted field')
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows.filter((values) => values.some((value) => value.trim()))
}

function positiveInteger(value: string, label: string, rowNumber: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `${label} must be a positive whole number on row ${rowNumber}`,
    )
  }
  return parsed
}

function normalizeComparable(value: string) {
  return value.trim().toLocaleLowerCase()
}

export function parseTranscriptCsv(csvText: string): TranscriptCsvSource[] {
  const rows = parseCsvRows(csvText)
  if (rows.length < 2) {
    throw new Error(
      'The CSV must contain a header row and at least one transcript row',
    )
  }

  const headers = rows[0].map((header) => header.trim().toLocaleLowerCase())
  const headerIndexes = new Map<string, number>()
  headers.forEach((header, index) => {
    if (!header) return
    if (headerIndexes.has(header)) {
      throw new Error(`The CSV contains the header ${header} more than once`)
    }
    headerIndexes.set(header, index)
  })
  const missingHeaders = requiredHeaders.filter(
    (header) => !headerIndexes.has(header),
  )
  if (missingHeaders.length > 0) {
    throw new Error(`The CSV is missing: ${missingHeaders.join(', ')}`)
  }

  const valueAt = (row: string[], header: string) =>
    row[headerIndexes.get(header) ?? -1] ?? ''

  interface PendingSource {
    videoId: string
    channelName: string
    title: string
    sourceUrl: string
    publishedAt: string | null
    partCount: number
    parts: Map<number, string>
  }

  const grouped = new Map<string, PendingSource>()

  for (const [rowIndex, row] of rows.slice(1).entries()) {
    const rowNumber = rowIndex + 2
    const videoId = valueAt(row, 'video_id').trim()
    const channelName = valueAt(row, 'channel_name').trim()
    const title = valueAt(row, 'video_title').trim()
    const sourceUrl = valueAt(row, 'video_url').trim()
    const publishedAt = valueAt(row, 'published_at').trim() || null
    const transcriptText = valueAt(row, 'transcript_text')
    const partNumber = positiveInteger(
      valueAt(row, 'part_number'),
      'part_number',
      rowNumber,
    )
    const partCount = positiveInteger(
      valueAt(row, 'part_count'),
      'part_count',
      rowNumber,
    )

    if (!videoId) throw new Error(`video_id is empty on row ${rowNumber}`)
    if (!channelName)
      throw new Error(`channel_name is empty on row ${rowNumber}`)
    if (channelName.length > 120)
      throw new Error(
        `channel_name is longer than 120 characters on row ${rowNumber}`,
      )
    if (!title) throw new Error(`video_title is empty on row ${rowNumber}`)
    if (title.length > 200)
      throw new Error(
        `video_title is longer than 200 characters on row ${rowNumber}`,
      )
    if (!sourceUrl) throw new Error(`video_url is empty on row ${rowNumber}`)
    try {
      const parsedUrl = new URL(sourceUrl)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error()
    } catch {
      throw new Error(`video_url is invalid on row ${rowNumber}`)
    }
    if (!transcriptText.trim())
      throw new Error(`transcript_text is empty on row ${rowNumber}`)
    if (partNumber > partCount) {
      throw new Error(`part_number exceeds part_count on row ${rowNumber}`)
    }

    const existing = grouped.get(videoId)
    if (!existing) {
      grouped.set(videoId, {
        videoId,
        channelName,
        title,
        sourceUrl,
        publishedAt,
        partCount,
        parts: new Map([[partNumber, transcriptText]]),
      })
      continue
    }

    if (
      normalizeComparable(existing.channelName) !==
        normalizeComparable(channelName) ||
      existing.title !== title ||
      existing.sourceUrl !== sourceUrl ||
      existing.partCount !== partCount
    ) {
      throw new Error(`Rows for video_id ${videoId} have conflicting details`)
    }
    if (existing.parts.has(partNumber)) {
      throw new Error(
        `video_id ${videoId} contains part ${partNumber} more than once`,
      )
    }
    existing.parts.set(partNumber, transcriptText)
  }

  return [...grouped.values()].map((source) => {
    const missingParts = Array.from(
      { length: source.partCount },
      (_, index) => index + 1,
    ).filter((partNumber) => !source.parts.has(partNumber))
    if (missingParts.length > 0) {
      throw new Error(
        `video_id ${source.videoId} is missing transcript part${missingParts.length === 1 ? '' : 's'} ${missingParts.join(', ')}`,
      )
    }

    const transcriptText = Array.from(
      { length: source.partCount },
      (_, index) => source.parts.get(index + 1) ?? '',
    ).join('')
    if (transcriptText.length > 250_000) {
      throw new Error(
        `The combined transcript for video_id ${source.videoId} exceeds 250,000 characters`,
      )
    }

    return {
      videoId: source.videoId,
      channelName: source.channelName,
      title: source.title,
      sourceUrl: source.sourceUrl,
      publishedAt: source.publishedAt,
      transcriptText,
      partCount: source.partCount,
      extractionMode: 'individual',
    }
  })
}
