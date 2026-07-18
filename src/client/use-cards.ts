import { useEffect, useState } from 'react'
import { getCards, type Card } from './api'
import { errorMessage } from './format'

export function useCards() {
  const [cards, setCards] = useState<Card[]>([])
  const [selectedCardId, setSelectedCardId] = useState('')
  const [cardsError, setCardsError] = useState<string | null>(null)
  const [cardsLoaded, setCardsLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCards()
      .then((nextCards) => {
        if (cancelled) return
        setCards(nextCards)
        setSelectedCardId((current) => current || nextCards[0]?.id || '')
        setCardsLoaded(true)
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setCardsError(errorMessage(requestError, 'Cards could not be loaded'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { cards, selectedCardId, setSelectedCardId, cardsError, cardsLoaded }
}
