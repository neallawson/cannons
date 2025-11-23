import './style.css';
import { GameState } from './game/GameState';
import { Renderer } from './game/Renderer';
import { GameLoop } from './game/GameLoop';
import type { Player } from './game/types';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="gameCanvas"></canvas>
  <div id="ui-layer" style="position: absolute; bottom: 20px; left: 20px; color: white; font-family: sans-serif;">
    <label>Power: <input type="range" id="powerSlider" min="10" max="100" value="50"></label>
    <span id="powerValue">50</span>
    <button id="fireBtn">Fire</button>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#gameCanvas')!;
const width = window.innerWidth;
const height = window.innerHeight;

const gameState = new GameState(width, height);
const renderer = new Renderer(canvas);

// Hill parameters (for X positioning only)
const hillWidth = 300;

gameState.update(() => {
  // Place castles on top of hills (X only, Y is handled by GameState)
  // Left castle
  const p1X = hillWidth / 2;
  // Right castle
  const p2X = width - hillWidth / 2;

  const player1: Player = {
    id: 'p1',
    name: 'Player 1',
    color: 'red',
    castlePosition: { x: p1X, y: 0 }, // Y will be set by addPlayer
    cannonAngle: 45,
    health: 100,
    wins: parseInt(localStorage.getItem('p1_wins') || '0'),
    isMyTurn: true,
  };

  const player2: Player = {
    id: 'p2',
    name: 'Player 2',
    color: 'blue',
    castlePosition: { x: p2X, y: 0 }, // Y will be set by addPlayer
    cannonAngle: 135,
    health: 100,
    wins: parseInt(localStorage.getItem('p2_wins') || '0'),
    isMyTurn: false,
  };

  // Use addPlayer helper to ensure Y position is calculated correctly
  gameState.addPlayer(player1);
  gameState.addPlayer(player2);
});

import { PhysicsEngine } from './game/PhysicsEngine';

const physicsEngine = new PhysicsEngine(renderer);

const loop = new GameLoop(
  (dt) => {
    gameState.update(state => {
      physicsEngine.update(state, dt);
    });
  },
  () => {
    renderer.render(gameState.getState());
  }
);

loop.start();

import { NetworkManager } from './game/NetworkManager';

let myPlayerId = 'p1'; // Default to p1 (Host)
let isMultiplayer = false;

const networkManager = new NetworkManager((data) => {
  if (data.type === 'fire') {
    const otherPlayerId = myPlayerId === 'p1' ? 'p2' : 'p1';
    physicsEngine.fireProjectile(gameState.getState(), data.angle, data.power, otherPlayerId);
    gameState.nextTurn();
  }
});

import { InputManager } from './game/InputManager';

const inputManager = new InputManager(
  canvas,
  (angle, power) => {
    const currentPlayerId = gameState.getState().currentTurnPlayerId;

    // Local check: is it my turn?
    if (isMultiplayer && currentPlayerId !== myPlayerId) return;

    physicsEngine.fireProjectile(gameState.getState(), angle, power, currentPlayerId);
    gameState.nextTurn();

    if (isMultiplayer) {
      networkManager.sendData({ type: 'fire', angle, power });
    }
  },
  (angle) => {
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
const fireBtn = document.getElementById('fireBtn')!;


// Multiplayer UI
const mpDiv = document.createElement('div');
mpDiv.style.cssText = 'position: absolute; top: 160px; left: 20px; color: white; font-family: sans-serif;';
mpDiv.innerHTML = `
  <button id="hostBtn">Host Game</button>
  <button id="joinBtn">Join Game</button>
  <span id="status"></span>
`;
document.body.appendChild(mpDiv);

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

fireBtn.addEventListener('click', () => {
  inputManager.fire();
});

import { AIOpponent } from './game/AIOpponent';

const aiOpponent = new AIOpponent('p2', (angle, power) => {
  physicsEngine.fireProjectile(gameState.getState(), angle, power, 'p2');
  gameState.nextTurn();
});

// Update "isMyTurn" based on state
// Update "isMyTurn" based on state
gameState.subscribe(state => {
  if (state.gameStatus === 'finished') {
    loop.stop();
    const winner = state.players.find(p => p.id === state.winnerId);
    const winnerName = winner?.name || 'Unknown';

    // Update Score
    if (winner) {
      winner.wins++;
      localStorage.setItem(`${winner.id}_wins`, winner.wins.toString());
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
      <h1>Game Over!</h1>
      <h2>Winner: ${winnerName}</h2>
      <button id="playAgainBtn" style="padding: 10px 20px; font-size: 20px; cursor: pointer;">Play Again</button>
    `;

    document.body.appendChild(overlay);

    document.getElementById('playAgainBtn')!.addEventListener('click', () => {
      window.location.reload();
    });

    return;
  }

  if (isMultiplayer) {
    inputManager.setMyTurn(state.currentTurnPlayerId === myPlayerId);
    document.getElementById('status')!.innerText = `Player: ${myPlayerId} | Turn: ${state.currentTurnPlayerId}`;

    // Update cannon position for aiming
    const myPlayer = state.players.find(p => p.id === myPlayerId);
    if (myPlayer) {
      // Cannon pivot is at (x, y - 60). 
      // We'll adjust this slightly if we move the pivot in Renderer.
      // Let's assume pivot is at y - 70 (center of dome).
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
