import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FormProvider, useFormContext } from "./FormContext";
import { useClappContext } from "@clapps/renderer";

interface IntentFormProps {
  intent: string;
  submitLabel?: string;
  children?: ReactNode;
}

function IntentFormInner({ intent, submitLabel = "Submit", children }: IntentFormProps) {
  const { values, reset } = useFormContext();
  const { sendIntent } = useClappContext();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendIntent(intent, values);
    reset();
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {children}
      <Button type="submit" className="self-start">
        {submitLabel}
      </Button>
    </form>
  );
}

export function IntentForm(props: IntentFormProps) {
  return (
    <FormProvider>
      <IntentFormInner {...props} />
    </FormProvider>
  );
}
