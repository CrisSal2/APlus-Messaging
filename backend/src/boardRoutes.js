// src/boardRoutes.js
import express from 'express';
import { supabase } from './supabaseClient.js';
import { authRequired } from './middleware/auth.js';

const router = express.Router();

// -----------------------------
// Sync a Monday.com board to the local DB (admin only)
// Called automatically when the Monday.com app loads on a board.
// Creates the board record if it doesn't exist, then ensures
// the admin is listed as a coordinator participant.
//
// Requires in Supabase:
//   - UNIQUE constraint on boards.monday_board_id
//   - UNIQUE constraint on board_participants(board_id, user_id)
// -----------------------------
router.post('/sync', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admins only.' });
    }

    const { mondayBoardId, name } = req.body;
    if (!mondayBoardId || !name) {
      return res.status(400).json({ ok: false, error: 'mondayBoardId and name are required.' });
    }

    // Upsert the board record
    const { data: board, error: boardError } = await supabase
      .from('boards')
      .upsert(
        [{ monday_board_id: String(mondayBoardId), name }],
        { onConflict: 'monday_board_id' }
      )
      .select('id, name, monday_board_id')
      .single();

    if (boardError) {
      return res.status(500).json({ ok: false, error: boardError.message });
    }

    // Ensure the admin is a coordinator on this board
    const { error: participantError } = await supabase
      .from('board_participants')
      .upsert(
        [{ board_id: board.id, user_id: req.user.id, role_in_board: 'coordinator' }],
        { onConflict: 'board_id,user_id' }
      );

    if (participantError) {
      return res.status(500).json({ ok: false, error: participantError.message });
    }

    return res.json({ ok: true, board });
  } catch (err) {
    console.error('Unexpected error in POST /api/boards/sync:', err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
  }
});

// -----------------------------
// List all boards this admin is a coordinator on
// -----------------------------
router.get('/', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admins only.' });
    }

    const { data, error } = await supabase
      .from('board_participants')
      .select('boards(id, name, monday_board_id)')
      .eq('user_id', req.user.id)
      .eq('role_in_board', 'coordinator');

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, boards: data.map((d) => d.boards) });
  } catch (err) {
    console.error('Unexpected error in GET /api/boards:', err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
  }
});

// -----------------------------
// List all clients on a specific board (admin only)
// -----------------------------
router.get('/:boardId/participants', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admins only.' });
    }

    const { boardId } = req.params;

    const { data, error } = await supabase
      .from('board_participants')
      .select('user_id, role_in_board, users(id, email)')
      .eq('board_id', boardId)
      .eq('role_in_board', 'client');

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, participants: data });
  } catch (err) {
    console.error('Unexpected error in GET /api/boards/:boardId/participants:', err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
  }
});

// -----------------------------
// Cut a client's access to a board (admin only)
// Removes them from board_participants — their JWT still works
// but boardAccessRequired will return 403 from this point on.
// -----------------------------
router.delete('/:boardId/participants/:userId', authRequired, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Admins only.' });
    }

    const { boardId, userId } = req.params;

    const { error } = await supabase
      .from('board_participants')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .eq('role_in_board', 'client'); // safety: never removes coordinators

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.json({ ok: true, message: 'Client access revoked.' });
  } catch (err) {
    console.error('Unexpected error in DELETE /api/boards/:boardId/participants/:userId:', err);
    return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
  }
});

export default router;
