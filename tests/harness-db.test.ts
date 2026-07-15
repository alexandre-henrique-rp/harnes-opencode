import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HarnessDB } from '../tools/harness-db.ts';

const testDir = path.join(process.cwd(), '.harness', 'tmp', 'db_test');

test('Suíte de Testes do HarnessDB (Mock ORM)', async (t) => {
  // Setup inicial: garante pasta de teste limpa
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const db = new HarnessDB(testDir);

  await t.test('1. state - deve obter o estado padrão e atualizá-lo de forma atômica', () => {
    // 1. Get padrão
    const initialState = db.state.get();
    assert.strictEqual(initialState.currentPhase, 'phase.0.briefing');
    assert.strictEqual(initialState.currentSprint, 'S01');
    assert.strictEqual(initialState.status, 'pending');

    // 2. Update de campos
    const updated = db.state.update({
      currentPhase: 'phase.5.build',
      status: 'running'
    });

    assert.strictEqual(updated.currentPhase, 'phase.5.build');
    assert.strictEqual(updated.status, 'running');
    assert.ok(updated.updatedAt !== '');

    // 3. Persistência física no disco
    const persisted = db.state.get();
    assert.strictEqual(persisted.currentPhase, 'phase.5.build');
    assert.strictEqual(persisted.status, 'running');
    assert.ok(fs.existsSync(path.join(testDir, 'state.json')));
  });

  await t.test('2. events - deve inserir eventos em JSONL e listá-los ordenadamente', () => {
    // 1. Inserir eventos
    const ev1 = db.events.insert('task_started', { taskId: 'T001', assignee: 'backend' });
    const ev2 = db.events.insert('task_completed', { taskId: 'T001', result: 'success' });

    assert.strictEqual(ev1.type, 'task_started');
    assert.strictEqual(ev1.payload.taskId, 'T001');
    assert.ok(ev1.id !== '');

    assert.strictEqual(ev2.type, 'task_completed');
    assert.strictEqual(ev2.payload.result, 'success');

    // 2. Listar eventos
    const list = db.events.list();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(list[0].type, 'task_started');
    assert.strictEqual(list[1].type, 'task_completed');
    assert.ok(fs.existsSync(path.join(testDir, 'events.jsonl')));
  });

  await t.test('3. tasks - deve pesquisar e atualizar tarefas da sprint', () => {
    // Cria estrutura e arquivo de teste de sprint fake (S99)
    const sprintId = 'S99';
    const sprintDir = path.join(testDir, 'sprints');
    fs.mkdirSync(sprintDir, { recursive: true });

    const sprintData = {
      sprintId: sprintId,
      tasks: [
        { id: 'T001', sprintId: sprintId, title: 'Tarefa 1', status: 'pending' },
        { id: 'T002', sprintId: sprintId, title: 'Tarefa 2', status: 'pending' }
      ]
    };
    fs.writeFileSync(path.join(sprintDir, `${sprintId}.json`), JSON.stringify(sprintData, null, 2));

    // Define a sprint atual no state para o findMany resolver por padrão
    db.state.update({ currentSprint: sprintId });

    // 1. findMany
    const pendingTasks = db.tasks.findMany({ status: 'pending' });
    assert.strictEqual(pendingTasks.length, 2);
    assert.strictEqual(pendingTasks[0].id, 'T001');

    // 2. findOne
    const task = db.tasks.findOne('T002');
    assert.ok(task !== null);
    assert.strictEqual(task.title, 'Tarefa 2');

    // 3. update
    const updated = db.tasks.update('T001', { status: 'completed', commitRange: 'abc' });
    assert.ok(updated !== null);
    assert.strictEqual(updated.status, 'completed');
    assert.strictEqual(updated.commitRange, 'abc');
    assert.ok(updated.completedAt !== undefined);

    // 4. Confirmar persistência da alteração da sprint
    const completedTasks = db.tasks.findMany({ status: 'completed' });
    assert.strictEqual(completedTasks.length, 1);
    assert.strictEqual(completedTasks[0].id, 'T001');
  });

  // Cleanup: Limpa o diretório de teste ao final
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});
