const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();

// Configurações básicas do Express para processar JSON e formulários
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos (HTML, CSS, imagens e scripts do frontend) a partir da pasta 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Configuração da conexão com o banco de dados PostgreSQL (compatível com o Render)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Função para atualizar a estrutura do banco automaticamente ao iniciar o servidor
async function configurarBancoDeDados() {
  try {
    // Garante que a tabela base de usuários existe
    await pool.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        telefone VARCHAR(20)
      );
    `);

    // Adiciona as colunas de segurança e verificação se não existirem
    await pool.query(`
      ALTER TABLE usuarios 
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente',
      ADD COLUMN IF NOT EXISTS email_verificado BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS telefone_verificado BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS codigo_verificacao VARCHAR(6);
    `);

    console.log('Tabela e colunas de verificação configuradas com sucesso no PostgreSQL!');
  } catch (err) {
    console.error('Erro ao configurar o banco de dados:', err);
  }
}

// Executa a configuração assim que o servidor conecta
configurarBancoDeDados();

// Porta dinâmica obrigatória exigida pelo ambiente do Render
const PORT = process.env.PORT || 3000;

// ==========================================
// ROTAS DE NAVEGAÇÃO (Páginas HTML)
// ==========================================

// Rota para a página principal (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rota para o painel administrativo (admin.html)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// ==========================================
// ROTAS DE API / BACKEND (Integrações e Dados)
// ==========================================

// Rota de status para verificar a conexão com o PostgreSQL
app.get('/api/status-db', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    res.json({ 
      success: true, 
      message: 'Banco de dados conectado com sucesso!', 
      time: result.rows[0].now 
    });
  } catch (err) {
    console.error('Erro na conexão com o banco:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao conectar ao banco de dados' 
    });
  }
});

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================

// Escutando em '0.0.0.0' para aceitar requisições externas do Render
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});