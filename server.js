/**
 * Friends - Real-time Multiplayer Telegram Mini App Trivia Game
 * Backend Server with Express, HTTP & Socket.io
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

// Enable CORS for external hosting and Telegram Mini App webview
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static frontend files (index.html, assets, etc.)
app.use(express.static(__dirname));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Pool of default fake choices for trivia question generation
const FAKE_WIFI_NAMES = [
  "FBI Surveillance Van #4",
  "Get Your Own Wi-Fi",
  "PrettyFlyForAWifi",
  "Linksys_5G_Home",
  "Router_Of_Doom",
  "Nacho_Wifi",
  "DropItLikeItsHotSpot",
  "Area51_Guest_5G",
  "Searching...",
  "KeepItOnTheLow5G",
  "MomUseThisOne",
  "Netgear_99B",
  "TellMyWiFiLoveHer",
  "WuTangLAN",
  "NoFreeWifiHere",
  "WinterIsComing_5G",
  "Connecting...",
  "ItBurnsWhenIP",
  "MartinRouterKing",
  "WinternetIsComing"
];

const FAKE_LOCATIONS = [
  "Tokyo, Japan",
  "London, UK",
  "New York, USA",
  "Barcelona, Spain",
  "Berlin, Germany",
  "Sydney, Australia",
  "Paris, France",
  "Toronto, Canada",
  "Rome, Italy",
  "Seoul, South Korea",
  "Rio de Janeiro, Brazil",
  "Amsterdam, Netherlands",
  "Cape Town, South Africa",
  "Dubai, UAE",
  "Singapore",
  "Los Angeles, USA",
  "Vienna, Austria",
  "Stockholm, Sweden",
  "Prague, Czech Republic",
  "Buenos Aires, Argentina"
];

const FAKE_FOODS = [
  "Sushi & Sashimi 🍱",
  "Neapolitan Pizza 🍕",
  "Tacos al Pastor 🌮",
  "Ramen Noodles 🍜",
  "Double Cheese Burger 🍔",
  "Pad Thai 🍲",
  "Italian Gelato 🍦",
  "Crispy Fried Chicken 🍗",
  "Butter Chicken Curry 🍛",
  "Dim Sum Dumplings 🥟",
  "Fresh Croissant 🥐",
  "Steak Frites 🥩",
  "Matcha Ice Cream 🍵",
  "Seafood Paella 🥘",
  "Shawarma Wrap 🌯"
];

const FAKE_DESTINATIONS = [
  "Kyoto, Japan 🗾",
  "Santorini, Greece 🇬🇷",
  "Machu Picchu, Peru 🇵🇪",
  "Reykjavik, Iceland 🇮🇸",
  "Maui, Hawaii 🌺",
  "Swiss Alps, Switzerland 🇨🇭",
  "Maldives Islands 🏝️",
  "Venice, Italy 🛶",
  "Bora Bora 🌴",
  "Pyramids of Giza, Egypt 🇪🇬",
  "Auckland, New Zealand 🇳🇿",
  "Bali, Indonesia 🇮🇩"
];

const BOT_NAMES = [
  "Alex 🤖",
  "Sam 🎮",
  "Taylor ⚡",
  "Jordan 🌟",
  "Morgan 🚀",
  "Casey 🔮"
];

// Helper: Shuffle Array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// In-Memory Game Rooms Store
// roomCode -> { code, hostId, players: [{ id, name, tgId, avatar, score, isBot }], rotation: [], currentSpotlightIndex: 0, status: 'lobby'|'spotlight'|'question'|'results'|'endgame', spotlightData: {}, currentQuestion: {}, currentTimer: null, questionIndex: 0 }
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Socket.io Event Handling
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Create or Join Room
  socket.on('join_game', ({ roomCode, playerName, tgUser }) => {
    let code = (roomCode || 'FRND').toUpperCase().trim();
    if (!rooms.has(code)) {
      // Create new room if code doesn't exist
      rooms.set(code, {
        code,
        hostId: socket.id,
        players: [],
        rotation: [],
        currentSpotlightIndex: 0,
        status: 'lobby',
        spotlightData: null,
        currentQuestion: null,
        currentTimer: null,
        questionIndex: 0
      });
    }

    const room = rooms.get(code);

    if (room.status !== 'lobby') {
      socket.emit('error_message', 'Game is already in progress in this room.');
      return;
    }

    if (room.players.length >= 6) {
      socket.emit('error_message', 'Room is full (max 6 players).');
      return;
    }

    const name = playerName || (tgUser && (tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : ''))) || `Player ${room.players.length + 1}`;
    const avatar = tgUser?.photo_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name)}`;

    const newPlayer = {
      id: socket.id,
      tgId: tgUser?.id || null,
      name,
      avatar,
      score: 0,
      isHost: room.players.length === 0,
      isBot: false
    };

    room.players.push(newPlayer);
    socket.join(code);
    socket.roomCode = code;

    console.log(`[Room ${code}] Player Joined: ${name} (${socket.id})`);

    // Notify room of updated lobby state
    io.to(code).emit('lobby_update', {
      roomCode: code,
      players: room.players,
      hostId: room.hostId,
      canStart: room.players.length >= 2 && room.players.length <= 6
    });
  });

  // Host Adds Bot Player (for easy 2-6 player testing)
  socket.on('add_bot', () => {
    const code = socket.roomCode;
    if (!code || !rooms.has(code)) return;

    const room = rooms.get(code);
    if (room.status !== 'lobby') return;
    if (room.players.length >= 6) {
      socket.emit('error_message', 'Maximum 6 players reached!');
      return;
    }

    const unusedBotName = BOT_NAMES.find(n => !room.players.some(p => p.name === n)) || `Bot ${room.players.length + 1}`;
    const botPlayer = {
      id: 'bot_' + Math.random().toString(36).substr(2, 7),
      tgId: null,
      name: unusedBotName,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(unusedBotName)}`,
      score: 0,
      isHost: false,
      isBot: true
    };

    room.players.push(botPlayer);

    io.to(code).emit('lobby_update', {
      roomCode: code,
      players: room.players,
      hostId: room.hostId,
      canStart: room.players.length >= 2 && room.players.length <= 6
    });
  });

  // Host Removes a Bot or Player
  socket.on('remove_player', ({ targetId }) => {
    const code = socket.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);
    if (socket.id !== room.hostId) return;

    room.players = room.players.filter(p => p.id !== targetId);

    io.to(code).emit('lobby_update', {
      roomCode: code,
      players: room.players,
      hostId: room.hostId,
      canStart: room.players.length >= 2 && room.players.length <= 6
    });
  });

  // Start Game
  socket.on('start_game', () => {
    const code = socket.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);

    if (socket.id !== room.hostId) {
      socket.emit('error_message', 'Only the host can start the game.');
      return;
    }

    if (room.players.length < 2 || room.players.length > 6) {
      socket.emit('error_message', 'Game requires between 2 and 6 players.');
      return;
    }

    // Shuffle player rotation order
    room.rotation = shuffleArray([...room.players]);
    room.currentSpotlightIndex = 0;
    room.players.forEach(p => p.score = 0);

    console.log(`[Room ${code}] Game Started! Rotation:`, room.rotation.map(p => p.name));

    startNextSpotlightTurn(room);
  });

  // Spotlight Player Submits Facts (Supports 5 custom or pre-set facts)
  socket.on('submit_spotlight_facts', ({ facts, wifi, siblings, living, food, destination }) => {
    const code = socket.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);

    const currentSpotlight = room.rotation[room.currentSpotlightIndex];
    if (socket.id !== currentSpotlight.id) return;

    // Handle array of 5 custom facts OR 5 standard facts
    let parsedFacts = [];
    if (Array.isArray(facts) && facts.length === 5) {
      parsedFacts = facts.map(f => ({
        title: (f.title || 'Secret Fact').trim(),
        answer: (f.answer || 'Option A').trim()
      }));
    } else {
      parsedFacts = [
        { title: "Wi-Fi Name", answer: (wifi || 'Home_WiFi').trim() },
        { title: "Number of Siblings", answer: (siblings !== undefined && siblings !== null && siblings !== '') ? String(siblings).trim() : '1' },
        { title: "Current Living Location", answer: (living || 'City Center').trim() },
        { title: "Favorite Food or Drink", answer: (food || 'Pizza & Boba').trim() },
        { title: "Dream Travel Destination", answer: (destination || 'Tokyo, Japan').trim() }
      ];
    }

    room.spotlightData = parsedFacts;

    console.log(`[Room ${code}] 5 Spotlight facts submitted by ${currentSpotlight.name}:`, room.spotlightData);

    // Proceed to generate and start question 1 of 5
    room.questionIndex = 0;
    startQuestionRound(room);
  });

  // Player Submits Answer to Multiple Choice Question
  socket.on('submit_answer', ({ choice }) => {
    const code = socket.roomCode;
    if (!code || !rooms.has(code)) return;
    const room = rooms.get(code);

    if (room.status !== 'question' || !room.currentQuestion) return;

    const currentSpotlight = room.rotation[room.currentSpotlightIndex];
    // Spotlight player does not answer their own questions
    if (socket.id === currentSpotlight.id) return;

    const qData = room.currentQuestion;
    if (qData.answers[socket.id]) return; // Already answered

    const elapsed = (Date.now() - qData.startTime) / 1000;
    const timeLeft = Math.max(0, 25 - elapsed);
    const isCorrect = choice.trim().toLowerCase() === qData.correctAnswer.trim().toLowerCase();
    
    // Points based on speed: max 1000 pts for instant answer, min 100 pts for 15s limit
    const pointsEarned = isCorrect ? Math.round(100 + (timeLeft / 15) * 900) : 0;

    qData.answers[socket.id] = {
      choice,
      isCorrect,
      pointsEarned,
      timeLeft: timeLeft.toFixed(1)
    };

    const playerObj = room.players.find(p => p.id === socket.id);
    if (playerObj) {
      playerObj.score += pointsEarned;
    }

    // Send IMMEDIATE feedback to the submitting player so they know if it's correct/incorrect and see the true answer!
    socket.emit('answer_feedback', {
      choice,
      isCorrect,
      correctAnswer: qData.correctAnswer,
      pointsEarned
    });

    // Broadcast that a player answered (without revealing choices to other opponents yet)
    io.to(code).emit('player_answered_update', {
      playerId: socket.id,
      answeredCount: Object.keys(qData.answers).length,
      totalOpponents: room.players.length - 1
    });

    // If all non-spotlight players have answered, trigger immediate evaluation
    const expectedAnswersCount = room.players.length - 1;
    if (Object.keys(qData.answers).length >= expectedAnswersCount) {
      if (room.currentTimer) clearTimeout(room.currentTimer);
      finishQuestionRound(room);
    }
  });

  // Handle Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    const code = socket.roomCode;
    if (code && rooms.has(code)) {
      const room = rooms.get(code);
      room.players = room.players.filter(p => p.id !== socket.id);

      if (room.players.length === 0) {
        if (room.currentTimer) clearTimeout(room.currentTimer);
        rooms.delete(code);
        console.log(`[Room ${code}] Deleted (empty)`);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
        }

        io.to(code).emit('lobby_update', {
          roomCode: code,
          players: room.players,
          hostId: room.hostId,
          canStart: room.players.length >= 2 && room.players.length <= 6
        });
      }
    }
  });
});

// Helper: Start Next Spotlight Player's Turn
function startNextSpotlightTurn(room) {
  if (room.currentSpotlightIndex >= room.rotation.length) {
    // Game Over - Show Final Leaderboard
    room.status = 'endgame';
    const sortedLeaderboard = [...room.players].sort((a, b) => b.score - a.score);

    io.to(room.code).emit('game_over', {
      leaderboard: sortedLeaderboard
    });
    return;
  }

  const spotlightPlayer = room.rotation[room.currentSpotlightIndex];
  room.status = 'spotlight';
  room.spotlightData = null;

  console.log(`[Room ${room.code}] Spotlight Turn ${room.currentSpotlightIndex + 1}/${room.rotation.length}: ${spotlightPlayer.name}`);

  io.to(room.code).emit('spotlight_start', {
    spotlightPlayer: {
      id: spotlightPlayer.id,
      name: spotlightPlayer.name,
      avatar: spotlightPlayer.avatar
    },
    turnIndex: room.currentSpotlightIndex + 1,
    totalTurns: room.rotation.length
  });

  // If Spotlight Player is a Bot, auto-generate bot facts after 2.5s
  if (spotlightPlayer.isBot) {
    setTimeout(() => {
      if (room.status === 'spotlight' && room.rotation[room.currentSpotlightIndex]?.id === spotlightPlayer.id) {
        room.spotlightData = [
          { title: "Wi-Fi Name", answer: FAKE_WIFI_NAMES[Math.floor(Math.random() * FAKE_WIFI_NAMES.length)] },
          { title: "Number of Siblings", answer: String(Math.floor(Math.random() * 4)) },
          { title: "Current Living Location", answer: FAKE_LOCATIONS[Math.floor(Math.random() * FAKE_LOCATIONS.length)] },
          { title: "Favorite Food or Drink", answer: FAKE_FOODS[Math.floor(Math.random() * FAKE_FOODS.length)] },
          { title: "Dream Travel Destination", answer: FAKE_DESTINATIONS[Math.floor(Math.random() * FAKE_DESTINATIONS.length)] }
        ];
        room.questionIndex = 0;
        startQuestionRound(room);
      }
    }, 2500);
  }
}

// Helper: Start Question Round for Spotlight Player (5 Total Questions)
function startQuestionRound(room) {
  room.status = 'question';
  const spotlightPlayer = room.rotation[room.currentSpotlightIndex];
  const qIndex = room.questionIndex; // 0 to 4
  const factObj = (room.spotlightData && room.spotlightData[qIndex]) || { title: `Fact ${qIndex + 1}`, answer: 'Option A' };

  let titleText = factObj.title.trim();
  // Format question text cleanly
  let questionText = `What is ${spotlightPlayer.name}'s ${titleText}?`;
  if (titleText.toLowerCase().startsWith('what is') || titleText.toLowerCase().startsWith('where is') || titleText.toLowerCase().startsWith('how many') || titleText.toLowerCase().includes('?')) {
    questionText = titleText.endsWith('?') ? titleText : `${titleText}?`;
  }

  const correctAnswer = factObj.answer.trim();
  let fakeChoices = [];

  // Combine all fake item pools for high variety
  const GENERAL_POOL = [
    ...FAKE_WIFI_NAMES,
    ...FAKE_LOCATIONS,
    ...FAKE_FOODS,
    ...FAKE_DESTINATIONS,
    "Tokyo 🗾", "Playing Piano 🎹", "Marvel Movies 🎬", "Golden Retriever 🐶", "Cyberpunk 2077 🎮",
    "Matcha Latte 🍵", "Paris, France 🇫🇷", "Basketball 🏀", "Cat Lover 🐱", "New York 🏙️",
    "Inception 🍿", "Coffee & Croissant ☕", "Guitar 🎸", "Tesla Model 3 🚗", "Bungee Jumping 🪂"
  ];

  // If correct answer is a number, generate number options
  if (/^\d+$/.test(correctAnswer)) {
    const num = parseInt(correctAnswer, 10);
    const numCandidates = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10].filter(n => n !== num);
    fakeChoices = shuffleArray(numCandidates).slice(0, 3).map(String);
  } else {
    // Pick 3 non-matching choices from general pool
    const pool = GENERAL_POOL.filter(item => item.toLowerCase() !== correctAnswer.toLowerCase());
    fakeChoices = shuffleArray(pool).slice(0, 3);
  }

  // Fallback to ensure 3 unique fake choices exist
  while (fakeChoices.length < 3) {
    const extra = `Option ${fakeChoices.length + 1}`;
    if (!fakeChoices.includes(extra) && extra.toLowerCase() !== correctAnswer.toLowerCase()) {
      fakeChoices.push(extra);
    }
  }

  const allOptions = shuffleArray([correctAnswer, ...fakeChoices]);

  room.currentQuestion = {
    questionIndex: qIndex + 1,
    totalQuestions: 5,
    questionText,
    correctAnswer,
    options: allOptions,
    spotlightPlayerId: spotlightPlayer.id,
    spotlightPlayerName: spotlightPlayer.name,
    startTime: Date.now(),
    answers: {}
  };

  io.to(room.code).emit('question_start', {
    questionIndex: qIndex + 1,
    totalQuestions: 5,
    questionText,
    options: allOptions,
    spotlightPlayerId: spotlightPlayer.id,
    spotlightPlayerName: spotlightPlayer.name,
    timeLimit: 15
  });

  // Handle AI Bot auto-answering questions
  room.players.forEach(player => {
    if (player.isBot && player.id !== spotlightPlayer.id) {
      const delay = Math.floor(Math.random() * 6000) + 2000; // 2-8 seconds
      setTimeout(() => {
        if (room.status === 'question' && room.currentQuestion && !room.currentQuestion.answers[player.id]) {
          // Bot pick: 60% chance correct, 40% random
          const isBotCorrect = Math.random() < 0.6;
          const chosen = isBotCorrect ? correctAnswer : allOptions[Math.floor(Math.random() * allOptions.length)];

          const elapsed = (Date.now() - room.currentQuestion.startTime) / 1000;
          const timeLeft = Math.max(0, 15 - elapsed);
          const isCorrect = chosen.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
          const pts = isCorrect ? Math.round(100 + (timeLeft / 15) * 900) : 0;

          room.currentQuestion.answers[player.id] = {
            choice: chosen,
            isCorrect,
            pointsEarned: pts,
            timeLeft: timeLeft.toFixed(1)
          };

          player.score += pts;

          io.to(room.code).emit('player_answered_update', {
            playerId: player.id,
            answeredCount: Object.keys(room.currentQuestion.answers).length,
            totalOpponents: room.players.length - 1
          });

          if (Object.keys(room.currentQuestion.answers).length >= room.players.length - 1) {
            if (room.currentTimer) clearTimeout(room.currentTimer);
            finishQuestionRound(room);
          }
        }
      }, delay);
    }
  });

  // Set 15-second timer
  if (room.currentTimer) clearTimeout(room.currentTimer);
  room.currentTimer = setTimeout(() => {
    finishQuestionRound(room);
  }, 15000);
}

// Helper: Finish Question Round and Show Results + Ranks
function finishQuestionRound(room) {
  if (room.status !== 'question') return;
  room.status = 'results';

  if (room.currentTimer) {
    clearTimeout(room.currentTimer);
    room.currentTimer = null;
  }

  const qData = room.currentQuestion;
  const spotlightPlayer = room.rotation[room.currentSpotlightIndex];

  // Calculate live leaderboard with numerical ranks
  const sortedLeaderboard = [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((p, idx) => ({
      ...p,
      rank: idx + 1
    }));

  // Prepare results payload
  const resultsData = {
    questionText: qData.questionText,
    correctAnswer: qData.correctAnswer,
    spotlightPlayerName: spotlightPlayer.name,
    playerAnswers: room.players
      .filter(p => p.id !== spotlightPlayer.id)
      .map(p => {
        const pAns = qData.answers[p.id];
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          choice: pAns ? pAns.choice : 'Time Expired ⏰',
          isCorrect: pAns ? pAns.isCorrect : false,
          pointsEarned: pAns ? pAns.pointsEarned : 0,
          totalScore: p.score
        };
      }),
    leaderboard: sortedLeaderboard
  };

  io.to(room.code).emit('question_results', resultsData);

  // Wait 5 seconds for result & rank review, then proceed
  setTimeout(() => {
    room.questionIndex++;
    if (room.questionIndex < 5) {
      startQuestionRound(room);
    } else {
      // Finished all 5 questions for current Spotlight player -> Next player in rotation
      room.currentSpotlightIndex++;
      startNextSpotlightTurn(room);
    }
  }, 5000);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`  FRIENDS - Telegram Mini App Server Live`);
  console.log(`  Listening on Port: ${PORT}`);
  console.log(`====================================================`);
});
