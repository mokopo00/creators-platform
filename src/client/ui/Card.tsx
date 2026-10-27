import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { fadeUp, hoverLift, spring } from './motion';

type Props = HTMLMotionProps<'div'> & { interactive?: boolean };

export function Card({ interactive, className = '', children, ...rest }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      variants={fadeUp}
      whileHover={interactive && !reduce ? hoverLift : undefined}
      transition={spring}
      className={`glass p-4 ${className}`}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
