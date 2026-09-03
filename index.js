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
});// ==========================================
// ROTAS DE CADASTRO E VERIFICAÇÃO
// ==========================================

// 1. Rota para iniciar o cadastro (gera o código e salva como pendente)
app.post('/api/registrar', async (req, res) => {
  const { nome, email, telefone } = req.body;

  if (!nome || !email || !telefone) {
    return res.status(400).json({ success: false, message: 'Preencha todos os campos obrigatórios.' });
  }

  // Gera um código numérico aleatório de 6 dígitos
  const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // Insere ou atualiza o usuário como 'pendente' e guarda o código de verificação
    const query = `
      INSERT INTO usuarios (nome, email, telefone, status, codigo_verificacao, email_verificado, telefone_verificado)
      VALUES ($1, $2, $3, 'pendente', $4, FALSE, FALSE)
      ON CONFLICT (email) 
      DO UPDATE SET 
        nome = EXCLUDED.nome,
        telefone = EXCLUDED.telefone,
        status = 'pendente',
        codigo_verificacao = EXCLUDED.codigo_verificacao,
        email_verificado = FALSE,
        telefone_verificado = FALSE
      RETURNING id;
    `;

    await pool.query(query, [nome, email, telefone, codigoVerificacao]);

    // Simulação do envio (aqui depois podemos plugar um serviço real de e-mail/SMS)
    console.log(`[VERIFICAÇÃO] Código gerado para ${email} / Telefone ${telefone}: ${codigoVerificacao}`);

    res.json({ 
      success: true, 
      message: 'Pré-cadastro realizado com sucesso! Insira o código de verificação enviado.',
      // Enviando o código na resposta temporariamente para testes fáceis (removeremos depois)
      codigoDebug: codigoVerificacao 
    });

  } catch (err) {
    console.error('Erro ao registrar usuário:', err);
    res.status(500).json({ success: false, message: 'Erro interno ao processar o cadastro.' });
  }
});

// 2. Rota para validar o código digitado e ativar a conta
app.post('/api/verificar-codigo', async (req, res) => {
  const { email, codigo } = req.body;

  if (!email || !codigo) {
    return res.status(400).json({ success: false, message: 'Informe o e-mail e o código de verificação.' });
  }

  try {
    // Busca o usuário pelo e-mail
    const resultado = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Usuário não encontrado.' });
    }

    const usuario = resultado.rows[0];

    // Verifica se o código bate com o armazenado
    if (usuario.codigo_verificacao !== codigo) {
      return res.status(400).json({ success: false, message: 'Código de verificação incorreto.' });
    }

    // Se estiver correto, atualiza o status para ativo e marca como verificado
    await pool.query(`
      UPDATE usuarios 
      SET status = 'ativo', email_verificado = TRUE, telefone_verificado = TRUE, codigo_verificacao = NULL
      WHERE email = $1
    `, [email]);

    res.json({ success: true, message: 'Conta verificada e ativada com sucesso!' });

  } catch (err) {
    console.error('Erro ao verificar código:', err);
    res.status(500).json({ success: false, message: 'Erro interno ao validar o código.' });
  }
});