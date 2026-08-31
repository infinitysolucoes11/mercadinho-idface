const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração para aceitar dados grandes (como imagens em Base64) do site
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Conectar/Criar o banco de dados SQLite
const db = new sqlite3.Database('./banco.db', (err) => {
    if (err) console.error('Erro ao abrir o banco:', err.message);
    else console.log('Banco de dados SQLite conectado com sucesso!');
});

// Criar a tabela atualizada com todos os novos campos
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
        cliente_id INTEGER,
        data_hora DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    )`);
});

// Rota de teste
app.get('/api', (req, res) => {
    res.json({ mensagem: "API do Mercadinho funcionando!" });
});

// Rota para cadastrar o cliente com todos os dados novos
app.post('/cadastrar', (req, res) => {
    console.log("-> Recebida requisição de cadastro para o CPF:", req.body.cpf);
    const { nome, cpf, telefone, email, rua, bairro, cidade, estado, pais, foto } = req.body;

    if (!nome || !cpf || !foto) {
        console.log("-> Erro: Faltou preencher campos obrigatórios ou foto.");
        return res.status(400).json({ erro: "Preencha Nome, CPF e tire a foto!" });
    }

    const query = `INSERT INTO clientes (nome, cpf, telefone, email, rua, bairro, cidade, estado, pais, foto_rostos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(query, [nome, cpf, telefone, email, rua, bairro, cidade, estado, pais, foto], function(err) {
        if (err) {
            console.error("-> ERRO no banco ao salvar:", err.message);
            return res.status(500).json({ erro: "Erro ao cadastrar cliente (CPF já cadastrado?)" });
        }
        console.log("-> SUCESSO! Cliente cadastrado com ID:", this.lastID);
        res.json({ sucesso: true, id: this.lastID, mensagem: "Cliente cadastrado com sucesso!" });
    });
});

// Rota para apagar o cliente pelo CPF (via POST enviado pelo botão da interface)
app.post('/deletar', (req, res) => {
    const { cpf } = req.body;
    
    if (!cpf) {
        return res.status(400).json({ erro: "Informe o CPF para exclusão!" });
    }

    db.run(`DELETE FROM clientes WHERE cpf = ?`, [cpf], function(err) {
        if (err) {
            console.error("-> ERRO ao deletar:", err.message);
            return res.status(500).json({ erro: "Erro ao deletar cliente do banco." });
        }
        if (this.changes === 0) {
            return res.status(404).json({ erro: "Nenhum cliente encontrado com este CPF." });
        }
        console.log("-> SUCESSO! Cliente com CPF", cpf, "deletado.");
        res.json({ sucesso: true, mensagem: "Cadastro excluído com sucesso!" });
    });
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});