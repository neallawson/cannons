import './style.css';
import { GameState } from './game/GameState';
import { Renderer } from './game/Renderer';
import { GameLoop } from './game/GameLoop';
import { PhysicsEngine } from './game/PhysicsEngine';
import { NetworkManager } from './game/NetworkManager';
import { InputManager } from './game/InputManager';
import { AIOpponent } from './game/AIOpponent';
import { ModalManager } from './game/ModalManager';
import type { Player, GameStateData } from './game/types';
import { LobbyUI } from './game/LobbyUI';

// --- Globals ---
let gameState: GameState;
let renderer: Renderer | undefined;
let physicsEngine: PhysicsEngine;
let loop: GameLoop | undefined;
let lobbyUI: LobbyUI;
let modalManager: ModalManager;
let networkManager: NetworkManager;
let inputManager: InputManager;

// State Variables
let isMultiplayer = false;
let myPlayerId = 'p1';
let maxPower = 60; // Upgraded from 55
let isMobileMode = false;
let aiDifficulty = 50; // Default 50

// Constants
const LOGICAL_WIDTH = 3000;
const LOGICAL_HEIGHT = 1332;

// --- DOM Setup ---
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="gameCanvas"></canvas>
  <div id="game-ui-container">
      <div id="hud-panel">
        <div id="game-info">
            <div id="game-count" class="hud-row">Game: 1</div>
            <div id="turn-display" class="hud-row">Turn: -</div>
        </div>
        <div id="score-board"></div>
        <div id="mp-label" style="text-align: center; margin-top: 10px; color: #FFD700; border-top: 1px solid #555; padding-top: 5px; cursor: pointer;">▶ Click for 2-Player Mode</div>
         <div id="mp-controls" style="border-top: none; margin-top: 5px; padding-top: 0; display: none; flex-direction: column;">
            <div style="display: flex; flex-direction: row; gap: 10px; width: 100%;">
                <a id="hostBtn" class="btn-link" style="text-align:center; flex: 1;">Host Game</a>
                <a id="joinBtn" class="btn-link" style="text-align:center; flex: 1;">Join Game</a>
            </div>
            <div id="status" style="font-size: 1.8rem; color: #ccc; margin-top: 5px; text-align: center;"></div>
        </div>
      </div>

      <div id="ui-layer" style="position: absolute; bottom: 20px; left: 20px; color: white; font-family: sans-serif;">
        <label>Power: 
            <div id="power-container">
                <input type="range" id="powerSlider" min="10" max="100" value="50">
            </div>
        </label>
        <span id="powerValue">50</span>
        <span id="angle-display">Angle: 45°</span>
      </div>
      <div id="window-size" style="position: absolute; top: 10px; right: 10px; color: lime; font-family: monospace; font-size: 16px; background: rgba(0,0,0,0.5); padding: 5px; pointer-events: none;"></div>
  </div>

  <div id="mobile-controls">
      <div id="mobileAngleDisplay" style="font-weight: bold; color: #FFD700; font-size: 1.2rem; white-space: nowrap;">Ang: 45°</div>
      <div style="display: flex; align-items: center; flex: 1; margin: 0 5px;">
          <span style="font-size: 1rem;">Pwr:</span>
          <input type="range" id="mobilePowerSlider" min="10" max="100" value="50">
          <span id="mobilePowerValue" style="width: 30px; text-align: right; font-size: 1rem;">50</span>
      </div>
      <button id="mobileFireBtn" class="mobile-fire-btn">FIRE</button>
  </div>
`;

function log(msg: string) {
  console.log(msg);
}

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;

// --- Helper Functions ---

function updateHUD(state: GameStateData) {
  const totalWins = state.players.reduce((sum: number, p: Player) => sum + p.wins, 0);
  document.getElementById('game-count')!.innerText = `Game: ${totalWins + 1}`;

  const currentPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
  if (currentPlayer) {
    const turnEl = document.getElementById('turn-display')!;
    turnEl.innerHTML = `Turn: <span style="color: ${currentPlayer.color}">${currentPlayer.name}</span>`;
    turnEl.style.color = 'white';
  }

  const sortedPlayers = [...state.players].sort((a, b) => b.wins - a.wins);
  const scoreBoard = document.getElementById('score-board')!;
  const scoreFontSize = isMobileMode ? '4.0rem' : '3.0rem';
  scoreBoard.innerHTML = sortedPlayers.map(p =>
    `<div style="color: ${p.color}; font-size: ${scoreFontSize};">${p.name}: ${p.wins}</div>`
  ).join('');
}

function updateUILayout() {
  if (!renderer) return;
  const container = document.getElementById('game-ui-container');
  if (container) {
    const scale = renderer.getScale();
    const offset = renderer.getViewOffset();

    container.style.width = `${LOGICAL_WIDTH}px`;
    container.style.height = `${LOGICAL_HEIGHT}px`;
    container.style.transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;
    container.style.transformOrigin = 'top left';
  }
}

function updatePlayerUI() {
  const uiLayer = document.getElementById('ui-layer');
  if (!uiLayer) return;
  uiLayer.classList.remove('ui-right', 'theme-blue', 'theme-red');

  if (myPlayerId === 'p2') {
    uiLayer.classList.add('ui-right', 'theme-blue');
  } else {
    uiLayer.classList.add('theme-red');
  }
}

function resetScoreboard() {
  sessionStorage.setItem('p1_wins', '0');
  sessionStorage.setItem('p2_wins', '0');
}

// --- Game Logic ---

function setupGameSubscriptions() {
  // AI Opponent
  const aiOpponent = new AIOpponent('p2', (angle, power) => {
    const damageSeed = Math.random();
    physicsEngine.fireProjectile(gameState.getState(), angle, power, 'p2', damageSeed);
    gameState.nextTurn();
  });
  aiOpponent.setDifficulty(aiDifficulty);

  let gameOverHandled = false;
  let teamStatusUpdated = false;

  gameState.subscribe(state => {
    // Multiplayer Status update
    if (isMultiplayer && myPlayerId && !teamStatusUpdated) {
      const myPlayer = state.players.find(p => p.id === myPlayerId);
      if (myPlayer) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.innerHTML = `You are the <span style="color: ${myPlayer.color}; font-weight: bold;">${myPlayer.name}</span>`;
          teamStatusUpdated = true;
        }
      }
    }

    if (state.gameStatus === 'finished') {
      if (gameOverHandled) return;
      if (state.explosions.length > 0) return;

      gameOverHandled = true;
      if (loop) loop.stop();

      let winnerName = 'Unknown';
      if (state.winnerId === 'draw') {
        winnerName = 'Draw';
        state.players.forEach(p => {
          p.wins++;
          sessionStorage.setItem(`${p.id}_wins`, p.wins.toString());
        });
      } else {
        const winner = state.players.find(p => p.id === state.winnerId);
        winnerName = winner?.name || 'Unknown';
        if (winner) {
          winner.wins++;
          sessionStorage.setItem(`${winner.id}_wins`, winner.wins.toString());
        }
      }

      // Overlay
      const overlay = document.createElement('div');
      overlay.id = 'game-over-overlay';
      overlay.style.cssText = `
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          color: white;
          font-family: sans-serif;
          z-index: 1000;
        `;

      overlay.innerHTML = `
          <h1 style="font-size: 60px; color: #FFD700; text-shadow: 4px 4px #000;">${state.winnerId === 'draw' ? "It's a Draw!" : "Game Over!"}</h1>
          <h2 style="font-size: 40px;">${state.winnerId === 'draw' ? "Both Teams Win!" : `Winner: ${winnerName}`}</h2>
          <h3 style="font-size: 30px;">in ${state.round} volleys</h3>
          <button id="playAgainBtn" style="padding: 15px 30px; font-size: 30px; cursor: pointer; font-family: sans-serif;">Play Again</button>
        `;

      document.getElementById('game-ui-container')!.appendChild(overlay);

      const btn = document.getElementById('playAgainBtn')!;
      const handleReset = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        resetGame();
      };
      btn.addEventListener('touchstart', handleReset, { passive: false });
      btn.addEventListener('click', handleReset);
      return;
    }

    // Input Handling
    inputManager.setCanFire(state.gameStatus === 'playing');

    if (isMultiplayer) {
      inputManager.setMyTurn(state.currentTurnPlayerId === myPlayerId);
      const myPlayer = state.players.find(p => p.id === myPlayerId);
      if (myPlayer) {
        inputManager.setCannonPosition(myPlayer.castlePosition.x, myPlayer.castlePosition.y - 70);
      }
    } else {
      const isP1Turn = state.currentTurnPlayerId === 'p1';
      inputManager.setMyTurn(isP1Turn);
      if (isP1Turn) {
        const p1 = state.players.find(p => p.id === 'p1');
        if (p1) {
          inputManager.setCannonPosition(p1.castlePosition.x, p1.castlePosition.y - 70);
        }
      }
      // AI Update
      if (!isMultiplayer) {
        aiOpponent.update(state, physicsEngine);
      }
    }
  });

  // Debug Tuner
  (window as any).setAIDifficulty = (level: number) => {
    aiOpponent.setDifficulty(level);
  };
}

function startGame(seed: number) {
  if (loop) loop.stop();
  if (renderer) renderer.destroy();

  renderer = new Renderer(canvas);
  gameState = new GameState(LOGICAL_WIDTH, LOGICAL_HEIGHT, seed);
  physicsEngine = new PhysicsEngine(renderer);

  const hillWidth = 300;
  gameState.update((state) => {
    const p1X = hillWidth / 2;
    const p2X = LOGICAL_WIDTH - hillWidth / 2;

    const player1: Player = {
      id: 'p1', name: 'Red Team', color: '#FF0000',
      castlePosition: { x: p1X, y: 0 }, cannonAngle: 45, health: 100,
      wins: parseInt(sessionStorage.getItem('p1_wins') || '0'), isMyTurn: true,
    };

    let p2Label = "Player 2";
    if (!isMultiplayer) {
      if (aiDifficulty === 25) p2Label = "AI Easy";
      else if (aiDifficulty === 50) p2Label = "AI Medium";
      else if (aiDifficulty === 75) p2Label = "AI Hard";
      else if (aiDifficulty === 100) p2Label = "AI Expert";
      else p2Label = "AI Bot";
    }

    const player2: Player = {
      id: 'p2', name: 'Blue Team', color: '#0066FF',
      castlePosition: { x: p2X, y: 0 }, cannonAngle: 135, health: 100,
      wins: parseInt(sessionStorage.getItem('p2_wins') || '0'), isMyTurn: false,
      difficultyLabel: !isMultiplayer ? p2Label : undefined
    };
    gameState.addPlayer(player1);
    gameState.addPlayer(player2);
    state.gameStatus = 'playing';
  });

  loop = new GameLoop(
    (dt) => {
      gameState.update(state => {
        physicsEngine.update(state, dt, (stepDt) => gameState.updateWind(stepDt));
        const wasPlaying = state.gameStatus === 'playing';
        if (wasPlaying && state.gameStatus === 'ending') {
          if (inputManager.canFire()) inputManager.setCanFire(false);
        }
      });
    },
    () => {
      const state = gameState.getState();
      if (renderer) renderer.render(state);
      updateHUD(state);
      if (renderer) {
        const offset = renderer.getViewOffset();
        const scale = renderer.getScale();
        inputManager.setViewOffset(offset.x, offset.y);
        inputManager.setScale(scale);
      }
    }
  );

  loop.start();
  setupGameSubscriptions();
  updateUILayout();

  // Mobile Setup
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmallScreen = window.innerWidth <= 768;
  if (isTouchDevice && isSmallScreen) {
    isMobileMode = true;
    inputManager.setMobileMode(true);
    const desktopUI = document.getElementById('ui-layer');
    if (desktopUI) desktopUI.style.display = 'none';
    const mobileUI = document.getElementById('mobile-controls');
    if (mobileUI) {
      mobileUI.classList.add('active');
      if (renderer) {
        renderer.setSafeZone(mobileUI.offsetHeight);
        updateUILayout();
      }
    }

    const mobileFireBtn = document.getElementById('mobileFireBtn');
    if (mobileFireBtn) {
      mobileFireBtn.onclick = (e) => { e.preventDefault(); inputManager.fire(); };
      mobileFireBtn.ontouchstart = (e) => { e.preventDefault(); inputManager.fire(); };
    }

    const mobilePowerSlider = document.getElementById('mobilePowerSlider') as HTMLInputElement;
    const mobilePowerValue = document.getElementById('mobilePowerValue');
    if (mobilePowerSlider) {
      mobilePowerSlider.oninput = (e) => {
        let val = parseInt((e.target as HTMLInputElement).value);
        if (val > 60) { val = 60; (e.target as HTMLInputElement).value = '60'; }
        if (mobilePowerValue) mobilePowerValue.innerText = val > 59 ? '60 (MAX)' : val.toString();
        inputManager.setPower(val);
      }
    }
  }
}

function resetGame(remoteSeed?: number) {
  if (remoteSeed !== undefined) {
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.remove();
    startGame(remoteSeed);
    return;
  }

  if (isMultiplayer) {
    if (myPlayerId === 'p1') {
      const overlay = document.getElementById('game-over-overlay');
      if (overlay) overlay.remove();
      const newSeed = Date.now();
      networkManager.sendData({ type: 'restart', seed: newSeed });
      startGame(newSeed);
    } else {
      const playAgainBtn = document.getElementById('playAgainBtn');
      if (playAgainBtn) playAgainBtn.style.display = 'none';
      let statusMsg = document.getElementById('game-over-status');
      if (!statusMsg) {
        statusMsg = document.createElement('h3');
        statusMsg.id = 'game-over-status';
        statusMsg.style.cssText = "font-size: 30px; margin-top: 20px; color: #ccc; font-family: sans-serif;";
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.appendChild(statusMsg);
      }
      if (statusMsg) statusMsg.innerText = "Waiting for Host...";
    }
  } else {
    // Single Player
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.remove();
    startGame(Date.now());
  }
}

function promptDifficultyAndStart() {
  modalManager.showSelectionDialog(
    "Select AI Difficulty",
    [
      { label: "Easy", value: 25 },
      { label: "Medium", value: 50 },
      { label: "Hard", value: 75 },
      { label: "Expert", value: 100 }
    ],
    (level) => {
      console.log(`Difficulty Selected: ${level}`);
      aiDifficulty = level;
      resetGame();
    }
  );
}

function enterSinglePlayerMode(notifyPeer: boolean = true) {
  if (notifyPeer) networkManager.sendData({ type: 'player_left' });
  isMultiplayer = false;
  myPlayerId = 'p1';
  networkManager.resetConnection();
  resetScoreboard();
  updatePlayerUI();
  const mpLabel = document.getElementById('mp-label');
  if (mpLabel) mpLabel.innerText = "▶ Click for 2-Player Mode";
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.innerText = "";

  promptDifficultyAndStart();
}

function enterMultiplayerMode(seed: number, isHost: boolean) {
  if (loop) loop.stop();
  lobbyUI.hide();
  modalManager.hide();
  isMultiplayer = true;
  myPlayerId = isHost ? 'p1' : 'p2';
  resetScoreboard();
  const mpLabel = document.getElementById('mp-label');
  if (mpLabel) mpLabel.innerText = "■ Stop Multiplayer";
  modalManager.showTemporaryMessage(myPlayerId === 'p1' ? "You are the Red Team" : "You are the Blue Team", 3);
  updatePlayerUI();
  startGame(seed);
}

// --- Initialization ---

modalManager = new ModalManager();

networkManager = new NetworkManager(
  (data) => {
    if (data.type === 'fire') {
      const otherPlayerId = myPlayerId === 'p1' ? 'p2' : 'p1';
      if (data.windData) gameState.setWindState(data.windData);
      gameState.update(state => {
        const player = state.players.find(p => p.id === otherPlayerId);
        if (player) player.cannonAngle = data.angle;
      });
      physicsEngine.fireProjectile(gameState.getState(), data.angle, data.power, otherPlayerId, data.damageSeed);
      gameState.nextTurn();
    } else if (data.type === 'restart') {
      resetGame(data.seed);
    } else if (data.type === 'player_left') {
      modalManager.showTemporaryMessage("Peers left. Returning to Single Player.", 3);
      enterSinglePlayerMode(false);
    }
  },
  (seed, isHost) => {
    enterMultiplayerMode(seed, isHost);
  },
  log
);

lobbyUI = new LobbyUI(networkManager, modalManager);

inputManager = new InputManager(
  canvas,
  (angle, power) => {
    if (!gameState) return;
    const currentId = gameState.getState().currentTurnPlayerId;
    if (isMultiplayer && currentId !== myPlayerId) return;

    const damageSeed = Math.random();
    physicsEngine.fireProjectile(gameState.getState(), angle, power, currentId, damageSeed);
    gameState.nextTurn();
    if (isMultiplayer) {
      const windData = gameState.getWindState();
      networkManager.sendData({ type: 'fire', angle, power, damageSeed, windData });
    }
  },
  (angle) => {
    // UI Updates for Angle
    const angleDisplay = document.getElementById('angle-display');
    if (angleDisplay) {
      let dAngle = Math.round(angle);
      if (myPlayerId === 'p2') dAngle = 180 - dAngle;
      else if (dAngle > 180) dAngle -= 360;
      angleDisplay.innerText = `Angle: ${dAngle}°`;
    }
    const mobileAngleDisplay = document.getElementById('mobileAngleDisplay');
    if (isMobileMode && mobileAngleDisplay) {
      let dAngle = Math.round(angle);
      if (myPlayerId === 'p2') dAngle = 180 - dAngle;
      // Fix negative angle display
      else if (dAngle > 180) dAngle -= 360;
      mobileAngleDisplay.innerText = `Ang: ${dAngle}°`;
    }

    if (!gameState) return;
    gameState.update(state => {
      const targetId = isMultiplayer ? myPlayerId : state.currentTurnPlayerId;
      const p = state.players.find(pl => pl.id === targetId);
      if (p) p.cannonAngle = angle;
    });
  }
);

// Window Listeners
window.addEventListener('resize', updateUILayout);

const powerSlider = document.getElementById('powerSlider') as HTMLInputElement;
const powerValue = document.getElementById('powerValue')!;
const mpLabel = document.getElementById('mp-label')!;

powerSlider.addEventListener('input', (e) => {
  let val = parseInt((e.target as HTMLInputElement).value);
  if (val > maxPower) { val = maxPower; (e.target as HTMLInputElement).value = maxPower.toString(); }
  powerValue.innerText = val > 59 ? `${val} (MAX)` : val.toString();
  inputManager.setPower(val);
});

mpLabel.addEventListener('click', () => {
  if (isMultiplayer) {
    modalManager.showConfirmation("Stop multiplayer?", () => {
      enterSinglePlayerMode(true);
    });
  } else {
    lobbyUI.show();
    lobbyUI.showMainMenu();
  }
});

// Start
if (!isMultiplayer) {
  promptDifficultyAndStart();
}
