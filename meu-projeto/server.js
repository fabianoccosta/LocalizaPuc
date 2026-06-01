const express = require('express');
const path = require('path');
const app = express();

// Define a porta dinâmica do Railway ou 3000 para rodar local
const PORT = process.env.PORT || 3000;

// Serve os arquivos estáticos (HTML, imagens, CSS) da pasta public
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`Servidor rodando com sucesso na porta ${PORT}`);
});