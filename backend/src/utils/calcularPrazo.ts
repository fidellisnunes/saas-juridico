/**
 * Utilitário de cálculo de prazos processuais de acordo com o CPC (Art. 219 e 224) e CLT (Art. 775 e 775-A).
 * 
 * Regras implementadas:
 * 1. Exclusão do dia do começo (data de publicação) e inclusão do dia do vencimento.
 * 2. Contagem estritamente em dias úteis (segunda a sexta-feira).
 * 3. Exclusão de feriados nacionais/locais e suspensões fornecidas no parâmetro `feriados`.
 * 4. Suspensão automática do recesso forense de fim de ano (20 de dezembro a 20 de janeiro, inclusive)
 *    conforme Art. 220 do CPC e Art. 775-A da CLT.
 */

/**
 * Normaliza uma data para o formato YYYY-MM-DD para comparação precisa de datas sem interferência de fuso horário/horário.
 */
function normalizarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Verifica se uma determinada data é dia útil.
 * Retorna false se for fim de semana, feriado cadastrado ou recesso forense nacional (20/12 a 20/01).
 */
function isDiaUtil(date: Date, holidaySet: Set<string>): boolean {
  const diaSemana = date.getDay(); // 0 = Domingo, 6 = Sábado
  if (diaSemana === 0 || diaSemana === 6) {
    return false;
  }

  // Suspensão de prazos no Recesso Forense Nacional (Art. 220 CPC e Art. 775-A CLT)
  // Período de 20 de Dezembro (mês 11 em JS) a 20 de Janeiro (mês 0 em JS) inclusive.
  const mes = date.getMonth();
  const dia = date.getDate();
  if ((mes === 11 && dia >= 20) || (mes === 0 && dia <= 20)) {
    return false;
  }

  // Verifica na lista de feriados e suspensões customizadas
  const dataFormatada = normalizarData(date);
  if (holidaySet.has(dataFormatada)) {
    return false;
  }

  return true;
}

/**
 * Calcula a data de vencimento de um prazo processual.
 * 
 * @param dataPublicacao Data em que a intimação/notificação foi publicada
 * @param dias Quantidade de dias do prazo (ex: 15 dias para contestação)
 * @param esfera Esfera judicial: 'CPC' (Cível) ou 'CLT' (Trabalhista)
 * @param feriados Array de datas que representam feriados nacionais, locais ou suspensões de expediente
 * @returns Data do vencimento do prazo
 */
export function calcularPrazo(
  dataPublicacao: Date,
  dias: number,
  esfera: 'CPC' | 'CLT',
  feriados: Date[] = []
): Date {
  if (dias <= 0) {
    throw new Error('A quantidade de dias do prazo deve ser maior que zero.');
  }

  // Criar um Set com feriados normalizados para busca eficiente O(1)
  const holidaySet = new Set(feriados.map(normalizarData));

  // O prazo começa a ser contado a partir do primeiro dia útil SUBSEQUENTE à publicação.
  // Excluímos o dia do começo (a própria data da publicação).
  let dataCorrente = new Date(dataPublicacao.getTime());
  let diasContados = 0;

  while (diasContados < dias) {
    // Avança um dia
    dataCorrente.setDate(dataCorrente.getDate() + 1);

    // Se for dia útil, conta
    if (isDiaUtil(dataCorrente, holidaySet)) {
      diasContados++;
    }
  }

  return dataCorrente;
}
