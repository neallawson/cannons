import './style.css';
import { GameState } from './game/GameState';
import { Renderer } from './game/Renderer';
import { GameLoop } from './game/GameLoop';
import type { Player, GameStateData } from './game/types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="gameCanvas"></canvas>
  
  <div id="hud-panel">
    <div id="game-info">
        <div id="game-count" class="hud-row">Game: 1</div>
        <div id="wind-display" class="hud-row">Wind: 0.0</div>
        <div id="turn-display" class="hud-row">Turn: -</div>
    </div>
    <div id="score-board"></div>
    
    <div id="mp-label" style="text-align: center; font-size: 1.2rem; margin-top: 10px; color: #ddd; border-top: 1px solid #555; padding-top: 5px; cursor: pointer;">▶ 2-Player Mode</div>
    <div id="mp-controls" style="border-top: none; margin-top: 5px; padding-top: 0; display: none;">
        <a id="hostBtn" class="btn-link" style="text-align:center;">Host Game</a>
        <a id="joinBtn" class="btn-link" style="text-align:center;">Join Game</a>
        <div id="status" style="font-size: 0.9rem; color: #ccc; margin-top: 5px; text-align: center;"></div>
    </div>
  </div>

  <div id="ui-layer" style="position: absolute; bottom: 20px; left: 20px; color: white; font-family: sans-serif;">
    <label>Power: <input type="range" id="powerSlider" min="10" max="100" value="50"></label>
    <span id="powerValue">50</span>
  </div>
  <div id="window-size" style="position: absolute; top: 10px; right: 10px; color: lime; font-family: monospace; font-size: 16px; background: rgba(0,0,0,0.5); padding: 5px; pointer-events: none;"></div>
`;

function log(msg: string) {
  console.log(msg);
}

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
// Fixed Logical Resolution
const LOGICAL_WIDTH = 2488;
const LOGICAL_HEIGHT = 1332;

// Defer initialization until we have a seed
let gameState: GameState;
let renderer: Renderer;
let physicsEngine: PhysicsEngine;
let loop: GameLoop;

let isMultiplayer = false;
let myPlayerId = 'p1';

import { PhysicsEngine } from './game/PhysicsEngine';

function updateHUD(state: GameStateData) {
  // Game Count
  const totalWins = state.players.reduce((sum: number, p: Player) => sum + p.wins, 0);
  document.getElementById('game-count')!.innerText = `Game: ${totalWins + 1}`;

  // Wind
  document.getElementById('wind-display')!.innerText = `Wind: ${state.wind.speed.toFixed(1)}`;

  // Turn
  const currentPlayer = state.players.find(p => p.id === state.currentTurnPlayerId);
  if (currentPlayer) {
    const turnEl = document.getElementById('turn-display')!;
    turnEl.innerHTML = `Turn: <span style="color: ${currentPlayer.color}">${currentPlayer.name}</span>`;
    turnEl.style.color = 'white'; // Ensure label is white
  }

  // Scores
  const sortedPlayers = [...state.players].sort((a, b) => b.wins - a.wins);
  const scoreBoard = document.getElementById('score-board')!;
  scoreBoard.innerHTML = sortedPlayers.map(p =>
    `<div style="color: ${p.color}; font-size: 2.0rem;">${p.name}: ${p.wins}</div>`
  ).join('');
}

function startGame(seed: number) {
  gameState = new GameState(LOGICAL_WIDTH, LOGICAL_HEIGHT, seed);
  renderer = new Renderer(canvas);
  // renderer.setGameDimensions(gameWidth, gameHeight); // Removed
  physicsEngine = new PhysicsEngine(renderer);

  // Hill parameters (for X positioning only)
  const hillWidth = 300;

  gameState.update(() => {
    // Place castles on top of hills (X only, Y is handled by GameState)
    const p1X = hillWidth / 2;
    const p2X = LOGICAL_WIDTH - hillWidth / 2;

    const player1: Player = {
      id: 'p1',
      name: 'Red Team',
      color: '#FF0000', // Bright Red
      castlePosition: { x: p1X, y: 0 },
      cannonAngle: 45,
      health: 100,
      wins: parseInt(sessionStorage.getItem('p1_wins') || '0'),
      isMyTurn: true,
    };

    const player2: Player = {
      id: 'p2',
      name: 'Blue Team',
      color: '#0066FF', // Bright Blue
      castlePosition: { x: p2X, y: 0 },
      cannonAngle: 135,
      health: 100,
      wins: parseInt(sessionStorage.getItem('p2_wins') || '0'),
      isMyTurn: false,
    };

    gameState.addPlayer(player1);
    gameState.addPlayer(player2);
  });

  loop = new GameLoop(
    (dt) => {
      gameState.update(state => {
        physicsEngine.update(state, dt);
      });
    },
    () => {
      const state = gameState.getState();
      renderer.render(state);
      updateHUD(state); // Update DOM HUD

      // Sync view offset and scale to input manager
      const offset = renderer.getViewOffset();
      const scale = renderer.getScale();
      inputManager.setViewOffset(offset.x, offset.y);
      inputManager.setScale(scale);
    }
  );

  loop.start();
  setupGameSubscriptions();
}



import { NetworkManager } from './game/NetworkManager';

const networkManager = new NetworkManager(
  (data) => {
    if (data.type === 'fire') {
      log(`Net Fire: Ang ${data.angle} Pwr ${data.power}`);
      const otherPlayerId = myPlayerId === 'p1' ? 'p2' : 'p1';
      physicsEngine.fireProjectile(gameState.getState(), data.angle, data.power, otherPlayerId, data.damageSeed);
      gameState.nextTurn();
    }
  },
  (seed) => {
    // Multiplayer Game Start
    console.log(`Starting multiplayer game with seed: ${seed}`);
    // If we were in single player mode (default), stop it and restart with synced seed
    if (loop) loop.stop();
    startGame(seed);
  },
  log // Pass logger
);

import { InputManager } from './game/InputManager';

const inputManager = new InputManager(
  canvas,
  (angle, power) => {
    if (!gameState) return;
    const currentPlayerId = gameState.getState().currentTurnPlayerId;

    // Local check: is it my turn?
    if (isMultiplayer && currentPlayerId !== myPlayerId) return;

    const damageSeed = Math.random();
    physicsEngine.fireProjectile(gameState.getState(), angle, power, currentPlayerId, damageSeed);
    gameState.nextTurn();

    if (isMultiplayer) {
      log(`Local Fire: Ang ${angle} Pwr ${power}`);
      networkManager.sendData({ type: 'fire', angle, power, damageSeed });
    }
  },
  (angle) => {
    if (!gameState) return;
    const currentPlayerId = gameState.getState().currentTurnPlayerId;
    // Only update if it's my turn
    if (isMultiplayer && currentPlayerId !== myPlayerId) return;

    gameState.update(state => {
      const player = state.players.find(p => p.id === currentPlayerId);
      if (player) {
        player.cannonAngle = angle;
      }
    });
  }
);

// UI Controls
const powerSlider = document.getElementById('powerSlider') as HTMLInputElement;
const powerValue = document.getElementById('powerValue')!;


// Multiplayer UI - Handled in HTML now
const mpLabel = document.getElementById('mp-label')!;
const mpControls = document.getElementById('mp-controls')!;

mpLabel.addEventListener('click', () => {
  if (mpControls.style.display === 'none') {
    mpControls.style.display = 'flex';
    mpLabel.innerText = '▼ 2-Player Mode';
  } else {
    mpControls.style.display = 'none';
    mpLabel.innerText = '▶ 2-Player Mode';
  }
});

document.getElementById('hostBtn')!.addEventListener('click', async () => {
  isMultiplayer = true;
  myPlayerId = 'p1';
  document.getElementById('status')!.innerText = 'Hosting...';
  await networkManager.hostGame();
  document.getElementById('status')!.innerText = 'Host: Waiting for peer...';
});

document.getElementById('joinBtn')!.addEventListener('click', async () => {
  isMultiplayer = true;
  myPlayerId = 'p2';
  document.getElementById('status')!.innerText = 'Joining...';
  await networkManager.joinGame();
  document.getElementById('status')!.innerText = 'Joined!';
});

powerSlider.addEventListener('input', (e) => {
  const val = parseInt((e.target as HTMLInputElement).value);
  powerValue.innerText = val.toString();
  inputManager.setPower(val);
});

import { AIOpponent } from './game/AIOpponent';

function setupGameSubscriptions() {
  // AI Opponent
  const aiOpponent = new AIOpponent('p2', (angle, power) => {
    const damageSeed = Math.random();
    physicsEngine.fireProjectile(gameState.getState(), angle, power, 'p2', damageSeed);
    gameState.nextTurn();
  });

  // Game Over State
  let gameOverHandled = false;

  gameState.subscribe(state => {
    if (state.gameStatus === 'finished') {
      if (gameOverHandled) return;

      // Wait for all explosions to finish before showing Game Over
      if (state.explosions.length > 0) {
        return;
      }

      gameOverHandled = true;
      loop.stop();

      const winner = state.players.find(p => p.id === state.winnerId);
      const winnerName = winner?.name || 'Unknown';

      // Update Score
      if (winner) {
        winner.wins++;
        sessionStorage.setItem(`${winner.id}_wins`, winner.wins.toString());
      }

      // Create Game Over Overlay
      const overlay = document.createElement('div');
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
          <h1 style="font-size: 60px; color: #FFD700; text-shadow: 4px 4px #000;">Game Over!</h1>
          <h2 style="font-size: 40px;">Winner: ${winnerName}</h2>
          <h3 style="font-size: 30px;">in ${state.round} volleys</h3>
          <button id="playAgainBtn" style="padding: 15px 30px; font-size: 30px; cursor: pointer; font-family: sans-serif;">Play Again</button>
        `;

      document.body.appendChild(overlay);

      document.getElementById('playAgainBtn')!.addEventListener('click', () => {
        window.location.reload();
      });

      return;
    }

    if (isMultiplayer) {
      inputManager.setMyTurn(state.currentTurnPlayerId === myPlayerId);
      const checksum = gameState.getTerrainChecksum().toFixed(0);
      document.getElementById('status')!.innerHTML = `
        Player: ${myPlayerId} | Turn: ${state.currentTurnPlayerId}<br>
        Player: ${myPlayerId} | Turn: ${state.currentTurnPlayerId}<br>
        Seed: ${gameState.getSeed()} | Width: ${LOGICAL_WIDTH}<br>
        Terrain Checksum: ${checksum}
        Terrain Checksum: ${checksum}
      `;

      // Update cannon position for aiming
      const myPlayer = state.players.find(p => p.id === myPlayerId);
      if (myPlayer) {
        inputManager.setCannonPosition(myPlayer.castlePosition.x, myPlayer.castlePosition.y - 70);
      }

    } else {
      const isP1Turn = state.currentTurnPlayerId === 'p1';
      inputManager.setMyTurn(isP1Turn); // Local play: P1 is human

      if (isP1Turn) {
        const p1 = state.players.find(p => p.id === 'p1');
        if (p1) {
          inputManager.setCannonPosition(p1.castlePosition.x, p1.castlePosition.y - 70);
        }
      }

      // AI Update
      if (!isMultiplayer) {
        aiOpponent.update(state);
      }
    }
  });
}

// Start single player immediately with random seed
if (!isMultiplayer) {
  startGame(Date.now());
}
