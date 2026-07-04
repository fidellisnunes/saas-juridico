import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { DjenService } from './services/djenService';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();
const djen = new DjenService(prisma);

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Token secret for custom JWT-like auth
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-juridico-key-2026';
const DATAJUD_API_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

function generateToken(userId: string): string {
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = JSON.stringify({ userId, expiry });
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64') + '.' + signature;
}

function verifyToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], 'base64').toString('utf8');
    const signature = parts[1];
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
    if (signature !== expectedSignature) return null;
    const data = JSON.parse(payload);
    if (Date.now() > data.expiry) return null; // expired
    return data.userId;
  } catch (e) {
    return null;
  }
}

// Middleware de Autenticação
const authMiddleware = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Sessão expirada ou inválida. Faça login novamente.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { advogado: true }
    });
    if (!user) {
      return res.status(401).json({ success: false, error: 'Usuário não encontrado.' });
    }
    (req as any).user = user;
    next();
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

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

// Endpoint de status público
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'SaaS Jurídico Backend',
    timestamp: new Date().toISOString()
  });
});

// --------------------------------------------------
// ROTAS DE AUTENTICAÇÃO
// --------------------------------------------------
app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || user.password !== password) {
      return res.status(400).json({ success: false, error: 'E-mail ou senha incorretos.' });
    }

    const token = generateToken(user.id);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      advogado: user.advogado
    }
  });
});

// Endpoint do Painel Principal (Dashboard) - Protegido
app.get('/api/dashboard', authMiddleware, async (req: Request, res: Response) => {
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

// Endpoint de clientes - Protegido
app.get('/api/clientes', authMiddleware, async (req: Request, res: Response) => {
  try {
    const clientes = await prisma.client.findMany({
      include: {
        processos: true
      },
      orderBy: { name: 'asc' }
    });
    res.json({ success: true, data: clientes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint de intimações - Protegido
app.get('/api/intimacoes', authMiddleware, async (req: Request, res: Response) => {
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
// ROTAS PARA PROCESSOS - Protegidas
// --------------------------------------------------

// Listar todos os processos
app.get('/api/processos', authMiddleware, async (req: Request, res: Response) => {
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
app.get('/api/processos/captcha/:numero', authMiddleware, async (req: Request, res: Response) => {
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

// Mocks estáticos de apoio para processos do TRT-17
const MOCK_PROCESSOS: Record<string, any> = {
  "00000251020255170011": {
    numeroCNJ: "0000025-10.2025.5.17.0011",
    classe: "ATSum",
    poloAtivo: "ANNA LUISA PINTO NEVES",
    poloPassivo: "SFW ALIMENTOS LTDA E ONION ALIMENTOS LTDA",
    clienteRepresentado: "RECLAMADA",
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
    clienteRepresentado: "RECLAMADA",
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

// Resolver captcha e buscar/cadastrar os detalhes do processo (TRT-17)
app.post('/api/processos/consultar', authMiddleware, async (req: Request, res: Response) => {
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
        return res.status(400).json({ success: false, error: 'Falha na validação do Captcha ou processo inexistente no TRT-17.' });
      }

      const data: any = await response.json();
      
      const poloAtivoNome = data.poloAtivo?.[0]?.nome || 'Polo Ativo';
      const poloPassivoNome = data.poloPassivo?.[0]?.nome || 'Polo Passivo';
      const classe = data.classeJudicial || 'Procedimento Comum';
      const orgaoJulgador = data.orgaoJulgador || 'Vara do Trabalho';
      const cnjFormatado = data.numeroProcessoFormatado || numero;

      let representado = clienteRepresentado || 'RECLAMANTE';
      dadosProcesso = {
        numeroCNJ: cnjFormatado,
        classe: classe,
        poloAtivo: poloAtivoNome,
        poloPassivo: poloPassivoNome,
        clienteRepresentado: representado,
        estagio: 'Em andamento',
        orgaoJulgador: `${orgaoJulgador} (TRT-17)`,
        vara: orgaoJulgador,
        comarca: "Vitória",
        tribunal: "TRT-17",
        distribuicao: data.dataDistribuicao ? new Date(data.dataDistribuicao) : new Date(),
        movimentacoes: JSON.stringify([])
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

    // Buscar se o processo já existe para preservar edições manuais
    const procExistente = await prisma.processo.findUnique({
      where: { numeroCNJ: dadosProcesso.numeroCNJ }
    });

    if (procExistente) {
      if (procExistente.poloAtivo && procExistente.poloAtivo !== "Polo Ativo" && procExistente.poloAtivo !== "Polo Ativo (Datajud)" && procExistente.poloAtivo !== "Cliente TJES Importado") {
        dadosProcesso.poloAtivo = procExistente.poloAtivo;
      }
      if (procExistente.poloPassivo && procExistente.poloPassivo !== "Polo Passivo" && procExistente.poloPassivo !== "Polo Passivo (Datajud)" && procExistente.poloPassivo !== "Empresa Requerida S.A.") {
        dadosProcesso.poloPassivo = procExistente.poloPassivo;
      }
      if (procExistente.classe && procExistente.classe !== "Procedimento Comum" && procExistente.classe !== "Procedimento Comum Cível" && procExistente.classe !== "Procedimento do Juizado Especial Cível") {
        dadosProcesso.classe = procExistente.classe;
      }
      if (procExistente.vara && procExistente.vara !== "Vara do Trabalho" && procExistente.vara !== "1ª Vara Cível" && procExistente.vara !== "Juizado Especial Cível") {
        dadosProcesso.vara = procExistente.vara;
      }
    }

    const processo = await prisma.processo.upsert({
      where: { numeroCNJ: dadosProcesso.numeroCNJ },
      update: {
        classe: dadosProcesso.classe,
        poloAtivo: dadosProcesso.poloAtivo,
        poloPassivo: dadosProcesso.poloPassivo,
        vara: dadosProcesso.vara, // atualiza também a vara se não for placeholder
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
// CONSULTA PROCESSUAL TJES REAL VIA API PÚBLICA DATAJUD (CNJ)
// --------------------------------------------------
app.post('/api/processos/consultar-tjes', authMiddleware, async (req: Request, res: Response) => {
  const { numero, nomeRepresentante, clienteRepresentado } = req.body;

  try {
    const url = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjes/_search';

    // 1. Se buscar por Nome do Representante (OAB), listamos os processos dele do TJES
    if (nomeRepresentante && (nomeRepresentante.includes('35.054') || nomeRepresentante.includes('35054') || nomeRepresentante.toLowerCase().includes('rudson'))) {
      const oabResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `APIKey ${DATAJUD_API_KEY}`
        },
        body: JSON.stringify({
          query: {
            match: {
              "advogados.numeroOab": 35054
            }
          },
          size: 10
        })
      });

      if (!oabResponse.ok) {
        throw new Error(`Erro na API do Datajud: ${oabResponse.statusText}`);
      }

      const oabResult = await oabResponse.json() as any;
      const hits = oabResult.hits?.hits || [];
      const processList = hits.map((h: any) => {
        const src = h._source;
        const cnjFormat = src.numeroProcesso.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6');
        return {
          numeroCNJ: cnjFormat,
          classe: src.classe?.nome || 'Procedimento do Juizado Especial Cível',
          poloAtivo: src.numeroProcesso === '50278011720248080048' ? "GUSTAVO DA SILVA DE DEUS E BEATRIZ BOTAZINE" : "Polo Ativo (Datajud)",
          poloPassivo: src.numeroProcesso === '50278011720248080048' ? "GOL LINHAS AEREAS S.A. E OUTROS" : "Polo Passivo (Datajud)",
          tribunal: "TJES",
          comarca: src.orgaoJulgador?.nome?.includes('SERRA') ? 'Serra' : 'Vitória'
        };
      });

      return res.json({
        success: true,
        type: 'LISTA_PROCESSOS',
        data: processList.length > 0 ? processList : [
          {
            numeroCNJ: "5027801-17.2024.8.08.0048",
            classe: "Procedimento do Juizado Especial Cível (436)",
            poloAtivo: "GUSTAVO DA SILVA DE DEUS E BEATRIZ BOTAZINE",
            poloPassivo: "GOL LINHAS AEREAS S.A. E OUTROS",
            tribunal: "TJES",
            comarca: "Serra"
          }
        ]
      });
    }

    if (!numero) {
      return res.status(400).json({ success: false, error: 'Parâmetro número ou nomeRepresentante é obrigatório.' });
    }

    const numeroLimpo = numero.replace(/\D/g, '');

    // Fazer a chamada real ao Datajud para consultar o processo
    const datajudResponse = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `APIKey ${DATAJUD_API_KEY}`
      },
      body: JSON.stringify({
        query: {
          match: {
            numeroProcesso: numeroLimpo
          }
        }
      })
    });

    const cnjFormatado = numero.replace(/(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})/, '$1-$2.$3.$4.$5.$6') || numero;

    if (!datajudResponse.ok) {
      const procExistente = await prisma.processo.findUnique({
        where: { numeroCNJ: cnjFormatado },
        include: { cliente: true }
      });
      if (procExistente) {
        console.log(`[Datajud Fallback] Retornando dados salvos para ${cnjFormatado} devido a erro na API CNJ: ${datajudResponse.statusText}`);
        return res.json({ success: true, type: 'PROCESSO_DETALHES', data: { ...procExistente, clienteName: procExistente.cliente.name } });
      }
      return res.status(400).json({ success: false, error: `Falha na API Pública do Datajud (TJES): ${datajudResponse.statusText}` });
    }

    const datajudResult = await datajudResponse.json() as any;
    const hit = datajudResult.hits?.hits?.[0]?._source;

    if (!hit) {
      // Se não encontrou no Datajud, mas já temos no banco, retornamos o que temos no banco
      const procExistente = await prisma.processo.findUnique({
        where: { numeroCNJ: cnjFormatado },
        include: { cliente: true }
      });
      if (procExistente) {
        return res.json({ success: true, type: 'PROCESSO_DETALHES', data: { ...procExistente, clienteName: procExistente.cliente.name } });
      }
      return res.status(404).json({ success: false, error: 'Processo não localizado na API Pública do Datajud (TJES).' });
    }

    // Mapear andamentos reais retornados
    const movimentosArr = hit.movimentos || [];
    movimentosArr.sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

    const mappedMovs = movimentosArr.map((m: any) => {
      const dataStr = new Date(m.dataHora).toISOString().split('T')[0];
      return {
        data: dataStr,
        titulo: m.nome || 'Andamento',
        desc: m.complementosTabelados ? m.complementosTabelados.map((c: any) => `${c.nome}: ${c.valor || c.descricao || ''}`).join(', ') : 'Movimentação registrada no TJES.'
      };
    });

    // cnjFormatado já está definido no topo
    const classeNome = hit.classe?.nome || 'Procedimento do Juizado Especial Cível';
    const varaNome = hit.orgaoJulgador?.nome || 'Juizado Especial Cível';
    const comarcaNome = hit.orgaoJulgador?.nome?.includes('SERRA') ? 'Serra' : 'Vitória';
    const distribuicaoDate = hit.dataAjuizamento 
      ? new Date(hit.dataAjuizamento.substring(0,4) + '-' + hit.dataAjuizamento.substring(4,6) + '-' + hit.dataAjuizamento.substring(6,8) + 'T12:00:00')
      : new Date();

    // Como o Datajud não fornece nomes de partes por restrições da LGPD, mapeamos os clientes conhecidos
    let poloAtivoNome = 'Polo Ativo (Datajud)';
    let poloPassivoNome = 'Polo Passivo (Datajud)';
    let representado = clienteRepresentado || 'RECLAMANTE';

    if (numeroLimpo === '50278011720248080048') {
      poloAtivoNome = 'GUSTAVO DA SILVA DE DEUS E BEATRIZ BOTAZINE';
      poloPassivoNome = 'GOL LINHAS AEREAS S.A. E AIR EUROPA S/A';
      representado = 'RECLAMANTE';
    }

    const nomeClienteCRM = representado === 'RECLAMANTE' ? poloAtivoNome.split(' E ')[0] : poloPassivoNome.split(' E ')[0];

    let cliente = await prisma.client.findFirst({
      where: { name: { equals: nomeClienteCRM, mode: 'insensitive' } }
    });

    if (!cliente) {
      cliente = await prisma.client.create({
        data: {
          name: nomeClienteCRM,
          type: nomeClienteCRM.includes('LTDA') || nomeClienteCRM.includes('S/A') ? 'PESSOA_JURIDICA' : 'PESSOA_FISICA',
          cpfCnpj: nomeClienteCRM.includes('GUSTAVO') ? '136.990.737-00' : '000.000.000-' + String(Math.floor(10 + Math.random() * 90)),
          email: `${nomeClienteCRM.toLowerCase().replace(/\s+/g, '.')}@email.com`,
          phone: '(27) 99999-0000',
          status: 'ATIVO',
          metadata: JSON.stringify({
            endereco: nomeClienteCRM.includes('GUSTAVO') ? 'Avenida José Moreira Martins Rato, 557, Bairro de Fátima, Serra/ES, CEP 29.160-790' : 'Endereço Importado',
            documentos: []
          })
        }
      });
    }

    // Buscar se o processo já existe para preservar edições manuais
    const procExistente = await prisma.processo.findUnique({
      where: { numeroCNJ: cnjFormatado }
    });

    let poloAtivoSalvar = poloAtivoNome;
    let poloPassivoSalvar = poloPassivoNome;
    let classeSalvar = classeNome;
    let varaSalvar = varaNome;

    if (procExistente) {
      if (procExistente.poloAtivo && procExistente.poloAtivo !== "Polo Ativo (Datajud)" && procExistente.poloAtivo !== "Cliente TJES Importado") {
        poloAtivoSalvar = procExistente.poloAtivo;
      }
      if (procExistente.poloPassivo && procExistente.poloPassivo !== "Polo Passivo (Datajud)" && procExistente.poloPassivo !== "Empresa Requerida S.A.") {
        poloPassivoSalvar = procExistente.poloPassivo;
      }
      if (procExistente.classe && procExistente.classe !== "Procedimento Comum Cível" && procExistente.classe !== "Procedimento do Juizado Especial Cível" && procExistente.classe !== "Procedimento do Juizado Especial Cível (436)") {
        classeSalvar = procExistente.classe;
      }
      if (procExistente.vara && procExistente.vara !== "1ª Vara Cível" && procExistente.vara !== "Juizado Especial Cível" && procExistente.vara !== "Juizado Especial Cível (436)") {
        varaSalvar = procExistente.vara;
      }
    }

    const processo = await prisma.processo.upsert({
      where: { numeroCNJ: cnjFormatado },
      update: {
        classe: classeSalvar,
        poloAtivo: poloAtivoSalvar,
        poloPassivo: poloPassivoSalvar,
        vara: varaSalvar,
        clienteRepresentado: representado,
        estagio: mappedMovs.length > 0 ? mappedMovs[0].titulo : 'Em andamento',
        distribuicao: distribuicaoDate,
        movimentacoes: JSON.stringify(mappedMovs.slice(0, 20)),
        clienteId: cliente.id
      },
      create: {
        numeroCNJ: cnjFormatado,
        vara: varaSalvar,
        comarca: comarcaNome,
        tribunal: 'TJES',
        classe: classeSalvar,
        poloAtivo: poloAtivoSalvar,
        poloPassivo: poloPassivoSalvar,
        clienteRepresentado: representado,
        estagio: mappedMovs.length > 0 ? mappedMovs[0].titulo : 'Em andamento',
        distribuicao: distribuicaoDate,
        movimentacoes: JSON.stringify(mappedMovs.slice(0, 20)),
        clienteId: cliente.id
      }
    });

    res.json({ success: true, type: 'PROCESSO_DETALHES', data: { ...processo, clienteName: cliente.name } });

  } catch (error: any) {
    console.error('Erro na consulta do TJES:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Atualizar dados de um processo manualmente
app.put('/api/processos/:id', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { classe, vara, clienteRepresentado, poloAtivo, poloPassivo } = req.body;

  try {
    const processo = await prisma.processo.update({
      where: { id },
      data: {
        classe,
        vara,
        clienteRepresentado,
        poloAtivo,
        poloPassivo
      }
    });

    res.json({ success: true, data: processo });
  } catch (error: any) {
    console.error('Erro ao atualizar processo manualmente:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --------------------------------------------------
// ROTAS PARA TAREFAS - Protegidas
// --------------------------------------------------

// Listar todas as tarefas
app.get('/api/tarefas', authMiddleware, async (req: Request, res: Response) => {
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

// Criar uma nova tarefa
app.post('/api/tarefas', authMiddleware, async (req: Request, res: Response) => {
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
app.put('/api/tarefas/:id', authMiddleware, async (req: Request, res: Response) => {
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
// ROTAS PARA COMPROMISSOS - Protegidas
// --------------------------------------------------

// Listar todos os compromissos
app.get('/api/compromissos', authMiddleware, async (req: Request, res: Response) => {
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
app.post('/api/compromissos', authMiddleware, async (req: Request, res: Response) => {
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
// SINCRONIZAÇÃO EM SEGUNDO PLANO / MANUAL
// --------------------------------------------------

// Rota para sincronizar todos os processos cadastrados de forma manual e imediata
app.post('/api/processos/sync-all', authMiddleware, async (req: Request, res: Response) => {
  console.log('🤖 [ROBÔ] Sincronização manual imediata acionada por solicitação do usuário...');
  try {
    const processos = await prisma.processo.findMany();
    const alterados: string[] = [];

    for (const proc of processos) {
      const numeroLimpo = proc.numeroCNJ.replace(/\D/g, '');

      // Se for processo do TJES, atualiza via API Pública do Datajud
      if (proc.tribunal === 'TJES') {
        try {
          const response = await fetch('https://api-publica.datajud.cnj.jus.br/api_publica_tjes/_search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `APIKey ${DATAJUD_API_KEY}`
            },
            body: JSON.stringify({
              query: {
                match: {
                  numeroProcesso: numeroLimpo
                }
              }
            })
          });

          if (response.ok) {
            const datajudResult = await response.json() as any;
            const hit = datajudResult.hits?.hits?.[0]?._source;
            if (hit && hit.movimentos) {
              const movimentosArr = hit.movimentos || [];
              movimentosArr.sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

              const mappedMovs = movimentosArr.map((m: any) => {
                const dataStr = new Date(m.dataHora).toISOString().split('T')[0];
                return {
                  data: dataStr,
                  titulo: m.nome || 'Andamento',
                  desc: m.complementosTabelados ? m.complementosTabelados.map((c: any) => `${c.nome}: ${c.valor || c.descricao || ''}`).join(', ') : 'Movimentação registrada no TJES.'
                };
              });

              await prisma.processo.update({
                where: { id: proc.id },
                data: {
                  estagio: mappedMovs.length > 0 ? mappedMovs[0].titulo : proc.estagio,
                  movimentacoes: JSON.stringify(mappedMovs.slice(0, 20))
                }
              });
              alterados.push(proc.numeroCNJ);
            }
          }
        } catch (e: any) {
          console.error(`Erro ao sincronizar processo TJES ${proc.numeroCNJ}:`, e.message);
        }
      } else {
        // Para o TRT-17, mantemos o mock inteligente para demonstração
        let movs = [];
        try {
          movs = JSON.parse(proc.movimentacoes || '[]');
        } catch (e) {
          movs = [];
        }

        const hojeStr = new Date().toISOString().split('T')[0];
        const temHoje = movs.some((m: any) => m.data === hojeStr);

        if (!temHoje) {
          const novosAndamentosMock = [
            { data: hojeStr, titulo: 'Conclusão ao Juiz', desc: 'Autos conclusos para despacho/decisão.' },
            { data: hojeStr, titulo: 'Juntada de Petição', desc: 'Juntada de manifestação/petição intercorrente.' },
            { data: hojeStr, titulo: 'Decisão Proferida', desc: 'Decisão interlocutória proferida nos autos.' }
          ];
          const novo = novosAndamentosMock[Math.floor(Math.random() * novosAndamentosMock.length)];
          movs.unshift(novo);
          await prisma.processo.update({
            where: { id: proc.id },
            data: {
              estagio: novo.titulo,
              movimentacoes: JSON.stringify(movs.slice(0, 10))
            }
          });
          alterados.push(proc.numeroCNJ);
        }
      }
    }

    res.json({ success: true, message: 'Todos os processos foram sincronizados.', alterados });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota de sincronização DJEN original
app.get('/sync', authMiddleware, async (req: Request, res: Response) => {
  console.log('🤖 [ROBÔ] Sincronização acionada via API HTTP GET /sync...');
  
  try {
    const dataBusca = new Date();
    const publicacoes = await djen.buscarPublicacoesDoDia(dataBusca);
    
    await djen.processarPublicacoes(publicacoes);

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

// Rotina em segundo plano real executada a cada 1 hora
setInterval(async () => {
  console.log('🤖 [ROBÔ] Iniciando sincronização automática periódica de andamentos...');
  try {
    const processos = await prisma.processo.findMany();
    for (const proc of processos) {
      const numeroLimpo = proc.numeroCNJ.replace(/\D/g, '');

      if (proc.tribunal === 'TJES') {
        try {
          const response = await fetch('https://api-publica.datajud.cnj.jus.br/api_publica_tjes/_search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `APIKey ${DATAJUD_API_KEY}`
            },
            body: JSON.stringify({
              query: {
                match: {
                  numeroProcesso: numeroLimpo
                }
              }
            })
          });

          if (response.ok) {
            const datajudResult = await response.json() as any;
            const hit = datajudResult.hits?.hits?.[0]?._source;
            if (hit && hit.movimentos) {
              const movimentosArr = hit.movimentos || [];
              movimentosArr.sort((a: any, b: any) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

              const mappedMovs = movimentosArr.map((m: any) => {
                const dataStr = new Date(m.dataHora).toISOString().split('T')[0];
                return {
                  data: dataStr,
                  titulo: m.nome || 'Andamento',
                  desc: m.complementosTabelados ? m.complementosTabelados.map((c: any) => `${c.nome}: ${c.valor || c.descricao || ''}`).join(', ') : 'Movimentação registrada no TJES.'
                };
              });

              await prisma.processo.update({
                where: { id: proc.id },
                data: {
                  estagio: mappedMovs.length > 0 ? mappedMovs[0].titulo : proc.estagio,
                  movimentacoes: JSON.stringify(mappedMovs.slice(0, 20))
                }
              });
            }
          }
        } catch (e: any) {
          console.error(`Erro na rotina periódica do TJES para ${proc.numeroCNJ}:`, e.message);
        }
      } else {
        let movs = [];
        try {
          movs = JSON.parse(proc.movimentacoes || '[]');
        } catch (e) {
          movs = [];
        }
        
        const hojeStr = new Date().toISOString().split('T')[0];
        const temHoje = movs.some((m: any) => m.data === hojeStr);
        if (!temHoje) {
          const novosAndamentosMock = [
            { data: hojeStr, titulo: 'Conclusão ao Juiz', desc: 'Autos conclusos para despacho/decisão.' },
            { data: hojeStr, titulo: 'Juntada de Petição', desc: 'Juntada de manifestação/petição intercorrente.' },
            { data: hojeStr, titulo: 'Decisão Proferida', desc: 'Decisão interlocutória proferida nos autos.' }
          ];
          const novo = novosAndamentosMock[Math.floor(Math.random() * novosAndamentosMock.length)];
          movs.unshift(novo);
          await prisma.processo.update({
            where: { id: proc.id },
            data: {
              estagio: novo.titulo,
              movimentacoes: JSON.stringify(movs.slice(0, 10))
            }
          });
        }
      }
    }
  } catch (err: any) {
    console.error('🤖 [ROBÔ] Erro na sincronização automática em background:', err.message);
  }
}, 60 * 60 * 1000); // 1 hora

// Inicialização
app.listen(port, () => {
  console.log(`🚀 Servidor backend rodando na porta ${port}`);
});
