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

// Endpoint de status
app.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'online',
    service: 'SaaS Jurídico Backend Scraper',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para acionar a sincronização do DJEN manualmente ou por agendador cron externo
app.get('/sync', async (req: Request, res: Response) => {
  console.log('🤖 [ROBÔ] Sincronização acionada via API HTTP GET /sync...');
  
  try {
    const dataBusca = new Date();
    const publicacoes = await djen.buscarPublicacoesDoDia(dataBusca);
    
    console.log(`[ROBÔ] Buscando intimações para Rudson Fidellis Nunes...`);
    await djen.processarPublicacoes(publicacoes);

    // Buscar no banco local para retornar quais foram salvas hoje
    const formatada = dataBusca.toISOString().split('T')[0];
    const intimacoesHojes = await prisma.intimacao.findMany({
      where: {
        createdAt: {
          gte: new Date(formatada + 'T00:00:00.000Z')
        }
      },
      include: {
        processo: true
      }
    });

    res.json({
      success: true,
      message: 'Sincronização executada com sucesso.',
      dataBuscada: formatada,
      totalProcessadas: publicacoes.length,
      intimacoesSalvas: intimacoesHojes.map(item => ({
        id: item.id,
        tribunal: item.fonte,
        processo: item.processo?.numeroCNJ || 'Sem Vínculo',
        textoCurto: item.textoCompleto.substring(0, 100) + '...'
      }))
    });

  } catch (error: any) {
    console.error('❌ Erro na rota de sincronização:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Erro interno do servidor.'
    });
  }
});

// Inicialização do servidor
app.listen(port, () => {
  console.log(`🚀 Servidor backend rodando na porta ${port}`);
  console.log(`📍 Rota de sincronização disponível em: http://localhost:${port}/sync`);
});
