import { useRef } from 'react'

export default function RippleButton({ className = '', children, ...props }) {
  const containerRef = useRef(null)

  const createRipple = (event) => {
    const container = containerRef.current
    if (!container) return
    const circle = document.createElement('span')
    const diameter = Math.max(container.clientWidth, container.clientHeight)
    const radius = diameter / 2
    circle.style.width = circle.style.height = `${diameter}px`
    circle.style.left = `${event.clientX - container.getBoundingClientRect().left - radius}px`
    circle.style.top = `${event.clientY - container.getBoundingClientRect().top - radius}px`
    circle.className = 'ripple'
    const ripple = container.getElementsByClassName('ripple')[0]
    if (ripple) ripple.remove()
    container.appendChild(circle)
  }

  return (
    <button
      ref={containerRef}
      onMouseDown={createRipple}
      className={`relative overflow-hidden focus:outline-none ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
