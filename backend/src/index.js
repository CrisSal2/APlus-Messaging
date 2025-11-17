import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { supabase } from './supabaseClient.js';


const app = express();


app.use(cors());
app.use(express.json());

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


// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`APlus Messaging backend listening on http://localhost:${PORT}`);
});
