
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ----------------- إدارة الغرف واللوجات -----------------
let rooms = {};
let gameLogs = [];

// حفظ وقراءة اللوجات
function saveLogs() {
  try {
    fs.writeFileSync(path.join(__dirname, "game_logs.json"), JSON.stringify(gameLogs, null, 2));
  } catch(e) {
    console.error("Failed to save logs:", e);
  }
}
function loadLogs() {
  try {
    const fp = path.join(__dirname, "game_logs.json");
    if (!fs.existsSync(fp)) return [];
    return JSON.parse(fs.readFileSync(fp));
  } catch {
    return [];
  }
}

// ----------------- Socket.IO -----------------
io.on("connection", (socket) => {
  console.log("✅ لاعب دخل:", socket.id);

  // انضمام لاعب للغرفة
  socket.on("joinRoom", ({ roomId, playerName }) => {
    if (!roomId || !playerName) return;

    if (!rooms[roomId]) rooms[roomId] = { players: [] };

    if (rooms[roomId].players.length >= 2) {
      socket.emit("roomFull");
      return;
    }

    // منع تكرار الاسم داخل نفس الغرفة اختياري
    const nameTaken = rooms[roomId].players.some(p => (p.name||"").toLowerCase() === (playerName||"").toLowerCase());
    const safeName = nameTaken ? (playerName + " #" + (rooms[roomId].players.length+1)) : playerName;

    const role = rooms[roomId].players.length === 0 ? "A" : "B";
    rooms[roomId].players.push({ id: socket.id, name: safeName, role });

    socket.join(roomId);

    // إرسال قائمة اللاعبين للجميع
    io.to(roomId).emit("playersUpdate", {
      players: rooms[roomId].players.map((p) => ({
        role: p.role,
        name: p.name,
      })),
    });

    socket.emit("playerRole", { role, playerName: safeName });
    console.log(`${safeName} (${role}) دخل غرفة ${roomId}`);
  });

  // Player A يبدأ اللعبة
  socket.on("gameStart", (state) => {
    const { roomId } = state;
    io.to(roomId).emit("gameStart", state);
  });

  // أي حدث داخل اللعبة
  socket.on("gameEvent", ({ roomId, event }) => {
    socket.to(roomId).emit("gameEvent", event);

    if (event.type === "gameOver") {
      gameLogs.push({
        roomId,
        winner: event.winner,
        scores: event.scores,
        players: rooms[roomId]?.players || [],
        timestamp: new Date().toISOString(),
      });
      saveLogs();
    }
  });

  // لاعب خرج
  socket.on("disconnect", () => {
    for (let roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(
        (p) => p.id !== socket.id
      );
      if (rooms[roomId].players.length === 0) delete rooms[roomId];
    }
  });
});

// ----------------- Leaderboard -----------------
app.get("/api/leaderboard", (req, res) => {
  const logs = loadLogs();
  const sorted = logs.sort((a, b) => {
    const maxA = Math.max(a.scores.A, a.scores.B);
    const maxB = Math.max(b.scores.A, b.scores.B);
    return maxB - maxA;
  });
  res.json(sorted.slice(0, 20)); // أفضل 20 نتيجة
});

app.get("/leaderboard", (req, res) => {
  res.sendFile(path.join(__dirname, "leaderboard.html"));
});

// ----------------- تشغيل السيرفر -----------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 السيرفر شغال على http://localhost:${PORT}`);
});
