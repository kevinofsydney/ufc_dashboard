import { CircleHelp } from 'lucide-react'
import { useId } from 'react'

interface HelpTooltipProps {
  label: string
  text: string
  align?: 'center' | 'left' | 'right'
}

export function HelpTooltip({
  label,
  text,
  align = 'center',
}: HelpTooltipProps) {
  const tooltipId = useId()

  return (
    <span className={`help-tooltip help-tooltip--${align}`}>
      <button
        className="help-tooltip__trigger"
        type="button"
        aria-label={`Help: ${label}`}
        aria-describedby={tooltipId}
      >
        <CircleHelp size={16} strokeWidth={1.9} aria-hidden="true" />
      </button>
      <span className="help-tooltip__content" id={tooltipId} role="tooltip">
        {text}
      </span>
    </span>
  )
}
