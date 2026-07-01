import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando a semeadura (seed) do banco de dados SQLite...');

  // 1. Criar Usuário (Dr. Rudson Fidellis Nunes)
  const user = await prisma.user.upsert({
    where: { email: 'rudson.nunes@advocacia.com.br' },
    update: {},
    create: {
      email: 'rudson.nunes@advocacia.com.br',
      name: 'Rudson Fidellis Nunes',
      password: '$argv-senha-criptografada-segura$', // Senha mock
      role: 'ADVOGADO',
    },
  });

  // 2. Criar Perfil de Advogado vinculado com OAB/ES 35.054
  const advogado = await prisma.advogado.upsert({
    where: { oab_uf: { oab: '35.054', uf: 'ES' } },
    update: {},
    create: {
      userId: user.id,
      oab: '35.054',
      uf: 'ES',
    },
  });

  console.log(`👤 Advogado cadastrado: ${user.name} (OAB/ES ${advogado.oab})`);

  // 3. Criar Clientes (Vitória Logística S/A e Marcos Aurélio de Souza)
  const cliente1 = await prisma.client.upsert({
    where: { cpfCnpj: '27.890.123/0001-44' },
    update: {},
    create: {
      name: 'Vitória Logística S/A',
      type: 'PESSOA_JURIDICA',
      cpfCnpj: '27.890.123/0001-44',
      email: 'contato@vitorialog.com.br',
      phone: '(27) 3224-1000',
      status: 'ATIVO',
      metadata: JSON.stringify({
        documentos: [
          { nome: 'contrato_social.pdf', url: 'https://supabase-storage/pdf/1' },
          { nome: 'procuracao_assinada.pdf', url: 'https://supabase-storage/pdf/2' }
        ]
      })
    },
  });

  const cliente2 = await prisma.client.upsert({
    where: { cpfCnpj: '098.765.432-11' },
    update: {},
    create: {
      name: 'Marcos Aurélio de Souza',
      type: 'PESSOA_FISICA',
      cpfCnpj: '098.765.432-11',
      email: 'marcos.aurelio@gmail.com',
      phone: '(27) 99881-2233',
      status: 'ATIVO',
      metadata: JSON.stringify({
        documentos: [
          { nome: 'rg_cpf.pdf', url: 'https://supabase-storage/pdf/3' }
        ]
      })
    },
  });

  console.log('👥 Clientes semeados com sucesso.');

  // 4. Cadastrar Processos do Advogado (TJES e TRT17)
  const processoTJES = await prisma.processo.upsert({
    where: { numeroCNJ: '0012456-78.2025.8.08.0024' },
    update: {},
    create: {
      numeroCNJ: '0012456-78.2025.8.08.0024',
      vara: '2ª Vara Cível de Vitória',
      comarca: 'Vitória / ES',
      tribunal: 'TJES',
      clienteId: cliente1.id,
      advogados: {
        connect: { id: advogado.id }
      }
    },
  });

  const processoTRT = await prisma.processo.upsert({
    where: { numeroCNJ: '0000345-12.2025.5.17.0002' },
    update: {},
    create: {
      numeroCNJ: '0000345-12.2025.5.17.0002',
      vara: '2ª Vara do Trabalho de Vitória',
      comarca: 'Vitória / ES',
      tribunal: 'TRT-17',
      clienteId: cliente2.id,
      advogados: {
        connect: { id: advogado.id }
      }
    },
  });

  console.log(`💼 Processo TJES cadastrado: ${processoTJES.numeroCNJ}`);
  console.log(`💼 Processo TRT17 cadastrado: ${processoTRT.numeroCNJ}`);
  console.log('🎉 Banco de dados semeado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro na semeadura:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
