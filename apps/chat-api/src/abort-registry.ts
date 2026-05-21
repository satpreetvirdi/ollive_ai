const activeRequests = new Map<string, AbortController>();

export function registerAbort(conversationId: string): AbortSignal {
  cancelRequest(conversationId);
  const controller = new AbortController();
  activeRequests.set(conversationId, controller);
  return controller.signal;
}

export function cancelRequest(conversationId: string): boolean {
  const controller = activeRequests.get(conversationId);
  if (controller) {
    controller.abort();
    activeRequests.delete(conversationId);
    return true;
  }
  return false;
}

export function clearAbort(conversationId: string): void {
  activeRequests.delete(conversationId);
}
