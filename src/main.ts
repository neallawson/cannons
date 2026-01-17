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
// Fixed Logical Resolution
const LOGICAL_WIDTH = 3000;
const LOGICAL_HEIGHT = 1332;

// Defer initialization until we have a seed
let gameState: GameState;
let renderer: Renderer;
let physicsEngine: PhysicsEngine;
let loop: GameLoop;

let isMultiplayer = false;
let myPlayerId = 'p1';
let maxPower = 55; // Default max power, can be upgraded later
let isMobileMode = false; // Track if mobile mode is active

function updateHUD(state: GameStateData) {
  // Game Count
  const totalWins = state.players.reduce((sum: number, p: Player) => sum + p.wins, 0);
  document.getElementById('game-count')!.innerText = `Game: ${totalWins + 1}`;

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
  const scoreFontSize = isMobileMode ? '4.0rem' : '3.0rem'; // Mobile: 4.0rem (double), Desktop: 3.0rem (50% increase)
  scoreBoard.innerHTML = sortedPlayers.map(p =>
    `<div style="color: ${p.color}; font-size: ${scoreFontSize};">${p.name}: ${p.wins}</div>`
  ).join('');
}

// Note: renderer is now initialized in startGame to ensure clean state
// renderer = new Renderer(canvas); 
window.addEventListener('resize', updateUILayout);

function startGame(seed: number) {
  // Clean up previous loop if exists
  if (loop) {
    loop.stop();
  }

  // Clean up previous renderer if exists to remove listeners
  if (renderer) {
    renderer.destroy();
  }

  // Initialize fresh Renderer
  renderer = new Renderer(canvas);

  gameState = new GameState(LOGICAL_WIDTH, LOGICAL_HEIGHT, seed);
  // renderer is passed to physics
  physicsEngine = new PhysicsEngine(renderer);

  // Hill parameters (for X positioning only)
  const hillWidth = 300;

  gameState.update((state) => {
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

    // Start the game!
    state.gameStatus = 'playing';
  });

  loop = new GameLoop(
    (dt) => {
      gameState.update(state => {
        const wasPlaying = state.gameStatus === 'playing';
        // Wind is now updated inside PhysicsEngine's fixed step
        physicsEngine.update(state, dt, (stepDt) => gameState.updateWind(stepDt));

        if (wasPlaying && state.gameStatus === 'ending') {
          if (inputManager.canFire()) {
            console.log('Game Status Changed: playing -> ending. Disabling input.');
            inputManager.setCanFire(false);
          }
        }
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

  // Initial UI Layout
  updateUILayout();

  // Mobile Detection & Setup
  // Simple check: Touch capability AND smallish screen
  const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isSmallScreen = window.innerWidth <= 768;

  if (isTouchDevice && isSmallScreen) {
    console.log("Mobile Mode Detected. Engaging Bottom Control Bar.");

    // 1. Set Mobile Mode Flag
    isMobileMode = true;

    // 2. Alert InputManager
    inputManager.setMobileMode(true);

    // 3. Hide Desktop UI
    const desktopUI = document.getElementById('ui-layer');
    if (desktopUI) desktopUI.style.display = 'none';

    // 3. Show Mobile UI
    const mobileUI = document.getElementById('mobile-controls');
    if (mobileUI) {
      mobileUI.classList.add('active');

      // 3b. Set Safe Zone based on actual rendered height (15vh)
      const uiHeight = mobileUI.offsetHeight;
      console.log("Mobile UI Height:", uiHeight);

      if (renderer) {
        renderer.setSafeZone(uiHeight);
        updateUILayout(); // Re-sync DOM UI
      }
    }

    // 4. Bind Mobile Controls
    const mobileFireBtn = document.getElementById('mobileFireBtn');
    if (mobileFireBtn) {
      mobileFireBtn.addEventListener('click', (e) => {
        e.preventDefault(); // Prevent ghost clicks
        inputManager.fire();
      });
      // Also listen for touchstart to prevent delay
      mobileFireBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        inputManager.fire();
      }, { passive: false });
    }

    const mobilePowerSlider = document.getElementById('mobilePowerSlider') as HTMLInputElement;
    const mobilePowerValue = document.getElementById('mobilePowerValue');

    if (mobilePowerSlider) {
      mobilePowerSlider.addEventListener('input', (e) => {
        let val = parseInt((e.target as HTMLInputElement).value);
        if (val > 55) {
          val = 55;
          (e.target as HTMLInputElement).value = '55';
        }
        if (mobilePowerValue) mobilePowerValue.innerText = val > 54 ? '55 (MAX)' : val.toString();
        inputManager.setPower(val);
      });
    }

    // Sync Mobile Angle Display
    // We need to hook into the onAngleChange or update the DOM in the loop?
    // InputManager calls a callback. Let's see...
    // The callback is defined in line 359: `(angle) => { ... }`
    // We need to update that callback to ALSO update mobile UI.
  }
}

function resetGame(remoteSeed?: number) {
  // If remoteSeed is provided, it means we received a restart signal from the host.
  // We should always honor this and start immediately.
  if (remoteSeed !== undefined) {
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.remove();
    startGame(remoteSeed);
    return;
  }

  // If we are in multiplayer
  if (isMultiplayer) {
    // If we are the HOST ('p1')
    if (myPlayerId === 'p1') {
      const overlay = document.getElementById('game-over-overlay');
      if (overlay) overlay.remove();

      const newSeed = Date.now();
      networkManager.sendData({ type: 'restart', seed: newSeed });
      startGame(newSeed);
    } else {
      // If we are the CLIENT ('p2')
      // Do NOT start a new game. Instead, update the overlay.
      const playAgainBtn = document.getElementById('playAgainBtn');
      if (playAgainBtn) {
        playAgainBtn.style.display = 'none'; // Hide the button
      }

      // Create or update a status message in the overlay
      let statusMsg = document.getElementById('game-over-status');
      if (!statusMsg) {
        statusMsg = document.createElement('h3');
        statusMsg.id = 'game-over-status';
        statusMsg.style.cssText = "font-size: 30px; margin-top: 20px; color: #ccc; font-family: sans-serif;";
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.appendChild(statusMsg);
      }
      if (statusMsg) {
        statusMsg.innerText = "Waiting for Host...";
      }
    }
  } else {
    // Single player reset
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.remove();
    startGame(Date.now());
  }
}


function resetScoreboard() {
  sessionStorage.setItem('p1_wins', '0');
  sessionStorage.setItem('p2_wins', '0');
}

function enterSinglePlayerMode(notifyPeer: boolean = true) {
  if (notifyPeer) {
    networkManager.sendData({ type: 'player_left' });
  }

  isMultiplayer = false;
  myPlayerId = 'p1';

  networkManager.resetConnection();
  resetScoreboard();

  // Reset UI to default (Red/Left)
  updatePlayerUI();

  const mpLabel = document.getElementById('mp-label');
  if (mpLabel) mpLabel.innerText = "▶ Click for 2-Player Mode";
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.innerText = "";

  resetGame();
}

function enterMultiplayerMode(seed: number, isHost: boolean) {
  console.log(`Starting multiplayer game with seed: ${seed}, isHost: ${isHost}`);

  // If we were in single player mode (default), stop it
  if (loop) loop.stop();

  lobbyUI.hide();
  modalManager.hide();

  isMultiplayer = true;
  myPlayerId = isHost ? 'p1' : 'p2';

  resetScoreboard();

  // Update Toggle Label
  const mpLabel = document.getElementById('mp-label');
  if (mpLabel) mpLabel.innerText = "■ Stop Multiplayer";

  if (myPlayerId === 'p1') {
    modalManager.showTemporaryMessage("You are the Red Team", 3);
  } else {
    modalManager.showTemporaryMessage("You are the Blue Team", 3);
  }

  updatePlayerUI();
  startGame(seed);
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

import { LobbyUI } from './game/LobbyUI';

// Initialize Lobby UI
let lobbyUI: LobbyUI;
const modalManager = new ModalManager();

const networkManager = new NetworkManager(
  (data) => {
    if (data.type === 'fire') {
      log(`Net Fire: Ang ${data.angle} Pwr ${data.power}`);
      const otherPlayerId = myPlayerId === 'p1' ? 'p2' : 'p1';

      // Sync Wind State from the shooter
      if (data.windData) {
        gameState.setWindState(data.windData);
      }

      // Update enemy cannon angle so it looks correct when firing
      gameState.update(state => {
        const player = state.players.find(p => p.id === otherPlayerId);
        if (player) {
          player.cannonAngle = data.angle;
        }
      });

      physicsEngine.fireProjectile(gameState.getState(), data.angle, data.power, otherPlayerId, data.damageSeed);
      gameState.nextTurn();
    } else if (data.type === 'restart') {
      console.log('Received restart signal');
      resetGame(data.seed);
    } else if (data.type === 'player_left') {
      console.log('Other player left the game.');
      modalManager.showTemporaryMessage("The other player has left the game. Returning to Single Player.", 3);
      enterSinglePlayerMode(false); // Don't notify peer, they already left
    }
  },
  (seed, isHost) => {
    enterMultiplayerMode(seed, isHost);
  }, log // Pass logger
);

lobbyUI = new LobbyUI(networkManager);

function updatePlayerUI() {
  const uiLayer = document.getElementById('ui-layer');
  if (!uiLayer) return;

  // Reset classes
  uiLayer.classList.remove('ui-right', 'theme-blue', 'theme-red');

  if (myPlayerId === 'p2') {
    uiLayer.classList.add('ui-right', 'theme-blue');
  } else {
    uiLayer.classList.add('theme-red');
  }
}

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
      const windData = gameState.getWindState();
      networkManager.sendData({ type: 'fire', angle, power, damageSeed, windData });
    }
  },
  (angle) => {
    // Update Angle Display locally always
    const angleDisplay = document.getElementById('angle-display');
    if (angleDisplay) {
      let displayAngle = Math.round(angle);
      if (myPlayerId === 'p2') {
        displayAngle = 180 - displayAngle;
      } else {
        // Red player (p1)
        if (displayAngle > 180) {
          displayAngle -= 360;
        }
      }
      angleDisplay.innerText = `Angle: ${displayAngle}°`;
    }

    // Sync Mobile Angle Display (Only recursively if active)
    const mobileUI = document.getElementById('mobile-controls');
    if (mobileUI && mobileUI.classList.contains('active')) {
      const mobileAngleDisplay = document.getElementById('mobileAngleDisplay');
      if (mobileAngleDisplay) {
        let displayAngle = Math.round(angle);
        if (myPlayerId === 'p2') {
          displayAngle = 180 - displayAngle;
        } else {
          if (displayAngle > 180) displayAngle -= 360;
        }
        mobileAngleDisplay.innerText = `Ang: ${displayAngle}°`;
      }
    }

    if (!gameState) return;

    // Broadcast angle even if it's not my turn?
    // User requested: "Allow both teams to "move" their cannon at all times"
    // and is confusing when it gets locked.
    // So we should update our local state and broadcast.
    // However, GameState logic might restrict it?
    // The previous logic was: if (isMultiplayer && currentPlayerId !== myPlayerId) return;
    // We want to remove that restriction for MOVEMENT.

    // BUT we must filter so we only update OUR player.
    // Ensure we are updating the correct player in GameState
    if (isMultiplayer) {
      // Network update
      // Throttle network updates? InputManager calls this on mousemove.
      // NetworkManager doesn't have built-in throttling shown here, but let's assume it's okay for now or minimal bandwidth.
      // We should send 'angle_update' or just use the Fire packet? 
      // Wait, the current network system doesn't seem to have a dedicated continuous angle sync packet in `NetworkManager.ts` usage here?
      // Looking at Main.ts:321, we send 'fire'.
      // Looking at Main.ts:243, we handle 'fire', 'restart', 'player_left'.
      // We DON'T have an 'angle' packet type yet!

      // The user said: "Allow both teams to "move" their cannon at all times... confusing when it gets locked."
      // This implies visual movement.
      // If we want the OTHER player to see it, we need to sync it.
      // The current code didn't sync angle until FIRE?
      // Let's check InputManager callbacks.
      // Oh, InputManager calls `onAngleChange`.
      // Check line 320: `gameState.update(...)`
      // It updates the LOCAL gameState.
      // It DOES NOT send network data.

      // So previously, you only saw the enemy move when they fired?
      // "Net Fire: Ang ... Pwr ..." -> "Update enemy cannon angle" (Line 253)
      // Yes.

      // The user request "Allow both teams to "move" their cannon at all times" implies LOCAL movement primarily so it doesn't feel stuck.
      // "and is confusing when it gets locked."
      // It doesn't explicitly demand "Sync movement in real-time".
      // Given "small changes", I will implement LOCAL movement freedom.
      // Syncing real-time angle would require a new packet type and interval.
      // I will enabling LOCAL movement for now.

      // So, simply REMOVE the check "currentPlayerId !== myPlayerId".
      // But wait, we must make sure we update *my* player, not the current turn player if it's not me.
    }

    gameState.update(state => {
      // Find MY player, not necessarily current turn player
      const targetPlayerId = isMultiplayer ? myPlayerId : state.currentTurnPlayerId;
      const player = state.players.find(p => p.id === targetPlayerId);
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
// Multiplayer UI - Handled in HTML now
const mpLabel = document.getElementById('mp-label')!;
// const mpControls = document.getElementById('mp-controls')!;

mpLabel.addEventListener('click', () => {
  if (isMultiplayer) {
    // Switch to Single Player
    modalManager.showConfirmation("Stop multiplayer and return to single player?", () => {
      console.log('Switching to Single Player');
      enterSinglePlayerMode(true); // Notify peer
    });
  } else {
    // Switch to Multiplayer (Open Lobby)
    lobbyUI.show();
    lobbyUI.showMainMenu();
  }
});

// document.getElementById('hostBtn')!.addEventListener('click', async () => {
//   isMultiplayer = true;
//   myPlayerId = 'p1';
//   document.getElementById('status')!.innerText = 'Hosting... Waiting for peer...';
//   // await networkManager.hostGame();
//   networkManager.createLobby("My Game", true);
// });

// document.getElementById('joinBtn')!.addEventListener('click', async () => {
//   isMultiplayer = true;
//   myPlayerId = 'p2';
//   document.getElementById('status')!.innerText = 'Joining... Waiting for host...';
//   // await networkManager.joinGame();
//   networkManager.listLobbies();
// });

powerSlider.addEventListener('input', (e) => {
  let val = parseInt((e.target as HTMLInputElement).value);

  // Cap at maxPower
  if (val > maxPower) {
    val = maxPower;
    (e.target as HTMLInputElement).value = maxPower.toString();
  }

  if (val === maxPower) {
    powerValue.innerText = `${val} (MAX)`;
  } else {
    powerValue.innerText = val.toString();
  }

  inputManager.setPower(val);
});

function setupGameSubscriptions() {
  // AI Opponent
  const aiOpponent = new AIOpponent('p2', (angle, power) => {
    const damageSeed = Math.random();
    physicsEngine.fireProjectile(gameState.getState(), angle, power, 'p2', damageSeed);
    gameState.nextTurn();
  });

  // Game Over State
  let gameOverHandled = false;
  let teamStatusUpdated = false;

  gameState.subscribe(state => {
    // Update Multiplayer Status (Team Color)
    if (isMultiplayer && myPlayerId && !teamStatusUpdated) {
      const myPlayer = state.players.find(p => p.id === myPlayerId);
      if (myPlayer) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
          statusEl.innerHTML = `You are the <span style="color: ${myPlayer.color}; font-weight: bold;">${myPlayer.name}</span>`;
          teamStatusUpdated = true; // Only set once to avoid flickering or overwriting
        }
      }
    }

    if (state.gameStatus === 'finished') {
      if (gameOverHandled) return;

      // Wait for all explosions to finish before showing Game Over
      if (state.explosions.length > 0) {
        return;
      }

      gameOverHandled = true;
      loop.stop();

      let winnerName = 'Unknown';

      if (state.winnerId === 'draw') {
        winnerName = 'Draw';
        // Increment wins for ALL players
        state.players.forEach(p => {
          p.wins++;
          sessionStorage.setItem(`${p.id}_wins`, p.wins.toString());
        });
      } else {
        const winner = state.players.find(p => p.id === state.winnerId);
        winnerName = winner?.name || 'Unknown';

        // Update Score
        if (winner) {
          winner.wins++;
          sessionStorage.setItem(`${winner.id}_wins`, winner.wins.toString());
        }
      }

      // Create Game Over Overlay
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
      // Debug info removed


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
