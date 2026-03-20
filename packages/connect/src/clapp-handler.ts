export interface ClappHandlerContext {
  stateDir: string;
  setState(clappId: string, state: unknown): void;
  checkAuthStatus(): void;
}

export interface ClappHandler {
  handleIntent(intent: { intent: string; payload: Record<string, unknown> }): boolean;
  onConnect?(): void;
  refresh?(): void;
  init?(): void;
}

export type ClappHandlerFactory = (ctx: ClappHandlerContext) => ClappHandler;
