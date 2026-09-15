/**
 * Thin adapter over Nuxt UI's toast so station code keeps a one-arg call.
 * Named useNotify to avoid shadowing the auto-imported `useToast` from @nuxt/ui.
 */
const STYLE = {
  info: { color: 'primary' as const, icon: 'i-lucide-info' },
  success: { color: 'success' as const, icon: 'i-lucide-circle-check' },
  error: { color: 'error' as const, icon: 'i-lucide-circle-alert' }
}

export function useNotify() {
  const toast = useToast()
  return {
    push(text: string, type: keyof typeof STYLE = 'info') {
      toast.add({ title: text, description: undefined, ...STYLE[type] })
    }
  }
}
