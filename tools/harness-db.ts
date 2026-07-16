import fs from 'node:fs';
import path from 'node:path';

// Interfaces de Tipo para o Harness DB
export interface HarnessState {
  currentPhase: string;
  currentSprint: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  updatedAt: string;
}

export interface HarnessEvent {
  id: string;
  type: string;
  payload: any;
  timestamp: string;
}

export interface Task {
  id: string;
  sprintId: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  assignee?: string;
  artifacts?: string[];
  commitRange?: string;
  completedAt?: string;
}

export class HarnessDB {
  private baseDir: string;

  constructor(baseDir: string = '.harness') {
    this.baseDir = baseDir;
    // Garante que o diretório base exista
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  // Helper para verificar se um arquivo existe
  private exists(p: string): boolean {
    return fs.existsSync(p);
  }

  // Helper para gravação atômica segura (evita corrupção de arquivos)
  private writeAtomic(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = filePath + '.tmp';
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  }

  // =========================================================================
  // Coleção 1: STATE (Documento Singleton Atômico)
  // =========================================================================
  public state = {
    get: (): HarnessState => {
      const p = path.join(this.baseDir, 'state.json');
      if (!this.exists(p)) {
        return {
          currentPhase: 'phase.0.briefing',
          currentSprint: 'S01',
          status: 'pending',
          updatedAt: ''
        };
      }
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
      } catch (err) {
        // Fallback caso o arquivo esteja vazio ou malformado
        return {
          currentPhase: 'phase.0.briefing',
          currentSprint: 'S01',
          status: 'pending',
          updatedAt: ''
        };
      }
    },

    update: (data: Partial<HarnessState>): HarnessState => {
      const p = path.join(this.baseDir, 'state.json');
      const current = this.state.get();
      const updated: HarnessState = {
        ...current,
        ...data,
        updatedAt: new Date().toISOString()
      };

      this.writeAtomic(p, JSON.stringify(updated, null, 2));
      return updated;
    }
  };

  // =========================================================================
  // Coleção 2: EVENTS (Append-only Log em JSON Lines)
  // =========================================================================
  public events = {
    insert: (type: string, payload: any): HarnessEvent => {
      const p = path.join(this.baseDir, 'events.jsonl');
      const event: HarnessEvent = {
        id: Math.random().toString(36).substring(2, 9),
        type,
        payload,
        timestamp: new Date().toISOString()
      };

      // Gravação síncrona incremental (Append)
      fs.appendFileSync(p, JSON.stringify(event) + '\n', 'utf-8');
      return event;
    },

    list: (): HarnessEvent[] => {
      const p = path.join(this.baseDir, 'events.jsonl');
      if (!this.exists(p)) return [];
      const content = fs.readFileSync(p, 'utf-8');
      return content
        .split('\n')
        .filter(line => line.trim() !== '')
        .map(line => JSON.parse(line));
    }
  };

  // =========================================================================
  // Coleção 3: TASKS (Tabela Relacional sobre JSON de Sprints)
  // =========================================================================
  public tasks = {
    findMany: (filter: Partial<Task>): Task[] => {
      const sprintId = filter.sprintId || this.state.get().currentSprint;
      const sprintPath = path.join(this.baseDir, 'sprints', `${sprintId}.json`);

      if (!this.exists(sprintPath)) return [];
      
      try {
        const data = JSON.parse(fs.readFileSync(sprintPath, 'utf-8'));
        const tasks: Task[] = data.tasks || [];

        // Filtro síncrono dinâmico baseado no objeto filter
        return tasks.filter(task => {
          for (const key in filter) {
            const filterValue = filter[key as keyof Task];
            const taskValue = task[key as keyof Task];

            // Compara arrays se aplicável (ex: artifacts)
            if (Array.isArray(filterValue) && Array.isArray(taskValue)) {
              if (filterValue.length !== taskValue.length) return false;
              for (let i = 0; i < filterValue.length; i++) {
                if (filterValue[i] !== taskValue[i]) return false;
              }
              continue;
            }

            if (taskValue !== filterValue) {
              return false;
            }
          }
          return true;
        });
      } catch (err) {
        return [];
      }
    },

    findOne: (taskId: string): Task | null => {
      const state = this.state.get();
      const sprintId = state.currentSprint;
      const tasks = this.tasks.findMany({ sprintId });
      for (const t of tasks) {
        if (t.id === taskId) return t;
      }
      return null;
    },

    update: (taskId: string, updateData: Partial<Task>): Task | null => {
      const state = this.state.get();
      const sprintId = state.currentSprint;
      const sprintPath = path.join(this.baseDir, 'sprints', `${sprintId}.json`);

      if (!this.exists(sprintPath)) return null;

      try {
        const data = JSON.parse(fs.readFileSync(sprintPath, 'utf-8'));
        const tasks: Task[] = data.tasks || [];

        let updatedTask: Task | null = null;
        const updatedTasks = tasks.map(task => {
          if (task.id === taskId) {
            updatedTask = { ...task, ...updateData };
            // Adiciona carimbo de conclusão se foi completado
            if (updateData.status === 'completed' && !task.completedAt) {
              updatedTask.completedAt = new Date().toISOString();
            }
            return updatedTask;
          }
          return task;
        });

        if (!updatedTask) return null;

        // Gravação atômica da sprint atualizada
        this.writeAtomic(sprintPath, JSON.stringify({ ...data, tasks: updatedTasks }, null, 2));
        return updatedTask;
      } catch (err) {
        return null;
      }
    },

    insert: (newTask: Omit<Task, 'sprintId' | 'status'> & Partial<Task>): Task | null => {
      const state = this.state.get();
      const sprintId = newTask.sprintId || state.currentSprint;
      const sprintPath = path.join(this.baseDir, 'sprints', `${sprintId}.json`);

      if (!this.exists(sprintPath)) return null;

      try {
        const data = JSON.parse(fs.readFileSync(sprintPath, 'utf-8'));
        const tasks: Task[] = data.tasks || [];

        // Verifica se já existe para não duplicar
        if (tasks.some(t => t.id === newTask.id)) {
          throw new Error(`Task ${newTask.id} already exists`);
        }

        const taskToInsert: Task = {
          sprintId,
          status: 'pending',
          ...newTask,
        };

        tasks.push(taskToInsert);
        this.writeAtomic(sprintPath, JSON.stringify({ ...data, tasks }, null, 2));
        return taskToInsert;
      } catch (err) {
        return null;
      }
    },

    remove: (taskId: string): boolean => {
      const state = this.state.get();
      const sprintId = state.currentSprint;
      const sprintPath = path.join(this.baseDir, 'sprints', `${sprintId}.json`);

      if (!this.exists(sprintPath)) return false;

      try {
        const data = JSON.parse(fs.readFileSync(sprintPath, 'utf-8'));
        const tasks: Task[] = data.tasks || [];
        const initialLength = tasks.length;
        
        const filteredTasks = tasks.filter(t => t.id !== taskId);
        
        if (filteredTasks.length === initialLength) {
          return false; // Task não encontrada
        }

        this.writeAtomic(sprintPath, JSON.stringify({ ...data, tasks: filteredTasks }, null, 2));
        return true;
      } catch (err) {
        return false;
      }
    }
  };
}
