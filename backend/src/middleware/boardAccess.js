// src/middleware/boardAccess.js
import { supabase } from "../supabaseClient.js";

/**
 * Ensures the logged-in user is a participant of the board.
 * Looks for boardId in:
 *  - req.params.boardId (GET /api/messages/:boardId)
 *  - req.body.boardId   (POST /api/messages)
 */
export async function boardAccessRequired(req, res, next) {
  try {
    const boardId = req.params.boardId || req.body.boardId;

    if (!boardId) {
      return res.status(400).json({
        ok: false,
        error: "boardId is required.",
      });
    }

    // req.user was attached by authRequired()
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        ok: false,
        error: "Not authenticated.",
      });
    }

    // Check membership in board_participants
    const { data, error } = await supabase
      .from("board_participants")
      .select("id, role_in_board")
      .eq("board_id", boardId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("boardAccessRequired error:", error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    if (!data) {
      return res.status(403).json({
        ok: false,
        error: "Forbidden: you do not have access to this board.",
      });
    }

    // store role for later if useful
    req.boardRole = data.role_in_board;

    return next();
  } catch (err) {
    console.error("Unexpected boardAccessRequired error:", err);
    return res.status(500).json({ ok: false, error: "Unexpected server error." });
  }
}
