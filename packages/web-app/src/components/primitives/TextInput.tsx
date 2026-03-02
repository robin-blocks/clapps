import { Input } from "@/components/ui/input";
import { useFormContext } from "./FormContext";

interface TextInputProps {
  name: string;
  type?: string;
  placeholder?: string;
}

export function TextInput({ name, type = "text", placeholder }: TextInputProps) {
  const { values, setValue } = useFormContext();
  const value = values[name] ?? "";

  return (
    <Input
      type={type}
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(name, e.target.value)}
    />
  );
}
