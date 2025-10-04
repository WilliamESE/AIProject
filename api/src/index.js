import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { buildApiRouter } from './routes/index.js';

//Setup the backend app with express
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//Basic api end points
app.get('/health', (req, res) => res.json({ ok: true }));

//Load our app's api from /routes/index.js
app.use(buildApiRouter());

//Handle bad requests
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON', details: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

//Start listening
const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));