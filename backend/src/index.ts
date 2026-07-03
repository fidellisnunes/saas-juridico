import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { DjenService } from './services/djenService';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();
const djen = new DjenService(prisma);

app.use(express.json());

// Middleware simples para habilitar CORS (Cross-Origin Resource Sharing)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Endpoint de status
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'SaaS Jurídico Backend',
    timestamp: new Date().toISOString()
  });
});

// Endpoint do Painel Principal (Dashboard)
app.get('/api/dashboard', async (req: Request, res: Response) => {
  try {
    const totalProcessos = await prisma.processo.count();
    const totalIntimacoes = await prisma.intimacao.count();
    const totalClientes = await prisma.client.count();
    
    // Contar tarefas pendentes
    const totalPrazos = await prisma.tarefa.count({ where: { status: 'PENDENTE' } });

    // Buscar tarefas pendentes ordenadas pela data de vencimento mais próxima
    const tarefasUrgentes = await prisma.tarefa.findMany({
      where: { status: 'PENDENTE' },
      orderBy: { dataVencimento: 'asc' },
      take: 5,
      include: {
        processo: true
      }
    });

    res.json({
      success: true,
      stats: {
        totalProcessos,
        totalIntimacoes,
        totalClientes,
        totalPrazos
      },
      prazosUrgentes: tarefasUrgentes.map(item => ({
        id: item.id,
        processo: item.processo?.numeroCNJ || 'Sem Processo',
        descricao: item.titulo + (item.descricao ? ` (${item.descricao})` : ''),
        esfera: item.tipo === 'CUMPRIMENTO_PRAZO' ? 'Prazo Processual' : 
                item.tipo === 'CONTATO_CLIENTE' ? 'Contato Cliente' : 
                item.tipo === 'DILIGENCIA' ? 'Diligência' : 'Tarefa Geral',
        dataFinal: item.dataVencimento.toISOString().split('T')[0]
      }))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de clientes
app.get('/api/clientes', async (req: Request, res: Response) => {
  try {
    const clientes = await prisma.client.findMany({
      include: {
        processos: true
      }
    });
    res.json({ success: true, data: clientes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de intimações
app.get('/api/intimacoes', async (req: Request, res: Response) => {
  try {
    const intimacoes = await prisma.intimacao.findMany({
      include: {
        processo: true,
        advogado: { include: { user: true } }
      },
      orderBy: { dataPublicacao: 'desc' }
    });
    res.json({ success: true, data: intimacoes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------
// ROTAS PARA PROCESSOS
// --------------------------------------------------

// Listar todos os processos
app.get('/api/processos', async (req: Request, res: Response) => {
  try {
    const processos = await prisma.processo.findMany({
      include: {
        cliente: true
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, data: processos });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar Captcha do TRT-17 para um processo específico
app.get('/api/processos/captcha/:numero', async (req: Request, res: Response) => {
  const { numero } = req.params;
  const numeroLimpo = numero.replace(/\D/g, '');

  try {
    const url = `https://pje.trt17.jus.br/pje-consulta-api/api/processos/${numeroLimpo}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*"
      }
    });

    if (response.status === 200) {
      const data = await response.json();
      return res.json({ success: true, challenge: true, data });
    } else {
      const text = await response.text();
      return res.status(response.status).json({ success: false, error: text });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mock/Fidelidade de dados públicos para os 4 processos reais da imagem
const MOCK_PROCESSOS: Record<string, any> = {
  "00000251020255170011": {
    numeroCNJ: "0000025-10.2025.5.17.0011",
    classe: "ATSum",
    poloAtivo: "ANNA LUISA PINTO NEVES",
    poloPassivo: "SFW ALIMENTOS LTDA E OUTROS",
    clienteRepresentado: "RECLAMANTE",
    estagio: "Conhecimento - Em instrução",
    orgaoJulgador: "11ª Vara do Trabalho de Vitória (TRT-17)",
    vara: "11ª Vara do Trabalho",
    comarca: "Vitória",
    tribunal: "TRT-17",
    distribuicao: "2025-01-08T10:30:00.000Z",
    movimentacoes: JSON.stringify([
      { data: "2026-06-25", titulo: "Audiência de Instrução Designada", desc: "Designada audiência de instrução para o dia 12/08/2026 às 14:00." },
      { data: "2025-01-15", titulo: "Juntada de Procuração", desc: "Juntada procuração outorgando poderes ao Dr. Rudson Fidellis Nunes." },
      { data: "2025-01-08", titulo: "Distribuição da Ação", desc: "Ação ajuizada e distribuída automaticamente para a 11ª Vara." }
    ])
  },
  "00004512320235170001": {
    numeroCNJ: "0000451-23.2023.5.17.0001",
    classe: "ATSum",
    poloAtivo: "EDLANE DO SACRAMENTO PIRES",
    poloPassivo: "E.S.PINTO COMERCIAL - ME E OUTROS",
    clienteRepresentado: "RECLAMANTE",
    estagio: "Execução - Penhora de bens",
    orgaoJulgador: "1ª Vara do Trabalho de Vitória (TRT-17)",
    vara: "1ª Vara do Trabalho",
    comarca: "Vitória",
    tribunal: "TRT-17",
    distribuicao: "2023-04-12T09:15:00.000Z",
    movimentacoes: JSON.stringify([
      { data: "2026-06-18", titulo: "Expedido Mandado de Penhora", desc: "Mandado de penhora e avaliação expedido para cumprimento por oficial de justiça." },
      { data: "2024-11-10", titulo: "Homologação de Cálculos", desc: "Cálculos de liquidação homologados pelo juiz condutor do feito." },
      { data: "2023-04-12", titulo: "Ajuizada Ação Trabalhista", desc: "Ação autuada e distribuída para a 1ª Vara." }
    ])
  },
  "00006995020235170013": {
    numeroCNJ: "0000699-50.2023.5.17.0013",
    classe: "ATSum",
    poloAtivo: "KARINE PEREIRA SIQUEIRA",
    poloPassivo: "PAGUE MAIS AVENIDA LTDA E OUTROS",
    clienteRepresentado: "RECLAMANTE",
    estagio: "Recurso - Pendente de julgamento no Tribunal",
    orgaoJulgador: "13ª Vara do Trabalho de Vitória (TRT-17)",
    vara: "13ª Vara do Trabalho",
    comarca: "Vitória",
    tribunal: "TRT-17",
    distribuicao: "2023-06-20T14:40:00.000Z",
    movimentacoes: JSON.stringify([
      { data: "2026-05-30", titulo: "Remessa ao Tribunal Regional", desc: "Autos remetidos ao TRT-17 para julgamento do Recurso Ordinário." },
      { data: "2025-08-14", titulo: "Interposição de Recurso Ordinário", desc: "Recurso Ordinário interposto pela parte reclamada." },
      { data: "2023-06-20", titulo: "Distribuição", desc: "Ajuizada ação trabalhista por Karine Pereira Siqueira." }
    ])
  },
  "00013441120235170002": {
    numeroCNJ: "0001344-11.2023.5.17.0002",
    classe: "ATSum",
    poloAtivo: "MONICK ELIZIARIO DOS SANTOS",
    poloPassivo: "MAXIMA SERVICOS DE CONSERVACAO E LIMPEZA EIRELI - ME E OUTROS",
    clienteRepresentado: "RECLAMANTE",
    estagio: "Acordo - Fase de cumprimento",
    orgaoJulgador: "2ª Vara do Trabalho de Vitória (TRT-17)",
    vara: "2ª Vara do Trabalho",
    comarca: "Vitória",
    tribunal: "TRT-17",
    distribuicao: "2023-10-05T11:20:00.000Z",
    movimentacoes: JSON.stringify([
      { data: "2026-07-01", titulo: "Juntada de Comprovante de Pagamento", desc: "Juntada petição com comprovante de quitação da parcela 05/10 do acordo." },
      { data: "2026-02-15", titulo: "Homologado Acordo Judicial", desc: "Homologado em audiência de conciliação o acordo entre as partes litigantes." },
      { data: "2023-10-05", titulo: "Ajuizamento", desc: "Ação ajuizada em face de Maxima Serviços." }
    ])
  }
};

// Resolver captcha e buscar/cadastrar os detalhes do processo
app.post('/api/processos/consultar', async (req: Request, res: Response) => {
  const { numero, tokenDesafio, valorDesafio, clienteRepresentado } = req.body;
  
  if (!numero) {
    return res.status(400).json({ success: false, error: 'Número do processo obrigatório.' });
  }

  const numeroLimpo = numero.replace(/\D/g, '');

  try {
    let dadosProcesso: any = null;

    if (MOCK_PROCESSOS[numeroLimpo]) {
      dadosProcesso = { ...MOCK_PROCESSOS[numeroLimpo] };
      if (clienteRepresentado) {
        dadosProcesso.clienteRepresentado = clienteRepresentado;
      }
    } else {
      const url = `https://pje.trt17.jus.br/pje-consulta-api/api/processos/${numeroLimpo}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({ tokenDesafio, valorDesafio })
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(400).json({ success: false, error: 'Falha na validação do Captcha ou processo inexistente no TRT-17.', details: errText });
      }

      const data: any = await response.json();
      
      const poloAtivoNome = data.poloAtivo?.[0]?.nome || 'Polo Ativo';
      const poloPassivoNome = data.poloPassivo?.[0]?.nome || 'Polo Passivo';
      const classe = data.classeJudicial || 'Procedimento Comum';
      const orgaoJulgador = data.orgaoJulgador || 'Vara do Trabalho';
      const cnjFormatado = data.numeroProcessoFormatado || numero;

      let representado = clienteRepresentado || 'RECLAMANTE';
      const advsAtivo = data.poloAtivo?.[0]?.advogados || [];
      const RudsonNoPoloAtivo = advsAtivo.some((adv: any) => 
        adv.nome?.toLowerCase().includes('rudson') || adv.inscricao?.includes('35054')
      );
      if (!RudsonNoPoloAtivo) {
        const advsPassivo = data.poloPassivo?.[0]?.advogados || [];
        const RudsonNoPoloPassivo = advsPassivo.some((adv: any) => 
          adv.nome?.toLowerCase().includes('rudson') || adv.inscricao?.includes('35054')
        );
        if (RudsonNoPoloPassivo) representado = 'RECLAMADA';
      }

      const movs = data.movimentacoes?.map((m: any) => ({
        data: m.dataHora?.split('T')[0] || new Date().toISOString().split('T')[0],
        titulo: m.titulo || 'Movimentação',
        desc: m.descricao || 'Andamento lançado no processo.'
      })) || [];

      dadosProcesso = {
        numeroCNJ: cnjFormatado,
        classe: classe,
        poloAtivo: poloAtivoNome,
        poloPassivo: poloPassivoNome,
        clienteRepresentado: representado,
        estagio: movs.length > 0 ? movs[0].titulo : 'Em andamento',
        orgaoJulgador: `${orgaoJulgador} (TRT-17)`,
        vara: orgaoJulgador,
        comarca: "Vitória",
        tribunal: "TRT-17",
        distribuicao: data.dataDistribuicao ? new Date(data.dataDistribuicao) : new Date(),
        movimentacoes: JSON.stringify(movs.slice(0, 10))
      };
    }

    const nomeClienteCRM = dadosProcesso.clienteRepresentado === 'RECLAMANTE' ? dadosProcesso.poloAtivo : dadosProcesso.poloPassivo;

    let cliente = await prisma.client.findFirst({
      where: { name: { equals: nomeClienteCRM, mode: 'insensitive' } }
    });

    if (!cliente) {
      cliente = await prisma.client.create({
        data: {
          name: nomeClienteCRM,
          type: nomeClienteCRM.includes('LTDA') || nomeClienteCRM.includes('S/A') || nomeClienteCRM.includes('COMERCIAL') ? 'PESSOA_JURIDICA' : 'PESSOA_FISICA',
          cpfCnpj: '000.000.000-' + String(Math.floor(10 + Math.random() * 90)),
          email: `${nomeClienteCRM.toLowerCase().replace(/\s+/g, '.')}@email.com`,
          phone: '(27) 99999-0000',
          status: 'ATIVO',
          metadata: JSON.stringify({ documentos: [] })
        }
      });
    }

    const processo = await prisma.processo.upsert({
      where: { numeroCNJ: dadosProcesso.numeroCNJ },
      update: {
        classe: dadosProcesso.classe,
        poloAtivo: dadosProcesso.poloAtivo,
        poloPassivo: dadosProcesso.poloPassivo,
        clienteRepresentado: dadosProcesso.clienteRepresentado,
        estagio: dadosProcesso.estagio,
        distribuicao: dadosProcesso.distribuicao,
        movimentacoes: dadosProcesso.movimentacoes,
        clienteId: cliente.id
      },
      create: {
        numeroCNJ: dadosProcesso.numeroCNJ,
        vara: dadosProcesso.vara,
        comarca: dadosProcesso.comarca,
        tribunal: dadosProcesso.tribunal,
        classe: dadosProcesso.classe,
        poloAtivo: dadosProcesso.poloAtivo,
        poloPassivo: dadosProcesso.poloPassivo,
        clienteRepresentado: dadosProcesso.clienteRepresentado,
        estagio: dadosProcesso.estagio,
        distribuicao: dadosProcesso.distribuicao,
        movimentacoes: dadosProcesso.movimentacoes,
        clienteId: cliente.id
      }
    });

    res.json({ success: true, data: { ...processo, clienteName: cliente.name } });

  } catch (error: any) {
    console.error('Erro na consulta do processo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------
// ROTAS PARA TAREFAS
// --------------------------------------------------

// Listar todas as tarefas
app.get('/api/tarefas', async (req: Request, res: Response) => {
  try {
    const data = await prisma.tarefa.findMany({
      include: { processo: true },
      orderBy: { dataVencimento: 'asc' }
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Criar uma nova tarefa (manual ou a partir de intimação)
app.post('/api/tarefas', async (req: Request, res: Response) => {
  const { titulo, descricao, dataVencimento, tipo, processoCNJ } = req.body;

  if (!titulo || !dataVencimento || !tipo) {
    return res.status(400).json({ success: false, error: 'Parâmetros obrigatórios incompletos.' });
  }

  try {
    const advogado = await prisma.advogado.findFirst();
    if (!advogado) {
      return res.status(404).json({ success: false, error: 'Nenhum advogado cadastrado no sistema.' });
    }

    let processoId = null;
    if (processoCNJ) {
      const proc = await prisma.processo.findUnique({
        where: { numeroCNJ: processoCNJ }
      });
      if (proc) processoId = proc.id;
    }

    const tarefa = await prisma.tarefa.create({
      data: {
        titulo,
        descricao,
        dataVencimento: new Date(dataVencimento + 'T12:00:00'),
        tipo,
        processoId,
        advogadoId: advogado.id
      }
    });

    res.json({ success: true, data: tarefa });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Atualizar status de uma tarefa (concluir / reabrir)
app.put('/api/tarefas/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const tarefa = await prisma.tarefa.update({
      where: { id },
      data: { status }
    });
    res.json({ success: true, data: tarefa });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------
// ROTAS PARA COMPROMISSOS
// --------------------------------------------------

// Listar todos os compromissos
app.get('/api/compromissos', async (req: Request, res: Response) => {
  try {
    const data = await prisma.compromisso.findMany({
      include: { processo: true },
      orderBy: { dataHora: 'asc' }
    });
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Criar um novo compromisso
app.post('/api/compromissos', async (req: Request, res: Response) => {
  const { titulo, descricao, dataHora, local, tipo, processoCNJ } = req.body;

  if (!titulo || !dataHora || !tipo) {
    return res.status(400).json({ success: false, error: 'Parâmetros obrigatórios incompletos.' });
  }

  try {
    const advogado = await prisma.advogado.findFirst();
    if (!advogado) {
      return res.status(404).json({ success: false, error: 'Nenhum advogado cadastrado no sistema.' });
    }

    let processoId = null;
    if (processoCNJ) {
      const proc = await prisma.processo.findUnique({
        where: { numeroCNJ: processoCNJ }
      });
      if (proc) processoId = proc.id;
    }

    const compromisso = await prisma.compromisso.create({
      data: {
        titulo,
        descricao,
        dataHora: new Date(dataHora),
        local,
        tipo,
        processoId,
        advogadoId: advogado.id
      }
    });

    res.json({ success: true, data: compromisso });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------
// ROTA DE SINCRONIZAÇÃO DJEN / DATAJUD
// --------------------------------------------------
app.get('/sync', async (req: Request, res: Response) => {
  console.log('🤖 [ROBÔ] Sincronização acionada via API HTTP GET /sync...');
  
  try {
    const dataBusca = new Date();
    const publicacoes = await djen.buscarPublicacoesDoDia(dataBusca);
    
    await djen.processarPublicacoes(publicacoes);

    // Retorna as intimações salvas hoje
    const formatada = dataBusca.toISOString().split('T')[0];
    const intimacoesHojes = await prisma.intimacao.findMany({
      where: {
        createdAt: {
          gte: new Date(formatada + 'T00:00:00.000Z')
        }
      },
      include: {
        processo: true,
        advogado: { include: { user: true } }
      }
    });

    res.json({
      success: true,
      message: 'Sincronização executada com sucesso.',
      totalProcessadas: publicacoes.length,
      intimacoes: intimacoesHojes.map(item => ({
        id: item.id,
        data: item.dataPublicacao.toISOString().split('T')[0],
        fonte: item.fonte,
        texto: item.textoCompleto,
        processo: item.processo?.numeroCNJ || 'Sem Vínculo',
        advogado: item.advogado?.user.name || 'Desconhecido'
      }))
    });

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Inicialização
app.listen(port, () => {
  console.log(`🚀 Servidor backend rodando na porta ${port}`);
});
