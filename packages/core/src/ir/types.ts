/** Layout node in the intermediate representation */
export interface LayoutNode {
  component: string;
  props: Record<string, string | number | boolean>;
  children: (LayoutNode | string)[];
}

/** Parsed VIEW.md */
export interface ViewSpec {
  name: string;
  domain: string;
  version: string;
  stateBindings: StateBinding[];
  layout: LayoutNode;
  intents: IntentDef[];
}

/** State binding declaration from VIEW.md */
export interface StateBinding {
  path: string;
  type: string;
}

/** Intent definition from VIEW.md */
export interface IntentDef {
  name: string;
  payload: string;
  description: string;
}

/** Parsed APP.md */
export interface AppSpec {
  name: string;
  domain: string;
  modules: string[];
  layout: LayoutNode;
  resolvedModules?: Map<string, ViewSpec>;
}

/** Clapp state envelope from the relay */
export interface ClappState {
  version: number;
  timestamp: string;
  state: Record<string, unknown>;
}
