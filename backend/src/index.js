import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { supabase } from './supabaseClient.js';
import authRoutes from './authRoutes.js';
import { authRequired } from './middleware/auth.js';
import { boardAccessRequired } from "./middleware/boardAccess.js";


const app = express();


app.use(cors());
app.use(express.json());
app.use('/auth', authRoutes);


/* Health check route */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'APlus Messaging backend is running' });
});

/* Example route to check our Supabase connection using the boards table */
app.get('/supabase-check', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('boards')
      .select('id, name, monday_board_id')
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({
      ok: true,
      sample_board: data && data.length > 0 ? data[0] : null
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    res.status(500).json({ ok: false, error: 'Unexpected error' });
  }
});

/* Create a new message */
app.post("/api/messages", authRequired, boardAccessRequired, async (req, res) => {
  try {
    const { boardId, content } = req.body;

    // Important: senderId must come from JWT, NOT from req.body
    const senderId = req.user.id;

    if (!boardId || !content) {
      return res.status(400).json({
        ok: false,
        error: "boardId and content are required",
      });
    }

    const { data, error } = await supabase
      .from("messages")
      .insert([
        {
          board_id: boardId,
          sender_id: senderId,
          content,
        },
      ])
      .select("*")
      .single();

    if (error) {
      console.error("Error inserting message:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(201).json({ ok: true, message: data });
  } catch (err) {
    console.error("Unexpected error in POST /api/messages:", err);
    return res.status(500).json({ ok: false, error: "Unexpected server error" });
  }
});


/* Get all messages for a specific board */
app.get("/api/messages/:boardId", authRequired, boardAccessRequired, async (req, res) => {
  try {
    const { boardId } = req.params;

    const { data, error } = await supabase
      .from("messages")
      .select("id, board_id, sender_id, content, created_at")
      .eq("board_id", boardId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, messages: data || [] });
  } catch (err) {
    console.error("Unexpected error in GET /api/messages/:boardId:", err);
    return res.status(500).json({ ok: false, error: "Unexpected server error" });
  }
});





// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`APlus Messaging backend listening on http://localhost:${PORT}`);
});
