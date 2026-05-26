# JC2503 Web Application Development Coursework Report

**Student Name:** Gu Hao | **Student ID:** 50098805 | **Date:** May 2026

***

## 1. Introduction

This report describes the design and implementation of a personal website and a multiplayer puzzle game. It covers the website structure, game logic, client-server communication, and reflections on the development process.

***

## 2. Website Structure

The website is built using Node.js \[3] with Express \[2] as the web framework and EJS for dynamic page rendering \[5]. Socket.IO \[1] enables real-time multiplayer functionality in the puzzle game. The project follows a standard server-side architecture with route handling, game logic, and views clearly separated.

The application consists of three main pages: the **Home page** (`/`) provides a personal introduction with navigation links; the **About page** (`/about`) displays detailed academic background and interests; and the **Game page** (`/game`) offers a multiplayer block puzzle experience with real-time player interactions.

Static assets including CSS stylesheets \[5] and image resources are served from the `public` directory. The server (`server.js`) handles all routing, WebSocket connections, and game logic coordination, while view templates in the `views` directory render the actual pages using EJS. This separation of concerns ensures maintainability and clear organization of the codebase.

**Figure 1: Architecture & Data Flow**

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Browser (Client)                                 │
│         ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐                         │
│         │  /    │  │/about │  │ /game │  │/report│                         │
│         │index  │  │ .ejs  │  │ .ejs  │  │ .html │                         │
│         └───┬───┘  └───┬───┘  └───┬───┘  └───┬───┘                         │
└─────────────┼──────────┼─────────┼─────────┼──────────────────────────────┘
              │ HTTP     │ HTTP    │WebSocket│ HTTP                          │
              ▼          ▼         │          ▼                              │
              │          │         ▼          │                              │
┌─────────────┼──────────┼─────────┼─────────┼──────────────────────────────┐
│                            server.js                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │  Express Router │────▶│   Socket.IO     │◀───▶│  gameLogic.js   │        │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘        │
│           │                     │                       │                   │
│           │ res.render()        │ io.emit()             │ getGameState()    │
│           ▼                     │                       │                   │
│       views/*.ejs               │                       │                   │
│                                 │                       │                   │
│  ┌───────────────────────────────────────────────────────────┐              │
│  │                        public/                           │              │
│  │                     CSS/*.css  │  Images/*.jpg,*.svg     │              │
│  └───────────────────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────────┘
```

*Figure 1: Website architecture and client-server data flow\[9].*

***

## 3. Game Design

**Game Rules and Scoring:** Players take turns placing blocks on a 4×4 grid. Each block has one of four shapes  and four colors, creating 16 unique types. Placing a block triggers line checks in four directions; matches of three or more (by shape or color) are cleared for 1 point each. A full board triggers a jackpot, clearing all blocks for 16 bonus points. Players are eliminated by 60-second timeout or disconnection; the game ends when all players leave.

**Data Structure:** The board uses a 16-element one-dimensional array, with `row * 4 + col` mapping 2D coordinates to indices. Each cell stores a block object `{id, shape, color}` or `null` if empty. The `availableBlocks` array manages the block pool for random selection during gameplay.

**Player Management:** The `players` array stores player objects with `{id, name, score, currentBlock}`. `currentPlayerIndex` cycles turns using modular arithmetic `(currentPlayerIndex + 1) % players.length`. A 60-second `turnTimeout` triggers `removePlayer` on expiration, returning the unplaced block to the pool and advancing to the next player. Join/leave events dynamically update the player array and recalculate turn order.

```
┌─────────────────────────────────────────────────────────────────┐
│ Client → Server         │ Server → All Clients                 │
├─────────────────────────────────────────────────────────────────┤
│ "joinGame"              │ "gameStateUpdate" (full state)       │
│ "placeBlock"            │ "playerJoined" / "playerLeft"        │
│ "disconnect"            │ "turnChange" (active player)         │
│                         │ "yourTurn" (direct to player)        │
└─────────────────────────────────────────────────────────────────┘
```

*Figure 2: Socket.IO \[1] multiplayer management showing client-server communication and player state synchronization.*

***

## 4. Client-Server Communication

Unlike the website's static pages (`/` and `/about`) which use **the traditional HTTP request-response pattern**, the multiplayer puzzle game requires continuous bidirectional data exchange. Based on WebSocket connections \[7], the game uses Socket.IO to implement real-time communication. Architecturally, HTTP routing (responsible for page navigation) is separated from persistent WebSocket connections (responsible for game state synchronization).

When a client establishes a connection, the server immediately sends the complete `gameStateUpdate`, containing the board array, player list (with scores), and current turn information, ensuring new players receive accurate status regardless of when they join.

**Client-to-server communication** follows a request-response pattern with explicit event payloads. The `joinGame` event carries the player's name, while the `placeBlock` event transmits the selected grid coordinates `{row, col}`. Before executing game logic, the server validates player identity, turn ownership, and board cell availability. Invalid operations return error messages through the callback mechanism, allowing clients to display appropriate feedback.

**Server-to-client communication** uses two patterns: broadcast events sent to all connected clients, and direct events sent only to specific players. Events such as `gameStateUpdate`, `boardUpdate`, and `turnChange` are broadcast via `io.emit()` to ensure all clients synchronize with the latest state; `yourTurn` messages are sent privately via `io.to(playerId).emit()`, ensuring each player receives their assigned block and time limit confidentially.

Additionally, the server broadcasts a `timeUpdate` event every second showing remaining turn time, while special events like `blocksCleared` and `jackpot` trigger visual animations for dramatic moments. Player lifecycle events (`playerJoined`, `playerLeft`) keep the participant list updated in real-time, with the disconnect handler automatically removing inactive players and returning their unplaced blocks to the available pool.

```
┌──────────┐                    ┌──────────┐
│ Client A │                    │  Server  │
└────┬─────┘                    └────┬─────┘
     │                               │
     │  joinGame (playerName)        │
     │──────────────────────────────>│
     │                               │
     │                    gameStateUpdate
     │<──────────────────────────────│
     │                               │
     │          yourTurn (block)     │
     │<──────────────────────────────│
     │                               │
     │  placeBlock (row, col)        │
     │──────────────────────────────>│
     │                               │
     │                    boardUpdate
     │<──────────────────────────────│
     │                     turnChange
     │<──────────────────────────────│
     │                               │
┌──────────┐                    ┌──────────┐
│ Client B │                    │  Server  │
└────┬─────┘                    └────┬─────┘
     │                               │
     │  joinGame (playerName)        │
     │──────────────────────────────>│
     │                               │
     │                    playerJoined
     │<──────────────────────────────│
     │                    gameStateUpdate
     │<──────────────────────────────│
     │                     turnChange
     │<──────────────────────────────│
     │                               │
     │        . . . . . . . . .      │
     │      (timeUpdate every 1s)    │
     │<──────────────────────────────│
```

*Figure 3: Sequence diagram showing Socket.IO event flow between clients and server\[9].*

***

## 5. Challenges & Lessons

**Multiplayer State Synchronization.** Concurrent player actions generate Socket.IO events reaching clients in varying orders, causing desynchronized boards and player lists. New players joining mid-game may miss events and get inconsistent state. The solution always broadcasts complete `gameStateUpdate` after any state change, ensuring all clients converge regardless of event order. For turn timeouts, the 60-second timer must clear itself, remove the player, return blocks, advance turns, and notify clients—embedding this directly created fragile code, so a `setOnPlayerRemovedCallback` pattern decouples logic and centralizes side effects. When line clearing returns blocks to the pool, duplicates could corrupt it, so each block is validated with `some()` before insertion to maintain integrity.

**UI Design and CSS Refinement.** For UI design, this is not a code problem but rather an aesthetic challenge. I drew reference from other excellent personal websites \[8] to achieve a clean and visually appealing page. However, integrating multiple strong visual designs introduces alignment issues and color inconsistency that require careful adjustment. Browser developer tools were used extensively for fine-tuning spacing, font sizes, and color values in real time. AI large language modelse also employed to help identify and eliminate style redundancy and inconsistency, ensuring the final stylesheet remained clean and maintainable.

The development process reinforced three key principles. First, multiplayer systems should prefer full-state snapshots over incremental updates to avoid synchronization drift. Second, side-effect-heavy operations benefit from centralized callback patterns that prevent logic from scattering across unrelated code paths. Third, good UI design requires iterative reference and testing, and CSS architecture must be flexible enough to handle diverse rendering environments without excessive duplication.

***

## 6. References

1. Socket.IO Documentation. "Socket.IO - Official Documentation." Available at: <https://socket.io/docs/> (Accessed: May 2026)
2. Express.js Documentation. "Express - Node.js web application framework." Available at: <https://expressjs.com/> (Accessed: May 2026)
3. Node.js Documentation. "Node.js v24.13.0 Documentation." Available at: <https://nodejs.org/docs/> (Accessed: May 2026)
4. W3Schools. "CSS Tutorial." Available at: <https://www.w3schools.com/css/> (Accessed: May 2026)
5. EJS Documentation. "EJS - Embedded JavaScript templating." Available at: <https://ejs.co/> (Accessed: May 2026)
6. MDN Web Docs. "WebSocket API." Available at: <https://developer.mozilla.org/en-US/docs/Web/API/WebSocket> (Accessed: May 2026)
7. 桉拾七仔. (2024). "\[网站搭建] 仅用了十分钟，完成属于自己的个人网站!" Bilibili. Available at: <https://www.bilibili.com/video/BV1WC411a73A/> (Accessed: May 2026)
8. DeepSeek. (2025). DeepSeek \[Large language model]. Used for helping identify and eliminate style redundancy and inconsistency, ensuring the final stylesheet remained clean and maintainable.
9. OpenAI. (2025). ChatGPT Image Generation Tool \[AI image generation]. Used for generating visual representations of architecture diagrams and sequence diagrams based on hand-drawn sketches and structural descriptions.

***

*Report completed for JC2503 Web Application Development | University of Aberdeen | May 2026*
