import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  children: ReactNode;
  id?: string;
}

export function Field({ label, children, id }: FieldProps) {
  return (
    <label className="field" id={id}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
