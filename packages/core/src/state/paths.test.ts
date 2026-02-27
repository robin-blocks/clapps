import { describe, it, expect } from "vitest";
import { getByPath, setByPath } from "./paths.js";

describe("getByPath", () => {
  it("gets top-level value", () => {
    expect(getByPath({ foo: "bar" }, "foo")).toBe("bar");
  });

  it("gets nested value", () => {
    expect(getByPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("returns undefined for missing path", () => {
    expect(getByPath({ a: 1 }, "b.c")).toBeUndefined();
  });
});

describe("setByPath", () => {
  it("sets top-level value immutably", () => {
    const obj = { foo: "bar" };
    const result = setByPath(obj, "foo", "baz");
    expect(result.foo).toBe("baz");
    expect(obj.foo).toBe("bar");
  });

  it("sets nested value", () => {
    const obj = { a: { b: 1 } };
    const result = setByPath(obj, "a.b", 2);
    expect((result.a as Record<string, unknown>).b).toBe(2);
  });

  it("creates intermediate objects", () => {
    const result = setByPath({}, "a.b.c", "deep");
    expect(
      ((result.a as Record<string, unknown>).b as Record<string, unknown>).c,
    ).toBe("deep");
  });
});
