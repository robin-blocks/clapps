import { createContext, useContext, useState, type ReactNode } from "react";

interface FormContextValue {
  values: Record<string, string>;
  setValue: (name: string, value: string) => void;
  reset: () => void;
}

const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext() {
  const ctx = useContext(FormContext);
  if (!ctx) {
    // Return a no-op context if not inside a form
    return {
      values: {},
      setValue: () => {},
      reset: () => {},
    };
  }
  return ctx;
}

interface FormProviderProps {
  children: ReactNode;
}

export function FormProvider({ children }: FormProviderProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const setValue = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const reset = () => {
    setValues({});
  };

  return (
    <FormContext.Provider value={{ values, setValue, reset }}>
      {children}
    </FormContext.Provider>
  );
}
