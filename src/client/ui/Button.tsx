import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { press, spring } from './motion';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Props = HTMLMotionProps<'button'> & { variant?: Variant };

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-white shadow-[0_6px_20px_rgba(79,85,200,0.35)] hover:brightness-110',
  secondary: 'glass !rounded-full text-ink hover:bg-white/80',
  danger: 'bg-danger text-white hover:brightness-110',
  ghost: 'text-ink-soft hover:bg-white/60',
};

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: Props) {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.button
      type={type}
      whileHover={rest.disabled || reduce ? undefined : { y: -1 }}
      whileTap={rest.disabled || reduce ? undefined : press}
      transition={spring}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...rest}
    />
  );
}
