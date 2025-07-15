import { useEffect } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'

export default function AnimatedNumber({ value }) {
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 100, damping: 20 })
  useEffect(() => {
    mv.set(Number(value) || 0)
  }, [value, mv])
  return (
    <motion.span>{spring.to((v) => Number(v).toFixed(2).replace(/\.00$/, ''))}</motion.span>
  )
}
