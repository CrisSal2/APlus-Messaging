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

/* Example route to check our Supabase connection */
app.get('/supabase-check', async (req, res) => {
  try {
    
    const { data, error } = await supabase.rpc('now');

    if (error) {
      console.error(error);
      return res.status(500).json({ ok: false, error: error.message });
    }

    res.json({ ok: true, server_time: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Unexpected error' });
  }
});

// Start server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`APlus Messaging backend listening on http://localhost:${PORT}`);
});
