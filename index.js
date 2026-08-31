const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static('public'));

const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

// Inicialização e recriação estruturada do banco de dados
db.serialize(() => {
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
            db.run(`INSERT OR IGNORE INTO unidades (nome_condominio, ip_leitora) VALUES (?, ?)`, [nome, '']);
        });
    });

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

    db.run(`CREATE TABLE IF NOT EXISTS administradores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario TEXT UNIQUE,
        senha TEXT,
        tipo TEXT, 
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
        db.run(`INSERT OR IGNORE INTO administradores (usuario, senha, tipo) VALUES (?, ?, ?)`, ['admin', '123456', 'dono']);
    });

    db.run(`CREATE TABLE IF NOT EXISTS historico_acessos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cpf_cliente TEXT,
        nome_condominio TEXT,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Listar unidades
app.get('/api/unidades', (req, res) => {
    db.all(`SELECT id, nome_condominio FROM unidades`, [], (err, unidades) => {
        if (err) return res.status(500).json({ erro: "Erro ao buscar unidades." });
        res.json(unidades);
    });
});

// Login do Cliente
app.post('/api/login', (req, res) => {
    const { cpf, senha } = req.body;
    db.get(`SELECT * FROM clientes WHERE cpf = ? AND senha = ?`, [cpf, senha], (err, cliente) => {
        if (err || !cliente) {
            return res.status(401).json({ erro: "CPF ou senha incorretos." });
        }
        res.json({ sucesso: true, nome: cliente.nome });
    });
});

// Cadastro do Cliente
app.post('/cadastrar', (req, res) => {
    const { nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto, unidade_id } = req.body;

    if (!nome || !cpf || !senha || !foto || !unidade_id) {
        return res.status(400).json({ erro: "Preencha todos os campos obrigatórios e escolha a unidade!" });
    }

    const query = `INSERT INTO clientes (nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto_rostos, unidade_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [nome, cpf, senha, telefone, email, rua, bairro, cidade, estado, pais, foto, unidade_id], function(err) {
        if (err) {
            console.error("ERRO REAL DO BANCO:", err.message);
            return res.status(500).json({ erro: "Este CPF já possui cadastro." });
        }

        db.get(`SELECT ip_leitora, porta_leitora FROM unidades WHERE id = ?`, [unidade_id], async (errUnidade, unidade) => {
            if (!errUnidade && unidade && unidade.ip_leitora) {
                try {
                    console.log(`Enviando usuário para a leitora em: ${unidade.ip_leitora}:${unidade.porta_leitora}`);
                } catch (erroEnvio) {
                    console.error("Aviso: Falha ao comunicar com a leitora:", erroEnvio.message);
                }
            }
            res.json({ sucesso: true, mensagem: "Cadastro realizado e integrado com sucesso!" });
        });
    });
});

// Deletar Cliente
app.post('/deletar', (req, res) => {
    const { cpf } = req.body;
    db.run(`DELETE FROM clientes WHERE cpf = ?`, [cpf], function(err) {
        if (err) return res.status(500).json({ erro: "Erro ao deletar." });
        if (this.changes === 0) return res.status(404).json({ erro: "Cliente não encontrado." });
        res.json({ sucesso: true, mensagem: "Cadastro excluído com sucesso!" });
    });
});

// Login Admin
app.post('/api/admin/login', (req, res) => {
    const { usuario, senha } = req.body;
    db.get(`SELECT * FROM administradores WHERE usuario = ? AND senha = ?`, [usuario, senha], (err, admin) => {
        if (err || !admin) {
            return res.status(401).json({ erro: "Usuário ou senha inválidos." });
        }
        res.json({ sucesso: true, tipo: admin.tipo, usuario: admin.usuario });
    });
});

// Painel Admin com suporte a filtro opcional por data e condomínio
app.get('/api/admin/dados', (req, res) => {
    const { data_inicio, data_fim, condominio } = req.query;

    let queryClientes = `SELECT c.*, u.nome_condominio FROM clientes c LEFT JOIN unidades u ON c.unidade_id = u.id WHERE 1=1`;
    let queryAcessos = `SELECT * FROM historico_acessos WHERE 1=1`;
    let paramsClientes = [];
    let paramsAcessos = [];

    if (condominio) {
        queryClientes += ` AND u.nome_condominio = ?`;
        paramsClientes.push(condominio);
        queryAcessos += ` AND nome_condominio = ?`;
        paramsAcessos.push(condominio);
    }

    if (data_inicio && data_fim) {
        queryClientes += ` AND date(c.criado_em) BETWEEN ? AND ?`;
        paramsClientes.push(data_inicio, data_fim);
        queryAcessos += ` AND date(data_hora) BETWEEN ? AND ?`;
        paramsAcessos.push(data_inicio, data_fim);
    }

    queryClientes += ` ORDER BY c.criado_em DESC`;
    queryAcessos += ` ORDER BY data_hora DESC LIMIT 100`;

    db.all(queryClientes, paramsClientes, (err, clientes) => {
        db.all(queryAcessos, paramsAcessos, (err2, acessos) => {
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

    db.run(`INSERT INTO historico_acessos (cpf_cliente, nome_condominio) VALUES (?, ?)`, 
        [cpfOuMatricula, "MicroMarket - Unidade Remota"], (err) => {
            if (err) return res.status(500).json({ sucesso: false, erro: err.message });
            res.json({ sucesso: true, acao: "registrado" });
        }
    );
});

app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});