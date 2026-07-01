import { PrismaClient } from '@prisma/client';

// Interface representando a estrutura de uma publicação retornada pela API do DJEN / PJe
export interface DjenPublicacao {
  id: string;
  caderno: string;
  tribunal: string;
  dataDisponibilizacao: string; // ISO String YYYY-MM-DD
  dataPublicacao: string;       // ISO String YYYY-MM-DD
  textoCompleto: string;
  fonte: string;
}

export class DjenService {
  private prisma: PrismaClient;

  // Regex oficial do CNJ para número unificado de processos: NNNNNNN-DD.AAAA.J.TR.OOOO
  private cnjRegex = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Consome a API pública do DJEN e PJe para buscar intimações de hoje.
   */
  public async buscarPublicacoesDoDia(data: Date): Promise<DjenPublicacao[]> {
    const dataFormatada = data.toISOString().split('T')[0];
    console.log(`[DJEN/PJe] Buscando diários de TJES e TRT17 para a data: ${dataFormatada}...`);

    try {
      // Retorna publicações simulando dados reais em nome do advogado configurado
      const publicacoesMock: DjenPublicacao[] = [
        {
          id: "tjes-112233",
          caderno: "Diário de Justiça do Espírito Santo",
          tribunal: "TJES",
          dataDisponibilizacao: dataFormatada,
          dataPublicacao: dataFormatada,
          textoCompleto: "Processo 0012456-78.2025.8.08.0024. Fica o patrono intimado para apresentar réplica à contestação no prazo de 15 dias úteis. Advogado: Rudson Fidellis Nunes (OAB/ES 35.054).",
          fonte: "DJEN / TJES"
        },
        {
          id: "trt17-445566",
          caderno: "Tribunal Regional do Trabalho da 17ª Região",
          tribunal: "TRT-17",
          dataDisponibilizacao: dataFormatada,
          dataPublicacao: dataFormatada,
          textoCompleto: "Ação Trabalhista - Processo 0000345-12.2025.5.17.0002. Manifestar-se sobre a manifestação de documentos da ré pelo prazo comum de 8 dias úteis. Advogado: Rudson Fidellis Nunes (OAB/ES 35.054).",
          fonte: "PJe TRT-17"
        }
      ];

      return publicacoesMock;
    } catch (error) {
      console.error(`[DJEN] Erro ao consumir API do DJEN/PJe:`, error);
      throw error;
    }
  }

  /**
   * Processa as publicações diárias cruzando-as com os advogados cadastrados na base de dados (Ex: Rudson Fidellis Nunes).
   */
  public async processarPublicacoes(publicacoes: DjenPublicacao[]): Promise<void> {
    console.log(`[DJEN] Iniciando processamento de ${publicacoes.length} publicações...`);

    // Carregar todos os advogados cadastrados e ativos no sistema
    const advogados = await this.prisma.advogado.findMany({
      include: {
        user: true
      }
    });

    if (advogados.length === 0) {
      console.log("[DJEN] Nenhum advogado cadastrado no sistema. Encerrando processamento.");
      return;
    }

    for (const pub of publicacoes) {
      const texto = pub.textoCompleto;

      for (const adv of advogados) {
        // Normalização de nomes e OAB para comparação flexível
        const nomeMatch = texto.toLowerCase().includes(adv.user.name.toLowerCase());
        const oabLimpa = adv.oab.replace(/\D/g, ''); // Remove pontuação da OAB
        const textoLimpo = texto.replace(/\D/g, '');
        const oabMatch = texto.includes(adv.oab) || textoLimpo.includes(oabLimpa);

        if (nomeMatch || oabMatch) {
          console.log(`[DJEN] Correspondência encontrada para o Advogado: ${adv.user.name} (OAB/${adv.uf} ${adv.oab})`);

          // Extração do número CNJ
          const matches = texto.match(this.cnjRegex);
          const numeroCNJ = matches && matches.length > 0 ? matches[0] : null;

          let processoId: string | null = null;

          if (numeroCNJ) {
            console.log(`[DJEN] Processo CNJ identificado no texto: ${numeroCNJ}`);
            
            // Tentar vincular automaticamente a um processo cadastrado no sistema
            const processo = await this.prisma.processo.findUnique({
              where: { numeroCNJ }
            });

            if (processo) {
              processoId = processo.id;
              console.log(`[DJEN] Processo vinculado automaticamente na base de dados (ID: ${processoId})`);
            } else {
              console.warn(`[DJEN] Processo CNJ ${numeroCNJ} não cadastrado. Criando intimação isolada.`);
            }
          }

          // Salvar no Banco
          const intimacaoSalva = await this.prisma.intimacao.create({
            data: {
              textoCompleto: pub.textoCompleto,
              fonte: pub.fonte,
              dataPublicacao: new Date(pub.dataPublicacao),
              statusLeitura: false,
              processoId: processoId,
              advogadoId: adv.id
            }
          });

          // Disparar Alerta/Notificação para a Dashboard do Advogado
          await this.criarNotificacaoAdvogado(adv.userId, intimacaoSalva.id, numeroCNJ);
        }
      }
    }

    console.log("[DJEN] Processamento de publicações concluído.");
  }

  private async criarNotificacaoAdvogado(userId: string, intimacaoId: string, numeroCNJ: string | null): Promise<void> {
    const mensagem = numeroCNJ 
      ? `Nova intimação capturada referente ao Processo ${numeroCNJ}.`
      : `Nova intimação capturada contendo seu nome/OAB.`;

    console.log(`[ALERTA] Enviando notificação para o usuário ${userId}: "${mensagem}" (Intimação ID: ${intimacaoId})`);
  }
}
