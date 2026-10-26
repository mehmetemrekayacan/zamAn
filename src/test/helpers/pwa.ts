// Testlerde service worker kaydı ve ağ erişimi başlatılmaz.
export function useRegisterSW() {
  return { needRefresh: [false, () => {}], updateServiceWorker: async () => {} } as const
}
