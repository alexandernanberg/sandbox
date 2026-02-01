import type {Entity} from 'koota'
import {useWorld} from 'koota/react'
import {
  createContext,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type {GamePhase} from '~/ecs/game'
import {IsGameState, GameState} from '~/ecs/game'
import {usePhysicsUpdate} from '~/ecs/physics'

// ============================================
// Game Context
// ============================================

interface GameContextValue {
  // State
  phase: GamePhase
  score: number
  collectedCount: number
  totalCollectibles: number
  gameTime: number
  bestTime: number

  // Actions
  startGame: () => void
  pauseGame: () => void
  resumeGame: () => void
  restartGame: () => void
  collectItem: (value: number) => void
  setTotalCollectibles: (count: number) => void
  triggerGameOver: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

export function useGame() {
  const context = use(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameManager')
  }
  return context
}

// ============================================
// Game Manager Provider
// ============================================

interface GameManagerProps {
  children: React.ReactNode
}

export function GameManager({children}: GameManagerProps) {
  const world = useWorld()
  const gameEntityRef = useRef<Entity | null>(null)

  // Local state for React re-renders
  const [phase, setPhase] = useState<GamePhase>('main-menu')
  const [score, setScore] = useState(0)
  const [collectedCount, setCollectedCount] = useState(0)
  const [totalCollectibles, setTotalCollectiblesState] = useState(0)
  const [gameTime, setGameTime] = useState(0)
  const [bestTime, setBestTime] = useState(0)

  // Create game state entity
  useLayoutEffect(() => {
    const entity = world.spawn(IsGameState, GameState)
    gameEntityRef.current = entity

    // Load best time from localStorage
    const saved = localStorage.getItem('crystalGame_bestTime')
    if (saved) {
      const time = parseFloat(saved)
      setBestTime(time)
      entity.set(GameState, {...entity.get(GameState)!, bestTime: time})
    }

    return () => {
      if (entity.isAlive()) {
        entity.destroy()
      }
    }
  }, [world])

  // Update game timer during play
  usePhysicsUpdate((delta) => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    const state = entity.get(GameState)
    if (!state || state.phase !== 'playing' || state.isPaused) return

    const newTime = state.gameTime + delta
    entity.set(GameState, {...state, gameTime: newTime})
    setGameTime(newTime)
  })

  // Actions
  const startGame = useCallback(() => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    entity.set(GameState, {
      ...entity.get(GameState)!,
      phase: 'playing',
      previousPhase: 'main-menu',
      isPaused: false,
      gameTime: 0,
      score: 0,
      collectedCount: 0,
    })
    setPhase('playing')
    setScore(0)
    setCollectedCount(0)
    setGameTime(0)
  }, [])

  const pauseGame = useCallback(() => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    const state = entity.get(GameState)!
    entity.set(GameState, {
      ...state,
      phase: 'paused',
      previousPhase: state.phase,
      isPaused: true,
    })
    setPhase('paused')
  }, [])

  const resumeGame = useCallback(() => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    const state = entity.get(GameState)!
    entity.set(GameState, {
      ...state,
      phase: 'playing',
      isPaused: false,
    })
    setPhase('playing')
  }, [])

  const restartGame = useCallback(() => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    entity.set(GameState, {
      ...entity.get(GameState)!,
      phase: 'main-menu',
      previousPhase: 'main-menu',
      isPaused: false,
      gameTime: 0,
      score: 0,
      collectedCount: 0,
    })
    setPhase('main-menu')
    setScore(0)
    setCollectedCount(0)
    setGameTime(0)
  }, [])

  const collectItem = useCallback((value: number) => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    const state = entity.get(GameState)!
    const newScore = state.score + value
    const newCollected = state.collectedCount + 1

    entity.set(GameState, {
      ...state,
      score: newScore,
      collectedCount: newCollected,
    })
    setScore(newScore)
    setCollectedCount(newCollected)

    // Check for victory
    if (newCollected >= state.totalCollectibles) {
      // Save best time
      if (state.bestTime === 0 || state.gameTime < state.bestTime) {
        const newBestTime = state.gameTime
        entity.set(GameState, {
          ...entity.get(GameState)!,
          bestTime: newBestTime,
          phase: 'victory',
        })
        setBestTime(newBestTime)
        localStorage.setItem('crystalGame_bestTime', newBestTime.toString())
      } else {
        entity.set(GameState, {...entity.get(GameState)!, phase: 'victory'})
      }
      setPhase('victory')
    }
  }, [])

  const setTotalCollectibles = useCallback((count: number) => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    entity.set(GameState, {...entity.get(GameState)!, totalCollectibles: count})
    setTotalCollectiblesState(count)
  }, [])

  const triggerGameOver = useCallback(() => {
    const entity = gameEntityRef.current
    if (!entity || !entity.isAlive()) return

    const state = entity.get(GameState)!
    entity.set(GameState, {
      ...state,
      phase: 'game-over',
      previousPhase: state.phase,
    })
    setPhase('game-over')
  }, [])

  const value = useMemo<GameContextValue>(
    () => ({
      phase,
      score,
      collectedCount,
      totalCollectibles,
      gameTime,
      bestTime,
      startGame,
      pauseGame,
      resumeGame,
      restartGame,
      collectItem,
      setTotalCollectibles,
      triggerGameOver,
    }),
    [
      phase,
      score,
      collectedCount,
      totalCollectibles,
      gameTime,
      bestTime,
      startGame,
      pauseGame,
      resumeGame,
      restartGame,
      collectItem,
      setTotalCollectibles,
      triggerGameOver,
    ],
  )

  return <GameContext value={value}>{children}</GameContext>
}
