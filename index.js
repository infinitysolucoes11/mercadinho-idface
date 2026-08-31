const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

// Criar tabelas e inserir as unidades padrão corrigidas para MicroMarket
db.serialize(() => {
    // Tabela de Unidades / Condomínios
    db.run(`CREATE TABLE IF NOT EXISTS unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_condominio TEXT,
        ip_leitora TEXT,
        porta_leitora TEXT DEFAULT '80',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        const unidadesIniciais = [
            'MicroMarket - Donatello',
            'MicroMarket - Dversão',
            'MicroMarket - Fantastique'
        ];
        
        unidadesIniciais.forEach(nome => {
            db.run(`INSERT OR IGNORE INTO unidades (nome_condominio, ip_leitora) VALUES (?, ?)`, 
                [nome, '']);
        });
    });

    // Tabela de clientes com vínculo à unidade de cadastro
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
        unidade_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(unidade_id) REFERENCES unidades(id)
    )`);

    // Tabela de administradores/funcionários
    db.run(`CREATE TABLE IF NOT EXISTS administradores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE,
        senha TEXT,
        tipo TEXT, 
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        db.run(`INSERT OR IGNORE INTO administradores (usuario, senha, tipo) VALUES (?, ?, ?)`, 
            ['admin', '123456', 'dono']
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

// Rota para listar unidades no site
app.get('/api/unidades', (req, res) => {
    db.all(`SELECT id, nome_condominio FROM unidades`, [], (err, unidades) => {
        if (err) return res.status(500).json({ erro: "Erro ao buscar unidades." });
        res.json(unidades);
    });
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

// Rota de Cadastro do Cliente com diagnóstico de erro real
app.post('/cadastrar', (req, res) => {
    const { nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto, unidade_id } = req.body;

    if (!nome || !cpf || !senha || !foto) {
        return res.status(400).json({ erro: "Preencha Nome, CPF, Senha e tire a foto!" });
    }

    const query = `INSERT INTO clientes (nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto_rostos, unidade_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto, unidade_id], function(err) {
        if (err) {
            console.error("ERRO REAL DO BANCO:", err.message);
            return res.status(500).json({ erro: "Erro técnico: " + err.message });
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
                db.all(`SELECT * FROM unidades`, [], (err4, unidades) => {
                    res.json({ clientes, acessos, admins, unidades });
                });
            });
        });
    });
});

app.post('/api/admin/unidades', (req, res) => {
    const { nome_condominio, ip_leitora, porta_leitora } = req.body;
    db.run(`INSERT INTO unidades (nome_condominio, ip_leitora, porta_leitora) VALUES (?, ?, ?)`, 
        [nome_condominio, ip_leitora || '', porta_leitora || '80'], function(err) {
            if (err) return res.status(500).json({ erro: "Erro ao cadastrar unidade." });
            res.json({ sucesso: true, mensagem: "Unidade cadastrada com sucesso!" });
        }
    );
});

app.post('/api/admin/criar-funcionario', (req, res) => {
    const { usuario, senha } = req.body;
    db.run(`INSERT INTO administradores (usuario, senha, tipo) VALUES (?, ?, 'funcionario')`, [usuario, senha], function(err) {
        if (err) return res.status(500).json({ erro: "Usuário já existe." });
        res.json({ sucesso: true, mensagem: "Funcionário criado com sucesso!" });
    });
});

app.post('/api/admin/deletar-funcionario', (req, res) => {
    const { id } = req.body;
    db.run(`DELETE FROM administradores WHERE id = ? AND tipo != 'dono'`, [id], function(err) {
        if (err || this.changes === 0) return res.status(400).json({ erro: "Não é possível apagar o Dono." });
        res.json({ sucesso: true, mensagem: "Funcionário removido!" });
    });
});

// Webhook para aceitar apenas acessos autorizados do iDFace
app.post('/api/controlid/webhook', (req, res) => {
    const dadosAcesso = req.body;
    let cpfOuMatricula = "Desconhecido";
    let autorizado = false;
    
    if (dadosAcesso.object_changes && dadosAcesso.object_changes.length > 0) {
        const log = dadosAcesso.object_changes.find(item => item.object === 'access_logs');
        if (log && log.values) {
            cpfOuMatricula = log.values.user_id || log.values.identifier_id || "Desconhecido";
            autorizado = log.values.authorized === true || log.values.result === 1;
        }
    }

    if (!autorizado) {
        return res.json({ sucesso: true, acao: "ignorado" });
    }

    const nomeCondominio = "MicroMarket - Unidade Remota"; 

    db.run(`INSERT INTO historico_acessos (cpf_cliente, nome_condominio) VALUES (?, ?)`, 
        [cpfOuMatricula, nomeCondominio], (err) => {
            if (err) return res.status(500).json({ sucesso: false, erro: err.message });
            res.json({ sucesso: true, acao: "registrado" });
        }
    );
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});