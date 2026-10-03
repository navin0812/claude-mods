export type Pending = { id: string; kind: string; command: string; would: string; files: string[]; more: number; size?: string; paths?: string }

declare module 'claude-code' {
  interface PluginState {
    'blast-radius': { pending: Pending | null }
  }
}
