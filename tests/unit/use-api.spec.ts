describe('useApi — the API is told what the reader is reading in', () => {
  it('sends the UI locale as Accept-Language, not the browser one', async () => {
    // Someone can run an Italian browser and switch this app to English. The
    // API localizes validation messages, error copy and framework catalogue
    // text, and it should follow the APP, not the operating system.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)
    // Stubs `useNuxtApp`, NOT `useI18n`. That distinction is the bug this
    // guards: `useI18n()` needs an active setup context, and `apiFetch` is
    // called from lifecycle hooks, route middleware and plugins — none of
    // which have one. It threw there, the request never went out, and pages
    // rendered empty with no error anyone would connect to a header. Stubbing
    // `useI18n` globally is precisely what hid it.
    vi.stubGlobal(
      'useNuxtApp',
      vi.fn(() => ({ $i18n: { locale: ref('it') } }))
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
    // Stubs `useNuxtApp`, NOT `useI18n`. That distinction is the bug this
    // guards: `useI18n()` needs an active setup context, and `apiFetch` is
    // called from lifecycle hooks, route middleware and plugins — none of
    // which have one. It threw there, the request never went out, and pages
    // rendered empty with no error anyone would connect to a header. Stubbing
    // `useI18n` globally is precisely what hid it.
    vi.stubGlobal(
      'useNuxtApp',
      vi.fn(() => ({ $i18n: { locale: ref('it') } }))
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

  it('falls back to English rather than throwing when there is no Nuxt context', async () => {
    // `useNuxtApp()` throws outside a Nuxt context. A missing locale must never
    // be the reason a request fails — the header is a hint, not a precondition.
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('$fetch', fetchMock)
    vi.stubGlobal(
      'useNuxtApp',
      vi.fn(() => {
        throw new Error('nuxt instance unavailable')
      })
    )
    vi.stubGlobal(
      'useRuntimeConfig',
      vi.fn(() => ({ public: { apiBase: 'https://api.test' } }))
    )

    const { useAuth } = await import('../../app/composables/useAuth')
    useAuth().setSession('a-token')

    const { useApi } = await import('../../app/composables/useApi')
    await expect(useApi().apiFetch('/projects')).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/projects',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Accept-Language': 'en' }),
      })
    )
  })
})
