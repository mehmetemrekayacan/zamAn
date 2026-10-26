import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { isTopDialog, registerDialog } from '../lib/dialogStack'

interface ModalDialogProps {
  children: ReactNode
  label: string
  onClose?: () => void
  busy?: boolean
  closeOnBackdrop?: boolean
  className?: string
  role?: 'dialog' | 'alertdialog'
}

function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex], [contenteditable="true"]')]
    .filter(element => {
      if (element.tabIndex < 0 || element.matches(':disabled') || element.closest('[hidden], [inert]')) return false
      for (let node: HTMLElement | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden') return false
        if (node === panel) break
      }
      return true
    })
}

/** Odak sınırı, Escape, arka plan kilidi ve açan kontrole dönüş ortak yönetilir. */
export function ModalDialog({ children, label, onClose, busy = false, closeOnBackdrop = false, className = '', role = 'dialog' }: ModalDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const options = useRef({ onClose, busy })
  const id = useId()
  useLayoutEffect(() => { options.current = { onClose, busy } }, [onClose, busy])

  useLayoutEffect(() => {
    const overlay = overlayRef.current!
    const panel = panelRef.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const unregister = registerDialog(overlay)
    const focusInitial = () => {
      const preferred = panel.querySelector<HTMLElement>('[data-dialog-initial-focus]')
      const target = preferred && focusableElements(panel).includes(preferred) ? preferred : panel
      target.focus({ preventScroll: true })
    }
    const keydown = (event: KeyboardEvent) => {
      if (!isTopDialog(overlay)) return
      if (event.key === 'Escape' || event.code === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!options.current.busy) options.current.onClose?.()
      } else if (event.key === 'Tab') {
        const items = focusableElements(panel)
        const first = items[0]
        const last = items.at(-1)
        const active = document.activeElement
        if (!first || !panel.contains(active) || active === panel || (event.shiftKey ? active === first : active === last)) {
          event.preventDefault()
          const target = event.shiftKey ? last ?? panel : first ?? panel
          target.focus()
        }
      }
    }
    const focusin = (event: FocusEvent) => {
      if (isTopDialog(overlay) && !panel.contains(event.target as Node)) focusInitial()
    }
    window.addEventListener('keydown', keydown, true)
    document.addEventListener('focusin', focusin)
    focusInitial()
    return () => {
      window.removeEventListener('keydown', keydown, true)
      document.removeEventListener('focusin', focusin)
      unregister()
      if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <div ref={overlayRef} data-modal-overlay={id} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={event => {
        if (event.target === event.currentTarget && closeOnBackdrop && !busy && isTopDialog(event.currentTarget)) onClose?.()
      }}>
      <div ref={panelRef} role={role} aria-modal="true" aria-label={label} aria-busy={busy || undefined} tabIndex={-1}
        className={`max-h-[calc(100dvh-2rem)] overflow-y-auto outline-none ${className}`}>
        {children}
      </div>
    </div>, document.body,
  )
}
