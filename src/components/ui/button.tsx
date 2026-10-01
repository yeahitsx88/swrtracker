import type { ButtonHTMLAttributes, Ref } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({ className, variant = 'primary', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'button',
        variant === 'secondary' && 'button-secondary',
        variant === 'danger' && 'button-danger',
        className,
      )}
      {...props}
    />
  );
}
