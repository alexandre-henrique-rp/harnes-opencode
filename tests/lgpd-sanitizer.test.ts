import { test } from 'node:test';
import * as assert from 'node:assert';
import { LGPDSanitizer, sanitizeOnce, createReversibleSession } from '../tools/lgpd-sanitizer.ts';

test('Suíte de Testes do LGPDSanitizer', async (t) => {

  await t.test('1. Deve detectar e sanitizar CPF, Email e API Key com placeholders reversíveis', () => {
    const sanitizer = createReversibleSession({
      detection: 'balanced',
      replacement: 'placeholder'
    });

    const prompt = 'Olá, meu email é user@domain.com, meu CPF é 123.456.789-00 e meu token do Github é ghp_12345678901234567890abc.';
    const result = sanitizer.sanitize(prompt);

    assert.ok(result.stats.detected >= 3, 'Deve detectar pelo menos 3 PIIs');
    assert.ok(!result.sanitized.includes('user@domain.com'), 'Email não deve estar no prompt sanitizado');
    assert.ok(!result.sanitized.includes('123.456.789-00'), 'CPF não deve estar no prompt sanitizado');
    assert.ok(!result.sanitized.includes('ghp_12345678901234567890abc'), 'Token não deve estar no prompt sanitizado');

    assert.ok(result.sanitized.includes('{{EMAIL_'), 'Deve conter placeholder de email');
    assert.ok(result.sanitized.includes('{{CPF_'), 'Deve conter placeholder de CPF');
    assert.ok(result.sanitized.includes('{{API_KEY_'), 'Deve conter placeholder de API Key');

    // Testa a reversão
    const llmResponse = `Processado para o CPF ${result.matches.find(m => m.type === 'cpf')?.placeholder} com sucesso.`;
    const reversed = sanitizer.reverse(llmResponse);
    assert.ok(reversed.includes('123.456.789-00'), 'Deve reverter o placeholder do CPF para o valor original');
  });

  await t.test('2. Deve respeitar a whitelist (lista branca) de termos que não devem ser sanitizados', () => {
    const sanitizer = new LGPDSanitizer({
      detection: 'balanced',
      replacement: 'placeholder',
      whitelist: ['teste@example.com']
    });

    const prompt = 'Enviar e-mail para teste@example.com (whitelist) e outro para invasor@malicioso.com (sanitizar).';
    const result = sanitizer.sanitize(prompt);

    assert.ok(result.sanitized.includes('teste@example.com'), 'E-mail da whitelist deve ser mantido intacto');
    assert.ok(!result.sanitized.includes('invasor@malicioso.com'), 'E-mail fora da whitelist deve ser sanitizado');
  });

  await t.test('3. Deve usar hash irreversível para chaves e no método sanitizeOnce', () => {
    const prompt = 'Meu CPF é 987.654.321-99 e minha senha: secreta123.';
    const result = sanitizeOnce(prompt, {
      detection: 'balanced',
      replacement: 'hash'
    });

    assert.ok(!result.sanitized.includes('987.654.321-99'));
    assert.ok(!result.sanitized.includes('secreta123'));
    assert.ok(result.sanitized.includes('[CPF_'), 'Deve conter o prefixo do tipo e o hash');
    assert.ok(result.sanitized.includes('[PASSWORD_'), 'Deve conter o prefixo do tipo e o hash');
  });

  await t.test('4. Deve resolver sobreposições de matches corretamente (match mais longo vence)', () => {
    const sanitizer = createReversibleSession({
      detection: 'paranoid',
      replacement: 'placeholder'
    });

    // Uma URL que contém um e-mail nos parâmetros de busca
    const prompt = 'Acesse https://site.com?email=joao@example.com';
    const result = sanitizer.sanitize(prompt);

    // email=joao@example.com pode bater no regex de email e no regex de url_with_pii
    // O sanitizer deve priorizar o match que evita a sobreposição desordenada ou quebra de string
    assert.ok(!result.sanitized.includes('joao@example.com'), 'O email não deve estar visível');
    assert.ok(result.matches.length > 0, 'Deve ter pelo menos um match sanitizado');
  });

  await t.test('5. Deve limpar o mapa reversível ao chamar clearMap', () => {
    const sanitizer = createReversibleSession({
      detection: 'balanced',
      replacement: 'placeholder'
    });

    const prompt = 'Meu e-mail é maria@example.com';
    const result = sanitizer.sanitize(prompt);
    
    assert.strictEqual(result.stats.detected, 1);
    
    sanitizer.clearMap();
    
    const reversed = sanitizer.reverse(result.sanitized);
    assert.ok(reversed.includes('{{EMAIL_'), 'A reversão não deve substituir os placeholders após limpar o mapa');
  });
  
  await t.test('6. Deve lançar erro ao tentar reverter com replacement do tipo hash ou redact', () => {
    const sanitizer = new LGPDSanitizer({
      detection: 'balanced',
      replacement: 'redact'
    });
    
    const prompt = 'Meu e-mail é maria@example.com';
    const result = sanitizer.sanitize(prompt);
    
    assert.throws(() => {
      sanitizer.reverse(result.sanitized);
    }, /Cannot reverse/);
  });
});
