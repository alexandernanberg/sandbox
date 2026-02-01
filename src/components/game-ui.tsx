import {useGame} from './game-manager'

// ============================================
// Game UI Overlay
// ============================================

export function GameUI() {
  const game = useGame()

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        zIndex: 1000,
      }}
    >
      {/* HUD - always visible during gameplay */}
      {game.phase === 'playing' && <HUD />}

      {/* Screens */}
      {game.phase === 'main-menu' && <MainMenu />}
      {game.phase === 'paused' && <PauseScreen />}
      {game.phase === 'victory' && <VictoryScreen />}
      {game.phase === 'game-over' && <GameOverScreen />}
    </div>
  )
}

// ============================================
// HUD
// ============================================

function HUD() {
  const {score, collectedCount, totalCollectibles, gameTime} = useGame()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
    >
      {/* Left side - Score */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          padding: '12px 20px',
          borderRadius: 8,
          color: 'white',
        }}
      >
        <div style={{fontSize: 14, opacity: 0.8, marginBottom: 4}}>SCORE</div>
        <div style={{fontSize: 28, fontWeight: 'bold'}}>{score}</div>
      </div>

      {/* Center - Crystals */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          padding: '12px 20px',
          borderRadius: 8,
          color: 'white',
          textAlign: 'center',
        }}
      >
        <div style={{fontSize: 14, opacity: 0.8, marginBottom: 4}}>
          CRYSTALS
        </div>
        <div style={{fontSize: 28, fontWeight: 'bold', color: '#00ffff'}}>
          {collectedCount} / {totalCollectibles}
        </div>
      </div>

      {/* Right side - Timer */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          padding: '12px 20px',
          borderRadius: 8,
          color: 'white',
          textAlign: 'right',
        }}
      >
        <div style={{fontSize: 14, opacity: 0.8, marginBottom: 4}}>TIME</div>
        <div style={{fontSize: 28, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums'}}>
          {formatTime(gameTime)}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Main Menu
// ============================================

function MainMenu() {
  const {startGame, bestTime} = useGame()

  const formatTime = (seconds: number) => {
    if (seconds === 0) return '--:--:--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        pointerEvents: 'auto',
      }}
    >
      <h1
        style={{
          fontSize: 64,
          fontWeight: 'bold',
          color: '#00ffff',
          textShadow: '0 0 20px #00ffff, 0 0 40px #00ffff',
          marginBottom: 20,
        }}
      >
        Crystal Collector
      </h1>
      <p
        style={{
          fontSize: 18,
          color: 'white',
          opacity: 0.8,
          marginBottom: 40,
          textAlign: 'center',
          maxWidth: 400,
        }}
      >
        Collect all the crystals scattered around the playground as fast as you
        can!
      </p>

      {bestTime > 0 && (
        <div
          style={{
            color: '#ffd700',
            fontSize: 18,
            marginBottom: 30,
          }}
        >
          Best Time: {formatTime(bestTime)}
        </div>
      )}

      <button
        onClick={startGame}
        style={{
          fontSize: 24,
          padding: '16px 48px',
          background: 'linear-gradient(135deg, #00ffff, #0088ff)',
          border: 'none',
          borderRadius: 8,
          color: 'white',
          fontWeight: 'bold',
          cursor: 'pointer',
          transition: 'transform 0.1s, box-shadow 0.1s',
          boxShadow: '0 4px 20px rgba(0, 255, 255, 0.4)',
        }}
        onMouseOver={(e) => {
          e.currentTarget.style.transform = 'scale(1.05)'
          e.currentTarget.style.boxShadow = '0 6px 30px rgba(0, 255, 255, 0.6)'
        }}
        onMouseOut={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(0, 255, 255, 0.4)'
        }}
      >
        Start Game
      </button>

      <div
        style={{
          marginTop: 40,
          color: 'white',
          opacity: 0.6,
          fontSize: 14,
          textAlign: 'center',
        }}
      >
        <div>WASD / Arrows - Move</div>
        <div>Space - Jump</div>
        <div>Shift - Sprint</div>
        <div>Click to lock mouse</div>
      </div>
    </div>
  )
}

// ============================================
// Pause Screen
// ============================================

function PauseScreen() {
  const {resumeGame, restartGame} = useGame()

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
        pointerEvents: 'auto',
      }}
    >
      <h1
        style={{
          fontSize: 48,
          fontWeight: 'bold',
          color: 'white',
          marginBottom: 40,
        }}
      >
        Paused
      </h1>

      <div style={{display: 'flex', gap: 20}}>
        <button
          onClick={resumeGame}
          style={{
            fontSize: 20,
            padding: '14px 36px',
            background: 'linear-gradient(135deg, #00ff88, #00aa55)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Resume
        </button>
        <button
          onClick={restartGame}
          style={{
            fontSize: 20,
            padding: '14px 36px',
            background: 'linear-gradient(135deg, #ff6644, #cc3322)',
            border: 'none',
            borderRadius: 8,
            color: 'white',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          Quit
        </button>
      </div>
    </div>
  )
}

// ============================================
// Victory Screen
// ============================================

function VictoryScreen() {
  const {restartGame, score, gameTime, bestTime} = useGame()

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.floor((seconds % 1) * 100)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
  }

  const isNewRecord = bestTime === gameTime

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        pointerEvents: 'auto',
      }}
    >
      <h1
        style={{
          fontSize: 64,
          fontWeight: 'bold',
          color: '#ffd700',
          textShadow: '0 0 20px #ffd700, 0 0 40px #ffd700',
          marginBottom: 20,
        }}
      >
        Victory!
      </h1>

      {isNewRecord && (
        <div
          style={{
            fontSize: 24,
            color: '#ff6600',
            marginBottom: 20,
            animation: 'pulse 1s infinite',
          }}
        >
          New Record!
        </div>
      )}

      <div
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          padding: '20px 40px',
          borderRadius: 12,
          marginBottom: 30,
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 40,
            color: 'white',
            fontSize: 20,
          }}
        >
          <div style={{textAlign: 'center'}}>
            <div style={{opacity: 0.7, marginBottom: 8}}>Time</div>
            <div style={{fontSize: 32, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums'}}>
              {formatTime(gameTime)}
            </div>
          </div>
          <div style={{textAlign: 'center'}}>
            <div style={{opacity: 0.7, marginBottom: 8}}>Score</div>
            <div style={{fontSize: 32, fontWeight: 'bold', color: '#00ffff'}}>
              {score}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={restartGame}
        style={{
          fontSize: 24,
          padding: '16px 48px',
          background: 'linear-gradient(135deg, #ffd700, #ff8800)',
          border: 'none',
          borderRadius: 8,
          color: 'white',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(255, 215, 0, 0.4)',
        }}
      >
        Play Again
      </button>
    </div>
  )
}

// ============================================
// Game Over Screen
// ============================================

function GameOverScreen() {
  const {restartGame, score, collectedCount, totalCollectibles} = useGame()

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.8)',
        pointerEvents: 'auto',
      }}
    >
      <h1
        style={{
          fontSize: 64,
          fontWeight: 'bold',
          color: '#ff4444',
          marginBottom: 20,
        }}
      >
        Game Over
      </h1>

      <div
        style={{
          color: 'white',
          fontSize: 20,
          marginBottom: 30,
          textAlign: 'center',
        }}
      >
        <div>You fell off the map!</div>
        <div style={{marginTop: 10, opacity: 0.8}}>
          Crystals: {collectedCount} / {totalCollectibles}
        </div>
        <div style={{opacity: 0.8}}>Score: {score}</div>
      </div>

      <button
        onClick={restartGame}
        style={{
          fontSize: 24,
          padding: '16px 48px',
          background: 'linear-gradient(135deg, #ff4444, #cc2222)',
          border: 'none',
          borderRadius: 8,
          color: 'white',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </div>
  )
}
