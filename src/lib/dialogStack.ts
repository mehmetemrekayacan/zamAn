// Yalnızca en üstteki pencere etkileşim alır; iç içe pencereler kapanınca
// arka planın önceki inert/kaydırma durumu geri yüklenir.
const dialogs: HTMLElement[] = []
const originalInert = new Map<HTMLElement, boolean>()
let originalOverflow = ''

export function hasOpenDialog(): boolean { return dialogs.length > 0 }
export function isTopDialog(element: HTMLElement): boolean { return dialogs.at(-1) === element }

function syncBackground() {
  const top = dialogs.at(-1)
  for (const element of document.body.children) {
    if (!(element instanceof HTMLElement)) continue
    if (!originalInert.has(element)) originalInert.set(element, element.hasAttribute('inert'))
    element.toggleAttribute('inert', top ? element !== top : originalInert.get(element))
  }
  if (!top) originalInert.clear()
  document.body.style.overflow = top ? 'hidden' : originalOverflow
}

export function registerDialog(element: HTMLElement): () => void {
  if (!dialogs.length) originalOverflow = document.body.style.overflow
  dialogs.push(element)
  syncBackground()
  const observer = new MutationObserver(syncBackground)
  observer.observe(document.body, { childList: true })
  return () => {
    observer.disconnect()
    const index = dialogs.indexOf(element)
    if (index >= 0) dialogs.splice(index, 1)
    syncBackground()
  }
}
