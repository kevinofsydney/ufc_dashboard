import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { getCards, type Card } from './api'
import { errorMessage } from './format'

const selectedCardStorageKey = 'fightfolio.selected-card.v1'

interface CardsContextValue {
  cards: Card[]
  setCards: Dispatch<SetStateAction<Card[]>>
  selectedCardId: string
  setSelectedCardId: Dispatch<SetStateAction<string>>
  cardsError: string | null
  cardsLoaded: boolean
  refreshCards: () => Promise<void>
}

const CardsContext = createContext<CardsContextValue | null>(null)

function storedCardId(): string {
  try {
    return (
      new URLSearchParams(window.location.search).get('card') ??
      window.localStorage.getItem(selectedCardStorageKey) ??
      ''
    )
  } catch {
    return ''
  }
}

export function CardsProvider({ children }: { children: ReactNode }) {
  const [cards, setCards] = useState<Card[]>([])
  const [selectedCardId, setSelectedCardId] = useState(storedCardId)
  const [cardsError, setCardsError] = useState<string | null>(null)
  const [cardsLoaded, setCardsLoaded] = useState(false)

  const refreshCards = async () => {
    try {
      const nextCards = await getCards()
      setCards(nextCards)
      setSelectedCardId((current) =>
        nextCards.some((card) => card.id === current)
          ? current
          : (nextCards[0]?.id ?? ''),
      )
      setCardsError(null)
      setCardsLoaded(true)
    } catch (requestError) {
      setCardsError(errorMessage(requestError, 'Cards could not be loaded'))
      setCardsLoaded(true)
    }
  }

  useEffect(() => {
    let cancelled = false
    getCards()
      .then((nextCards) => {
        if (cancelled) return
        setCards(nextCards)
        setSelectedCardId((current) =>
          nextCards.some((card) => card.id === current)
            ? current
            : (nextCards[0]?.id ?? ''),
        )
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

  useEffect(() => {
    if (!selectedCardId) return
    try {
      window.localStorage.setItem(selectedCardStorageKey, selectedCardId)
    } catch {
      // Selection still applies for this session when storage is unavailable.
    }
  }, [selectedCardId])

  return createElement(
    CardsContext.Provider,
    {
      value: {
        cards,
        setCards,
        selectedCardId,
        setSelectedCardId,
        cardsError,
        cardsLoaded,
        refreshCards,
      },
    },
    children,
  )
}

export function useCards(): CardsContextValue {
  const value = useContext(CardsContext)
  if (!value) throw new Error('useCards must be used inside CardsProvider')
  return value
}
