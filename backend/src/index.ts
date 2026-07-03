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
