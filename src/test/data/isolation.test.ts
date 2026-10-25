import { describe, expect, it, vi } from 'vitest'
import { loadDataEnvironment } from '../helpers/dataEnvironment'
import { createSupabaseStub } from '../helpers/supabase'

describe('test ortamı sınırları', () => {
  it('gerçek bulut yapılandırmasını yüklemez ve fetch isteğini engeller', async () => {
    const { supabase } = await loadDataEnvironment()
    expect(supabase.isCloudSyncEnabled()).toBe(false)
    expect(supabase.getSupabase()).toBeNull()
    await expect(fetch('https://example.invalid')).rejects.toThrow('ağ isteği engellendi')
  })

  it('yanlışlıkla bulut etkinleştirilse bile gerçek SDK istemcisi oluşturmaz', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-only-key')
    const { supabase } = await loadDataEnvironment()
    expect(supabase.isCloudSyncEnabled()).toBe(true)
    expect(() => supabase.getSupabase()).toThrow('gerçek Supabase istemcisi kullanılamaz')
  })

  it('yanıtı tanımlanmamış test isteği başarı gibi görünmez', async () => {
    const { cloud, supabase } = await loadDataEnvironment('test-user-a')
    const remote = createSupabaseStub()
    vi.spyOn(supabase, 'getSupabase').mockReturnValue(remote.client)
    expect(await cloud.pullCloud()).toMatchObject({ ok: false, error: expect.stringContaining('Tanımlanmamış Supabase test isteği') })
  })
})
