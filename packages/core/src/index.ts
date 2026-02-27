export type {
  LayoutNode,
  ViewSpec,
  AppSpec,
  StateBinding,
  IntentDef,
  ClappState,
} from "./ir/types.js";

export { parseLayoutDSL } from "./parser/layout-dsl.js";
export { parseViewMd } from "./parser/view-parser.js";
export { parseAppMd } from "./parser/app-parser.js";

export {
  IntentMessageSchema,
  StateUpdateSchema,
  type IntentMessage,
  type StateUpdate,
} from "./intent/schemas.js";

export { getByPath, setByPath } from "./state/paths.js";
