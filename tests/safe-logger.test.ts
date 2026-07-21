import { test } from 'node:test';
import * as assert from 'node:assert';
import { safeLog } from '../plugins/lib/safe-logger.ts';
import StructuredThinkingPlugin from '../plugins/structured-thinking.ts';
import ContextCompressorPlugin from '../plugins/context-compressor.ts';
import TokenBudgetPlugin from '../plugins/token-budget.ts';
import PromptCachePrefixerPlugin from '../plugins/prompt-cache-prefixer.ts';

test('Suíte de Testes do SafeLogger e Resiliência de Plugins', async (t) => {

  await t.test('1. safeLog não deve estourar erro se client for undefined ou null', () => {
    assert.doesNotThrow(() => {
      safeLog(undefined, { level: 'info', message: 'teste' });
      safeLog(null, { level: 'info', message: 'teste' });
    });
  });

  await t.test('2. safeLog não deve estourar erro se client.session não tiver o método log', () => {
    const fakeClientEmpty = {};
    const fakeClientSessionString = { session: 'session-id-123' };
    const fakeClientSessionObjWithoutLog = { session: {} };

    assert.doesNotThrow(() => {
      safeLog(fakeClientEmpty, { level: 'warn', message: 'teste' });
      safeLog(fakeClientSessionString, { level: 'warn', message: 'teste' });
      safeLog(fakeClientSessionObjWithoutLog, { level: 'error', message: 'teste' });
    });
  });

  await t.test('3. safeLog deve chamar client.session.log se for uma função válida', () => {
    let called = false;
    let receivedPayload: any = null;

    const fakeClientWithSessionLog = {
      session: {
        log: (payload: any) => {
          called = true;
          receivedPayload = payload;
          return Promise.resolve();
        }
      }
    };

    safeLog(fakeClientWithSessionLog, { level: 'debug', message: 'teste-sucesso', metadata: { foo: 'bar' } });

    assert.strictEqual(called, true, 'Deve ter chamado client.session.log');
    assert.strictEqual(receivedPayload.message, 'teste-sucesso');
    assert.strictEqual(receivedPayload.level, 'debug');
  });

  await t.test('4. StructuredThinkingPlugin não deve quebrar nas ferramentas de escrita (write, edit, bash) se client.session.log não for função', async () => {
    // Simula o runtime do opencode onde client.session é uma string ou objeto sem método log
    const ctx = {
      client: {
        session: 'sess-abc-123'
      }
    };

    const plugin = await StructuredThinkingPlugin(ctx);
    assert.ok(plugin['tool.execute.before'], 'Plugin deve definir hook tool.execute.before');

    // Executa hook tool.execute.before simulando chamada de escrita ('write', 'edit', 'bash')
    await assert.doesNotReject(async () => {
      await plugin['tool.execute.before']({ tool: 'write' }, { result: '' });
      await plugin['tool.execute.before']({ tool: 'edit' }, { result: '' });
      await plugin['tool.execute.before']({ tool: 'bash' }, { result: '' });
    }, 'Não deve falhar com client.session.log is not a function');
  });

  await t.test('5. ContextCompressorPlugin deve falhar de forma transparente (fail-open) sem lançar erro quando client.session.log ou client.model.complete ausentes', async () => {
    const ctx = {
      client: {
        session: { notLog: true }
      }
    };

    const plugin = await ContextCompressorPlugin(ctx);
    assert.ok(plugin['tool.execute.after']);

    const output = { result: 'MOCK BIG TOOL OUTPUT '.repeat(200), args: { path: 'test.txt' } };
    await assert.doesNotReject(async () => {
      await plugin['tool.execute.after']({ tool: 'read' }, output);
    });

    assert.ok(output.result.includes('MOCK BIG TOOL OUTPUT'), 'Deve manter resultado sem crashar');
  });

  await t.test('6. TokenBudgetPlugin deve registrar logs com segurança se limites forem excedidos', async () => {
    const ctx = { client: { session: null } };
    const plugin = await TokenBudgetPlugin(ctx);

    const output = {
      usage: { input_tokens: 195_000, output_tokens: 1_000 },
      result: 'Output text'
    };

    await assert.doesNotReject(async () => {
      await plugin['model.complete.after']({} as any, output as any);
    });
  });

  await t.test('7. PromptCachePrefixerPlugin deve tratar uso de métricas com safeLog', async () => {
    const ctx = { client: {} };
    const plugin = await PromptCachePrefixerPlugin(ctx);

    const output = {
      usage: { input_tokens: 1000, cache_read_input_tokens: 800 }
    };

    await assert.doesNotReject(async () => {
      await plugin['model.complete.after']({} as any, output as any);
    });
  });
});
