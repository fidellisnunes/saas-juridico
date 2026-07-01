import assert from 'assert';
import { calcularPrazo } from '../utils/calcularPrazo';

// Helper para formatar datas em string para fácil leitura nos testes
function formatarData(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function executarTestes() {
  console.log('🧪 Iniciando testes de cálculo de prazos processuais...\n');

  // Caso 1: Prazo Cível (CPC) de 5 dias sem feriados
  // Publicação em Terça-feira (07/07/2026).
  // Início da contagem: Quarta-feira (08/07/2026) -> Dia 1
  // Quinta (09/07) -> Dia 2, Sexta (10/07) -> Dia 3, Sábado/Domingo pulados, Segunda (13/07) -> Dia 4, Terça (14/07) -> Dia 5 (Vencimento)
  {
    const dataPublicacao = new Date(2026, 6, 7); // Mês 6 = Julho em JS (0-indexed)
    const dias = 5;
    const esfera = 'CPC';
    const feriados: Date[] = [];

    const dataVencimento = calcularPrazo(dataPublicacao, dias, esfera, feriados);
    const resultado = formatarData(dataVencimento);
    const esperado = '2026-07-14';

    console.log(`[Teste 1] Prazo Simples (5 dias, CPC) - Entrada: 2026-07-07`);
    console.log(`          Resultado: ${resultado} | Esperado: ${esperado}`);
    assert.strictEqual(resultado, esperado, 'Teste 1 falhou!');
    console.log('✅ Teste 1 passou!\n');
  }

  // Caso 2: Prazo Cível (CPC) de 5 dias com feriado no meio
  // Publicação em Terça-feira (07/07/2026).
  // Feriado na Segunda-feira (13/07/2026).
  // Início: Quarta (08/07) -> 1, Quinta (09/07) -> 2, Sexta (10/07) -> 3
  // Sábado/Domingo pulados, Segunda (13/07) é feriado (pulado), Terça (14/07) -> 4, Quarta (15/07) -> 5 (Vencimento)
  {
    const dataPublicacao = new Date(2026, 6, 7);
    const dias = 5;
    const esfera = 'CPC';
    const feriados = [new Date(2026, 6, 13)]; // 13 de Julho

    const dataVencimento = calcularPrazo(dataPublicacao, dias, esfera, feriados);
    const resultado = formatarData(dataVencimento);
    const esperado = '2026-07-15';

    console.log(`[Teste 2] Prazo com Feriado (5 dias, CPC) - Entrada: 2026-07-07, Feriado: 2026-07-13`);
    console.log(`          Resultado: ${resultado} | Esperado: ${esperado}`);
    assert.strictEqual(resultado, esperado, 'Teste 2 falhou!');
    console.log('✅ Teste 2 passou!\n');
  }

  // Caso 3: Prazo Trabalhista (CLT) de 8 dias caindo no recesso forense de fim de ano
  // Publicação em Quinta-feira (17/12/2026).
  // Exclui dia do começo (17/12).
  // Dia 1: Sexta (18/12).
  // Sábado (19/12) e Domingo (20/12) pulados.
  // De 20/12/2026 a 20/01/2027 o prazo fica suspenso pelo recesso forense.
  // A contagem retoma na Quinta-feira (21/01/2027) -> Dia 2
  // Sexta (22/01/2027) -> Dia 3
  // Sábado/Domingo pulados.
  // Segunda (25/01/2027) -> Dia 4
  // Terça (26/01/2027) -> Dia 5
  // Quarta (27/01/2027) -> Dia 6
  // Quinta (28/01/2027) -> Dia 7
  // Sexta (29/01/2027) -> Dia 8 (Vencimento)
  {
    const dataPublicacao = new Date(2026, 11, 17); // 17 de Dezembro de 2026 (Mês 11 em JS)
    const dias = 8;
    const esfera = 'CLT';
    const feriados: Date[] = [];

    const dataVencimento = calcularPrazo(dataPublicacao, dias, esfera, feriados);
    const resultado = formatarData(dataVencimento);
    const esperado = '2027-01-29';

    console.log(`[Teste 3] Prazo com Recesso Forense (8 dias, CLT) - Entrada: 2026-12-17`);
    console.log(`          Resultado: ${resultado} | Esperado: ${esperado}`);
    assert.strictEqual(resultado, esperado, 'Teste 3 falhou!');
    console.log('✅ Teste 3 passou!\n');
  }

  console.log('🎉 Todos os testes de cálculo de prazos passaram com sucesso!');
}

try {
  executarTestes();
} catch (error) {
  console.error('❌ Um ou mais testes falharam:', error);
  process.exit(1);
}
