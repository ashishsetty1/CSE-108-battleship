from flask import Flask, request, jsonify
from flask_socketio import SocketIO, join_room, leave_room, emit
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token
from sqlmodel import create_engine, Session, select, SQLModel
from werkzeug.security import generate_password_hash, check_password_hash
from models import User, UserFriendLink, Match  # noqa: F401 – UserFriendLink registers its table
import random
import string
import os

app = Flask(__name__)
app.config["SECRET_KEY"] = "battleship-secret"
app.config["JWT_SECRET_KEY"] = os.environ.get(
    "JWT_SECRET_KEY", "battleship-jwt-secret-change-in-prod"
)

CORS(app)
jwt = JWTManager(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

engine = create_engine("sqlite:///battleship.db")
SQLModel.metadata.create_all(engine)

# ---------------------------------------------------------------------------
# Game constants & in-memory state
# ---------------------------------------------------------------------------

SHIPS = {
    "Carrier": 5,
    "Battleship": 4,
    "Cruiser": 3,
    "Submarine": 3,
    "Destroyer": 2,
}

games = {}
player_rooms = {}  # username -> room_code (enforces one game per user)
sid_to_name = {}   # socket sid -> username (for disconnect cleanup)

# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    with Session(engine) as session:
        if session.exec(select(User).where(User.username == username)).first():
            return jsonify({"error": "Username already taken"}), 409

        user = User(
            username=username,
            password_hash=generate_password_hash(password),
        )
        session.add(user)
        session.commit()

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid username or password"}), 401

    token = create_access_token(identity=username)
    return jsonify({"token": token, "username": username}), 200


# ---------------------------------------------------------------------------
# Profile route
# ---------------------------------------------------------------------------

@app.route("/api/profile/<username>", methods=["GET"])
def get_profile(username):
    with Session(engine) as session:
        user = session.exec(select(User).where(User.username == username)).first()
        if not user:
            return jsonify({"error": "User not found"}), 404

        as_p1 = session.exec(select(Match).where(Match.player1 == username)).all()
        as_p2 = session.exec(select(Match).where(Match.player2 == username)).all()
        all_matches = sorted(as_p1 + as_p2, key=lambda m: m.id, reverse=True)

        history = []
        for m in all_matches:
            opponent = m.player2 if m.player1 == username else m.player1
            history.append({
                "opponent": opponent,
                "result": "win" if m.winner == username else "loss",
                "played_at": m.played_at,
            })

        return jsonify({
            "username": user.username,
            "wins": user.wins,
            "losses": user.losses,
            "total_match_count": user.total_match_count,
            "match_history": history,
        })


# ---------------------------------------------------------------------------
# Misc helpers
# ---------------------------------------------------------------------------

@app.route("/")
def home():
    return "Battleship backend is running!"


def generate_room_code():
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


def empty_player_state(players):
    return {
        "turn": 0,
        "boards": {p: [] for p in players},
        "ships": {p: {} for p in players},
        "ships_placed": {p: [] for p in players},
        "sunk_ships": {p: [] for p in players},
        "ready": {},
        "attacks": {p: [] for p in players},
        "stats": {
            p: {"shots": 0, "hits": 0, "misses": 0, "accuracy": 0}
            for p in players
        },
        "status": "placing",
    }


def is_valid_manual_ship(existing_cells, ship_cells, required_size):
    if len(ship_cells) != required_size:
        return False, "Incorrect number of cells for this ship."

    normalized = [tuple(cell) for cell in ship_cells]

    if len(set(normalized)) != len(normalized):
        return False, "You selected the same square more than once."

    for row, col in normalized:
        if row < 0 or row >= 10 or col < 0 or col >= 10:
            return False, "Ship is outside the board."
        if (row, col) in existing_cells:
            return False, "Ship overlaps another ship."

    rows = {row for row, col in normalized}
    cols = {col for row, col in normalized}

    if len(rows) != 1 and len(cols) != 1:
        return False, "Ship must be in one straight row or column."

    if len(rows) == 1:
        sorted_cols = sorted(col for row, col in normalized)
        if sorted_cols != list(range(sorted_cols[0], sorted_cols[0] + required_size)):
            return False, "Ship cells must be connected in a row."

    if len(cols) == 1:
        sorted_rows = sorted(row for row, col in normalized)
        if sorted_rows != list(range(sorted_rows[0], sorted_rows[0] + required_size)):
            return False, "Ship cells must be connected in a column."

    return True, "Valid placement."


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _remove_player_from_room(name, room_code):
    """Remove a player from a game, clean up state, and notify remaining player."""
    if room_code not in games:
        player_rooms.pop(name, None)
        return

    game = games[room_code]

    if name in game["players"]:
        if len(game["players"]) == 1:
            del games[room_code]
        else:
            socketio.emit("player_left", {"player": name}, room=room_code)
            game["players"] = [p for p in game["players"] if p != name]
            for key in ["boards", "ships", "ships_placed", "sunk_ships", "attacks", "stats"]:
                if key in game and isinstance(game[key], dict):
                    game[key].pop(name, None)
            game.get("ready", {}).pop(name, None)
            game["status"] = "abandoned"

    player_rooms.pop(name, None)


# ---------------------------------------------------------------------------
# Socket.IO events
# ---------------------------------------------------------------------------

@socketio.on("connect")
def handle_connect():
    print(f"Client connected: {request.sid}")


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    name = sid_to_name.pop(sid, None)
    if name and name in player_rooms:
        room_code = player_rooms[name]
        _remove_player_from_room(name, room_code)
    print(f"Client disconnected: {name or 'unknown'}")


@socketio.on("create_game")
def create_game(data):
    name = data.get("name", "").strip()

    if not name:
        emit("error_message", {"message": "Name is required"})
        return

    # Leave any existing room first
    if name in player_rooms:
        old_room = player_rooms[name]
        leave_room(old_room)
        _remove_player_from_room(name, old_room)

    room_code = generate_room_code()
    games[room_code] = {
        "players": [name],
        **empty_player_state([name]),
    }
    player_rooms[name] = room_code
    sid_to_name[request.sid] = name

    join_room(room_code)

    emit("game_created", {
        "room_code": room_code,
        "players": games[room_code]["players"],
        "turn": games[room_code]["turn"],
    })


@socketio.on("join_game")
def join_game(data):
    name = data.get("name", "").strip()
    room_code = data.get("room_code", "").strip().upper()

    if not name:
        emit("error_message", {"message": "Name is required"})
        return

    if room_code not in games:
        emit("error_message", {"message": "Invalid room code"})
        return

    if name in games[room_code]["players"]:
        emit("error_message", {"message": "You are already in this room"})
        return

    if len(games[room_code]["players"]) >= 2:
        emit("error_message", {"message": "Room is full"})
        return

    # Leave any other room this player is currently in
    if name in player_rooms:
        old_room = player_rooms[name]
        leave_room(old_room)
        _remove_player_from_room(name, old_room)

    games[room_code]["players"].append(name)
    players = games[room_code]["players"]
    games[room_code].update(empty_player_state(players))
    player_rooms[name] = room_code
    sid_to_name[request.sid] = name

    join_room(room_code)

    emit("player_joined", {
        "room_code": room_code,
        "players": players,
        "turn": games[room_code]["turn"],
    }, room=room_code)


@socketio.on("leave_game")
def leave_game(data):
    name = data.get("name", "").strip()
    room_code = data.get("room_code", "").strip()

    if not name:
        return

    if room_code in games:
        leave_room(room_code)
        _remove_player_from_room(name, room_code)
    else:
        player_rooms.pop(name, None)

    sid_to_name.pop(request.sid, None)


@socketio.on("place_ship")
def place_ship(data):
    room_code = data.get("room_code")
    player = data.get("name")
    ship_name = data.get("ship_name")
    cells = data.get("cells", [])

    if room_code not in games:
        emit("error_message", {"message": "Invalid room"})
        return

    if ship_name not in SHIPS:
        emit("error_message", {"message": "Invalid ship"})
        return

    game = games[room_code]

    if ship_name in game["ships_placed"][player]:
        emit("error_message", {"message": f"{ship_name} already placed"})
        return

    existing_cells = set(tuple(cell) for cell in game["boards"][player])
    valid, message = is_valid_manual_ship(existing_cells, cells, SHIPS[ship_name])

    if not valid:
        emit("error_message", {"message": message})
        return

    ship_cells = [tuple(cell) for cell in cells]
    game["boards"][player].extend(ship_cells)
    game["ships"][player][ship_name] = ship_cells
    game["ships_placed"][player].append(ship_name)

    emit("ship_placed", {"ship_name": ship_name, "cells": ship_cells})


@socketio.on("finish_placement")
def finish_placement(data):
    room_code = data.get("room_code")
    player = data.get("name")

    if room_code not in games:
        emit("error_message", {"message": "Invalid room"})
        return

    game = games[room_code]

    if len(game["ships_placed"][player]) < len(SHIPS):
        emit("error_message", {"message": "Place all ships before starting"})
        return

    game["ready"][player] = True
    emit("placement_finished", {"player": player}, room=room_code)

    if len(game["ready"]) == 2:
        game["status"] = "game"
        emit("start_game", {
            "turn": game["turn"],
            "players": game["players"],
            "stats": game["stats"],
            "sunk_ships": game["sunk_ships"],
        }, room=room_code)


@socketio.on("attack")
def handle_attack(data):
    room_code = data.get("room_code")
    player = data.get("name")
    row = data.get("row")
    col = data.get("col")

    if room_code not in games:
        emit("error_message", {"message": "Invalid room"})
        return

    game = games[room_code]

    if game["status"] != "game":
        emit("error_message", {"message": "Game is not active"})
        return

    if player != game["players"][game["turn"]]:
        emit("error_message", {"message": "Not your turn"})
        return

    opponent = [p for p in game["players"] if p != player][0]

    if (row, col) in [tuple(a) for a in game["attacks"][player]]:
        emit("error_message", {"message": "You already attacked that square"})
        return

    game["attacks"][player].append((row, col))

    opponent_ship_cells = set(tuple(cell) for cell in game["boards"][opponent])
    result = "hit" if (row, col) in opponent_ship_cells else "miss"

    game["stats"][player]["shots"] += 1
    if result == "hit":
        game["stats"][player]["hits"] += 1
    else:
        game["stats"][player]["misses"] += 1

    shots = game["stats"][player]["shots"]
    hits = game["stats"][player]["hits"]
    game["stats"][player]["accuracy"] = round((hits / shots) * 100) if shots else 0

    sunk_ship = None
    attacker_hits = set(
        tuple(attack)
        for attack in game["attacks"][player]
        if tuple(attack) in opponent_ship_cells
    )

    if result == "hit":
        for ship_name, ship_cells in game["ships"][opponent].items():
            ship_cell_set = set(tuple(cell) for cell in ship_cells)
            if (
                ship_cell_set.issubset(attacker_hits)
                and ship_name not in game["sunk_ships"][opponent]
            ):
                game["sunk_ships"][opponent].append(ship_name)
                sunk_ship = ship_name
                break

    total_ship_cells = len(game["boards"][opponent])
    total_hits = len(attacker_hits)

    winner = None
    game_over = False

    if total_hits == total_ship_cells:
        winner = player
        game_over = True
        game["status"] = "game_over"

        loser = [p for p in game["players"] if p != winner][0]
        with Session(engine) as session:
            session.add(Match(player1=game["players"][0], player2=game["players"][1], winner=winner))
            for uname, field in [(winner, "wins"), (loser, "losses")]:
                u = session.exec(select(User).where(User.username == uname)).first()
                if u:
                    setattr(u, field, getattr(u, field) + 1)
                    u.total_match_count += 1
                    session.add(u)
            session.commit()
    else:
        game["turn"] = 1 - game["turn"]

    emit("attack_result", {
        "attacker": player,
        "defender": opponent,
        "row": row,
        "col": col,
        "result": result,
        "sunk_ship": sunk_ship,
        "next_turn": game["turn"],
        "game_over": game_over,
        "winner": winner,
        "stats": game["stats"],
        "sunk_ships": game["sunk_ships"],
    }, room=room_code)


@socketio.on("skip_turn")
def skip_turn(data):
    room_code = data.get("room_code")
    player = data.get("name")

    if room_code not in games:
        return

    game = games[room_code]

    if game["status"] != "game":
        return

    if player != game["players"][game["turn"]]:
        return

    skipped_player = game["players"][game["turn"]]
    game["turn"] = 1 - game["turn"]

    emit("turn_skipped", {
        "skipped_player": skipped_player,
        "next_turn": game["turn"],
    }, room=room_code)


@socketio.on("restart_game")
def restart_game(data):
    room_code = data.get("room_code")

    if room_code not in games:
        emit("error_message", {"message": "Invalid room"})
        return

    players = games[room_code]["players"]
    games[room_code].update(empty_player_state(players))

    emit("game_restarted", {
        "players": players,
        "turn": games[room_code]["turn"],
    }, room=room_code)


if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=10000)
