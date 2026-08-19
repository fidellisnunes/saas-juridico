const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DATAJUD_API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

async function buscarDatajud(tribunalEndpoint) {
  const url = `https://api-publica.datajud.cnj.jus.br/${tribunalEndpoint}/_search`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `ApiKey ${DATAJUD_API_KEY}`
      },
      body: JSON.stringify({
        query: {
          bool: {
            should: [
              { match: { "advogados.numeroOab": "35054" } },
              { match: { "advogados.nome": "RUDSON FIDELLIS NUNES" } },
              { match: { "poloAtivo.nome": "RUDSON FIDELLIS NUNES" } },
              { match: { "poloPassivo.nome": "RUDSON FIDELLIS NUNES" } }
            ],
            minimum_should_match: 1
          }
        },
        size: 50,
        sort: [{ "dataHoraUltimaAtualizacao": { "order": "desc" } }]
      })
    });
    if (!response.ok) return [];
    const data = await response.json();
    return data.hits?.hits || [];
  } catch (err) {
    console.error(`Erro buscando em ${tribunalEndpoint}:`, err.message);
    return [];
  }
}

async function buscarComunicaAPI() {
  const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=35054&ufOab=ES`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    return data.items || [];
  } catch (err) {
    console.error('Erro na ComunicaAPI:', err.message);
    return [];
  }
}

async function main() {
  console.log('🔍 Buscando TODOS os processos em nome de Rudson Fidellis Nunes (OAB/ES 35.054)...');

  const [tjesHits, trtHits, comunicaItems] = await Promise.all([
    buscarDatajud('api_publica_tjes'),
    buscarDatajud('api_publica_trt17'),
    buscarComunicaAPI()
  ]);

  console.log(`📊 Encontrados: TJES DataJud=${tjesHits.length}, TRT-17 DataJud=${trtHits.length}, ComunicaAPI=${comunicaItems.length}`);

  const processosMap = new Map();

  // Processar TJES Hits
  for (const hit of tjesHits) {
    const src = hit._source || {};
    const rawCNJ = src.numeroProcesso;
    if (!rawCNJ) continue;

    let cnj = rawCNJ;
    if (!cnj.includes('-') && cnj.length === 20) {
      cnj = `${cnj.substring(0,7)}-${cnj.substring(7,9)}.${cnj.substring(9,13)}.${cnj.substring(13,14)}.${cnj.substring(14,16)}.${cnj.substring(16,20)}`;
    }

    const movsArr = (src.movimentos || []).map(m => ({
      data: m.dataHora ? m.dataHora.split('T')[0] : new Date().toISOString().split('T')[0],
      titulo: m.nome || 'Andamento',
      desc: m.complementosTabelados ? m.complementosTabelados.map(c => `${c.nome}: ${c.valor || c.descricao || ''}`).join(', ') : 'Movimentação registrada no TJES.'
    }));

    processosMap.set(cnj, {
      numeroCNJ: cnj,
      vara: src.orgaoJulgador?.nome || 'Vara Cível',
      comarca: src.orgaoJulgador?.nome?.includes('SERRA') ? 'Serra' : 'Vitória',
      tribunal: 'TJES',
      classe: src.classe?.nome || 'Procedimento Comum Cível',
      poloAtivo: src.poloAtivo?.[0]?.nome || 'Polo Ativo',
      poloPassivo: src.poloPassivo?.[0]?.nome || 'Polo Passivo',
      clienteRepresentado: 'RECLAMADA',
      estagio: movsArr.length > 0 ? movsArr[0].titulo : 'Em andamento',
      distribuicao: src.dataAjuizamento ? new Date(src.dataAjuizamento.substring(0,4) + '-' + src.dataAjuizamento.substring(4,6) + '-' + src.dataAjuizamento.substring(6,8) + 'T12:00:00') : new Date(),
      movimentacoes: JSON.stringify(movsArr.slice(0, 20))
    });
  }

  // Processar TRT-17 Hits
  for (const hit of trtHits) {
    const src = hit._source || {};
    const rawCNJ = src.numeroProcesso;
    if (!rawCNJ) continue;

    let cnj = rawCNJ;
    if (!cnj.includes('-') && cnj.length === 20) {
      cnj = `${cnj.substring(0,7)}-${cnj.substring(7,9)}.${cnj.substring(9,13)}.${cnj.substring(13,14)}.${cnj.substring(14,16)}.${cnj.substring(16,20)}`;
    }

    const movsArr = (src.movimentos || []).map(m => ({
      data: m.dataHora ? m.dataHora.split('T')[0] : new Date().toISOString().split('T')[0],
      titulo: m.nome || 'Andamento',
      desc: m.complementosTabelados ? m.complementosTabelados.map(c => `${c.nome}: ${c.valor || c.descricao || ''}`).join(', ') : 'Movimentação registrada no TRT-17.'
    }));

    processosMap.set(cnj, {
      numeroCNJ: cnj,
      vara: src.orgaoJulgador?.nome || 'Vara do Trabalho',
      comarca: 'Vitória',
      tribunal: 'TRT-17',
      classe: src.classe?.nome || 'Ação Trabalhista (ATSum)',
      poloAtivo: src.poloAtivo?.[0]?.nome || 'Polo Ativo',
      poloPassivo: src.poloPassivo?.[0]?.nome || 'Polo Passivo',
      clienteRepresentado: 'RECLAMANTE',
      estagio: movsArr.length > 0 ? movsArr[0].titulo : 'Em andamento',
      distribuicao: src.dataAjuizamento ? new Date(src.dataAjuizamento.substring(0,4) + '-' + src.dataAjuizamento.substring(4,6) + '-' + src.dataAjuizamento.substring(6,8) + 'T12:00:00') : new Date(),
      movimentacoes: JSON.stringify(movsArr.slice(0, 20))
    });
  }

  // Processar ComunicaAPI Items
  for (const item of comunicaItems) {
    const rawCNJ = item.numero_processo || item.numeroprocessocommascara;
    if (!rawCNJ) continue;

    let cnj = rawCNJ;
    if (!cnj.includes('-') && cnj.length === 20) {
      cnj = `${cnj.substring(0,7)}-${cnj.substring(7,9)}.${cnj.substring(9,13)}.${cnj.substring(13,14)}.${cnj.substring(14,16)}.${cnj.substring(16,20)}`;
    }

    if (!processosMap.has(cnj)) {
      const poloAtivo = item.destinatarios?.find(d => d.polo === 'A')?.nome || 'Polo Ativo';
      const poloPassivo = item.destinatarios?.find(d => d.polo === 'P')?.nome || 'Polo Passivo';

      processosMap.set(cnj, {
        numeroCNJ: cnj,
        vara: item.nomeOrgao || 'Vara Judicial',
        comarca: item.nomeOrgao?.includes('Serra') ? 'Serra' : 'Vitória',
        tribunal: item.siglaTribunal || 'TJES',
        classe: item.nomeClasse || 'Procedimento Judicial',
        poloAtivo,
        poloPassivo,
        clienteRepresentado: 'RECLAMANTE',
        estagio: item.tipoComunicacao || 'Em andamento',
        distribuicao: item.data_disponibilizacao ? new Date(item.data_disponibilizacao + 'T12:00:00') : new Date(),
        movimentacoes: JSON.stringify([{
          data: item.data_disponibilizacao || new Date().toISOString().split('T')[0],
          titulo: item.tipoComunicacao || 'Intimação',
          desc: item.texto ? item.texto.substring(0, 150) + '...' : 'Publicação no Diário Eletrônico.'
        }])
      });
    }
  }

  console.log(`📋 Total de processos únicos mapeados: ${processosMap.size}`);

  // Buscar cliente default
  let defaultClient = await prisma.client.findFirst();
  if (!defaultClient) {
    defaultClient = await prisma.client.create({
      data: {
        name: 'Dr. Rudson Fidellis Nunes',
        type: 'PESSOA_FISICA',
        cpfCnpj: '000.000.000-00',
        email: 'rudson@fidellisnunes.adv.br',
        phone: '(27) 99999-0000',
        status: 'ATIVO'
      }
    });
  }

  let counter = 100;
  // Upsert de todos os processos mapeados no SQLite local
  for (const pData of processosMap.values()) {
    const nomeClienteCRM = pData.poloAtivo !== 'Polo Ativo' ? pData.poloAtivo : (pData.poloPassivo !== 'Polo Passivo' ? pData.poloPassivo : 'Dr. Rudson Fidellis Nunes');
    
    let cliente = await prisma.client.findFirst({ where: { name: { equals: nomeClienteCRM } } });
    if (!cliente) {
      counter++;
      const pseudoCpfCnpj = `999.888.${counter}-${String(counter).slice(-2)}`;
      cliente = await prisma.client.create({
        data: {
          name: nomeClienteCRM,
          type: nomeClienteCRM.includes('LTDA') || nomeClienteCRM.includes('S.A') || nomeClienteCRM.includes('SA') ? 'PESSOA_JURIDICA' : 'PESSOA_FISICA',
          cpfCnpj: pseudoCpfCnpj,
          email: `${nomeClienteCRM.toLowerCase().replace(/[^a-z0-9]/g, '.')}@email.com`,
          phone: '(27) 99999-0000',
          status: 'ATIVO'
        }
      });
    }

    const saved = await prisma.processo.upsert({
      where: { numeroCNJ: pData.numeroCNJ },
      update: {
        vara: pData.vara,
        comarca: pData.comarca,
        tribunal: pData.tribunal,
        classe: pData.classe,
        poloAtivo: pData.poloAtivo,
        poloPassivo: pData.poloPassivo,
        clienteRepresentado: pData.clienteRepresentado,
        estagio: pData.estagio,
        distribuicao: pData.distribuicao,
        movimentacoes: pData.movimentacoes
      },
      create: {
        numeroCNJ: pData.numeroCNJ,
        vara: pData.vara,
        comarca: pData.comarca,
        tribunal: pData.tribunal,
        classe: pData.classe,
        poloAtivo: pData.poloAtivo,
        poloPassivo: pData.poloPassivo,
        clienteRepresentado: pData.clienteRepresentado,
        estagio: pData.estagio,
        distribuicao: pData.distribuicao,
        movimentacoes: pData.movimentacoes,
        clienteId: cliente.id
      }
    });

    console.log(`✅ Processo atualizado/salvo: ${saved.numeroCNJ} | ${saved.tribunal} | ${saved.classe}`);
  }

  const countTotal = await prisma.processo.count();
  console.log(`🎉 Total de processos agora no sistema: ${countTotal}`);
  await prisma.$disconnect();
}

main();
