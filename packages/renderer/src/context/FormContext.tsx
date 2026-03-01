"use client";

import { createContext, useContext } from "react";

export interface FormContextValue {
  values: Map<string, string>;
  setValue: (name: string, value: string) => void;
  submit: () => void;
}

export const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext(): FormContextValue | null {
  return useContext(FormContext);
}
