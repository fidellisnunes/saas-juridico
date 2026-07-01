# SaaS Jurídico - Gestão e Controle para Escritórios de Advocacia

Este é o código-base inicial para o sistema de gestão de escritórios de advocacia, focado na automação de prazos processuais e integração com a API pública do Diário de Justiça Eletrônico Nacional (DJEN).

## 🚀 Tecnologias Recomendadas
- **Frontend**: React.js com Tailwind CSS, TypeScript e Shadcn/UI (ou Next.js).
- **Backend**: Node.js (TypeScript) com Express ou NestJS.
- **Banco de Dados**: PostgreSQL com Prisma ORM.
- **Armazenamento**: Supabase Storage ou AWS S3 para documentos das pastas jurídicas.

## 📂 Estrutura de Diretórios Criada
- `backend/prisma/schema.prisma` - Modelagem do banco de dados contendo usuários, advogados, clientes, processos, intimações e prazos.
- `backend/src/utils/calcularPrazo.ts` - Algoritmo em TypeScript de contagem de prazos processuais (CPC e CLT) baseado em dias úteis, desconsiderando fins de semana e feriados.
- `backend/src/services/djenService.ts` - Esqueleto do serviço de integração com a API pública do DJEN e parsing/extração automática de dados.

## ⚙️ Próximos Passos recomendados para Execução
1. Configurar as variáveis de ambiente em um arquivo `.env` na raiz do backend.
2. Executar `npx prisma db push` para criar as tabelas no banco de dados local.
3. Instalar as dependências e iniciar o servidor.

---

> [!NOTE]
> Para começar a trabalhar neste projeto, defina o diretório `C:\Users\Rudson Fidellis\.gemini\antigravity\scratch\saas-juridico` como o seu diretório de espaço de trabalho (active workspace) no editor.
