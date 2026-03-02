"use client";

import type { ReactNode } from "react";
import { useFormContext } from "../../context/FormContext.js";

interface TextInputProps {
  name: string;
  placeholder?: string;
  type?: "text" | "password";
  children?: ReactNode;
}

export function TextInput({ name, placeholder, type = "text" }: TextInputProps) {
  const form = useFormContext();

  const value = form?.values.get(name) ?? "";

  return (
    <input
      type={type}
      className="clapp-input"
      name={name}
      placeholder={placeholder}
      value={value}
      onChange={(e) => form?.setValue(name, e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          form?.submit();
        }
      }}
    />
  );
}
