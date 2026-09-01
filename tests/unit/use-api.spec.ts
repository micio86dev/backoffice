describe('useApi — the API is told what the reader is reading in', () => {
  it('sends the UI locale as Accept-Language, not the browser one', async () => {
    // Someone can run an Italian browser and switch this app to English. The
    // API localizes validation messages, error copy and framework catalogue
    // text, and it should follow the APP, not the operating system.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ locale: ref('it') }))
    )
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../app/composables/useAuth')
    useAuth().setSession('a-token')

    const { useApi } = await import('../../app/composables/useApi')
    await useApi().apiFetch('/projects')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'it' }),
      })
    )
  })

  it('lets an explicit per-call header win', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useI18n',
      vi.fn(() => ({ locale: ref('it') }))
    )
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../app/composables/useAuth')
    useAuth().setSession('a-token')

    const { useApi } = await import('../../app/composables/useApi')
    await useApi().apiFetch('/projects', { headers: { 'Accept-Language': 'en' } })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'en' }),
      })
    )
  })
})
