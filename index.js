const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Conexão com o PostgreSQL (compatível com o Render e ambiente local)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Porta dinâmica obrigatória para o ambiente do Render
const PORT = process.env.PORT || 3000;

// Rota principal para teste de funcionamento
app.get('/', (req, res) => {
  res.send('Servidor do Mercadinho Autônomo rodando com sucesso no Render!');
});

// Exemplo de rota de teste para checar o banco de dados
app.get('/api/status-db', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ status: 'Conectado ao PostgreSQL com sucesso!', time: result.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao conectar ao banco de dados' });
  }
});

// Inicialização do servidor ouvindo em '0.0.0.0' para aceitar tráfego externo
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});