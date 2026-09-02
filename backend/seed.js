const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Semeando banco de dados SQLite com TODOS os 38 processos de Dr. Rudson Fidellis Nunes...');

  // 1. Criar ou atualizar Usuário principal com o e-mail oficial zoho
  const emailOficial = 'rudson@fidellisnunes.adv.br';
  
  // Ler senha persistida se existir (evita reset para '123')
  let defaultPass = '123';
  const credPath = path.join(__dirname, 'user_credentials.json');
  const driveCredPath = 'G:\\Meu Drive\\PROFISSIONAL\\FIDELLIS NUNES ADVOCACIA\\sistema\\database\\user_credentials.json';
  if (fs.existsSync(credPath)) {
    try { defaultPass = JSON.parse(fs.readFileSync(credPath, 'utf8')).password || '123'; } catch(e){}
  } else if (fs.existsSync(driveCredPath)) {
    try { defaultPass = JSON.parse(fs.readFileSync(driveCredPath, 'utf8')).password || '123'; } catch(e){}
  }

  let user = await prisma.user.findUnique({ where: { email: emailOficial } });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: emailOficial,
        password: defaultPass,
        name: 'Dr. Rudson Fidellis Nunes',
        role: 'ADVOGADO'
      }
    });
    console.log(`✅ Usuário criado: ${user.email}`);
  } else {
    console.log(`ℹ️ Usuário ${user.email} já existe. Senha no banco mantida sem alterações.`);
  }

  // 2. Criar ou vincular Advogado (OAB/ES 35.054)
  let advogado = await prisma.advogado.findFirst({ where: { oab: '35.054', uf: 'ES' } });

  if (!advogado) {
    advogado = await prisma.advogado.create({
      data: {
        userId: user.id,
        oab: '35.054',
        uf: 'ES'
      }
    });
    console.log(`✅ Advogado vinculado: OAB/ES ${advogado.oab}`);
  }

  // 3. Ler todos os 38 processos exportados do JSON
  const jsonPath = path.join(__dirname, 'all_processes.json');
  if (fs.existsSync(jsonPath)) {
    const jsonStr = fs.readFileSync(jsonPath, 'utf8');
    const processosList = JSON.parse(jsonStr);

    console.log(`📋 Carregando ${processosList.length} processos pré-mapeados...`);

    let clientCounter = 5000;
    for (const p of processosList) {
      const clientObj = p.cliente || { name: p.poloAtivo || 'Cliente' };
      
      let cliente = await prisma.client.findFirst({
        where: { name: { equals: clientObj.name } }
      });

      if (!cliente) {
        clientCounter++;
        cliente = await prisma.client.create({
          data: {
            name: clientObj.name,
            type: clientObj.type || (clientObj.name.includes('LTDA') || clientObj.name.includes('S.A') || clientObj.name.includes('SA') ? 'PESSOA_JURIDICA' : 'PESSOA_FISICA'),
            cpfCnpj: clientObj.cpfCnpj || `888.777.${clientCounter}-${String(clientCounter).slice(-2)}`,
            email: clientObj.email || `${clientObj.name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@email.com`,
            phone: clientObj.phone || '(27) 99999-0000',
            status: 'ATIVO'
          }
        });
      }

      await prisma.processo.upsert({
        where: { numeroCNJ: p.numeroCNJ },
        update: {
          vara: p.vara,
          comarca: p.comarca,
          tribunal: p.tribunal,
          classe: p.classe,
          poloAtivo: p.poloAtivo,
          poloPassivo: p.poloPassivo,
          clienteRepresentado: p.clienteRepresentado || 'RECLAMADA',
          estagio: p.estagio,
          distribuicao: p.distribuicao ? new Date(p.distribuicao) : new Date(),
          movimentacoes: p.movimentacoes
        },
        create: {
          numeroCNJ: p.numeroCNJ,
          vara: p.vara,
          comarca: p.comarca,
          tribunal: p.tribunal,
          classe: p.classe,
          poloAtivo: p.poloAtivo,
          poloPassivo: p.poloPassivo,
          clienteRepresentado: p.clienteRepresentado || 'RECLAMADA',
          estagio: p.estagio,
          distribuicao: p.distribuicao ? new Date(p.distribuicao) : new Date(),
          movimentacoes: p.movimentacoes,
          clienteId: cliente.id
        }
      });
    }
  }

  // 4. Cadastrar Intimação Real (Sentença de Extinção de 08/07/2026)
  const procRef = await prisma.processo.findUnique({ where: { numeroCNJ: '0021184-73.2017.8.08.0048' } });
  
  const intimacaoExiste = await prisma.intimacao.findFirst({
    where: { textoCompleto: { contains: 'JULGO EXTINTA a presente execução' } }
  });

  if (!intimacaoExiste) {
    await prisma.intimacao.create({
      data: {
        textoCompleto: `ESTADO DO ESPÍRITO SANTO PODER JUDICIÁRIO Juízo de Serra - Comarca da Capital - 2ª Vara Cível Avenida Carapebus, 226, Fórum Des Antônio José M. Feu Rosa, São Geraldo, SERRA - ES - CEP: 29163-392 Telefone:(27) 33574814 PROCESSO Nº 0021184-73.2017.8.08.0048 EXECUÇÃO DE TÍTULO EXTRAJUDICIAL (12154) EXEQUENTE: MRV ENGENHARIA E PARTICIPACOES S.A EXECUTADO: RUDSON FIDELLIS NUNES Advogado do(a) EXEQUENTE: RICARDO LOPES GODOY - MG77167 SENTENÇA Trata-se de Ação de Execução de Título Extrajudicial em que as partes, por meio da petição juntada ao ID 93884120, noticiaram a celebração de acordo extrajudicial, requerendo a sua homologação e a expedição de alvará judicial para o levantamento de valores bloqueados, conforme os termos estabelecidos na minuta de acordo assinada e anexada no ID 93884125. Verifico que o negócio jurídico celebrado entre as partes preserva os seus interesses, envolve agentes capazes e versa sobre direitos patrimoniais disponíveis, não havendo qualquer óbice legal à sua validação. Ante o exposto: 1. HOMOLOGO, por sentença, para que produza os seus jurídicos e legais efeitos, o acordo extrajudicial firmado entre as partes constante no instrumento de ID 93884125. 2. JULGO EXTINTA a presente execução, com resolução de mérito, com fulcro nos artigos 487, inciso III, alínea "b", e 924, inciso II, ambos do Código de Processo Civil. Serra/ES, 08/07/2026. Kelly Kiefer Juíza de Direito`,
        fonte: 'Diário de Justiça Eletrônico Nacional - TJES',
        dataPublicacao: new Date('2026-07-08T00:00:00.000Z'),
        statusLeitura: false,
        processoId: procRef ? procRef.id : null,
        advogadoId: advogado.id
      }
    });
  }

  const countTotal = await prisma.processo.count();
  console.log(`🎉 Banco de dados SQLite semeado! Total de processos cadastrados: ${countTotal}`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Erro no seed:', e);
  process.exit(1);
});
