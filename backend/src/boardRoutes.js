// src/boardRoutes.js
import express from 'express';
import { supabase } from './supabaseClient.js';
import { authRequired } from './middleware/auth.js';
import { adminRequired } from './middleware/adminRequired.js';
import { coordinatorRequired } from './middleware/boardAccess.js';
import { BOARD_ROLES } from './constants/roles.js';
import { isUuid, PG_UNIQUE_VIOLATION } from './utils/validate.js';

const router = express.Router();

const BOARD_COLUMNS = 'id, name, monday_board_id, monday_account_id';
const publicBoard = ({ id, name, monday_board_id }) => ({ id, name, monday_board_id });

// -----------------------------
// Sync a Monday.com board to the local DB (admin only)
// Called automatically when the Monday.com app loads on a board.
//
// Boards are owned by a Monday account. A caller can only create a board for
// their own account, or sync one their account already owns, so one tenant
// can never attach themselves to another tenant's board.
// -----------------------------
router.post('/sync', authRequired, adminRequired, async (req, res) => {
  const accountId = req.user.acc;
  if (!accountId) {
    return res.status(403).json({ ok: false, error: 'Session is missing account scope. Reload the app.' });
  }

  const { mondayBoardId } = req.body;
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const mondayBoardIdStr =
    typeof mondayBoardId === 'string' || typeof mondayBoardId === 'number'
      ? String(mondayBoardId)
      : '';

  if (!/^\d{1,20}$/.test(mondayBoardIdStr) || !name || name.length > 255) {
    return res.status(400).json({
      ok: false,
      error: 'A numeric mondayBoardId and a name (max 255 chars) are required.',
    });
  }

  const findBoard = () =>
    supabase.from('boards').select(BOARD_COLUMNS).eq('monday_board_id', mondayBoardIdStr).maybeSingle();

  let { data: board, error } = await findBoard();
  if (error) throw error;

  if (!board) {
    const insert = await supabase
      .from('boards')
      .insert([{ monday_board_id: mondayBoardIdStr, name, monday_account_id: accountId }])
      .select(BOARD_COLUMNS)
      .single();

    if (!insert.error) {
      board = insert.data;
    } else if (insert.error.code === PG_UNIQUE_VIOLATION) {
      ({ data: board, error } = await findBoard()); // lost a creation race
      if (error) throw error;
    } else {
      throw insert.error;
    }
  }

  // Ownership check (also covers the race branch above)
  if (board.monday_account_id && board.monday_account_id !== accountId) {
    return res.status(403).json({ ok: false, error: 'This board belongs to another account.' });
  }

  if (!board.monday_account_id) {
    // Legacy row created before account scoping: only an existing coordinator may claim it
    const { data: link, error: linkError } = await supabase
      .from('board_participants')
      .select('id')
      .eq('board_id', board.id)
      .eq('user_id', req.user.id)
      .eq('role_in_board', BOARD_ROLES.COORDINATOR)
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) {
      return res.status(403).json({ ok: false, error: 'This board belongs to another account.' });
    }
  }

  if (board.name !== name || !board.monday_account_id) {
    const { data: updated, error: updateError } = await supabase
      .from('boards')
      .update({ name, monday_account_id: accountId })
      .eq('id', board.id)
      .select(BOARD_COLUMNS)
      .single();
    if (updateError) throw updateError;
    board = updated;
  }

  const { error: participantError } = await supabase
    .from('board_participants')
    .upsert(
      [{ board_id: board.id, user_id: req.user.id, role_in_board: BOARD_ROLES.COORDINATOR }],
      { onConflict: 'board_id,user_id' }
    );
  if (participantError) throw participantError;

  return res.json({ ok: true, board: publicBoard(board) });
});

// -----------------------------
// List all boards this admin is a coordinator on
// -----------------------------
router.get('/', authRequired, adminRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('board_participants')
    .select('boards(id, name, monday_board_id)')
    .eq('user_id', req.user.id)
    .eq('role_in_board', BOARD_ROLES.COORDINATOR);
  if (error) throw error;

  return res.json({ ok: true, boards: data.map((d) => d.boards).filter(Boolean) });
});

// -----------------------------
// List all clients on a board (coordinators of that board only)
// -----------------------------
router.get('/:boardId/participants', authRequired, adminRequired, coordinatorRequired, async (req, res) => {
  const { data, error } = await supabase
    .from('board_participants')
    .select('user_id, role_in_board, users(id, email)')
    .eq('board_id', req.params.boardId)
    .eq('role_in_board', BOARD_ROLES.CLIENT);
  if (error) throw error;

  return res.json({ ok: true, participants: data });
});

// -----------------------------
// Cut a client's access to a board (coordinators of that board only)
// Their JWT still works, but boardAccessRequired returns 403 from now on.
// -----------------------------
router.delete(
  '/:boardId/participants/:userId',
  authRequired,
  adminRequired,
  coordinatorRequired,
  async (req, res) => {
    const { boardId, userId } = req.params;
    if (!isUuid(userId)) {
      return res.status(400).json({ ok: false, error: 'A valid userId is required.' });
    }

    const { error } = await supabase
      .from('board_participants')
      .delete()
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .eq('role_in_board', BOARD_ROLES.CLIENT); // safety: never removes coordinators
    if (error) throw error;

    return res.json({ ok: true, message: 'Client access revoked.' });
  }
);

export default router;
