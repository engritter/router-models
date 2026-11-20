# Como publicar no GitHub

Passo a passo para publicar o projeto.
Conta do GitHub: `engritter`. Repositório público: `engritter/router-models`.

## 1. Revisão antes do primeiro commit

```bash
claude plugin validate .
claude plugin test .
```

Confira que `.claude-plugin/types/` (gerado pelo Claude Code ao carregar o
plugin localmente) não será enviado. O `.gitignore` já exclui essa pasta.

## 2. Criar o repositório local

Na pasta `router-models`:

```bash
git init
git add .
git status
git commit -m "router-models 0.1.0"
git branch -M main
```

Revise a saída do `git status` antes do commit.

## 3a. Enviar com o GitHub CLI (`gh`)

```bash
gh auth status
gh repo create engritter/router-models --public --source . --push
```

Com `--public`, qualquer pessoa pode ler o código e instalar o plugin. Para
restringir o acesso, use `--private`: só quem você convidar consegue instalar, e
essa pessoa precisa ter credenciais Git para github.com na própria máquina.

## 3b. Enviar sem o `gh`

1. Em github.com, crie um repositório vazio chamado `router-models`, sem
   README, licença ou .gitignore.
2. Depois rode:

```bash
git remote add origin https://github.com/engritter/router-models.git
git push -u origin main
```

## 4. Depois de publicar

- Opcional: adicione um ícone quadrado em PNG (512 a 2048 px) em
  `.claude-plugin/icon.png`. O validador do diretório de plugins avisa que ele
  falta, mas o plugin funciona sem ele.
- Para versões novas, aumente `version` em `.claude-plugin/plugin.json`.
