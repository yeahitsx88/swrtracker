import type { ButtonHTMLAttributes, Ref } from 'react';
import type { ActionBlocker } from './action-blockers';
import { BlockedButton } from './blocked-action';
import { cn } from './cn';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  ref?: Ref<HTMLButtonElement>;
  /** Reasons the action is unavailable. When any apply (and `disabled` is false), activating the button explains them instead of acting. */
  blockers?: ActionBlocker[];
  /** Heading for the explanation, e.g. "Can’t create the team yet". */
  blockedTitle?: string;
}

export function Button({ className, variant = 'primary', blockers, blockedTitle, ...props }: ButtonProps) {
  const base = cn('button', variant === 'secondary' && 'button-secondary', variant === 'danger' && 'button-danger');
  if (blockers?.length && !props.disabled) {
    const { disabled: _disabled, ...rest } = props;
    return <BlockedButton {...rest} baseClassName={base} className={className} blockers={blockers} blockedTitle={blockedTitle} />;
  }
  return <button className={cn(base, className)} {...props} />;
}
