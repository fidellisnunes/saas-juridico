import { PrismaClient } from '@prisma/client';
import { DjenService } from './services/djenService';

const prisma = new PrismaClient();
const djen = new DjenService(prisma);

async function rodarIntegracao() {
  console.log('🤖 [ROBÔ] Inicializando rotina de captura diária do DJEN e PJe...');

  try {
    // 1. Verificar se existem advogados e processos no banco (SQLite)
    const advogados = await prisma.advogado.findMany({
      include: { user: true }
    });
    console.log(`📋 Advogados cadastrados no banco local: ${advogados.length}`);
    for (const adv of advogados) {
      console.log(`   - ${adv.user.name} (OAB/${adv.uf} ${adv.oab})`);
    }

    const processos = await prisma.processo.findMany();
    console.log(`📋 Processos cadastrados no banco local: ${processos.length}`);
    for (const proc of processos) {
      console.log(`   - Processo CNJ: ${proc.numeroCNJ} (${proc.tribunal})`);
    }

    // 2. Buscar publicações diárias (Mock da API Pública do DJEN contendo publicações para o Dr. Rudson)
    const dataBusca = new Date();
    const publicacoes = await djen.buscarPublicacoesDoDia(dataBusca);
    console.log(`📥 API pública retornou ${publicacoes.length} publicações para análise.`);

    // 3. Executar o processamento e parsing com Regex
    console.log('\n🔍 Analisando textos e cruzando OAB/Processos...');
    await djen.processarPublicacoes(publicacoes);

    // 4. Exibir o resultado final gravado no banco de dados SQLite
    console.log('\n📊 [RESULTADO NO BANCO LOCAL (SQLite)]');
    const intimacoesGravadas = await prisma.intimacao.findMany({
      include: {
        processo: true,
        advogado: { include: { user: true } }
      }
    });

    console.log(`Total de intimações gravadas: ${intimacoesGravadas.length}`);
    for (const item of intimacoesGravadas) {
      console.log(`\n----------------------------------------`);
      console.log(`ID: ${item.id}`);
      console.log(`Tribunal: ${item.fonte}`);
      console.log(`Texto: "${item.textoCompleto.substring(0, 100)}..."`);
      console.log(`Advogado Vinculado: ${item.advogado?.user.name || 'Nenhum'}`);
      console.log(`Processo Vinculado: ${item.processo?.numeroCNJ || 'Nenhum (Sem Vínculo)'}`);
    }
    console.log(`----------------------------------------`);

  } catch (error) {
    console.error('❌ Erro durante a integração:', error);
  } finally {
    await prisma.$disconnect();
    console.log('\n🔌 Conexão com o banco finalizada.');
  }
}

rodarIntegracao();
