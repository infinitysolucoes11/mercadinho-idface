const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Apaga o banco antigo e cria um novo do zero para eliminar qualquer erro
const fs = require('fs');
if (fs.existsSync('./banco.db')) {
    fs.unlinkSync('./banco.db');
    console.log("Banco de dados antigo apagado. Iniciando do zero!");
}

const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

// Criar tabelas limpas e estruturadas
db.serialize(() => {
    // Tabela de clientes com senha para login
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        cpf TEXT UNIQUE,
        senha TEXT,
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

    // Tabela de administradores/funcionários
    db.run(`CREATE TABLE IF NOT EXISTS administradores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE,
        senha TEXT,
        tipo TEXT, -- 'dono' ou 'funcionario'
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        // Insere o DONO padrão inicial automaticamente
        db.run(`INSERT OR IGNORE INTO administradores (usuario, senha, tipo) VALUES (?, ?, ?)`, 
            ['admin', '123456', 'dono'], (err) => {
                if (!err) console.log("-> Administrador padrão (dono) criado: usuario: admin | senha: 123456");
            }
        );
    });

    // Histórico de acessos por condomínio
    db.run(`CREATE TABLE IF NOT EXISTS historico_acessos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpf_cliente TEXT,
        nome_condominio TEXT,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Rota de Login do Cliente
app.post('/api/login', (req, res) => {
    const { cpf, senha } = req.body;
    db.get(`SELECT * FROM clientes WHERE cpf = ? AND senha = ?`, [cpf, senha], (err, cliente) => {
        if (err || !cliente) {
            return res.status(401).json({ erro: "CPF ou senha incorretos." });
        }
        res.json({ sucesso: true, nome: cliente.nome });
    });
});

// Rota de Cadastro do Cliente
app.post('/cadastrar', (req, res) => {
    const { nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto } = req.body;

    if (!nome || !cpf || !senha || !foto) {
        return res.status(400).json({ erro: "Preencha Nome, CPF, Senha e tire a foto!" });
    }

    const query = `INSERT INTO clientes (nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto_rostos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto], function(err) {
        if (err) {
            return res.status(500).json({ erro: "Este CPF já possui cadastro." });
        }
        res.json({ sucesso: true, mensagem: "Cadastro realizado com sucesso!" });
    });
});

// Rota para apagar cliente
app.post('/deletar', (req, res) => {
    const { cpf } = req.body;
    db.run(`DELETE FROM clientes WHERE cpf = ?`, [cpf], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao deletar." });
        if (this.changes === 0) return res.status(404).json({ erro: "Cliente não encontrado." });
        res.json({ sucesso: true, mensagem: "Cadastro excluído com sucesso!" });
    });
});

// Rota de Login do Administrador
app.post('/api/admin/login', (req, res) => {
    const { usuario, senha } = req.body;
    db.get(`SELECT * FROM administradores WHERE usuario = ? AND senha = ?`, [usuario, senha], (err, admin) => {
        if (err || !admin) {
            return res.status(401).json({ erro: "Usuário ou senha inválidos." });
        }
        res.json({ sucesso: true, tipo: admin.tipo, usuario: admin.usuario });
    });
});

// Rota para o painel admin buscar dados
app.get('/api/admin/dados', (req, res) => {
    db.all(`SELECT * FROM clientes ORDER BY criado_em DESC`, [], (err, clientes) => {
        db.all(`SELECT * FROM historico_acessos ORDER BY data_hora DESC LIMIT 100`, [], (err2, acessos) => {
            db.all(`SELECT id, usuario, tipo, criado_em FROM administradores`, [], (err3, admins) => {
                res.json({ clientes, acessos, admins });
            });
        });
    });
});

// Rota para o Dono cadastrar novos funcionários
app.post('/api/admin/criar-funcionario', (req, res) => {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) return res.status(400).json({ erro: "Preencha usuário e senha." });

    db.run(`INSERT INTO administradores (usuario, senha, tipo) VALUES (?, ?, 'funcionario')`, [usuario, senha], function(err) {
        if (err) return res.status(500).json({ erro: "Usuário já existe." });
        res.json({ sucesso: true, mensagem: "Funcionário criado com sucesso!" });
    });
});

// Rota para apagar funcionário (Apenas o Dono poderá fazer isso)
app.post('/api/admin/deletar-funcionario', (req, res) => {
    const { id } = req.body;
    db.run(`DELETE FROM administradores WHERE id = ? AND tipo != 'dono'`, [id], function(err) {
        if (err || this.changes === 0) return res.status(400).json({ erro: "Não é possível apagar o Dono ou funcionário não encontrado." });
        res.json({ sucesso: true, mensagem: "Funcionário removido!" });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});