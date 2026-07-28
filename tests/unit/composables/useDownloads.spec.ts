/**
 * useDownloads.ts (PR B3, task 20.3 — RED)
 *
 * D9: downloads are buffered fetch-then-blob, NEVER a blind `window.open`
 * (the same gated read as the corresponding GET endpoint — a pre-threshold
 * participant gets the identical 409 body a download would otherwise mask).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('useDownloads', () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>
  let revokeObjectURLMock: ReturnType<typeof vi.fn>
  let clickMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    revokeObjectURLMock = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    })
    clickMock = vi.fn()
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag)
      if (tag === 'a') el.click = clickMock
      return el
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('downloadTranscript(id) fetches the transcript as a blob and triggers a browser download (never window.open)', async () => {
    const windowOpenMock = vi.fn()
    vi.stubGlobal('open', windowOpenMock)
    const blob = new Blob(['transcript text'], { type: 'text/plain' })
    const apiFetchMock = vi.fn().mockResolvedValue(blob)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDownloads } = await import('../../../app/composables/useDownloads')
    const { downloadTranscript } = useDownloads()

    await downloadTranscript(42, 'beai-transcript-ref-042.txt')

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/participants/42/transcript/download',
      expect.objectContaining({ responseType: 'blob' })
    )
    expect(createObjectURLMock).toHaveBeenCalledWith(blob)
    expect(clickMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')
    expect(windowOpenMock).not.toHaveBeenCalled()
  })

  it('downloadEvaluation(id) fetches the evaluation as a blob from the DEDICATED download endpoint', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' })
    const apiFetchMock = vi.fn().mockResolvedValue(blob)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDownloads } = await import('../../../app/composables/useDownloads')
    const { downloadEvaluation } = useDownloads()

    await downloadEvaluation(42, 'beai-evaluation-ref-042.json')

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/participants/42/evaluation/download',
      expect.objectContaining({ responseType: 'blob' })
    )
    expect(clickMock).toHaveBeenCalledTimes(1)
  })

  it('propagates a rejection (e.g. 409 lifecycle_not_ready) without triggering any download', async () => {
    const notReadyError = Object.assign(new Error('conflict'), { status: 409 })
    const apiFetchMock = vi.fn().mockRejectedValue(notReadyError)
    vi.doMock('../../../app/composables/useApi', () => ({
      useApi: () => ({ apiFetch: apiFetchMock }),
    }))

    const { useDownloads } = await import('../../../app/composables/useDownloads')
    const { downloadTranscript } = useDownloads()

    await expect(downloadTranscript(42, 'x.txt')).rejects.toBe(notReadyError)
    expect(clickMock).not.toHaveBeenCalled()
    expect(createObjectURLMock).not.toHaveBeenCalled()
  })
})
