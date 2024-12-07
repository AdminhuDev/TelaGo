# TelaGo - Streaming de Filmes

TelaGo é uma plataforma de streaming de filmes inspirada na Netflix, desenvolvida com JavaScript puro, HTML5 e CSS3. O projeto utiliza a API do TMDB (The Movie Database) para fornecer informações atualizadas sobre filmes.

## 🚀 Funcionalidades

- 🎬 Catálogo dinâmico de filmes
- 🔍 Busca em tempo real
- 📱 Design responsivo
- 🎯 Categorias personalizadas
- 🎥 Reprodução de trailers
- 💫 Animações e transições suaves
- 🌈 Interface moderna e intuitiva

## 🛠️ Tecnologias Utilizadas

- HTML5
- CSS3
- JavaScript (ES6+)
- API TMDB
- Plyr.js para reprodução de vídeos

## 📋 Pré-requisitos

- Node.js
- Chave de API do TMDB

## 🔧 Instalação

1. Clone o repositório:
```bash
git clone https://github.com/AdminhuDev/TelaGo.git
```

2. Entre no diretório:
```bash
cd TelaGo
```

3. Instale as dependências:
```bash
npm install
```

4. Configure as variáveis de ambiente:
   - Copie o arquivo `example.env` para `.env`:
   ```bash
   cp example.env .env
   ```
   - Abra o arquivo `.env` e configure suas variáveis:
   ```env
   TMDB_API_KEY=sua_key_aqui
   TMDB_ACCESS_TOKEN=seu_token_aqui
   PORT=3000
   ```

5. Inicie o servidor:
```bash
npm start
```

## 🔑 Configuração

O arquivo `example.env` contém todas as variáveis de ambiente necessárias para o projeto:

```env
# Configurações da API TMDB
TMDB_ACCESS_TOKEN=seu_token_aqui

# Configurações do Servidor
PORT=3000
NODE_ENV=development

# Outras configurações...
```

## 🎨 Estrutura do Projeto

```
TelaGo/
├── app.js          # Lógica principal da aplicação
├── styles.css      # Estilos globais
├── index.html      # Estrutura da página
├── server.js       # Servidor Node.js
├── config.js       # Configurações da API
├── .env           # Variáveis de ambiente (criar baseado no example.env)
└── example.env    # Exemplo de configuração
```

## 🤝 Contribuindo

1. Faça um Fork do projeto
2. Crie uma Branch para sua Feature (`git checkout -b feature/AmazingFeature`)
3. Faça o Commit das suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Faça o Push para a Branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## ✨ Agradecimentos

- TMDB pela API
- Comunidade Open Source
- Inspiração Netflix

## 👤 Autor

AdminhuDev

## 📞 Contato

- GitHub: [@AdminhuDev](https://github.com/AdminhuDev)

---
⌨️ com ❤️ por [AdminhuDev](https://github.com/AdminhuDev) 
