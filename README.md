# Move Buss — Mobilidade Urbana

Site pronto para subir no GitHub Pages.  
App em HTML + CSS + JS (sem build) usando Firebase Authentication e Firestore.

## Funcionalidades
- Registro por **matrícula, nome e senha** (e-mail é gerado como `MATRICULA@movebuss.local`).
- Login por **matrícula e senha** com sessão persistente até logout.
- Badge com nome/matrícula (ouro para admin e verde para usuário).
- **Abertura/Fechamento de Caixa** por recebedor (1 aberto por vez por usuário).
- **Abastecimento** (só aparece com caixa aberto):  
  Validador (PRODATA/DIGICON), quantidade de bordos, **valor automático** (bordos × 5), **prefixo 55 + 3 dígitos**, data BR, matrícula motorista, matrícula recebedor (logado).  
  Gera **recibo térmico** e imprime automaticamente.
- **Sangria**: qualquer usuário pode solicitar com valor e motivo; Admin autoriza/nega. Valor autorizado entra no **resumo final** do caixa.
- **Relatórios diários** com filtro por data, agrupados por matrícula.  
  - Usuários comuns veem **apenas seus relatórios**.  
  - Admins veem **todos**, podem **editar/excluir** abastecimentos e **autorizar sangrias**.
- Botões **Alterar Senha** e **Logout** no topo (após login).
- Tema: fundo preto com degradê cinza e detalhes em verde bandeira “metal escovado”; badge admin dourada.

## Firebase
```js
const firebaseConfig = {
  apiKey: "AIzaSyDT9dx_7d1G5dJOnDJ4z7uKzvmZuOEu5wk",
  authDomain: "lancamentorecebedoria.firebaseapp.com",
  projectId: "lancamentorecebedoria",
  storageBucket: "lancamentorecebedoria.firebasestorage.app",
  messagingSenderId: "876028119542",
  appId: "1:876028119542:web:2ff23c9b1eeed25f9a9fd7",
  measurementId: "G-0XSFHZ4YWT"
};
```
As coleções **users**, **caixas**, **relatorios** (agregações no cliente) e subcoleções **abastecimentos** e **sangrias** são criadas automaticamente conforme o uso.

Admins pré-configurados por matrícula: **4144, 70029, 6266**.

> **Importante**: Ajuste as **Rules** do Firestore** antes de publicar em produção. Exemplo básico (ilustrativo):  
> permitir leitura/escrita do próprio usuário; admins podem tudo; ver `app.js` para claims por matrícula.

## Publicação
1. Suba esta pasta para um repositório no GitHub.
2. Ative **GitHub Pages** apontando para a branch principal (padrão).  
3. Pronto. Os arquivos são estáticos.
