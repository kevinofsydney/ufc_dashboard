import { describe, expect, it } from 'vitest'
import { parseTranscriptCsv } from '../../src/client/transcript-csv'

const headers =
  'record_id,channel_name,video_id,video_title,video_url,published_at,source,status,part_number,part_count,transcript_text,captured_at,notes'

describe('transcript CSV import', () => {
  it('combines out-of-order transcript rows by video and part number', () => {
    const csv = [
      headers,
      'video-auto-2,"Channel, Name",video,"Fight, breakdown",https://youtube.test/watch?v=video,2026-07-16T00:00:00Z,automatic,CAPTURED_AUTO,2,2," second ""quoted"" part",2026-07-17T00:00:00Z,',
      'video-auto-1,"Channel, Name",video,"Fight, breakdown",https://youtube.test/watch?v=video,2026-07-16T00:00:00Z,automatic,CAPTURED_AUTO,1,2,"First line\ncontinues",2026-07-17T00:00:00Z,',
    ].join('\r\n')

    expect(parseTranscriptCsv(csv)).toEqual([
      {
        videoId: 'video',
        channelName: 'Channel, Name',
        title: 'Fight, breakdown',
        sourceUrl: 'https://youtube.test/watch?v=video',
        publishedAt: '2026-07-16T00:00:00Z',
        transcriptText: 'First line\ncontinues second "quoted" part',
        partCount: 2,
        extractionMode: 'individual',
      },
    ])
  })

  it('rejects an incomplete multipart transcript', () => {
    const csv = [
      headers,
      'video-auto-1,Channel,video,Title,https://youtube.test/watch?v=video,,automatic,CAPTURED_AUTO,1,2,First part,,,',
    ].join('\n')

    expect(() => parseTranscriptCsv(csv)).toThrow(
      'video_id video is missing transcript part 2',
    )
  })

  it('rejects duplicate transcript parts', () => {
    const row =
      'video-auto-1,Channel,video,Title,https://youtube.test/watch?v=video,,automatic,CAPTURED_AUTO,1,1,Transcript,,,'

    expect(() => parseTranscriptCsv([headers, row, row].join('\n'))).toThrow(
      'video_id video contains part 1 more than once',
    )
  })
})
