const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

// Criar as tabelas atualizadas (Clientes, Acessos por Unidade/Condomínio)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        cpf TEXT UNIQUE,
        telefone TEXT,
        email TEXT,
        rua TEXT,
        bairro TEXT,
        cidade TEXT,
        estado TEXT,
        pais TEXT,
        foto_rostos TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS historico_acessos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpf_cliente TEXT,
        nome_condominio TEXT,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// 1. Rota para cadastrar o cliente (página principal)
app.post('/cadastrar', (req, res) => {
    const { nome, cpf, telefone, email, rua, bairro, cidade, estado, pais, foto } = req.body;

    if (!nome || !cpf || !foto) {
        return res.status(400).json({ erro: "Preencha Nome, CPF e tire a foto!" });
    }

    const query = `INSERT INTO clientes (nome, cpf, telefone, email, rua, bairro, cidade, estado, pais, foto_rostos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [nome, cpf, telefone, email, rua, bairro, cidade, estado, pais, foto], function(err) {
        if (err) {
            return res.status(500).json({ erro: "CPF já cadastrado ou erro no banco." });
        }
        res.json({ sucesso: true, id: this.lastID, mensagem: "Cliente cadastrado com sucesso!" });
    });
});

// 2. Rota para apagar cliente
app.post('/deletar', (req, res) => {
    const { cpf } = req.body;
    if (!cpf) return res.status(400).json({ erro: "Informe o CPF!" });

    db.run(`DELETE FROM clientes WHERE cpf = ?`, [cpf], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao deletar." });
        if (this.changes === 0) return res.status(404).json({ erro: "Cliente não encontrado." });
        res.json({ sucesso: true, mensagem: "Cadastro excluído com sucesso!" });
    });
});

// 3. Rota para a leitora registrar a entrada do cliente em um condomínio específico
app.post('/api/acesso', (req, res) => {
    const { cpf, nome_condominio } = req.body;

    if (!cpf || !nome_condominio) {
        return res.status(400).json({ erro: "Informe o CPF e o nome do condomínio." });
    }

    // Verifica se o cliente existe
    db.get(`SELECT nome FROM clientes WHERE cpf = ?`, [cpf], (err, cliente) => {
        if (err || !cliente) {
            return res.status(404).json({ erro: "Cliente não cadastrado." });
        }

        // Registra o acesso
        db.run(`INSERT INTO historico_acessos (cpf_cliente, nome_condominio) VALUES (?, ?)`, [cpf, nome_condominio], function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao registrar acesso." });
            res.json({ sucesso: true, mensagem: `Acesso liberado para ${cliente.nm_cliente || cliente.nome} no ${nome_condominio}!` });
        });
    });
});

// 4. Rota para o painel administrativo buscar os acessos e clientes
app.get('/api/admin/dados', (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY criado_em DESC`, [], (err, clientes) => {
        if (err) return res.status(500).json({ erro: "Erro ao buscar clientes." });

        db.all(`SELECT * FROM historico_acessos ORDER BY data_hora DESC LIMIT 100`, [], (err, acessos) => {
            if (err) return res.status(500).json({ erro: "Erro ao buscar acessos." });

            res.json({ clientes, acessos });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});