# 🚢 Battleship Arena – Real-Time Multiplayer Game

## 📌 Overview

Battleship Arena is a full-stack, real-time multiplayer web application inspired by the classic Battleship game. Players can create or join rooms, manually place ships, and battle opponents using a turn-based system powered by WebSockets.

This project was developed as a final project for **CSE 108 (Full Stack Development)**.

---

## 🚀 Features

### 🎮 Gameplay

* Real-time multiplayer using WebSockets (Flask-SocketIO)
* Room-based matchmaking (create/join via code)
* Turn-based attack system
* Manual ship placement with rule validation
* Sequential ship placement (no invalid shapes)
* Hit / Miss detection
* Ship destruction detection (with alerts)
* Win condition detection

### 🎯 Advanced Features

* Live battle log
* Player statistics:

  * Shots
  * Hits
  * Misses
  * Accuracy %
* Fleet status tracker (see which ships are sunk)
* Turn timer (auto-skip if player is inactive)
* Restart game functionality

### 🎨 UI/UX

* Modern, responsive UI
* Side-by-side boards (player + enemy)
* Coordinate grid (A–J, 1–10)
* Visual ship icons 🚢
* Hit effects 🔥
* Sound effects for hit/miss/win

---

## 🛠️ Tech Stack

### Frontend

* React (Vite)
* Socket.IO Client
* CSS (custom styling)

### Backend

* Python (Flask)
* Flask-SocketIO (WebSockets)
* Flask-CORS

---

## ⚙️ Installation & Setup

### 1. Clone the repository

```bash
git clone https://github.com/ashishsetty1/CSE-108-battleship.git
cd CSE-108-battleship
```

---

### 2. Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
python3 app.py
```

Backend runs on:

```
http://127.0.0.1:5000
```

---

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```
http://localhost:5173
```

---

## 🧠 How to Play

1. Enter your name
2. Create a game or join using a room code
3. Place all ships manually (must be in a straight line)
4. Wait for opponent to finish placement
5. Take turns attacking enemy board
6. Sink all enemy ships to win

---

## 📂 Project Structure

```
backend/
  app.py
  game_logic.py
  models.py
  requirements.txt

frontend/
  src/
    App.jsx
    main.jsx
  package.json
```

---

## 🎥 Demo (Optional)

Add a demo video or screenshots here if needed.

---


## 📌 Notes

* This project uses in-memory storage (no database)
* Designed for demonstration and academic purposes

---

## 🏁 Future Improvements

* Persistent database (PostgreSQL)
* User authentication
* Online matchmaking
* Animations and sound upgrades
* Mobile optimization

---

## 🏫 Course

CSE 108 – Full Stack Development
University of California, Merced
