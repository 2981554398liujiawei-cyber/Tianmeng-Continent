declare module '../../qa/cloud-save-mock-handler.mjs' {
  export function createMockCloudStore(): { vaults: Map<string, unknown>; history: Map<string, unknown> }
  export function handleCloudRequest(store: ReturnType<typeof createMockCloudStore>, body: unknown): unknown
}
