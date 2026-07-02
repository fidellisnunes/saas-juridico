import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { DjenService } from './services/djenService';
import { calcularPrazo } from './utils/calcularPrazo';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();
const djen = new DjenService(prisma);

app.use(express.json());

// Middleware simples para habilitar CORS (Cross-Origin Resource Sharing)
// Necessário para que a Vercel consiga fazer requisições para a Render com segurança.
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
    const totalPrazos = await prisma.prazo.count({ where: { status: 'PENDENTE' } });

    // Pega os prazos de maior urgência ordenados pela data final
    const prazosUrgentes = await prisma.prazo.findMany({
      where: { status: 'PENDENTE' },
      orderBy: { dataFinal: 'asc' },
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
      prazosUrgentes: prazosUrgentes.map(item => ({
        id: item.id,
        processo: item.processo.numeroCNJ,
        descricao: item.descricao,
        esfera: item.esfera === 'CIVEL_CPC' ? 'Cível (CPC)' : 'Trabalhista (CLT)',
        dataFinal: item.dataFinal.toISOString().split('T')[0]
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

// Endpoint para calcular e criar prazos manualmente no Supabase
app.post('/api/prazos', async (req: Request, res: Response) => {
  const { dataPublicacao, dias, esfera, descricao, processoCNJ, responsavelEmail } = req.body;

  if (!dataPublicacao || !dias || !esfera || !processoCNJ) {
    return res.status(400).json({ success: false, error: 'Parâmetros incompletos.' });
  }

  try {
    // Localizar processo
    const processo = await prisma.processo.findUnique({
      where: { numeroCNJ: processoCNJ }
    });

    if (!processo) {
      return res.status(404).json({ success: false, error: 'Processo não encontrado.' });
    }

    // Localizar usuário responsável (ou default)
    const user = await prisma.user.findFirst({
      where: responsavelEmail ? { email: responsavelEmail } : {}
    });

    if (!user) {
      return res.status(404).json({ success: false, error: 'Responsável não encontrado.' });
    }

    // Calcular data de vencimento
    // Podem ser passados feriados no body (opcional)
    const feriadosDatas = req.body.feriados ? req.body.feriados.map((d: string) => new Date(d + 'T12:00:00')) : [];
    const dataInicialValida = new Date(dataPublicacao + 'T12:00:00');
    const dataVencimento = calcularPrazo(dataInicialValida, parseInt(dias, 10), esfera, feriadosDatas);

    // Gravar o prazo no banco de dados Supabase
    const novoPrazo = await prisma.prazo.create({
      data: {
        dataInicial: dataInicialValida,
        dataFinal: dataVencimento,
        descricao: descricao || 'Prazo Processual',
        status: 'PENDENTE',
        esfera: esfera === 'CPC' ? 'CIVEL_CPC' : 'TRABALHISTA_CLT',
        processoId: processo.id,
        responsavelId: user.id
      }
    });

    res.json({
      success: true,
      data: {
        id: novoPrazo.id,
        dataInicial: novoPrazo.dataInicial.toISOString().split('T')[0],
        dataFinal: novoPrazo.dataFinal.toISOString().split('T')[0],
        descricao: novoPrazo.descricao,
        vencimento: novoPrazo.dataFinal.toLocaleDateString('pt-BR')
      }
    });

  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint para acionar a sincronização do DJEN / PJe
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

    // Criar prazos automáticos no banco baseando-se nas intimações reais vinculadas
    for (const item of intimacoesHojes) {
      if (item.processoId && item.advogadoId) {
        // Verifica se já não foi criado um prazo para esta intimação
        const existePrazo = await prisma.prazo.findFirst({
          where: {
            processoId: item.processoId,
            descricao: { contains: 'Intimação' }
          }
        });

        if (!existePrazo) {
          // Extrai esfera e dias aproximados do texto da intimação
          const texto = item.textoCompleto.toLowerCase();
          const esfera: 'CPC' | 'CLT' = texto.includes('trabalhista') || texto.includes('trt') ? 'CLT' : 'CPC';
          const diasMatch = texto.match(/prazo de\s+(\d+)\s+dias/);
          const dias = diasMatch ? parseInt(diasMatch[1], 10) : 15; // default 15 dias cíveis

          const dataFinalCalculada = calcularPrazo(item.dataPublicacao, dias, esfera, []);
          
          await prisma.prazo.create({
            data: {
              dataInicial: item.dataPublicacao,
              dataFinal: dataFinalCalculada,
              descricao: `Prazo automático: ${item.textoCompleto.substring(0, 50)}...`,
              status: 'PENDENTE',
              esfera: esfera === 'CPC' ? 'CIVEL_CPC' : 'TRABALHISTA_CLT',
              processoId: item.processoId,
              responsavelId: item.advogado.userId
            }
          });
        }
      }
    }

    res.json({
      success: true,
      message: 'Sincronização executada com sucesso.',
      totalProcessadas: publicacoes.length,
      intimacoes: intimacoesHojes.map(item => ({
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
