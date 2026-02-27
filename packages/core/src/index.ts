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
  AppEntrySchema,
  AppsUpdateSchema,
  ViewUpdateSchema,
  type IntentMessage,
  type StateUpdate,
  type AppEntry,
  type AppsUpdate,
  type ViewUpdate,
} from "./intent/schemas.js";

export { getByPath, setByPath } from "./state/paths.js";
