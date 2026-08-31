const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração para aceitar dados grandes (como imagens em Base64) do site e arquivos da pasta public
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// Rota para cadastrar o cliente com a foto
app.post('/cadastrar', (req, res) => {
    const { nome, cpf, foto } = req.body;

    if (!nome || !cpf || !foto) {
        return res.status(400).json({ erro: "Preencha todos os campos e tire a foto!" });
    }

    const query = `INSERT INTO clientes (nome, cpf, foto_rostos) VALUES (?, ?, ?)`;
    
    db.run(query, [nome, cpf, foto], function(err) {
        if (err) {
            console.error("Erro ao salvar no banco:", err.message);
            return res.status(500).json({ erro: "Erro ao cadastrar cliente (CPF já cadastrado?)" });
        }
        res.json({ sucesso: true, id: this.lastID, mensagem: "Cliente cadastrado com sucesso!" });
    });
});

// Iniciar o servidor (Deve ser sempre a última coisa)
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});