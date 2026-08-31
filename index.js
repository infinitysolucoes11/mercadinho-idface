const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = 3000;

// Configuração para aceitar dados do site e arquivos da pasta public
app.use(express.json());
app.use(express.static('public'));

// Conectar/Criar o banco de dados SQLite
const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

// Criar as tabelas do sistema se não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        cpf TEXT UNIQUE,
        foto_rostos TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS historico_acessos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    )`);
});

// Teste inicial do servidor
app.get('/api', (req, res) => {
    res.json({ mensagem: "API do Mercadinho funcionando!" });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});