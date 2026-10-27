import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { press, spring } from './motion';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white shadow-[0_6px_20px_rgba(79,85,200,0.30)] hover:brightness-110',
  secondary: 'glass !rounded-full text-ink hover:bg-white/80',
  danger: 'bg-danger text-white hover:brightness-110',
  ghost: 'text-ink-soft hover:bg-white/60 hover:text-ink',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-xs',
  md: 'h-10 gap-2 px-5 text-sm',
};

/** Shared class list so links styled as buttons match <Button> exactly. */
export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md') {
  return `inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full font-semibold transition-[filter,background-color,color] disabled:cursor-not-allowed disabled:opacity-50 ${SIZES[size]} ${VARIANTS[variant]}`;
}

type Props = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  className = '',
  type = 'button',
  children,
  ...rest
}: Props) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.button
      type={type}
      whileHover={rest.disabled || reduce ? undefined : { y: -1 }}
      whileTap={rest.disabled || reduce ? undefined : press}
      transition={spring}
      className={`${buttonClass(variant, size)} ${className}`}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} />}
      {children}
    </motion.button>
  );
}
