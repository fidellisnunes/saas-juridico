const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Semeando banco de dados SQLite...');

  // 1. Criar ou atualizar Usuário principal com o e-mail oficial zoho
  const emailOficial = 'rudson@fidellisnunes.adv.br';
  
  let user = await prisma.user.findUnique({
    where: { email: emailOficial }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: emailOficial,
        password: '123', // Senha inicial simples para permitir alteração no primeiro acesso
        name: 'Dr. Rudson Fidellis Nunes',
        role: 'ADVOGADO'
      }
    });
    console.log(`✅ Usuário criado: ${user.email}`);
  } else {
    console.log(`ℹ️ Usuário ${user.email} já existe.`);
  }

  // 2. Criar ou vincular Advogado (OAB/ES 35.054)
  let advogado = await prisma.advogado.findFirst({
    where: { oab: '35.054', uf: 'ES' }
  });

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

  // 3. Cadastrar Clientes principais
  const clientesData = [
    { name: 'MRV ENGENHARIA E PARTICIPACOES S.A', type: 'PESSOA_JURIDICA', cpfCnpj: '08.343.492/0001-20', email: 'contato@mrv.com.br', phone: '(27) 3333-1000' },
    { name: 'SFW ALIMENTOS LTDA', type: 'PESSOA_JURIDICA', cpfCnpj: '23.485.059/0001-12', email: 'juridico@sfwalimentos.com.br', phone: '(27) 3333-2000' },
    { name: 'JOSE CARLOS JESUS DO NASCIMENTO', type: 'PESSOA_FISICA', cpfCnpj: '439.520.975-00', email: 'jose.carlos@email.com', phone: '(27) 99999-1111' },
    { name: 'ANNA LUISA PINTO NEVES', type: 'PESSOA_FISICA', cpfCnpj: '111.222.333-44', email: 'anna.luisa@email.com', phone: '(27) 99999-2222' },
    { name: 'BANCO BRADESCO SA', type: 'PESSOA_JURIDICA', cpfCnpj: '60.746.948/0001-12', email: 'juridico@bradesco.com.br', phone: '(11) 3003-0000' }
  ];

  const clientesMap = {};
  for (const c of clientesData) {
    let clientObj = await prisma.client.findUnique({ where: { cpfCnpj: c.cpfCnpj } });
    if (!clientObj) {
      clientObj = await prisma.client.create({ data: c });
      console.log(`✅ Cliente cadastrado: ${c.name}`);
    }
    clientesMap[c.name] = clientObj;
  }

  // 4. Cadastrar Processos
  const processosData = [
    {
      numeroCNJ: '0021184-73.2017.8.08.0048',
      vara: '2ª Vara Cível - Serra',
      comarca: 'Serra',
      tribunal: 'TJES',
      classe: 'Execução de Título Extrajudicial',
      poloAtivo: 'MRV ENGENHARIA E PARTICIPACOES S.A',
      poloPassivo: 'RUDSON FIDELLIS NUNES',
      clienteRepresentado: 'RECLAMADA',
      estagio: 'Sentença de Extinção / Acordo Homologado',
      distribuicao: new Date('2017-09-27T00:00:00.000Z'),
      clienteId: clientesMap['MRV ENGENHARIA E PARTICIPACOES S.A'].id,
      movimentacoes: JSON.stringify([
        { data: '2026-07-08', titulo: 'Sentença de Extinção do Processo', desc: 'Homologado acordo extrajudicial e julgada extinta a execução.' },
        { data: '2026-06-15', titulo: 'Extinção da execução ou do cumprimento da sentença', desc: 'Extinção registrada na 2ª Vara Cível de Serra.' },
        { data: '2025-11-03', titulo: 'Decisão de Declínio de Competência', desc: 'Remessa ao Núcleo de Justiça 4.0.' }
      ])
    },
    {
      numeroCNJ: '0000025-10.2025.5.17.0011',
      vara: '11ª Vara do Trabalho de Vitória',
      comarca: 'Vitória',
      tribunal: 'TRT-17',
      classe: 'Ação Trabalhista (RORSum)',
      poloAtivo: 'ANNA LUISA PINTO NEVES',
      poloPassivo: 'SFW ALIMENTOS LTDA E OUTROS',
      clienteRepresentado: 'RECLAMANTE',
      estagio: 'Julgamento',
      distribuicao: new Date('2025-01-10T12:00:00.000Z'),
      clienteId: clientesMap['ANNA LUISA PINTO NEVES'].id,
      movimentacoes: JSON.stringify([
        { data: '2025-12-16', titulo: 'Intimação Eletrônica Proferida', desc: 'Intimação proferida pela 1ª Turma do TRT-17.' },
        { data: '2025-06-30', titulo: 'Conclusão ao Juiz dos Autos', desc: 'Autos conclusos para julgamento e prolação de sentença de mérito.' }
      ])
    },
    {
      numeroCNJ: '5024336-97.2024.8.08.0048',
      vara: '1º Juizado Especial Criminal e da Fazenda Pública - Serra',
      comarca: 'Serra',
      tribunal: 'TJES',
      classe: 'Termo Circunstanciado',
      poloAtivo: 'POLICIA MILITAR DO ESTADO DO ESPIRITO SANTO',
      poloPassivo: 'JOSE CARLOS JESUS DO NASCIMENTO',
      clienteRepresentado: 'RECLAMADA',
      estagio: 'Julgamento',
      distribuicao: new Date('2024-08-13T12:00:00.000Z'),
      clienteId: clientesMap['JOSE CARLOS JESUS DO NASCIMENTO'].id,
      movimentacoes: JSON.stringify([
        { data: '2025-02-07', titulo: 'Intimação de Sentença Proferida', desc: 'Ciência do inteiro teor da R. Sentença.' }
      ])
    },
    {
      numeroCNJ: '0018866-15.2020.8.08.0048',
      vara: '2ª Vara Cível - Serra',
      comarca: 'Serra',
      tribunal: 'TJES',
      classe: 'Monitória',
      poloAtivo: 'BANCO BRADESCO SA',
      poloPassivo: 'SFW ALIMENTOS LTDA',
      clienteRepresentado: 'RECLAMADA',
      estagio: 'Decurso de Prazo',
      distribuicao: new Date('2020-05-15T12:00:00.000Z'),
      clienteId: clientesMap['SFW ALIMENTOS LTDA'].id,
      movimentacoes: JSON.stringify([
        { data: '2025-08-12', titulo: 'Intimação sobre Embargos Monitórios', desc: 'Manifestação sobre Embargos Monitórios opostos.' }
      ])
    }
  ];

  for (const p of processosData) {
    let proc = await prisma.processo.findUnique({ where: { numeroCNJ: p.numeroCNJ } });
    if (!proc) {
      proc = await prisma.processo.create({ data: p });
      console.log(`✅ Processo criado: ${p.numeroCNJ}`);
    }
  }

  // 5. Cadastrar Intimação Real de Teste (Sentença de Extinção de 08/07/2026)
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
    console.log(`✅ Intimação de 08/07/2026 cadastrada.`);
  }

  console.log('🎉 Banco de dados SQLite semeado com sucesso!');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ Erro no seed:', e);
  process.exit(1);
});
