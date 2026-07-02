import { PrismaClient } from '@prisma/client';

export interface DjenPublicacao {
  id: string;
  caderno: string;
  tribunal: string;
  dataDisponibilizacao: string;
  dataPublicacao: string;
  textoCompleto: string;
  fonte: string;
}

export class DjenService {
  private prisma: PrismaClient;

  // Regex do CNJ para número unificado de processos: NNNNNNN-DD.AAAA.J.TR.OOOO
  private cnjRegex = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }

  /**
   * Busca publicações do dia. Se a variável de ambiente DATAJUD_API_KEY estiver configurada,
   * realiza uma consulta real na API pública do CNJ (DataJud) para buscar processos sob a OAB.
   * Caso contrário, retorna dados simulados realistas para testes.
   */
  public async buscarPublicacoesDoDia(data: Date): Promise<DjenPublicacao[]> {
    const dataFormatada = data.toISOString().split('T')[0];
    const apiKey = process.env.DATAJUD_API_KEY;

    if (apiKey) {
      console.log(`[CNJ/DataJud] Realizando consulta real na API pública do DataJud para TJES...`);
      try {
        // Consulta para o tribunal TJES
        const response = await fetch('https://api-publica.datajud.cnj.jus.br/api_publica_tjes/_search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `ApiKey ${apiKey}`
          },
          body: JSON.stringify({
            query: {
              bool: {
                must: [
                  {
                    match: {
                      "advogados.numeroOab": "35054"
                    }
                  },
                  {
                    match: {
                      "advogados.ufOab": "ES"
                    }
                  }
                ]
              }
            },
            size: 15,
            sort: [{ "dataHoraUltimaAtualizacao": { "order": "desc" } }]
          })
        });

        if (!response.ok) {
          throw new Error(`Erro na chamada ao DataJud: ${response.statusText}`);
        }

        const rawData: any = await response.json();
        const hits = rawData.hits?.hits || [];
        
        console.log(`[CNJ/DataJud] Retornados ${hits.length} resultados reais.`);

        // Mapeia os hits do ElasticSearch do CNJ para o formato do nosso sistema
        const resultadosReais = hits.map((hit: any, index: number) => {
          const source = hit._source || {};
          const cnj = source.numeroProcesso;
          const tribunal = source.tribunal || 'TJES';
          const movs = source.movimentos || [];
          const ultimaMov = movs.length > 0 ? movs[movs.length - 1] : {};
          
          return {
            id: hit._id || `datajud-${index}`,
            caderno: "Movimentação Processual",
            tribunal: tribunal,
            dataDisponibilizacao: source.dataHoraUltimaAtualizacao?.split('T')[0] || dataFormatada,
            dataPublicacao: source.dataHoraUltimaAtualizacao?.split('T')[0] || dataFormatada,
            textoCompleto: `Processo ${cnj}. Movimentação identificada no DataJud: ${ultimaMov.nome || 'Atualização de andamento'}. Assunto: ${source.assunto?.nome || 'Não especificado'}. Advogado: Rudson Fidellis Nunes (OAB/ES 35.054).`,
            fonte: `DataJud CNJ - ${tribunal}`
          };
        });

        return resultadosReais;

      } catch (error) {
        console.error(`[CNJ/DataJud] Falha na consulta real ao DataJud:`, error);
        // Retorna array vazio em caso de erro na consulta real, para NUNCA gerar dados fictícios se a chave estiver configurada
        return [];
      }
    }

    // Se NÃO houver DATAJUD_API_KEY configurada, roda o fallback simulado para testes locais
    console.log(`[DJEN/PJe] Simulando diários de TJES e TRT17 para o Dr. Rudson Nunes...`);
    return [
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
  }

  /**
   * Processa as publicações diárias cruzando-as com os advogados cadastrados.
   */
  public async processarPublicacoes(publicacoes: DjenPublicacao[]): Promise<void> {
    console.log(`[DJEN] Iniciando processamento de ${publicacoes.length} publicações...`);

    const advogados = await this.prisma.advogado.findMany({
      include: { user: true }
    });

    if (advogados.length === 0) {
      console.log("[DJEN] Nenhum advogado cadastrado no sistema.");
      return;
    }

    for (const pub of publicacoes) {
      const texto = pub.textoCompleto;

      for (const adv of advogados) {
        const nomeMatch = texto.toLowerCase().includes(adv.user.name.toLowerCase());
        const oabLimpa = adv.oab.replace(/\D/g, '');
        const textoLimpo = texto.replace(/\D/g, '');
        const oabMatch = texto.includes(adv.oab) || textoLimpo.includes(oabLimpa);

        if (nomeMatch || oabMatch) {
          console.log(`[DJEN] Correspondência encontrada para: ${adv.user.name} (OAB/${adv.uf} ${adv.oab})`);

          const matches = texto.match(this.cnjRegex);
          const numeroCNJ = matches && matches.length > 0 ? matches[0] : null;

          let processoId: string | null = null;

          if (numeroCNJ) {
            console.log(`[DJEN] Processo CNJ identificado: ${numeroCNJ}`);
            
            const processo = await this.prisma.processo.findUnique({
              where: { numeroCNJ }
            });

            if (processo) {
              processoId = processo.id;
              console.log(`[DJEN] Processo vinculado com sucesso no banco.`);
            }
          }

          // Salvar intimação no Supabase
          const jaExiste = await this.prisma.intimacao.findFirst({
            where: {
              textoCompleto: pub.textoCompleto,
              advogadoId: adv.id
            }
          });

          if (!jaExiste) {
            await this.prisma.intimacao.create({
              data: {
                textoCompleto: pub.textoCompleto,
                fonte: pub.fonte,
                dataPublicacao: new Date(pub.dataPublicacao),
                statusLeitura: false,
                processoId: processoId,
                advogadoId: adv.id
              }
            });
          }
        }
      }
    }
  }
}
