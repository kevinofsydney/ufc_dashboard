import type { Card } from '../api'

interface CardSelectProps {
  cards: Card[]
  value: string
  onChange: (cardId: string) => void
  label?: string
  className?: string
}

export function CardSelect({
  cards,
  value,
  onChange,
  label = 'Working card',
  className = 'source-card-select',
}: CardSelectProps) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {cards.length === 0 && <option value="">Create a card first</option>}
        {cards.map((card) => (
          <option key={card.id} value={card.id}>
            {card.name}
          </option>
        ))}
      </select>
    </label>
  )
}
