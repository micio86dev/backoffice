/**
 * useDownloads — buffered fetch-then-blob downloads for the transcript and
 * evaluation ARTIFACTS ONLY (D9, admin-backoffice spec "Downloads"
 * requirement). PDF export and per-question audio are explicit non-goals.
 *
 * Never a blind `window.open()`: the download endpoints apply the IDENTICAL
 * lifecycle gate as their read counterparts (ParticipantDownloadController
 * docblock — "the gate on each download is IDENTICAL to the corresponding
 * read endpoint's gate"), so a pre-threshold request must surface the same
 * 409/403/404 the caller already handles for the read path, not a bare file
 * dialog. Fetch-then-blob lets the caller inspect/catch that status before
 * any browser download UI ever appears.
 */
import { useApi } from './useApi'

function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function useDownloads() {
  const { apiFetch } = useApi()

  async function downloadTranscript(id: number | string, filename: string): Promise<void> {
    const blob = await apiFetch<Blob>(`/participants/${id}/transcript/download`, {
      responseType: 'blob',
    })
    triggerBrowserDownload(blob, filename)
  }

  async function downloadEvaluation(id: number | string, filename: string): Promise<void> {
    const blob = await apiFetch<Blob>(`/participants/${id}/evaluation/download`, {
      responseType: 'blob',
    })
    triggerBrowserDownload(blob, filename)
  }

  return { downloadTranscript, downloadEvaluation }
}
