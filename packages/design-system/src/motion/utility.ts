type MotionTransition = {
  duration: number;
  ease: string | [number, number, number, number];
};

export const utilityMotion = {
  quick: {
    duration: 0.12,
    ease: 'easeOut',
  } satisfies MotionTransition,
  standard: {
    duration: 0.18,
    ease: 'easeOut',
  } satisfies MotionTransition,
  emphasis: {
    duration: 0.22,
    ease: [0.2, 0.8, 0.2, 1],
  } satisfies MotionTransition,
};

export const reducedMotionStyles = {
  transitionDuration: '1ms',
  animationDuration: '1ms',
} as const;
