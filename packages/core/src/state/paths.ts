/** Get a value from a nested object by dot path */
export function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Set a value in a nested object by dot path (immutable) */
export function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  if (parts.length === 1) {
    return { ...obj, [parts[0]]: value };
  }
  const [head, ...rest] = parts;
  const child = (obj[head] as Record<string, unknown>) ?? {};
  return {
    ...obj,
    [head]: setByPath(child, rest.join("."), value),
  };
}
