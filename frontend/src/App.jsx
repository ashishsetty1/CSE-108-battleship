import { useState, useEffect } from "react";
import { io } from "socket.io-client";

const BACKEND = "https://cse-108-battleship-backend.onrender.com";

const socket = io(BACKEND, {
  transports: ["websocket", "polling"],
});


const SHIPS = [
  { name: "Carrier", size: 5 },
  { name: "Battleship", size: 4 },
  { name: "Cruiser", size: 3 },
  { name: "Submarine", size: 3 },
  { name: "Destroyer", size: 2 },
];

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function createEmptyBoard() {
  return Array(10)
    .fill(null)
    .map(() => Array(10).fill("empty"));
}

function createEmptyStats(players = []) {
  const stats = {};
  players.forEach((p) => {
    stats[p] = { shots: 0, hits: 0, misses: 0, accuracy: 0 };
  });
  return stats;
}

function App() {
  // ── Auth state ──────────────────────────────────────────────────────────
  const [authMode, setAuthMode] = useState("login");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ── Game state ──────────────────────────────────────────────────────────
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("");
  // "auth" → "lobby" → "placing" → "game" → "game_over"
  const [phase, setPhase] = useState("auth");
  const [turn, setTurn] = useState(0);
  const [message, setMessage] = useState("Connecting to backend...");
  const [isConnected, setIsConnected] = useState(false);

  const [ownBoard, setOwnBoard] = useState(createEmptyBoard());
  const [enemyBoard, setEnemyBoard] = useState(createEmptyBoard());

  const [selectedShipIndex, setSelectedShipIndex] = useState(0);
  const [currentShipCells, setCurrentShipCells] = useState([]);
  const [hoverCell, setHoverCell] = useState(null);
  const [placedShips, setPlacedShips] = useState([]);
  const [winner, setWinner] = useState("");
  const [battleLog, setBattleLog] = useState([]);
  const [stats, setStats] = useState({});
  const [sunkShips, setSunkShips] = useState({});
  const [timer, setTimer] = useState(30);

  const [showProfile, setShowProfile] = useState(false);
  const [profileData, setProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const myName = name.trim();

  // ── Restore session from localStorage ──────────────────────────────────
  useEffect(() => {
    const storedToken = localStorage.getItem("battleship_token");
    const storedUsername = localStorage.getItem("battleship_username");
    if (storedToken && storedUsername) {
      setName(storedUsername);
      setPhase("lobby");
    }
  }, []);

  // ── Auth handlers ───────────────────────────────────────────────────────
  const handleAuth = async () => {
    const username = authUsername.trim();
    const password = authPassword.trim();

    if (!username || !password) {
      setAuthError("Both fields are required.");
      return;
    }

    setAuthError("");
    setAuthLoading(true);

    try {
      const endpoint = authMode === "login" ? "/api/login" : "/api/signup";
      const res = await fetch(`${BACKEND}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.error || "Something went wrong.");
        return;
      }

      localStorage.setItem("battleship_token", data.token);
      localStorage.setItem("battleship_username", data.username);
      setName(data.username);
      setPhase("lobby");
    } catch {
      setAuthError("Could not reach the server. Is Flask running?");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("battleship_token");
    localStorage.removeItem("battleship_username");
    setName("");
    setCurrentRoom("");
    setPlayers([]);
    setPhase("auth");
    setAuthUsername("");
    setAuthPassword("");
    setAuthError("");
    setShowProfile(false);
  };

  const fetchProfile = async () => {
    setShowProfile(true);
    setProfileLoading(true);
    setProfileData(null);
    try {
      const res = await fetch(`${BACKEND}/api/profile/${myName}`);
      const data = await res.json();
      if (res.ok) setProfileData(data);
    } catch {
      // leave profileData null to show error state
    } finally {
      setProfileLoading(false);
    }
  };

  // ── Socket.IO event listeners ───────────────────────────────────────────
  useEffect(() => {
    socket.on("connect", () => {
      setIsConnected(true);
      setMessage("Connected to backend.");
    });

    socket.on("connect_error", () => {
      setIsConnected(false);
      setMessage("Could not connect to backend. Make sure Flask is running.");
    });

    socket.on("game_created", (data) => {
      setCurrentRoom(data.room_code);
      setPlayers(data.players);
      setTurn(data.turn);
      setPhase("lobby");
      setStats(createEmptyStats(data.players));
      setMessage("Game created. Share this room code with Player 2.");
      setOwnBoard(createEmptyBoard());
      setEnemyBoard(createEmptyBoard());
      setSelectedShipIndex(0);
      setCurrentShipCells([]);
      setHoverCell(null);
      setPlacedShips([]);
      setWinner("");
      setBattleLog([]);
      setSunkShips({});
    });

    socket.on("player_joined", (data) => {
      setCurrentRoom(data.room_code);
      setPlayers(data.players);
      setTurn(data.turn);
      setPhase("placing");
      setStats(createEmptyStats(data.players));
      setSunkShips({});
      setOwnBoard(createEmptyBoard());
      setEnemyBoard(createEmptyBoard());
      setSelectedShipIndex(0);
      setCurrentShipCells([]);
      setHoverCell(null);
      setPlacedShips([]);
      setWinner("");
      setBattleLog([]);
      setMessage("Both players joined. Place your ships.");
    });

    socket.on("player_left", (data) => {
      alert(`${data.player} has left the game.`);
      setCurrentRoom("");
      setPlayers([]);
      setOwnBoard(createEmptyBoard());
      setEnemyBoard(createEmptyBoard());
      setSelectedShipIndex(0);
      setCurrentShipCells([]);
      setHoverCell(null);
      setPlacedShips([]);
      setWinner("");
      setBattleLog([]);
      setSunkShips({});
      setPhase("lobby");
      setMessage("Your opponent left the game.");
    });

    socket.on("ship_placed", (data) => {
      setOwnBoard((prev) => {
        const newBoard = prev.map((row) => [...row]);
        data.cells.forEach(([r, c]) => {
          newBoard[r][c] = "ship";
        });
        return newBoard;
      });
      setPlacedShips((prev) => [...prev, data.ship_name]);
      setSelectedShipIndex((prev) => prev + 1);
      setCurrentShipCells([]);
      setHoverCell(null);
      setMessage(`${data.ship_name} placed successfully.`);
    });

    socket.on("placement_finished", (data) => {
      setMessage(`${data.player} finished placing ships.`);
    });

    socket.on("start_game", (data) => {
      setPhase("game");
      setTurn(data.turn);
      setPlayers(data.players);
      setStats(data.stats || createEmptyStats(data.players));
      setSunkShips(data.sunk_ships || {});
      setTimer(30);
      setMessage("Game started. Attack the enemy board.");
      setBattleLog(["Battle started. Good luck, captains!"]);
    });

    socket.on("attack_result", (data) => {
      playSound(data.result);

      const attackText =
        data.result === "hit"
          ? `${data.attacker} hit ${data.defender}'s fleet at ${LETTERS[data.col]}${data.row + 1}!`
          : `${data.attacker} missed at ${LETTERS[data.col]}${data.row + 1}.`;

      let newLogs = [attackText];

      if (data.sunk_ship) {
        newLogs.unshift(`💥 ${data.attacker} destroyed ${data.defender}'s ${data.sunk_ship}!`);
      }

      if (data.game_over) {
        playSound("win");
        newLogs.unshift(`🏆 ${data.winner} wins the battle!`);
      }

      setBattleLog((prev) => [...newLogs, ...prev].slice(0, 10));

      if (data.attacker === myName) {
        setEnemyBoard((prev) => {
          const newBoard = prev.map((row) => [...row]);
          newBoard[data.row][data.col] = data.result;
          return newBoard;
        });
      } else {
        setOwnBoard((prev) => {
          const newBoard = prev.map((row) => [...row]);
          newBoard[data.row][data.col] = data.result;
          return newBoard;
        });
      }

      setStats(data.stats || {});
      setSunkShips(data.sunk_ships || {});
      setTurn(data.next_turn);
      setTimer(30);

      if (data.sunk_ship) setMessage(`💥 ${data.sunk_ship} destroyed!`);

      if (data.game_over) {
        setWinner(data.winner);
        setPhase("game_over");
        setMessage(`${data.winner} wins!`);
      }
    });

    socket.on("turn_skipped", (data) => {
      setTurn(data.next_turn);
      setTimer(30);
      setBattleLog((prev) =>
        [`⏱️ ${data.skipped_player}'s turn timed out.`, ...prev].slice(0, 10)
      );
    });

    socket.on("game_restarted", (data) => {
      setPlayers(data.players);
      setTurn(data.turn);
      setPhase("placing");
      setOwnBoard(createEmptyBoard());
      setEnemyBoard(createEmptyBoard());
      setSelectedShipIndex(0);
      setCurrentShipCells([]);
      setHoverCell(null);
      setPlacedShips([]);
      setWinner("");
      setBattleLog([]);
      setStats(createEmptyStats(data.players));
      setSunkShips({});
      setTimer(30);
      setMessage("Game restarted. Place your ships again.");
    });

    socket.on("error_message", (data) => {
      alert(data.message);
    });

    return () => {
      socket.off("connect");
      socket.off("connect_error");
      socket.off("game_created");
      socket.off("player_joined");
      socket.off("player_left");
      socket.off("ship_placed");
      socket.off("placement_finished");
      socket.off("start_game");
      socket.off("attack_result");
      socket.off("turn_skipped");
      socket.off("game_restarted");
      socket.off("error_message");
    };
  }, [myName]);

  // ── Turn timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "game") return;
    setTimer(30);

    const interval = setInterval(() => {
      setTimer((prev) => {
        if (prev <= 1) {
          if (players[turn] === myName) {
            socket.emit("skip_turn", { room_code: currentRoom, name: myName });
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [phase, turn, players, currentRoom, myName]);

  // ── Sound effects ───────────────────────────────────────────────────────
  const playSound = (type) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const playTone = (frequency, startTime, duration, volume = 0.06) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      const now = audioContext.currentTime;
      if (type === "hit") {
        playTone(120, now, 0.12, 0.08);
        playTone(80, now + 0.08, 0.18, 0.07);
      } else if (type === "miss") {
        playTone(520, now, 0.08, 0.04);
        playTone(340, now + 0.08, 0.1, 0.035);
      } else {
        playTone(440, now, 0.12, 0.05);
        playTone(554, now + 0.12, 0.12, 0.05);
        playTone(659, now + 0.24, 0.18, 0.06);
      }
    } catch {
      // Sound is optional.
    }
  };

  // ── Game actions ────────────────────────────────────────────────────────
  const createGame = () => socket.emit("create_game", { name: myName });
  const joinGame = () => {
    if (!roomCode.trim()) { alert("Please enter a room code"); return; }
    socket.emit("join_game", { name: myName, room_code: roomCode.trim().toUpperCase() });
  };
  const restartGame = () => socket.emit("restart_game", { room_code: currentRoom });

  const leaveGame = () => {
    socket.emit("leave_game", { room_code: currentRoom, name: myName });
    setCurrentRoom("");
    setPlayers([]);
    setOwnBoard(createEmptyBoard());
    setEnemyBoard(createEmptyBoard());
    setSelectedShipIndex(0);
    setCurrentShipCells([]);
    setHoverCell(null);
    setPlacedShips([]);
    setWinner("");
    setBattleLog([]);
    setSunkShips({});
    setPhase("lobby");
    setMessage("You left the game.");
  };

  const getCurrentShip = () => SHIPS[selectedShipIndex];
  const isExistingShipCell = (row, col) => ownBoard[row][col] === "ship";
  const isTempCell = (row, col) => currentShipCells.some(([r, c]) => r === row && c === col);

  const validateTempSelection = (newCells, shipSize) => {
    if (newCells.length > shipSize) return "You selected too many cells for this ship.";
    const rows = new Set(newCells.map(([r]) => r));
    const cols = new Set(newCells.map(([, c]) => c));
    if (rows.size > 1 && cols.size > 1) return "Ship must be placed in a straight row or column.";
    if (newCells.length > 1) {
      if (rows.size === 1) {
        const sortedCols = newCells.map(([, c]) => c).sort((a, b) => a - b);
        for (let i = 1; i < sortedCols.length; i++) {
          if (sortedCols[i] !== sortedCols[i - 1] + 1) return "Ship cells must be connected.";
        }
      }
      if (cols.size === 1) {
        const sortedRows = newCells.map(([r]) => r).sort((a, b) => a - b);
        for (let i = 1; i < sortedRows.length; i++) {
          if (sortedRows[i] !== sortedRows[i - 1] + 1) return "Ship cells must be connected.";
        }
      }
    }
    return "";
  };

  const selectShipCell = (row, col) => {
    const currentShip = getCurrentShip();
    if (!currentShip) { alert("All ships are placed."); return; }
    if (isExistingShipCell(row, col)) { alert("You cannot overlap ships."); return; }
    if (isTempCell(row, col)) {
      setCurrentShipCells((prev) => prev.filter(([r, c]) => !(r === row && c === col)));
      return;
    }
    const newCells = [...currentShipCells, [row, col]];
    const error = validateTempSelection(newCells, currentShip.size);
    if (error) { alert(error); return; }
    setCurrentShipCells(newCells);
  };

  const confirmShip = () => {
    const currentShip = getCurrentShip();
    if (!currentShip) { alert("All ships are already placed."); return; }
    if (currentShipCells.length !== currentShip.size) {
      alert(`Select exactly ${currentShip.size} cells for ${currentShip.name}.`);
      return;
    }
    socket.emit("place_ship", {
      room_code: currentRoom,
      name: myName,
      ship_name: currentShip.name,
      cells: currentShipCells,
    });
  };

  const clearCurrentShip = () => { setCurrentShipCells([]); setHoverCell(null); };

  const attackSquare = (row, col) => {
    if (players[turn] !== myName) { alert("Not your turn!"); return; }
    if (enemyBoard[row][col] === "hit" || enemyBoard[row][col] === "miss") {
      alert("You already attacked that square."); return;
    }
    socket.emit("attack", { room_code: currentRoom, name: myName, row, col });
  };

  const finishPlacement = () => {
    if (placedShips.length < SHIPS.length) { alert("Place all ships first."); return; }
    socket.emit("finish_placement", { room_code: currentRoom, name: myName });
    setMessage("Waiting for the other player to finish placing ships.");
  };

  // ── Board rendering ─────────────────────────────────────────────────────
  const getHoverClass = (row, col) => {
    if (!hoverCell || phase !== "placing") return "";
    const currentShip = getCurrentShip();
    if (!currentShip) return "";
    if (row !== hoverCell.row && col !== hoverCell.col) return "";
    return "hover-preview";
  };

  const getCellContent = (cell, row, col) => {
    if (isTempCell(row, col)) return "■";
    if (cell === "ship") return "🚢";
    if (cell === "hit") return "🔥";
    if (cell === "miss") return "•";
    return "";
  };

  const getCellClass = (cell, row, col, showTemp) => {
    if (showTemp && isTempCell(row, col)) return "cell temp";
    if (cell === "ship") return "cell ship";
    if (cell === "hit") return "cell hit";
    if (cell === "miss") return "cell miss";
    return `cell water ${getHoverClass(row, col)}`;
  };

  const renderBoard = (board, onClick, showTemp = false) => (
    <div className="board-wrap">
      <div className="corner-label"></div>
      {LETTERS.map((letter) => (
        <div className="coord-label" key={letter}>{letter}</div>
      ))}
      {board.map((row, r) => (
        <div className="board-row-wrap" key={r}>
          <div className="coord-label">{r + 1}</div>
          {row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              onClick={() => onClick(r, c)}
              onMouseEnter={() => setHoverCell({ row: r, col: c })}
              onMouseLeave={() => setHoverCell(null)}
              className={getCellClass(cell, r, c, showTemp)}
            >
              {getCellContent(cell, r, c)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  const myStats = stats[myName] || { shots: 0, hits: 0, misses: 0, accuracy: 0 };
  const opponent = players.find((p) => p !== myName);
  const opponentStats = opponent
    ? stats[opponent] || { shots: 0, hits: 0, misses: 0, accuracy: 0 }
    : { shots: 0, hits: 0, misses: 0, accuracy: 0 };
  const currentShip = getCurrentShip();

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        * { box-sizing: border-box; }

        body {
          margin: 0;
          background:
            radial-gradient(circle at top, rgba(30, 92, 140, 0.35), transparent 35%),
            linear-gradient(135deg, #07111f 0%, #0b1f33 45%, #04101c 100%);
          color: #f8fafc;
          font-family: Inter, Arial, sans-serif;
        }

        .app { min-height: 100vh; padding: 20px; }

        .hero {
          max-width: 1250px;
          margin: 0 auto 16px;
          padding: 18px 22px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.82);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(14px);
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 12px;
        }

        .hero-left { flex: 1; }
        .title { margin: 0; font-size: 40px; letter-spacing: -1px; }
        .subtitle { margin: 8px 0 0; color: #cbd5e1; }

        .status {
          margin-top: 14px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 9px 14px;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.95);
          border: 1px solid rgba(148, 163, 184, 0.25);
        }

        .dot { width: 10px; height: 10px; border-radius: 999px; background: #ef4444; }
        .dot.connected { background: #22c55e; box-shadow: 0 0 18px rgba(34, 197, 94, 0.8); }

        .user-badge {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 16px;
          border-radius: 14px;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.2);
          align-self: flex-start;
        }

        .user-badge span { color: #7dd3fc; font-weight: 700; }

        .panel {
          max-width: 1250px;
          margin: 0 auto;
          padding: 18px;
          border-radius: 24px;
          background: rgba(15, 23, 42, 0.78);
          border: 1px solid rgba(148, 163, 184, 0.22);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        .lobby-card {
          max-width: 430px;
          margin: 12px auto;
          padding: 24px;
          border-radius: 20px;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .lobby-card h2 { margin-top: 0; }

        input {
          width: 100%;
          padding: 13px 14px;
          margin: 8px 0;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(15, 23, 42, 0.9);
          color: white;
          outline: none;
          font-size: 15px;
        }

        input:focus { border-color: rgba(56, 189, 248, 0.6); }

        button {
          border: none;
          border-radius: 12px;
          padding: 12px 16px;
          font-weight: 700;
          color: #06101f;
          background: linear-gradient(135deg, #38bdf8, #22c55e);
          cursor: pointer;
          box-shadow: 0 10px 25px rgba(56, 189, 248, 0.2);
          transition: transform 0.15s ease, opacity 0.15s ease;
        }

        button:hover { transform: translateY(-1px); opacity: 0.92; }
        button:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

        .secondary-btn {
          color: #e2e8f0;
          background: rgba(30, 41, 59, 0.92);
          border: 1px solid rgba(148, 163, 184, 0.25);
          box-shadow: none;
        }

        .danger-btn { color: white; background: linear-gradient(135deg, #ef4444, #f97316); }

        .auth-toggle {
          margin-top: 16px;
          text-align: center;
          color: #94a3b8;
          font-size: 14px;
        }

        .auth-toggle-link {
          color: #38bdf8;
          cursor: pointer;
          text-decoration: underline;
          margin-left: 4px;
        }

        .auth-error { color: #f87171; margin: 8px 0 0; font-size: 14px; }

        .room-pill {
          display: inline-block;
          margin-top: 12px;
          padding: 9px 16px;
          border-radius: 999px;
          background: rgba(56, 189, 248, 0.12);
          color: #7dd3fc;
          border: 1px solid rgba(125, 211, 252, 0.25);
          font-weight: 800;
          letter-spacing: 1px;
        }

        .players {
          display: flex;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
          margin: 14px 0 0;
        }

        .player-card {
          min-width: 160px;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(2, 6, 23, 0.55);
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .player-card.active {
          border-color: rgba(34, 197, 94, 0.8);
          box-shadow: 0 0 22px rgba(34, 197, 94, 0.18);
        }

        .timer {
          margin: 10px auto;
          width: fit-content;
          padding: 10px 16px;
          border-radius: 999px;
          border: 1px solid rgba(250, 204, 21, 0.4);
          background: rgba(250, 204, 21, 0.12);
          color: #fde68a;
          font-weight: 900;
        }

        .compact-game-layout { display: flex; flex-direction: column; align-items: center; gap: 16px; }

        .boards-row {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 24px;
          flex-wrap: wrap;
        }

        .game-card, .stats-card, .battle-log {
          padding: 14px;
          border-radius: 22px;
          background: rgba(2, 6, 23, 0.58);
          border: 1px solid rgba(148, 163, 184, 0.2);
        }

        .game-card h3, .stats-card h3, .battle-log h3 { margin-top: 0; margin-bottom: 10px; }

        .board-wrap {
          display: grid;
          grid-template-columns: 28px repeat(10, 34px);
          gap: 4px;
          justify-content: center;
          align-items: center;
        }

        .board-row-wrap { display: contents; }

        .coord-label, .corner-label {
          width: 28px; height: 28px;
          display: flex; align-items: center; justify-content: center;
          color: #93c5fd; font-size: 12px; font-weight: 900;
        }

        .cell {
          width: 34px; height: 34px; border-radius: 8px;
          border: 1px solid rgba(226, 232, 240, 0.18);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; cursor: pointer; user-select: none;
          transition: transform 0.1s ease, filter 0.1s ease;
        }

        .cell:hover { transform: scale(1.06); filter: brightness(1.18); }
        .water { background: linear-gradient(135deg, #0ea5e9, #075985); box-shadow: inset 0 0 12px rgba(255,255,255,0.12); }
        .hover-preview { outline: 2px solid rgba(250, 204, 21, 0.75); }
        .ship { background: linear-gradient(135deg, #475569, #1e293b); }
        .temp { background: linear-gradient(135deg, #facc15, #f97316); color: #111827; }
        .hit { background: radial-gradient(circle, #fef2f2, #ef4444 45%, #7f1d1d 100%); }
        .miss { background: linear-gradient(135deg, #e2e8f0, #94a3b8); color: #0f172a; }

        .ship-list { display: grid; gap: 8px; max-width: 390px; margin: 12px auto; }

        .ship-row {
          display: flex; justify-content: space-between; align-items: center;
          padding: 9px 12px; border-radius: 14px;
          background: rgba(15, 23, 42, 0.7);
          border: 1px solid rgba(148, 163, 184, 0.18);
        }

        .ship-row.current { border-color: rgba(250, 204, 21, 0.85); box-shadow: 0 0 18px rgba(250, 204, 21, 0.15); }
        .ship-row.placed { border-color: rgba(34, 197, 94, 0.65); color: #bbf7d0; }

        .actions { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 16px; }

        .wide-log { max-width: 1020px; width: 100%; }

        .log-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; }
        .log-item { padding: 7px 0; border-bottom: 1px solid rgba(148,163,184,0.14); color: #dbeafe; }

        .stats-row { display: flex; justify-content: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
        .stats-card { min-width: 210px; }
        .stat-line { display: flex; justify-content: space-between; gap: 18px; padding: 4px 0; color: #cbd5e1; }

        .fleet-grid { display: grid; grid-template-columns: repeat(2, minmax(170px, 1fr)); gap: 8px; margin-top: 10px; }
        .fleet-item { padding: 8px 10px; border-radius: 12px; background: rgba(15,23,42,0.65); border: 1px solid rgba(148,163,184,0.15); color: #dbeafe; }
        .fleet-item.sunk { border-color: rgba(239,68,68,0.55); color: #fecaca; }

        .legend { color: #cbd5e1; margin-bottom: 12px; }

        .playing-as {
          padding: 10px 14px;
          border-radius: 12px;
          background: rgba(56,189,248,0.08);
          border: 1px solid rgba(56,189,248,0.2);
          color: #7dd3fc;
          text-align: center;
          margin-bottom: 12px;
          font-size: 15px;
        }

        .stats-badges {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .stat-badge {
          padding: 20px 14px;
          border-radius: 18px;
          background: rgba(2, 6, 23, 0.58);
          border: 1px solid rgba(148, 163, 184, 0.2);
          text-align: center;
        }

        .stat-value { font-size: 34px; font-weight: 900; }
        .stat-label { font-size: 13px; color: #94a3b8; margin-top: 4px; }

        .profile-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 4px;
        }

        .profile-table th, .profile-table td {
          padding: 11px 16px;
          text-align: left;
          border-bottom: 1px solid rgba(148, 163, 184, 0.13);
          color: #dbeafe;
          font-size: 14px;
        }

        .profile-table th {
          color: #7dd3fc;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.6px;
        }

        .profile-table tr:hover td { background: rgba(56, 189, 248, 0.05); }
        .result-win { color: #4ade80; font-weight: 700; }
        .result-loss { color: #f87171; font-weight: 700; }

        @media (max-width: 700px) { .stats-badges { grid-template-columns: repeat(2, 1fr); } }

        @media (max-width: 950px) { .log-grid { grid-template-columns: 1fr; } }

        @media (max-width: 700px) {
          .app { padding: 12px; }
          .title { font-size: 32px; }
          .board-wrap { grid-template-columns: 22px repeat(10, 27px); gap: 3px; }
          .cell { width: 27px; height: 27px; font-size: 13px; border-radius: 6px; }
          .coord-label, .corner-label { width: 22px; height: 22px; font-size: 10px; }
        }
      `}</style>

      <div className="app">
        {/* ── Hero bar ── */}
        <div className="hero">
          <div className="hero-left">
            <h1 className="title">🚢 Battleship Arena</h1>
            <p className="subtitle">
              Real-time multiplayer Battleship with manual ship placement, stats,
              turn timer, sunk-ship alerts, and win detection.
            </p>

            <div className="status">
              <span className={isConnected ? "dot connected" : "dot"}></span>
              <strong>{message}</strong>
            </div>

            {currentRoom && <div className="room-pill">ROOM CODE: {currentRoom}</div>}

            {currentRoom && (
              <div className="players">
                {players.map((p, i) => (
                  <div
                    key={i}
                    className={phase === "game" && i === turn ? "player-card active" : "player-card"}
                  >
                    <strong>{p}</strong>
                    <div>{phase === "game" && i === turn ? "Current Turn" : "Player"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Show logged-in username + logout when authenticated */}
          {phase !== "auth" && myName && (
            <div className="user-badge">
              <button
                onClick={fetchProfile}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  color: "#7dd3fc", fontWeight: 700, fontSize: "15px",
                }}
              >
                👤 {myName}
              </button>
              <button
                className="secondary-btn"
                onClick={handleLogout}
                style={{ padding: "6px 12px", fontSize: "13px" }}
              >
                Log out
              </button>
            </div>
          )}
        </div>

        {/* ── Main panel ── */}
        <div className="panel">

          {/* ── Auth phase ── */}
          {!showProfile && phase === "auth" && (
            <div className="lobby-card">
              <h2>{authMode === "login" ? "Welcome Back" : "Create Account"}</h2>

              <input
                value={authUsername}
                onChange={(e) => setAuthUsername(e.target.value)}
                placeholder="Username"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              />

              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Password"
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              />

              {authError && <p className="auth-error">{authError}</p>}

              <button
                onClick={handleAuth}
                disabled={authLoading}
                style={{ width: "100%", marginTop: "10px" }}
              >
                {authLoading
                  ? "..."
                  : authMode === "login"
                  ? "Log In"
                  : "Create Account"}
              </button>

              <div className="auth-toggle">
                {authMode === "login" ? "Don't have an account?" : "Already have an account?"}
                <span
                  className="auth-toggle-link"
                  onClick={() => {
                    setAuthMode(authMode === "login" ? "signup" : "login");
                    setAuthError("");
                  }}
                >
                  {authMode === "login" ? "Sign up" : "Log in"}
                </span>
              </div>
            </div>
          )}

          {/* ── Lobby phase ── */}
          {!showProfile && phase === "lobby" && (
            <div className="lobby-card">
              {currentRoom ? (
                <>
                  <h2>Waiting for Player 2</h2>
                  <div className="playing-as">Playing as <strong>{myName}</strong></div>
                  <p style={{ color: "#94a3b8", textAlign: "center", margin: "12px 0" }}>
                    Share this code with your opponent:
                  </p>
                  <div className="room-pill" style={{ display: "block", textAlign: "center", marginBottom: "20px" }}>
                    {currentRoom}
                  </div>
                  <button className="danger-btn" onClick={leaveGame} style={{ width: "100%" }}>
                    Leave Game
                  </button>
                </>
              ) : (
                <>
                  <h2>Join the Battle</h2>
                  <div className="playing-as">Playing as <strong>{myName}</strong></div>
                  <button onClick={createGame} style={{ width: "100%", marginTop: "8px" }}>
                    Create Game
                  </button>
                  <div style={{ margin: "18px 0", color: "#94a3b8", textAlign: "center" }}>or</div>
                  <input
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value)}
                    placeholder="Enter room code"
                    onKeyDown={(e) => e.key === "Enter" && joinGame()}
                  />
                  <button onClick={joinGame} style={{ width: "100%", marginTop: "8px" }}>
                    Join Game
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Placing phase ── */}
          {!showProfile && phase === "placing" && (
            <>
              <h2>Manual Ship Placement</h2>

              {currentShip ? (
                <>
                  <h3>Current Ship: {currentShip.name} ({currentShip.size} cells)</h3>
                  <p className="legend">
                    Click each square manually. Selected cells must be connected in one straight
                    horizontal or vertical line.
                  </p>
                  <p>Selected: <strong>{currentShipCells.length}/{currentShip.size}</strong></p>
                </>
              ) : (
                <h3>All ships placed. Press Done Placing.</h3>
              )}

              <div className="ship-list">
                {SHIPS.map((ship, index) => (
                  <div
                    key={ship.name}
                    className={
                      placedShips.includes(ship.name)
                        ? "ship-row placed"
                        : index === selectedShipIndex
                        ? "ship-row current"
                        : "ship-row"
                    }
                  >
                    <span>
                      {placedShips.includes(ship.name)
                        ? "✅"
                        : index === selectedShipIndex
                        ? "👉"
                        : "⬜"}{" "}
                      {ship.name}
                    </span>
                    <strong>{ship.size} cells</strong>
                  </div>
                ))}
              </div>

              <div className="game-card" style={{ display: "inline-block" }}>
                {renderBoard(ownBoard, selectShipCell, true)}
              </div>

              <div className="actions">
                <button onClick={confirmShip}>Confirm Current Ship</button>
                <button className="secondary-btn" onClick={clearCurrentShip}>Clear Selection</button>
                <button className="danger-btn" onClick={finishPlacement}>Done Placing</button>
                <button className="secondary-btn" onClick={leaveGame}>Leave Game</button>
              </div>
            </>
          )}

          {/* ── Game phase ── */}
          {!showProfile && phase === "game" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <h2 style={{ margin: 0 }}>Turn: {players[turn]}</h2>
                <button className="secondary-btn" onClick={leaveGame} style={{ padding: "6px 14px", fontSize: "13px" }}>
                  Leave Game
                </button>
              </div>
              <div className="timer">⏱️ Turn Timer: {timer}s</div>
              <p className="legend">🚢 Your Ship &nbsp; 🔥 Hit &nbsp; • Miss</p>

              <div className="stats-row">
                <div className="stats-card">
                  <h3>Your Stats</h3>
                  <div className="stat-line"><span>Shots</span><strong>{myStats.shots}</strong></div>
                  <div className="stat-line"><span>Hits</span><strong>{myStats.hits}</strong></div>
                  <div className="stat-line"><span>Misses</span><strong>{myStats.misses}</strong></div>
                  <div className="stat-line"><span>Accuracy</span><strong>{myStats.accuracy}%</strong></div>
                </div>

                {opponent && (
                  <div className="stats-card">
                    <h3>{opponent}'s Stats</h3>
                    <div className="stat-line"><span>Shots</span><strong>{opponentStats.shots}</strong></div>
                    <div className="stat-line"><span>Hits</span><strong>{opponentStats.hits}</strong></div>
                    <div className="stat-line"><span>Misses</span><strong>{opponentStats.misses}</strong></div>
                    <div className="stat-line"><span>Accuracy</span><strong>{opponentStats.accuracy}%</strong></div>
                  </div>
                )}
              </div>

              <div className="compact-game-layout">
                <div className="boards-row">
                  <div className="game-card">
                    <h3>Your Fleet</h3>
                    {renderBoard(ownBoard, () => {}, false)}
                  </div>
                  <div className="game-card">
                    <h3>Enemy Waters</h3>
                    {renderBoard(enemyBoard, attackSquare, false)}
                  </div>
                </div>

                <div className="battle-log wide-log">
                  <h3>Fleet Status</h3>
                  <div className="fleet-grid">
                    {players.map((player) =>
                      SHIPS.map((ship) => {
                        const isSunk = (sunkShips[player] || []).includes(ship.name);
                        return (
                          <div key={`${player}-${ship.name}`} className={isSunk ? "fleet-item sunk" : "fleet-item"}>
                            <strong>{player}</strong> — {ship.name}: {isSunk ? "💥 Sunk" : "✅ Afloat"}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="battle-log wide-log">
                  <h3>Battle Log</h3>
                  {battleLog.length === 0 ? (
                    <p>No attacks yet.</p>
                  ) : (
                    <div className="log-grid">
                      {battleLog.map((log, i) => (
                        <div className="log-item" key={i}>{log}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ── Game over phase ── */}
          {!showProfile && phase === "game_over" && (
            <>
              <h1>🏆 Game Over</h1>
              <h2>{winner} wins!</h2>

              <div className="actions">
                <button onClick={restartGame}>Restart Game</button>
                <button className="secondary-btn" onClick={leaveGame}>Leave Game</button>
              </div>

              <br />

              <div className="compact-game-layout">
                <div className="boards-row">
                  <div className="game-card">
                    <h3>Your Fleet</h3>
                    {renderBoard(ownBoard, () => {}, false)}
                  </div>
                  <div className="game-card">
                    <h3>Enemy Waters</h3>
                    {renderBoard(enemyBoard, () => {}, false)}
                  </div>
                </div>

                <div className="battle-log wide-log">
                  <h3>Final Battle Log</h3>
                  <div className="log-grid">
                    {battleLog.map((log, i) => (
                      <div className="log-item" key={i}>{log}</div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Profile screen ── */}
          {showProfile && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "22px", flexWrap: "wrap" }}>
                <button className="secondary-btn" onClick={() => setShowProfile(false)}>
                  ← Back
                </button>
                <h2 style={{ margin: 0 }}>👤 {myName}</h2>
              </div>

              {profileLoading && <p style={{ color: "#94a3b8" }}>Loading...</p>}

              {!profileLoading && !profileData && (
                <p style={{ color: "#f87171" }}>Could not load profile.</p>
              )}

              {!profileLoading && profileData && (
                <>
                  <div className="stats-badges">
                    {[
                      { label: "Wins", value: profileData.wins, color: "#4ade80" },
                      { label: "Losses", value: profileData.losses, color: "#f87171" },
                      { label: "Matches", value: profileData.total_match_count, color: "#7dd3fc" },
                      {
                        label: "Win Rate",
                        value: profileData.total_match_count > 0
                          ? `${Math.round((profileData.wins / profileData.total_match_count) * 100)}%`
                          : "—",
                        color: "#facc15",
                      },
                    ].map(({ label, value, color }) => (
                      <div className="stat-badge" key={label}>
                        <div className="stat-value" style={{ color }}>{value}</div>
                        <div className="stat-label">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="battle-log" style={{ maxWidth: "100%" }}>
                    <h3>Match History</h3>
                    {profileData.match_history.length === 0 ? (
                      <p style={{ color: "#94a3b8" }}>No matches played yet.</p>
                    ) : (
                      <table className="profile-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Opponent</th>
                            <th>Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profileData.match_history.map((m, i) => (
                            <tr key={i}>
                              <td>{m.played_at}</td>
                              <td>{m.opponent}</td>
                              <td className={m.result === "win" ? "result-win" : "result-loss"}>
                                {m.result === "win" ? "Win" : "Loss"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export default App;
