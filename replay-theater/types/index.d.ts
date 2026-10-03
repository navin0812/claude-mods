export type Step = { file: string; tool: 'Edit' | 'Write'; before: string; after: string }

declare module 'claude-code' {
  interface PluginState {
    'replay-theater': { steps: Step[]; hint: boolean; cur: number }
  }
}
