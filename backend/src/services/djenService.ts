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
   * Busca publicações reais do dia na API pública de comunicações do PJe (comunicaapi.pje.jus.br)
   * consultando tanto pela OAB do advogado quanto pelos números CNJ de processos cadastrados no sistema.
   */
  public async buscarPublicacoesDoDia(data: Date): Promise<DjenPublicacao[]> {
    const dataFormatada = data.toISOString().split('T')[0];
    
    // Obter todos os advogados do sistema
    const advogados = await this.prisma.advogado.findMany();
    
    // Obter todos os processos do sistema
    const processos = await this.prisma.processo.findMany();
    
    const publicacoesMap = new Map<string, DjenPublicacao>();

    // 1. Buscar comunicações por OAB de cada advogado
    for (const adv of advogados) {
      const oabLimpa = adv.oab.replace(/\D/g, '');
      const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroOab=${oabLimpa}&ufOab=${adv.uf}`;
      try {
        console.log(`[DJEN] Buscando comunicações na API do PJe por OAB: ${oabLimpa}/${adv.uf}`);
        const response = await fetch(url, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "SaaS-Juridico-Monitor/1.0"
          }
        });
        if (response.ok) {
          const resJson: any = await response.json();
          const items = resJson.items || [];
          for (const item of items) {
            publicacoesMap.set(String(item.id), {
              id: String(item.id),
              caderno: item.tipoComunicacao || "Movimentação Processual",
              tribunal: item.siglaTribunal || "TJES",
              dataDisponibilizacao: item.data_disponibilizacao,
              dataPublicacao: item.data_disponibilizacao,
              textoCompleto: item.texto || "",
              fonte: item.meiocompleto || "Diário de Justiça Eletrônico Nacional"
            });
          }
        }
      } catch (err: any) {
        console.error(`[DJEN] Erro ao buscar por OAB ${oabLimpa}:`, err.message);
      }
    }

    // 2. Buscar comunicações por cada número CNJ de processo cadastrado no banco
    for (const proc of processos) {
      const cnjLimpo = proc.numeroCNJ.replace(/\D/g, '');
      const url = `https://comunicaapi.pje.jus.br/api/v1/comunicacao?numeroProcesso=${cnjLimpo}`;
      try {
        console.log(`[DJEN] Buscando comunicações na API do PJe por Processo CNJ: ${cnjLimpo}`);
        const response = await fetch(url, {
          headers: {
            "Accept": "application/json",
            "User-Agent": "SaaS-Juridico-Monitor/1.0"
          }
        });
        if (response.ok) {
          const resJson: any = await response.json();
          const items = resJson.items || [];
          for (const item of items) {
            publicacoesMap.set(String(item.id), {
              id: String(item.id),
              caderno: item.tipoComunicacao || "Movimentação Processual",
              tribunal: item.siglaTribunal || "TJES",
              dataDisponibilizacao: item.data_disponibilizacao,
              dataPublicacao: item.data_disponibilizacao,
              textoCompleto: item.texto || "",
              fonte: item.meiocompleto || "Diário de Justiça Eletrônico Nacional"
            });
          }
        }
      } catch (err: any) {
        console.error(`[DJEN] Erro ao buscar por Processo ${cnjLimpo}:`, err.message);
      }
    }

    return Array.from(publicacoesMap.values());
  }

  /**
   * Processa as publicações diárias cruzando-as com os advogados cadastrados e vinculando-as aos processos.
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
      const matches = texto.match(this.cnjRegex);
      const numeroCNJ = matches && matches.length > 0 ? matches[0] : null;

      // Se acharmos o CNJ na publicação, vamos verificar se o processo pertence ao advogado
      let processoVinculado: any = null;
      if (numeroCNJ) {
        processoVinculado = await this.prisma.processo.findUnique({
          where: { numeroCNJ },
          include: { cliente: true }
        });
      }

      for (const adv of advogados) {
        // Regra 1: Nome ou OAB do advogado estão na publicação
        const nomeMatch = texto.toLowerCase().includes(adv.user.name.toLowerCase());
        const oabLimpa = adv.oab.replace(/\D/g, '');
        const textoLimpo = texto.replace(/\D/g, '');
        const oabMatch = texto.includes(adv.oab) || textoLimpo.includes(oabLimpa);

        // Regra 2: O processo pertence a este advogado (por estar cadastrado no banco)
        const processoMatch = processoVinculado !== null;

        if (nomeMatch || oabMatch || processoMatch) {
          console.log(`[DJEN] Publicação vinculada para o advogado: ${adv.user.name} (CNJ: ${numeroCNJ || 'Sem CNJ'})`);

          // Salvar intimação no banco
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
                processoId: processoVinculado ? processoVinculado.id : null,
                advogadoId: adv.id
              }
            });
            console.log(`[DJEN] Nova intimação cadastrada com sucesso!`);
          }
        }
      }
    }
  }
}
