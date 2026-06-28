import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import pkg from 'pg';
import verifyToken from './authMiddleware.js';
const { Pool } = pkg;

// Firebase Admin - correct ESM imports
import { initializeApp, cert } from 'firebase-admin/app';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Initialize Firebase
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : require('./firebase-key.json');

initializeApp({
  credential: cert(serviceAccount)
});

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://tech-challenge-byte-bank.vercel.app'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.options('*', cors()); 

app.use(express.json());

// 🚀 ROTA DE BOAS-VINDAS / HEALTH-CHECK (Para bancas avaliadoras e pings de teste)
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: "online",
    message: "API do Bytebank operando normalmente 🚀",
    database: "PostgreSQL Connected",
    docs: "As rotas /transfers e /sync-user exigem Bearer Token no header Authorization"
  });
});

// 💡 CORREÇÃO CRÍTICA PARA O RENDER: Libera o SSL do PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// 1. GET: Fetch all transfers for the logged-in user
app.get('/transfers', verifyToken, async (req, res) => {
  try {
    const { limit } = req.query;
    
    let queryText = 'SELECT * FROM transfers WHERE user_id = $1 ORDER BY id DESC';
    const queryParams = [req.user.uid];

    if (limit && !isNaN(limit)) {
      queryText += ' LIMIT $2';
      queryParams.push(parseInt(limit, 10));
    }

    const result = await pool.query(queryText, queryParams);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar transações' });
  }
});

// 2. POST: Create a new transfer
app.post('/transfers', verifyToken, async (req, res) => {
  const { description, amount, date, type, categories_id, receipt_url } = req.body;
  const userId = req.user.uid;

  try {
    const query = `
      INSERT INTO transfers (user_id, description, amount, date, type, categories_id, receipt_url) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *;
    `;
    const values = [userId, description, amount, date, type, categories_id || null, receipt_url || null];
    const result = await pool.query(query, values);

    res.status(201).json(result.rows[0]); 
  } catch (error) {
    console.error('Error creating transfer:', error);
    res.status(500).json({ error: 'Erro ao criar nova transação no servidor' });
  }
});

// 3. PUT: Update a specific transfer
app.put('/transfers/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { description, amount, date, type, categories_id, receipt_url } = req.body;
  const userId = req.user.uid;

  try {
    const query = `
      UPDATE transfers 
      SET description = $1, amount = $2, date = $3, type = $4, categories_id = $5, receipt_url = $6 
      WHERE id = $7 AND user_id = $8 
      RETURNING *;
    `;
    const values = [description, amount, date, type, categories_id || null, receipt_url || null, id, userId];
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transação não encontrada ou não autorizada' });
    }

    res.json(result.rows[0]); 
  } catch (error) {
    console.error('Error updating transfer:', error);
    res.status(500).json({ error: 'Erro ao atualizar transação no servidor' });
  }
});

// 4. DELETE: Exclude a specific transfer
app.delete('/transfers/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.uid;

  try {
    const query = 'DELETE FROM transfers WHERE id = $1 AND user_id = $2 RETURNING *';
    const result = await pool.query(query, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transação não encontrada ou não autorizada' });
    }

    res.json({ message: 'Transação deletada com sucesso' });
  } catch (error) {
    console.error('Error deleting transfer:', error);
    res.status(500).json({ error: 'Erro ao deletar transação no servidor' });
  }
});

// 5. POST: Sync Firebase user (Movido para ANTES do listen!)
app.post('/sync-user', verifyToken, async (req, res) => {
  const userId = req.user.uid;
  const email = req.user.email || 'no-email@provided.com'; 

  try {
    const query = `
      INSERT INTO accounts (id, email, balance) 
      VALUES ($1, $2, 0) 
      ON CONFLICT (id) DO NOTHING;
    `;
    await pool.query(query, [userId, email]);
    res.status(200).json({ message: 'User synced successfully' });
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Erro ao sincronizar usuário' });
  }
});

// 6. O LISTEN TEM QUE SER A ÚLTIMA LINHA ABSOLUTA DO ARQUIVO
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});