import { config } from "dotenv";
config({ path: ".env.local" });

import { createServer } from "http";
import { Server } from "socket.io";
import { supabase } from "./util/supabase.js";
import { setupSocketHandlers } from "./socket/index.js";

const PORT = parseInt(process.env.PORT || "3001", 10);
const CLIENT_URL = process.env.CLIENT_URL || "*";

const httpServer = createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("chat karo socket server is up and running");
  }
});

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ["GET", "POST"],
  },
});

// Middleware to verify user using Supabase Auth
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  console.log("received a connection request");

  if (!token) return next(new Error("No token provided"));

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      console.error("❌ Auth failed: ", error?.message);
      return next(new Error("Authentication failed"));
    }

    socket.data.user = data.user;
    next();
  } catch (err) {
    console.error("❌ Auth error:", (err as Error).message);
    return next(new Error("Authentication failed"));
  }
});

// Initialize socket handlers
setupSocketHandlers(io);

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`🔌 Socket.io is ready for connections`);
});

export { io, httpServer };
