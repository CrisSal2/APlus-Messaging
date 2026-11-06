// src/middleware/boardAccess.js
import { supabase } from '../supabaseClient.js';
import { BOARD_ROLES } from '../constants/roles.js';
import { isUuid } from '../utils/validate.js';

/**
 * Builds a middleware that checks the logged-in user's membership of a board.
 * boardId is read from req.params.boardId or req.body.boardId.
 * `allowedRoles` (optional) restricts to specific role_in_board values.
 * Errors thrown here are forwarded to the global handler (Express 5).
 */
function requireBoardRole(allowedRoles = null) {
  return async (req, res, next) => {
    const boardId = req.params.boardId ?? req.body?.boardId;

    if (!isUuid(boardId)) {
      return res.status(400).json({ ok: false, error: 'A valid boardId is required.' });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }

    const { data, error } = await supabase
      .from('board_participants')
      .select('id, role_in_board')
      .eq('board_id', boardId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data || (allowedRoles && !allowedRoles.includes(data.role_in_board))) {
      return res.status(403).json({
        ok: false,
        error: 'Forbidden: you do not have access to this board.',
      });
    }

    req.boardRole = data.role_in_board;
    return next();
  };
}

/** Any participant (client or coordinator). */
export const boardAccessRequired = requireBoardRole();

/** Coordinators only: required for every board-scoped admin action. */
export const coordinatorRequired = requireBoardRole([BOARD_ROLES.COORDINATOR]);
