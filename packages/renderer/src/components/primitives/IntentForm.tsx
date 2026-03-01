"use client";

import { type ReactNode, useCallback, useMemo, useState } from "react";
import { useIntent } from "../../context/ClappProvider.js";
import { FormContext, type FormContextValue } from "../../context/FormContext.js";

interface IntentFormProps {
  intent: string;
  submitLabel?: string;
  children?: ReactNode;
}

export function IntentForm({
  intent,
  submitLabel = "Submit",
  children,
}: IntentFormProps) {
  const { emit } = useIntent();
  const [values, setValues] = useState<Map<string, string>>(() => new Map());

  const setValue = useCallback((name: string, value: string) => {
    setValues((prev) => {
      const next = new Map(prev);
      next.set(name, value);
      return next;
    });
  }, []);

  const submit = useCallback(() => {
    const payload: Record<string, string> = {};
    for (const [k, v] of values) {
      payload[k] = v;
    }
    emit(intent, payload);
    setValues(new Map());
  }, [values, emit, intent]);

  const ctx = useMemo<FormContextValue>(
    () => ({ values, setValue, submit }),
    [values, setValue, submit],
  );

  return (
    <FormContext.Provider value={ctx}>
      <form
        className="clapp-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {children}
        {submitLabel && (
          <button type="submit" className="clapp-btn clapp-btn-default clapp-btn-md">
            {submitLabel}
          </button>
        )}
      </form>
    </FormContext.Provider>
  );
}
